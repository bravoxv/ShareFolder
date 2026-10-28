use crate::process_manager::kill_process_tree;
use reqwest::blocking::Client;
use serde_json::{Value, json};
use std::{
    fs,
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, path::BaseDirectory};

struct SyncthingProcess {
    child: Child,
    api_key: String,
    port: u16,
}

static SYNCTHING: Mutex<Option<SyncthingProcess>> = Mutex::new(None);

fn api<T: serde::de::DeserializeOwned + Default>(
    client: &Client,
    process: &SyncthingProcess,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<T, String> {
    let url = format!("http://127.0.0.1:{}{}", process.port, path);
    let mut request = client
        .request(method, url)
        .header("X-API-Key", &process.api_key);
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .map_err(|e| format!("No se pudo comunicar con Syncthing: {}", e))?;
    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().unwrap_or_default();
        return Err(format!("Syncthing respondió {}: {}", status, detail));
    }
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Ok(T::default());
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("Respuesta inválida de Syncthing: {}", e))
}

fn ensure_running(
    app: &tauri::AppHandle,
) -> Result<std::sync::MutexGuard<'static, Option<SyncthingProcess>>, String> {
    let mut state = SYNCTHING
        .lock()
        .map_err(|_| "No se pudo acceder al servicio Syncthing.".to_string())?;
    if state
        .as_mut()
        .is_some_and(|sync| sync.child.try_wait().ok().flatten().is_none())
    {
        return Ok(state);
    }
    *state = None;

    let executable = app
        .path()
        .resolve("binaries/syncthing.exe", BaseDirectory::Resource)
        .or_else(|_| app.path().resolve("syncthing.exe", BaseDirectory::Resource))
        .ok()
        .filter(|p| p.exists())
        .or_else(|| {
            std::env::current_exe().ok().and_then(|exe| {
                let dir = exe.parent()?;
                let candidates = [
                    dir.join("binaries").join("syncthing.exe"),
                    dir.join("syncthing.exe"),
                    dir.join("..").join("hostshift").join("src-tauri").join("binaries").join("syncthing.exe"),
                ];
                candidates.into_iter().find(|p| p.exists())
            })
        })
        .ok_or_else(|| "No se encontró el motor Syncthing incluido en el sistema o carpeta de la app.".to_string())?;
    let home = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("syncthing");
    fs::create_dir_all(&home).map_err(|e| format!("No se pudo preparar Syncthing: {}", e))?;
    let key_path = home.join("hostshift-api-key");
    let api_key = fs::read_to_string(&key_path)
        .unwrap_or_else(|_| {
            let key = uuid::Uuid::new_v4().to_string();
            let _ = fs::write(&key_path, &key);
            key
        })
        .trim()
        .to_string();
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);

    let mut command = Command::new(executable);
    command
        .args([
            format!("--home={}", home.display()),
            format!("--gui-address=127.0.0.1:{}", port),
            format!("--gui-apikey={}", api_key),
            "--no-browser".into(),
            "--no-console".into(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let child = command
        .spawn()
        .map_err(|e| format!("No se pudo iniciar Syncthing: {}", e))?;
    let process = SyncthingProcess {
        child,
        api_key,
        port,
    };
    let client = Client::builder()
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if Instant::now() > deadline {
            let mut child = process.child;
            let _ = child.kill();
            return Err("Syncthing tardó demasiado en iniciar.".into());
        }
        if api::<Value>(
            &client,
            &process,
            reqwest::Method::GET,
            "/rest/system/status",
            None,
        )
        .is_ok()
        {
            break;
        }
        thread::sleep(Duration::from_millis(250));
    }
    *state = Some(process);
    Ok(state)
}

#[tauri::command]
pub fn syncthing_connect_group(
    app: tauri::AppHandle,
    group_id: String,
    folder_path: String,
    peer_ids: Vec<String>,
    can_publish: bool,
) -> Result<Value, String> {
    if group_id.is_empty()
        || group_id.len() > 128
        || !group_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("El ID del grupo no es válido.".into());
    }
    if !PathBuf::from(&folder_path).is_dir() {
        return Err("La carpeta del servidor no existe en esta PC.".into());
    }
    let mut state = ensure_running(&app)?;
    let process = state.as_mut().ok_or("Syncthing no está iniciado.")?;
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let status: Value = api(
        &client,
        process,
        reqwest::Method::GET,
        "/rest/system/status",
        None,
    )?;
    let own_id = status
        .get("myID")
        .and_then(Value::as_str)
        .ok_or("Syncthing no devolvió el ID de este dispositivo.")?
        .to_string();

    let mut devices: Vec<String> = peer_ids
        .into_iter()
        .filter(|id| !id.trim().is_empty() && id.trim() != own_id)
        .map(|id| id.trim().to_string())
        .collect();
    devices.sort();
    devices.dedup();
    for device_id in &devices {
        if device_id.len() != 63
            || !device_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("Uno de los IDs Syncthing del grupo no es válido.".into());
        }
        let mut device: Value = api(
            &client,
            process,
            reqwest::Method::GET,
            "/rest/config/defaults/device",
            None,
        )?;
        device["deviceID"] = json!(device_id);
        device["name"] = json!(format!("HostShift {}", &device_id[..8]));
        device["addresses"] = json!(["dynamic"]);
        device["autoAcceptFolders"] = json!(false);
        let _: Value = api(
            &client,
            process,
            reqwest::Method::POST,
            "/rest/config/devices",
            Some(device),
        )?;
    }

    // Asegurar archivo .stignore para evitar bloqueos en caliente de mundos activos (ej: session.lock, crash-reports)
    let ignore_path = PathBuf::from(&folder_path).join(".stignore");
    if !ignore_path.exists() {
        let default_ignores = "# Archivos bloqueados en caliente por servidores dedicados\nsession.lock\n*.log.lck\n*.tmp\ncrash-reports\n";
        let _ = fs::write(&ignore_path, default_ignores);
    }

    let folder_id = format!("hostshift-{}", group_id);
    let mut folder: Value = api(
        &client,
        process,
        reqwest::Method::GET,
        "/rest/config/defaults/folder",
        None,
    )?;
    folder["id"] = json!(folder_id);
    folder["label"] = json!(format!("HostShift {}", group_id));
    folder["path"] = json!(folder_path);
    folder["type"] = json!(if can_publish {
        "sendreceive"
    } else {
        "receiveonly"
    });
    // Intervalo de escaneo rápido para cambios en caliente (5 segundos)
    folder["rescanIntervalS"] = json!(5);
    let mut shared_devices = vec![json!({ "deviceID": own_id })];
    shared_devices.extend(devices.iter().map(|id| json!({ "deviceID": id })));
    folder["devices"] = json!(shared_devices);
    let _: Value = api(
        &client,
        process,
        reqwest::Method::POST,
        "/rest/config/folders",
        Some(folder),
    )?;
    Ok(json!({"deviceId": own_id, "peerCount": devices.len(), "folderId": folder_id}))
}

#[tauri::command]
pub fn syncthing_stop() -> Result<(), String> {
    let mut state = SYNCTHING
        .lock()
        .map_err(|_| "No se pudo acceder al servicio Syncthing.".to_string())?;
    if let Some(mut process) = state.take() {
        let client = Client::new();
        let _ = api::<Value>(
            &client,
            &process,
            reqwest::Method::POST,
            "/rest/system/shutdown",
            None,
        );
        let pid = process.child.id();
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match process.child.try_wait() {
                Ok(Some(_)) => {
                    kill_process_tree(pid);
                    return Ok(());
                }
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(100)),
                _ => break,
            }
        }
        kill_process_tree(pid);
        let _ = process.child.kill();
        let _ = process.child.wait();
    }
    Ok(())
}
