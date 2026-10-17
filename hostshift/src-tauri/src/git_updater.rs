// Actualizador basado en los hashes de cada archivo de runtime publicado en
// bin/update-manifest.json. El código fuente de GitHub se compila primero; solo
// se descargan los artefactos que forman parte de la aplicación instalada.

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command, time::Duration};
use tauri::{path::BaseDirectory, Manager};

const MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/bravoxv/ShareFolder/main/bin/update-manifest.json";
const RAW_FILE_BASE: &str = "https://raw.githubusercontent.com/bravoxv/ShareFolder/main/";
const MAX_MANIFEST_SIZE: usize = 64 * 1024;
const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;

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
struct UpdateManifest {
    files: Vec<ManifestFile>,
}

#[derive(Deserialize, Serialize, Clone)]
struct ManifestFile {
    path: String,
    target: UpdateTarget,
    size: u64,
    sha256: String,
}

#[derive(Deserialize, Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum UpdateTarget {
    Executable,
    SyncthingBinary,
    SyncthingLicense,
}

struct PreparedFile {
    remote: ManifestFile,
    destination: PathBuf,
    staged: PathBuf,
}

fn github_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("HostShift-Updater")
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("No se pudo preparar la conexión con GitHub: {}", error))
}

fn fetch_manifest(client: &Client) -> Result<UpdateManifest, String> {
    let response = client
        .get(MANIFEST_URL)
        .header(reqwest::header::CACHE_CONTROL, "no-cache, no-store")
        .send()
        .map_err(|error| format!("No se pudo contactar a GitHub: {}", error))?
        .error_for_status()
        .map_err(|error| format!("GitHub no pudo consultar el manifiesto: {}", error))?;
    let bytes = response
        .bytes()
        .map_err(|error| format!("No se pudo leer el manifiesto de GitHub: {}", error))?;
    if bytes.is_empty() || bytes.len() > MAX_MANIFEST_SIZE {
        return Err("El manifiesto publicado en GitHub tiene un tamaño inválido.".into());
    }
    let manifest: UpdateManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("El manifiesto de GitHub no es válido: {}", error))?;
    if manifest.files.is_empty() || manifest.files.len() > 20 {
        return Err("El manifiesto no contiene una lista de archivos válida.".into());
    }
    Ok(manifest)
}

fn destination_for(app: &tauri::AppHandle, item: &ManifestFile) -> Result<PathBuf, String> {
    match (item.target, item.path.as_str()) {
        (UpdateTarget::Executable, "bin/HostShift.exe") => std::env::current_exe()
            .map_err(|error| format!("No se pudo localizar HostShift.exe: {}", error)),
        (UpdateTarget::SyncthingBinary, "hostshift/src-tauri/binaries/syncthing.exe") => app
            .path()
            .resolve("binaries/syncthing.exe", BaseDirectory::Resource)
            .map_err(|error| format!("No se encontró el motor Syncthing local: {}", error)),
        (UpdateTarget::SyncthingLicense, "hostshift/src-tauri/binaries/SYNCTHING-LICENSE.txt") => app
            .path()
            .resolve(
                "binaries/SYNCTHING-LICENSE.txt",
                BaseDirectory::Resource,
            )
            .map_err(|error| format!("No se encontró la licencia local de Syncthing: {}", error)),
        _ => Err(format!(
            "El archivo '{}' no es un destino de actualización permitido.",
            item.path
        )),
    }
}

fn validate_manifest(manifest: &UpdateManifest) -> Result<(), String> {
    for item in &manifest.files {
        if item.size == 0 || item.size > MAX_FILE_SIZE {
            return Err(format!("El tamaño publicado para '{}' no es válido.", item.path));
        }
        if item.sha256.len() != 64 || !item.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(format!("El hash publicado para '{}' no es válido.", item.path));
        }
    }
    Ok(())
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn changed_files(
    app: &tauri::AppHandle,
    manifest: &UpdateManifest,
) -> Result<Vec<(ManifestFile, PathBuf)>, String> {
    validate_manifest(manifest)?;
    let mut changed = Vec::new();
    for item in &manifest.files {
        let destination = destination_for(app, item)?;
        let matches = fs::read(&destination)
            .ok()
            .filter(|bytes| bytes.len() as u64 == item.size)
            .is_some_and(|bytes| sha256(&bytes).eq_ignore_ascii_case(&item.sha256));
        if !matches {
            changed.push((item.clone(), destination));
        }
    }
    Ok(changed)
}

/// Compara todos los archivos de runtime declarados en el manifiesto publicado.
#[tauri::command]
pub fn check_git_updates(app_handle: tauri::AppHandle) -> Result<GitUpdateStatus, String> {
    let client = github_client()?;
    let manifest = fetch_manifest(&client)?;
    let changed = changed_files(&app_handle, &manifest)?;
    Ok(GitUpdateStatus {
        has_updates: !changed.is_empty(),
        changed_files: changed.into_iter().map(|(file, _)| file.path).collect(),
    })
}

