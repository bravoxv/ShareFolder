use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

const MAX_SHARED_CHUNK_BYTES: usize = 8 * 1024 * 1024;

fn resolve_shared_file_path(base_path: &str, relative_path: &str, must_exist: bool) -> Result<(PathBuf, PathBuf), String> {
    let root = PathBuf::from(base_path).canonicalize()
        .map_err(|e| format!("No se pudo abrir la carpeta del servidor: {}", e))?;
    let relative = Path::new(relative_path);
    if relative.as_os_str().is_empty() || relative.is_absolute() || relative.components().any(|part| !matches!(part, std::path::Component::Normal(_))) {
        return Err("La ruta relativa del archivo no es válida.".into());
    }

    let target = root.join(relative);
    if must_exist {
        let canonical_target = target.canonicalize().map_err(|e| format!("No se pudo abrir el archivo: {}", e))?;
        if !canonical_target.starts_with(&root) || !canonical_target.is_file() {
            return Err("El archivo está fuera de la carpeta compartida o no es un archivo regular.".into());
        }
        return Ok((root, canonical_target));
    }

    let parent = target.parent().ok_or("La ruta de destino no es válida.")?;
    fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear la carpeta de destino: {}", e))?;
    let canonical_parent = parent.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_parent.starts_with(&root) {
        return Err("La ruta de destino está fuera de la carpeta del servidor.".into());
    }
    if target.exists() {
        let canonical_target = target.canonicalize().map_err(|e| e.to_string())?;
        if !canonical_target.starts_with(&root) || !canonical_target.is_file() {
            return Err("El destino está fuera de la carpeta del servidor o no es un archivo regular.".into());
        }
        return Ok((root, canonical_target));
    }
    Ok((root, target))
}

