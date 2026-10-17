// Actualizador autónomo de HostShift: obtiene el ejecutable publicado en GitHub
// y no requiere que Git esté instalado en las computadoras de los usuarios.

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

const GITHUB_FILE_API: &str =
    "https://api.github.com/repos/bravoxv/ShareFolder/contents/bin/HostShift.exe?ref=main";
const UPDATE_FILE_LABEL: &str = "bin/HostShift.exe";
const MAX_EXECUTABLE_SIZE: u64 = 100 * 1024 * 1024;

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

#[derive(Deserialize)]
struct GitHubFile {
    sha: String,
    size: u64,
    download_url: Option<String>,
}

fn github_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("HostShift-Updater")
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| format!("No se pudo preparar la conexión con GitHub: {}", error))
}

fn get_remote_file(client: &Client) -> Result<GitHubFile, String> {
    let response = client
        .get(GITHUB_FILE_API)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .map_err(|error| format!("No se pudo contactar a GitHub: {}", error))?
        .error_for_status()
        .map_err(|error| format!("GitHub no pudo consultar el archivo publicado: {}", error))?;
    let file: GitHubFile = response.json().map_err(|error| {
        format!(
            "GitHub devolvió información inválida del ejecutable: {}",
            error
        )
    })?;
    if file.size == 0 || file.size > MAX_EXECUTABLE_SIZE {
        return Err("El tamaño del ejecutable publicado no es válido.".into());
    }
    Ok(file)
}

// GitHub identifica los archivos de su API con el SHA-1 de un objeto Git blob:
// SHA1("blob <longitud>\\0" + contenido).
fn git_blob_sha1(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn running_executable() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|error| format!("No se pudo localizar HostShift.exe: {}", error))
}

/// Compara la huella del ejecutable local con el archivo publicado en GitHub.
#[tauri::command]
pub fn check_git_updates() -> Result<GitUpdateStatus, String> {
    let executable = running_executable()?;
    let local_bytes = fs::read(&executable)
        .map_err(|error| format!("No se pudo leer el ejecutable local: {}", error))?;
    let local_sha = git_blob_sha1(&local_bytes);

    let client = github_client()?;
    let remote_file = get_remote_file(&client)?;
    let has_updates = local_sha != remote_file.sha;

    Ok(GitUpdateStatus {
        has_updates,
        changed_files: if has_updates {
            vec![UPDATE_FILE_LABEL.into()]
        } else {
            vec![]
        },
    })
}

fn quote_powershell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Descarga el ejecutable publicado, verifica su SHA de GitHub y lo reemplaza
/// después de cerrar esta instancia. El actualizador vuelve a abrir HostShift.
#[tauri::command]
pub fn apply_git_updates(app_handle: tauri::AppHandle) -> Result<GitUpdateResult, String> {
    let executable = running_executable()?;
    let current_bytes = fs::read(&executable)
        .map_err(|error| format!("No se pudo leer el ejecutable local: {}", error))?;
    let local_sha = git_blob_sha1(&current_bytes);

    let client = github_client()?;
    let remote_file = get_remote_file(&client)?;
    if local_sha == remote_file.sha {
        return Ok(GitUpdateResult {
            success: true,
            updated_files: vec![],
            message: "El ejecutable local ya coincide con el publicado en GitHub.".into(),
        });
    }

    let download_url = remote_file
        .download_url
        .ok_or_else(|| "GitHub no proporcionó el enlace de descarga del ejecutable.".to_string())?;
    let response = client
        .get(download_url)
        .send()
        .map_err(|error| format!("No se pudo descargar HostShift desde GitHub: {}", error))?
        .error_for_status()
        .map_err(|error| format!("GitHub rechazó la descarga del ejecutable: {}", error))?;
    let downloaded = response
        .bytes()
        .map_err(|error| format!("La descarga del ejecutable quedó incompleta: {}", error))?;

    if downloaded.len() as u64 != remote_file.size || git_blob_sha1(&downloaded) != remote_file.sha
    {
        return Err("La descarga no coincide con el archivo publicado en GitHub. No se instaló la actualización.".into());
    }
    if !downloaded.starts_with(b"MZ") {
        return Err("El archivo publicado no es un ejecutable de Windows válido.".into());
    }

    let staged = PathBuf::from(format!("{}.update", executable.to_string_lossy()));
    fs::write(&staged, &downloaded).map_err(|error| {
        format!(
            "No se pudo preparar la actualización junto a la aplicación: {}",
            error
        )
    })?;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let helper =
            std::env::temp_dir().join(format!("hostshift-update-{}.ps1", std::process::id()));
        let script = format!(
            "$ErrorActionPreference = 'Stop'\n$target = {}\n$staged = {}\n$targetPid = {}\nwhile (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 300 }}\nMove-Item -LiteralPath $staged -Destination $target -Force\nStart-Process -FilePath $target\nRemove-Item -LiteralPath $PSCommandPath -Force\n",
            quote_powershell(&executable.to_string_lossy()),
            quote_powershell(&staged.to_string_lossy()),
            std::process::id(),
        );
        fs::write(&helper, script)
            .map_err(|error| format!("No se pudo preparar el reinicio de HostShift: {}", error))?;

        if let Err(error) = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&helper)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            let _ = fs::remove_file(&staged);
            let _ = fs::remove_file(&helper);
            return Err(format!(
                "No se pudo iniciar el instalador de la actualización: {}",
                error
            ));
        }

        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(1));
            app_handle.exit(0);
        });

        return Ok(GitUpdateResult {
            success: true,
            updated_files: vec![UPDATE_FILE_LABEL.into()],
            message: "Actualización descargada. HostShift se reiniciará con la nueva versión."
                .into(),
        });
    }

    #[cfg(not(windows))]
    {
        let _ = app_handle;
        let _ = fs::remove_file(&staged);
        Err("La actualización automática del ejecutable está disponible en Windows.".into())
    }
}
