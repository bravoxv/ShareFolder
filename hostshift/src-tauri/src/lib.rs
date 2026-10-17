pub mod process_manager;
pub mod integrity_engine;
pub mod file_manager;
pub mod git_updater;

use integrity_engine::generate_directory_manifest;
use file_manager::{
    list_directory_contents, list_server_files, read_file_content, read_server_file_chunk,
    save_file_content, start_server_file_download, write_server_file_chunk,
    finish_server_file_download, cancel_server_file_download,
};
use git_updater::{check_git_updates, apply_git_updates};
use process_manager::ServerProcessManager;
use std::sync::Mutex;
use tauri::Emitter;

static PROCESS_MANAGER: Mutex<Option<ServerProcessManager>> = Mutex::new(None);
static PLAYIT_MANAGER: Mutex<Option<ServerProcessManager>> = Mutex::new(None);

#[tauri::command]
fn start_game_server(executable_path: String, working_dir: String, app_handle: tauri::AppHandle) -> Result<u32, String> {
    let mut mgr_lock = PROCESS_MANAGER.lock().unwrap();
    if mgr_lock.is_none() {
        *mgr_lock = Some(ServerProcessManager::new());
    }
    
    if let Some(ref mgr) = *mgr_lock {
        mgr.start_server(executable_path, vec![], working_dir, app_handle)
    } else {
        Err("No se pudo instanciar el gestor de procesos.".into())
    }
}

#[tauri::command]
fn start_playit_tunnel(executable_path: String, app_handle: tauri::AppHandle) -> Result<u32, String> {
    let mut mgr_lock = PLAYIT_MANAGER.lock().unwrap();
    if mgr_lock.is_none() {
        *mgr_lock = Some(ServerProcessManager::new());
    }
    
    let path = std::path::Path::new(&executable_path);
    let working_dir = path.parent().unwrap_or_else(|| std::path::Path::new(".")).to_string_lossy().to_string();

    if let Some(ref mgr) = *mgr_lock {
        // Enviar evento de log con prefijo playit-log
        #[cfg(windows)]
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut cmd = std::process::Command::new(&executable_path);
        cmd.current_dir(&working_dir)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn().map_err(|e| format!("Error al arrancar playit.gg: {}", e))?;
        let pid = child.id();

        // Extraer stdin para comandos de playit
        let stdin = child.stdin.take();
        if let Some(ref m) = *mgr_lock {
            *m.stdin_writer.lock().unwrap() = stdin;
        }

        if let Some(stdout) = child.stdout.take() {
            let app = app_handle.clone();
            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stdout);
                for line in std::io::BufRead::lines(reader) {
                    if let Ok(l) = line {
                        let _ = app.emit("playit-log", l);
                    }
                }
            });
        }

        Ok(pid)
    } else {
        Err("No se pudo iniciar el gestor de túnel playit.".into())
    }
}

#[tauri::command]
fn send_command_to_playit(command: String) -> Result<(), String> {
    let mgr_lock = PLAYIT_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_lock {
        mgr.send_command(&command)
    } else {
        Err("El túnel playit.gg no está en ejecución.".into())
    }
}

#[tauri::command]
fn stop_playit_tunnel() -> Result<(), String> {
    let mut mgr_lock = PLAYIT_MANAGER.lock().unwrap();
    *mgr_lock = None;
    Ok(())
}

#[tauri::command]
fn send_command_to_server(command: String) -> Result<(), String> {
    let mgr_lock = PROCESS_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_lock {
        mgr.send_command(&command)
    } else {
        Err("No hay ningún servidor en ejecución.".into())
    }
}

#[tauri::command]
fn stop_game_server() -> Result<(), String> {
    let mgr_lock = PROCESS_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_lock {
        mgr.stop_server(Some("stop".into()))
    } else {
        Ok(())
    }
}

