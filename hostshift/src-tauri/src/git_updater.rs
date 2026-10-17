// Sistema de actualización incremental desde GitHub para HostShift

use std::process::Command;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitUpdateStatus {
    pub has_updates: bool,
    pub current_commit: String,
    pub remote_commit: String,
    pub modified_files: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitUpdateResult {
    pub success: bool,
    pub updated_files: Vec<String>,
    pub message: String,
}

fn find_git_repo(start_path: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut curr = start_path.to_path_buf();
    for _ in 0..10 {
        if curr.join(".git").exists() {
            return Some(curr);
        }
        if !curr.pop() {
            break;
        }
    }
    None
}

/// Comprueba si hay nuevos commits en GitHub y lista qué archivos cambiaron
#[tauri::command]
pub fn check_git_updates(repo_path: Option<String>) -> Result<GitUpdateStatus, String> {
    // 1. Intentar localizar la carpeta raíz del repositorio que contiene `.git`
    let determined_dir = if let Some(ref p) = repo_path {
        std::path::PathBuf::from(p)
    } else {
        let mut candidates = vec![
            std::env::current_dir().unwrap_or_default(),
        ];
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                candidates.push(parent.to_path_buf());
            }
        }
        
        let mut found = None;
        for c in candidates {
            if let Some(r) = find_git_repo(&c) {
                found = Some(r);
                break;
            }
        }
        found.unwrap_or_else(|| std::path::PathBuf::from("."))
    };

    let working_dir = determined_dir.to_string_lossy().to_string();

    // 2. Obtener commit local actual via git rev-parse
    let local_output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&working_dir)
        .output();

    let current_commit = match local_output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        _ => {
            // Fallback si no está en un repo git o git no está instalado: consultar GitHub API
            #[cfg(windows)]
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let mut cmd = Command::new("curl.exe");
            cmd.args([
                "-s",
                "-H", "User-Agent: HostShift-App",
                "https://api.github.com/repos/bravoxv/ShareFolder/commits/main"
            ]);
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);

            if let Ok(c_out) = cmd.output() {
                if c_out.status.success() {
                    let text = String::from_utf8_lossy(&c_out.stdout);
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(sha) = v.get("sha").and_then(|s| s.as_str()) {
                            let short_sha = sha.chars().take(7).collect::<String>();
                            return Ok(GitUpdateStatus {
                                has_updates: false,
                                current_commit: short_sha.clone(),
                                remote_commit: short_sha,
                                modified_files: vec![],
                            });
                        }
                    }
                }
            }

            return Err("Esta copia de HostShift se ejecuta en modo portable sin repositorio Git local.".into());
        }
    };

    // 3. Fetch silencioso desde el repositorio remoto (origin)
    let fetch_output = Command::new("git")
        .args(["fetch", "origin", "main"])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al contactar git: {}", e))?;

    if !fetch_output.status.success() {
        return Err(format!("No se pudo contactar a GitHub: {}", String::from_utf8_lossy(&fetch_output.stderr)));
    }

    // 4. Obtener commit remoto de origin/main
    let remote_output = Command::new("git")
        .args(["rev-parse", "origin/main"])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al obtener commit de origin/main: {}", e))?;

    let remote_commit = String::from_utf8_lossy(&remote_output.stdout).trim().to_string();

    let has_updates = current_commit != remote_commit;
    let mut modified_files = Vec::new();

    if has_updates {
        // 5. Obtener la lista exacta de archivos modificados entre local y remoto
        let diff_output = Command::new("git")
            .args(["diff", "--name-only", &current_commit, &remote_commit])
            .current_dir(&working_dir)
            .output()
            .map_err(|e| format!("Fallo al obtener diff: {}", e))?;

        if diff_output.status.success() {
            let diff_text = String::from_utf8_lossy(&diff_output.stdout);
            for line in diff_text.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    modified_files.push(trimmed.to_string());
                }
            }
        }
    }

    Ok(GitUpdateStatus {
        has_updates,
        current_commit: current_commit.chars().take(7).collect(),
        remote_commit: remote_commit.chars().take(7).collect(),
        modified_files,
    })
}

/// Aplica la actualización descargando e integrando únicamente los archivos modificados
#[tauri::command]
pub fn apply_git_updates(repo_path: Option<String>) -> Result<GitUpdateResult, String> {
    let determined_dir = if let Some(ref p) = repo_path {
        std::path::PathBuf::from(p)
    } else {
        let mut candidates = vec![
            std::env::current_dir().unwrap_or_default(),
        ];
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                candidates.push(parent.to_path_buf());
            }
        }
        let mut found = None;
        for c in candidates {
            if let Some(r) = find_git_repo(&c) {
                found = Some(r);
                break;
            }
        }
        found.unwrap_or_else(|| std::path::PathBuf::from("."))
    };

    let working_dir = determined_dir.to_string_lossy().to_string();

    // 1. Obtener archivos que cambiarán antes de hacer pull
    let status = check_git_updates(Some(working_dir.clone()))?;
    if !status.has_updates {
        return Ok(GitUpdateResult {
            success: true,
            updated_files: vec![],
            message: "El repositorio ya se encuentra en su versión más reciente.".into(),
        });
    }

    // 2. Realizar pull fast-forward para actualizar solo los archivos modificados
    let pull_output = Command::new("git")
        .args(["pull", "origin", "main", "--ff-only"])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al ejecutar git pull: {}", e))?;

    if !pull_output.status.success() {
        return Err(format!("Error aplicando actualización: {}", String::from_utf8_lossy(&pull_output.stderr)));
    }

    Ok(GitUpdateResult {
        success: true,
        updated_files: status.modified_files,
        message: "Actualización incremental aplicada con éxito.".into(),
    })
}
