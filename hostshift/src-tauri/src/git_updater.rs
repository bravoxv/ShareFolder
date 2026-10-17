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

/// Comprueba si hay nuevos commits en GitHub y lista qué archivos cambiaron
#[tauri::command]
pub fn check_git_updates(repo_path: Option<String>) -> Result<GitUpdateStatus, String> {
    let working_dir = repo_path.unwrap_or_else(|| ".".into());

    // 1. Obtener commit local actual
    let local_output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al ejecutar git rev-parse: {}", e))?;

    if !local_output.status.success() {
        return Err(String::from_utf8_lossy(&local_output.stderr).to_string());
    }

    let current_commit = String::from_utf8_lossy(&local_output.stdout).trim().to_string();

    // 2. Fetch silencioso desde el repositorio remoto (origin)
    let fetch_output = Command::new("git")
        .args(["fetch", "origin", "main"])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al ejecutar git fetch: {}", e))?;

    if !fetch_output.status.success() {
        return Err(format!("No se pudo contactar a GitHub: {}", String::from_utf8_lossy(&fetch_output.stderr)));
    }

    // 3. Obtener commit remoto de origin/main
    let remote_output = Command::new("git")
        .args(["rev-parse", "origin/main"])
        .current_dir(&working_dir)
        .output()
        .map_err(|e| format!("Fallo al obtener commit de origin/main: {}", e))?;

    let remote_commit = String::from_utf8_lossy(&remote_output.stdout).trim().to_string();

    let has_updates = current_commit != remote_commit;
    let mut modified_files = Vec::new();

    if has_updates {
        // 4. Obtener la lista exacta de archivos modificados entre local y remoto
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
    let working_dir = repo_path.unwrap_or_else(|| ".".into());

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