#[tauri::command]
fn check_server_status() -> Result<bool, String> {
    let mgr_lock = PROCESS_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_lock {
        Ok(mgr.is_running())
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn check_playit_status() -> Result<bool, String> {
    let mgr_lock = PLAYIT_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_lock {
        Ok(mgr.is_running())
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn get_playit_tunnel_address() -> Result<Option<String>, String> {
    let possible_paths = [
        "C:\\ProgramData\\playit_gg\\playit.toml",
    ];

    let mut secret_key: Option<String> = None;

    // 1. Probar en ProgramData
    for p in possible_paths {
        if let Ok(content) = std::fs::read_to_string(p) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("secret_key") {
                    if let Some(val) = trimmed.split('=').nth(1) {
                        let clean = val.trim().trim_matches('"').trim_matches('\'').trim();
                        if !clean.is_empty() {
                            secret_key = Some(clean.to_string());
                            break;
                        }
                    }
                }
            }
        }
        if secret_key.is_some() {
            break;
        }
    }

    // 2. Probar en %LOCALAPPDATA%\playit_gg\playit.toml
    if secret_key.is_none() {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let path = format!("{}\\playit_gg\\playit.toml", local_app_data);
            if let Ok(content) = std::fs::read_to_string(&path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("secret_key") {
                        if let Some(val) = trimmed.split('=').nth(1) {
                            let clean = val.trim().trim_matches('"').trim_matches('\'').trim();
                            if !clean.is_empty() {
                                secret_key = Some(clean.to_string());
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    let key = match secret_key {
        Some(k) => k,
        None => return Ok(None),
    };

    // Consultar el endpoint oficial de playit.gg usando curl del sistema Windows
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut cmd = std::process::Command::new("curl.exe");
    cmd.args([
        "-s",
        "-X", "POST",
        "https://api.playit.gg/v1/agents/rundata",
        "-H", &format!("Authorization: Agent-Key {}", key),
        "-H", "Content-Type: application/json",
        "-d", "{}"
    ]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output().map_err(|e| format!("Error ejecutando curl: {}", e))?;
    if !output.status.success() {
        return Ok(None);
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout_str)
        .map_err(|e| format!("Error parseando respuesta playit: {}", e))?;

    if let Some(tunnels) = parsed.get("data").and_then(|d| d.get("tunnels")).and_then(|t| t.as_array()) {
        for tunnel in tunnels {
            if let Some(addr) = tunnel.get("display_address").and_then(|a| a.as_str()) {
                if !addr.is_empty() {
                    return Ok(Some(addr.to_string()));
                }
            }
        }
    }

    Ok(None)
}

static AUTH_SERVER_PORT: Mutex<Option<u16>> = Mutex::new(None);

fn ensure_auth_http_server() -> Result<u16, String> {
    let mut port = AUTH_SERVER_PORT.lock().map_err(|_| "No se pudo acceder al servidor de autenticación.".to_string())?;
    if let Some(port) = *port { return Ok(port); }
    use std::io::{Read, Write};
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("No se pudo iniciar el servidor local de autenticación: {}", error))?;
    let assigned_port = listener.local_addr().map_err(|error| format!("No se pudo detectar el puerto local de autenticación: {}", error))?.port();
    listener.set_nonblocking(false).map_err(|error| format!("No se pudo preparar el servidor local de autenticación: {}", error))?;
    std::thread::spawn(move || {
        let html = include_str!("../../../browser_login.html");
        for mut stream in listener.incoming().flatten() {
            let mut request = [0_u8; 1024];
            let _ = stream.read(&mut request);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(), html
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        }
    });
    *port = Some(assigned_port);
    Ok(assigned_port)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let target = if url == "browser_login.html" {
            let port = ensure_auth_http_server()?;
            format!("http://127.0.0.1:{}", port)
        } else if url.starts_with("http://") || url.starts_with("https://") {
            url
        } else {
            return Err("Solo se permiten URLs HTTP/HTTPS.".into());
        };

        Command::new("cmd")
            .args(["/C", "start", "", &target])
            .spawn()
            .map_err(|error| format!("No se pudo abrir el navegador: {}", error))?;
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("HostShift Core listo: {}", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            generate_directory_manifest,
            list_directory_contents,
            list_server_files,
            read_server_file_chunk,
            start_server_file_download,
            write_server_file_chunk,
            finish_server_file_download,
            cancel_server_file_download,
            read_file_content,
            save_file_content,
            start_game_server,
            stop_game_server,
            send_command_to_server,
            check_server_status,
            start_playit_tunnel,
            stop_playit_tunnel,
            send_command_to_playit,
            check_playit_status,
            get_playit_tunnel_address,
            open_external_url,
            check_git_updates,
            apply_git_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
