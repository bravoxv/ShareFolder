// Comandos Tauri invocables desde el frontend para hashes y snapshots P2P

use std::fs::File;
use std::io::Read;
use std::path::Path;
use sha2::{Sha256, Digest};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct FileEntry {
    pub relative_path: String,
    pub size_bytes: u64,
    pub hash_sha256: String,
}

#[derive(Serialize, Deserialize)]
pub struct ManifestResult {
    pub files: Vec<FileEntry>,
    pub total_bytes: u64,
    pub manifest_hash: String,
}

/// Calcula el SHA-256 de un archivo en streaming
fn compute_file_hash(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Escanea recursivamente un directorio y calcula el manifiesto de integridad
#[tauri::command]
pub fn generate_directory_manifest(base_dir: String) -> Result<ManifestResult, String> {
    let root = Path::new(&base_dir);
    if !root.exists() {
        return Err("El directorio especificado no existe.".into());
    }

    let mut entries = Vec::new();
    let mut total_bytes = 0u64;
    let mut manifest_hasher = Sha256::new();

    // Recorrido recursivo simple
    fn visit_dirs(
        dir: &Path, 
        root: &Path, 
        entries: &mut Vec<FileEntry>, 
        total_bytes: &mut u64,
        manifest_hasher: &mut Sha256
    ) -> Result<(), String> {
        if dir.is_dir() {
            let read_dir = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
            for entry in read_dir {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_dir() {
                    visit_dirs(&path, root, entries, total_bytes, manifest_hasher)?;
                } else {
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let file_size = metadata.len();
                    let hash = compute_file_hash(&path)?;
                    let rel_path = path.strip_prefix(root).unwrap().to_string_lossy().replace("\\", "/");

                    manifest_hasher.update(hash.as_bytes());
                    manifest_hasher.update(rel_path.as_bytes());

                    *total_bytes += file_size;
                    entries.push(FileEntry {
                        relative_path: rel_path,
                        size_bytes: file_size,
                        hash_sha256: hash,
                    });
                }
            }
        }
        Ok(())
    }

    visit_dirs(root, root, &mut entries, &mut total_bytes, &mut manifest_hasher)?;

    let manifest_hash = format!("{:x}", manifest_hasher.finalize());

    Ok(ManifestResult {
        files: entries,
        total_bytes,
        manifest_hash,
    })
}
