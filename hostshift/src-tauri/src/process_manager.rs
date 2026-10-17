// Motor de aislamiento de procesos para servidores dedicados en Windows

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// En Windows, detener cmd.exe no detiene necesariamente el servidor que lanzó.
/// taskkill /T termina también los procesos descendientes de esa consola.
pub fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("taskkill.exe")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    let _ = pid;
}

pub struct ServerProcessManager {
    pub child: Arc<Mutex<Option<Child>>>,
    pub stdin_writer: Arc<Mutex<Option<std::process::ChildStdin>>>,
}

/// Elimina secuencias de escape ANSI (ej: \x1b[0m, \x1b[32m, [m) para que el texto sea limpio
fn strip_ansi_escapes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut in_escape = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '\x1b' {
            in_escape = true;
            continue;
        }
        if in_escape {
            // Fin de la secuencia de escape ANSI (generalmente termina en 'm' u otra letra)
            if c.is_alphabetic() {
                in_escape = false;
            }
            continue;
        }
        // También limpiar restos huérfanos comunes como "[m" al final
        result.push(c);
    }

    // Limpieza final de fragmentos residuales de reset de color al final de línea
    if result.ends_with("[m") {
        result.truncate(result.len() - 2);
    }
    result
}

impl ServerProcessManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
        }
    }

    /// Inicia el proceso del servidor como proceso hijo en segundo plano (sin abrir consola cmd)
    pub fn start_server(
        &self,
        executable: String,
        args: Vec<String>,
        working_dir: String,
        app_handle: AppHandle,
    ) -> Result<u32, String> {
        let mut child_lock = self.child.lock().unwrap();
        if child_lock.is_some() {
            return Err("Ya existe un proceso de servidor en ejecución.".into());
        }

        #[cfg(windows)]
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let is_batch = executable.to_lowercase().ends_with(".bat")
            || executable.to_lowercase().ends_with(".cmd");

        let mut cmd = if is_batch {
            let mut c = Command::new("cmd.exe");
            c.arg("/C").arg(&executable).args(args);
            c
        } else {
            let mut c = Command::new(&executable);
            c.args(args);
            c
        };

        cmd.current_dir(working_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Error al arrancar proceso: {}", e))?;
        let pid = child.id();

        // Extraer stdin para enviar comandos (ej: help, save, stop, comandos de juego)
        let stdin = child.stdin.take();
        *self.stdin_writer.lock().unwrap() = stdin;

        // Capturar stdout para monitoreo de eventos de guardado y logs
        if let Some(stdout) = child.stdout.take() {
            let app = app_handle.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        // Limpiar secuencias de escape ANSI (colores de terminal como \x1b[m, \x1b[32m)
                        let clean_line = strip_ansi_escapes(&l);
                        let _ = app.emit("server-log", clean_line);
                    }
                }
            });
        }

        *child_lock = Some(child);
        Ok(pid)
    }

    /// Envía un comando interactivo (por ejemplo "save-all flush" o "stop") al stdin del juego
    pub fn send_command(&self, command: &str) -> Result<(), String> {
        let mut writer_lock = self.stdin_writer.lock().unwrap();
        if let Some(ref mut stdin) = *writer_lock {
            writeln!(stdin, "{}", command)
                .map_err(|e| format!("Fallo al escribir en stdin: {}", e))?;
            stdin
                .flush()
                .map_err(|e| format!("Fallo al vaciar buffer stdin: {}", e))?;
            Ok(())
        } else {
            Err("El stdin del servidor no está disponible.".into())
        }
    }

    /// Consulta si el proceso hijo sigue vivo
    pub fn is_running(&self) -> bool {
        let mut lock = self.child.lock().unwrap();
        if let Some(ref mut child) = *lock {
            match child.try_wait() {
                Ok(None) => true, // Sigue corriendo
                _ => {
                    *lock = None;
                    false
                }
            }
        } else {
            false
        }
    }

    /// Registra un proceso iniciado por un comando especializado, como Playit,
    /// para que también pueda supervisarse y cerrarse al salir de HostShift.
    pub fn set_child(&self, child: Child) {
        *self.child.lock().unwrap() = Some(child);
    }

    /// Cierre síncrono usado al salir de la aplicación. Espera el apagado normal
    /// y después termina el árbol completo del proceso si sigue activo.
    pub fn shutdown(&self, stop_command: Option<String>, grace: Duration) {
        if let Some(command) = stop_command {
            let _ = self.send_command(&command);
        }
        *self.stdin_writer.lock().unwrap() = None;

        let Some(mut child) = self.child.lock().unwrap().take() else {
            return;
        };
        let pid = child.id();
        let deadline = Instant::now() + grace;
        loop {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // El proceso padre puede haber terminado antes que un hijo.
                    kill_process_tree(pid);
                    return;
                }
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(100));
                }
                _ => break,
            }
        }
        kill_process_tree(pid);
        let _ = child.kill();
        let _ = child.wait();
    }

    /// Detiene el servidor limpiamente enviando el comando de apagado o terminándolo si no responde
    pub fn stop_server(&self, stop_command: Option<String>) -> Result<(), String> {
        if let Some(cmd) = stop_command {
            let _ = self.send_command(&cmd);
        }

        // Dar un margen para el apagado limpio antes de terminar todo el árbol.
        let child_arc = self.child.clone();
        std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(10);
            loop {
                let mut lock = child_arc.lock().unwrap();
                let Some(child) = lock.as_mut() else {
                    return;
                };
                let pid = child.id();
                match child.try_wait() {
                    Ok(Some(_)) => {
                        lock.take();
                        drop(lock);
                        kill_process_tree(pid);
                        return;
                    }
                    Ok(None) if Instant::now() < deadline => {
                        drop(lock);
                        std::thread::sleep(Duration::from_millis(100));
                    }
                    _ => {
                        if let Some(mut child) = lock.take() {
                            drop(lock);
                            kill_process_tree(pid);
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                        return;
                    }
                }
            }
        });

        Ok(())
    }
}