fn quote_powershell(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Descarga los archivos del manifiesto que difieren, los verifica y los instala
/// después de cerrar HostShift. Al terminar, vuelve a abrir la aplicación.
#[tauri::command]
pub fn apply_git_updates(app_handle: tauri::AppHandle) -> Result<GitUpdateResult, String> {
    let client = github_client()?;
    let manifest = fetch_manifest(&client)?;
    let changed = changed_files(&app_handle, &manifest)?;
    if changed.is_empty() {
        return Ok(GitUpdateResult {
            success: true,
            updated_files: vec![],
            message: "Todos los archivos de HostShift ya coinciden con GitHub.".into(),
        });
    }

    let mut prepared: Vec<PreparedFile> = Vec::with_capacity(changed.len());
    for (remote, destination) in changed {
        let url = format!("{}{}", RAW_FILE_BASE, remote.path);
        let response = client
            .get(url)
            .header(reqwest::header::CACHE_CONTROL, "no-cache, no-store")
            .send()
            .map_err(|error| format!("No se pudo descargar '{}': {}", remote.path, error))?
            .error_for_status()
            .map_err(|error| format!("GitHub rechazó '{}': {}", remote.path, error))?;
        let bytes = response
            .bytes()
            .map_err(|error| format!("La descarga de '{}' quedó incompleta: {}", remote.path, error))?;
        if bytes.len() as u64 != remote.size
            || !sha256(&bytes).eq_ignore_ascii_case(&remote.sha256)
        {
            return Err(format!(
                "La descarga de '{}' no coincide con su hash publicado; no se instaló la actualización.",
                remote.path
            ));
        }
        if matches!(remote.target, UpdateTarget::Executable) && !bytes.starts_with(b"MZ") {
            return Err("El archivo principal publicado no es un ejecutable válido de Windows.".into());
        }

        let parent = destination
            .parent()
            .ok_or_else(|| format!("No se pudo determinar la carpeta de '{}'.", remote.path))?;
        fs::create_dir_all(parent).map_err(|error| {
            format!("No se pudo preparar el destino de '{}': {}", remote.path, error)
        })?;
        let staged = PathBuf::from(format!("{}.update", destination.to_string_lossy()));
        if let Err(error) = fs::write(&staged, &bytes) {
            for file in &prepared {
                let _ = fs::remove_file(&file.staged);
            }
            return Err(format!("No se pudo preparar '{}': {}", remote.path, error));
        }
        prepared.push(PreparedFile {
            remote,
            destination,
            staged,
        });
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let executable = std::env::current_exe()
            .map_err(|error| format!("No se pudo localizar HostShift.exe: {}", error))?;
        let plan: Vec<_> = prepared
            .iter()
            .map(|file| {
                serde_json::json!({
                    "destination": file.destination,
                    "staged": file.staged,
                })
            })
            .collect();
        let helper = std::env::temp_dir().join(format!(
            "hostshift-update-{}.ps1",
            std::process::id()
        ));
        let plan_path = std::env::temp_dir().join(format!(
            "hostshift-update-{}.json",
            std::process::id()
        ));
        let script = format!(
            "$ErrorActionPreference = 'Stop'\n$target = {}\n$planPath = {}\n$targetPid = {}\nwhile (Get-Process -Id $targetPid -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 250 }}\n$plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json\nforeach ($file in $plan) {{ Move-Item -LiteralPath $file.staged -Destination $file.destination -Force }}\nStart-Process -FilePath $target\nRemove-Item -LiteralPath $planPath -Force\nRemove-Item -LiteralPath $PSCommandPath -Force\n",
            quote_powershell(&executable.to_string_lossy()),
            quote_powershell(&plan_path.to_string_lossy()),
            std::process::id(),
        );
        let plan_json = serde_json::to_vec(&plan)
            .map_err(|error| format!("No se pudo preparar la lista de actualización: {}", error))?;
        fs::write(&plan_path, plan_json)
            .and_then(|_| fs::write(&helper, script))
            .map_err(|error| {
                for file in &prepared {
                    let _ = fs::remove_file(&file.staged);
                }
                let _ = fs::remove_file(&plan_path);
                format!("No se pudo preparar la instalación de archivos: {}", error)
            })?;

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
            for file in &prepared {
                let _ = fs::remove_file(&file.staged);
            }
            let _ = fs::remove_file(&plan_path);
            let _ = fs::remove_file(&helper);
            return Err(format!("No se pudo iniciar la instalación de la actualización: {}", error));
        }

        let updated_files = prepared.into_iter().map(|file| file.remote.path).collect();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(700));
            app_handle.exit(0);
        });
        return Ok(GitUpdateResult {
            success: true,
            updated_files,
            message: "Archivos actualizados desde GitHub. HostShift se reiniciará.".into(),
        });
    }

    #[cfg(not(windows))]
    {
        let _ = app_handle;
        for file in &prepared {
            let _ = fs::remove_file(&file.staged);
        }
        Err("La actualización automática de archivos está disponible en Windows.".into())
    }
}
