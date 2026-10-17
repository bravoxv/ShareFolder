pub mod process_manager;
pub mod integrity_engine;
pub mod file_manager;

use integrity_engine::generate_directory_manifest;
use file_manager::{list_directory_contents, read_file_content, save_file_content};
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
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("No se pudo abrir navegador: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn sync_auth_session(user_json: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle.emit("auth-session-synced", user_json)
        .map_err(|e| format!("Error emitiendo evento de sesión: {}", e))?;
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
            read_file_content,
            save_file_content,
            start_game_server,
            stop_game_server,
            send_command_to_server,
            start_playit_tunnel,
            stop_playit_tunnel,
            send_command_to_playit,
            open_external_url,
            sync_auth_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
