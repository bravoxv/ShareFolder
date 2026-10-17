// Sistema de actualización incremental desde GitHub para HostShift

use std::process::Command;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitUpdateStatus {
    pub has_updates: bool,
    pub changed_files: Vec<String>,
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

/// Compara los archivos locales con origin/main y devuelve las rutas diferentes.
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
        Ok(out) => return Err(format!("No se pudo leer el commit local: {}", String::from_utf8_lossy(&out.stderr))),
        Err(e) => return Err(format!("No se pudo ejecutar Git: {}", e)),
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

    // La actualización se determina por los archivos del árbol remoto, no por
    // el número de versión ni por la diferencia entre los identificadores SHA.
    let diff_output = Command::new("git")
        .args(["diff", "--name-only", &current_commit, &remote_commit])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al obtener la lista de archivos: {}", e))?;

    if !diff_output.status.success() {
        return Err(format!("Fallo al comparar archivos locales y remotos: {}", String::from_utf8_lossy(&diff_output.stderr)));
    }

    let changed_files: Vec<String> = String::from_utf8_lossy(&diff_output.stdout)
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect();

    Ok(GitUpdateStatus {
        has_updates: !changed_files.is_empty(),
        changed_files,
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
            message: "Los archivos locales ya coinciden con GitHub.".into(),
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
        updated_files: status.changed_files,
        message: "Actualización incremental aplicada con éxito.".into(),
    })
}
