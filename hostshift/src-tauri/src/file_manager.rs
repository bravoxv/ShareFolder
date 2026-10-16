use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

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