fn collect_server_files(root: &Path, directory: &Path, result: &mut Vec<DiskFileItem>) -> Result<(), String> {
    let entries = fs::read_dir(directory).map_err(|e| format!("Error al recorrer el servidor: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_symlink() { continue; }
        let path = entry.path();
        let relative_path = path.strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy().replace('\\', "/");
        if relative_path == ".hostshift-downloads" || relative_path.starts_with(".hostshift-downloads/") { continue; }
        if file_type.is_dir() {
            result.push(DiskFileItem {
                name: entry.file_name().to_string_lossy().to_string(),
                relative_path,
                is_dir: true,
                size_bytes: 0,
            });
            collect_server_files(root, &path, result)?;
        } else if file_type.is_file() {
            result.push(DiskFileItem {
                name: entry.file_name().to_string_lossy().to_string(),
                relative_path,
                is_dir: false,
                size_bytes: entry.metadata().map(|m| m.len()).unwrap_or(0),
            });
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_server_files(base_path: String) -> Result<Vec<DiskFileItem>, String> {
    let root = PathBuf::from(base_path).canonicalize()
        .map_err(|e| format!("No se pudo abrir la carpeta del servidor: {}", e))?;
    if !root.is_dir() { return Err("La ruta del servidor no es una carpeta.".into()); }
    let mut files = Vec::new();
    collect_server_files(&root, &root, &mut files)?;
    files.sort_by(|a, b| a.relative_path.to_lowercase().cmp(&b.relative_path.to_lowercase()));
    Ok(files)
}

#[tauri::command]
pub fn read_server_file_chunk(base_path: String, relative_path: String, offset: u64, chunk_size: usize) -> Result<Vec<u8>, String> {
    if chunk_size > MAX_SHARED_CHUNK_BYTES { return Err("El bloque supera el máximo de 8 MB.".into()); }
    let (_, path) = resolve_shared_file_path(&base_path, &relative_path, true)?;
    let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if offset > size { return Err("El desplazamiento supera el tamaño del archivo.".into()); }
    let length = (size - offset).min(chunk_size as u64) as usize;
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes).map_err(|e| format!("No se pudo leer el bloque: {}", e))?;
    Ok(bytes)
}

#[tauri::command]
fn download_temp_path(base_path: &str, file_id: &str) -> Result<PathBuf, String> {
    if file_id.is_empty() || !file_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("El identificador temporal no es válido.".into());
    }
    let root = PathBuf::from(base_path).canonicalize().map_err(|e| e.to_string())?;
    let temp_dir = root.join(".hostshift-downloads");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let canonical_dir = temp_dir.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_dir.starts_with(&root) { return Err("La carpeta temporal está fuera del servidor.".into()); }
    Ok(canonical_dir.join(format!("{}.part", file_id)))
}

#[tauri::command]
pub fn start_server_file_download(base_path: String, relative_path: String, file_id: String, total_size: u64) -> Result<(), String> {
    let _ = resolve_shared_file_path(&base_path, &relative_path, false)?;
    let temp = download_temp_path(&base_path, &file_id)?;
    let file = OpenOptions::new().create(true).truncate(true).write(true).open(temp).map_err(|e| e.to_string())?;
    file.set_len(total_size).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_server_file_chunk(base_path: String, file_id: String, offset: u64, content: Vec<u8>) -> Result<(), String> {
    if content.len() > MAX_SHARED_CHUNK_BYTES { return Err("El bloque supera el máximo de 8 MB.".into()); }
    let temp = download_temp_path(&base_path, &file_id)?;
    let size = fs::metadata(&temp).map_err(|e| format!("No se inició la descarga: {}", e))?.len();
    if offset.saturating_add(content.len() as u64) > size { return Err("El bloque supera el tamaño declarado del archivo.".into()); }
    let mut file = OpenOptions::new().write(true).open(temp).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
    file.write_all(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn finish_server_file_download(base_path: String, relative_path: String, file_id: String, total_size: u64) -> Result<(), String> {
    let (_, target) = resolve_shared_file_path(&base_path, &relative_path, false)?;
    let temp = download_temp_path(&base_path, &file_id)?;
    if fs::metadata(&temp).map_err(|e| e.to_string())?.len() != total_size { return Err("La descarga está incompleta.".into()); }
    if target.exists() {
        let backup = temp.with_extension("backup");
        if backup.exists() { fs::remove_file(&backup).map_err(|e| e.to_string())?; }
        fs::rename(&target, &backup).map_err(|e| format!("No se pudo preparar el reemplazo: {}", e))?;
        if let Err(error) = fs::rename(&temp, &target) {
            let _ = fs::rename(&backup, &target);
            return Err(format!("No se pudo colocar el archivo descargado: {}", error));
        }
        fs::remove_file(backup).map_err(|e| format!("El archivo se descargó, pero no se pudo limpiar el respaldo temporal: {}", e))?;
        Ok(())
    } else {
        fs::rename(&temp, &target).map_err(|e| format!("No se pudo colocar el archivo descargado: {}", e))
    }
}

#[tauri::command]
pub fn cancel_server_file_download(base_path: String, file_id: String) -> Result<(), String> {
    let temp = download_temp_path(&base_path, &file_id)?;
    match fs::remove_file(temp) { Ok(()) => Ok(()), Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), Err(e) => Err(e.to_string()) }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DiskFileItem {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

/// Lee recursivamente el contenido de un directorio arbitrario en el disco de Windows
#[tauri::command]
pub fn list_directory_contents(base_path: String, sub_dir: Option<String>) -> Result<Vec<DiskFileItem>, String> {
    let mut target = PathBuf::from(&base_path);
    if let Some(sub) = sub_dir {
        if !sub.is_empty() && sub != "/" {
            target = target.join(sub.trim_start_matches('/').trim_start_matches('\\'));
        }
    }

    if !target.exists() {
        return Err(format!("La carpeta '{}' no existe en el disco.", target.display()));
    }

    let entries = fs::read_dir(&target).map_err(|e| format!("Error al leer directorio: {}", e))?;
    let mut items = Vec::new();

    let root = Path::new(&base_path);

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            let is_dir = path.is_dir();
            let name = entry.file_name().to_string_lossy().to_string();
            let size_bytes = if is_dir { 0 } else { entry.metadata().map(|m| m.len()).unwrap_or(0) };
            
            let relative_path = path.strip_prefix(root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|_| name.clone());

            items.push(DiskFileItem {
                name,
                relative_path,
                is_dir,
                size_bytes,
            });
        }
    }

    // Ordenar: primero carpetas, luego archivos alfabéticamente
    items.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(items)
}

/// Lee el contenido en texto de un archivo dentro del servidor para editarlo
#[tauri::command]
pub fn read_file_content(base_path: String, relative_path: String) -> Result<String, String> {
    let target = PathBuf::from(&base_path).join(relative_path.trim_start_matches('/').trim_start_matches('\\'));
    if !target.exists() {
        return Err("El archivo no existe.".into());
    }

    // Limitar lectura de archivos de texto a 2 MB para evitar congelamiento de UI
    let metadata = fs::metadata(&target).map_err(|e| e.to_string())?;
    if metadata.len() > 2 * 1024 * 1024 {
        return Err("El archivo es demasiado grande (> 2MB) para previsualizarse en el editor de texto.".into());
    }

    let mut file = File::open(&target).map_err(|e| e.to_string())?;
    let mut content = String::new();
    file.read_to_string(&mut content).map_err(|e| format!("No se pudo leer como texto: {}", e))?;

    Ok(content)
}

/// Guarda el contenido editado de un archivo de configuración en disco
#[tauri::command]
pub fn save_file_content(base_path: String, relative_path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&base_path).join(relative_path.trim_start_matches('/').trim_start_matches('\\'));
    let mut file = File::create(&target).map_err(|e| format!("Error al crear/abrir archivo para guardar: {}", e))?;
    file.write_all(content.as_bytes()).map_err(|e| format!("Error al escribir datos: {}", e))?;
    file.flush().map_err(|e| format!("Error al vaciar búfer: {}", e))?;
    Ok(())
}
