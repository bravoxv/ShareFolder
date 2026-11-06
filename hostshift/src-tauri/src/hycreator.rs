use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HyCreatorItem {
    pub rel: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HyCreatorInfo {
    pub is_available: bool,
    pub hycreator_dir: String,
    pub assets_zip_path: Option<String>,
    pub available_scans: Vec<String>,
    pub active_scan_path: Option<String>,
    pub total_prefabs: usize,
    pub total_blockymodels: usize,
    pub total_models: usize,
    pub total_items: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogPageResult {
    pub total: usize,
    pub page: usize,
    pub page_size: usize,
    pub items: Vec<HyCreatorItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetContentResult {
    pub rel_path: String,
    pub format: String, // "json", "text", "binary_base64"
    pub content: String,
    pub size_bytes: usize,
}

/// Detecta la carpeta de datos de HyCreator y Hytale en el sistema Windows
fn get_hycreator_base_dir() -> PathBuf {
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(local_appdata).join("HyCreator")
    } else {
        PathBuf::from(r"C:\Users\Administrator\AppData\Local\HyCreator")
    }
}

fn get_default_assets_zip() -> Option<String> {
    // 1. Verificar settings.json de HyCreator
    let settings_path = get_hycreator_base_dir().join("settings.json");
    if settings_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&settings_path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(release_zip) = v.pointer("/sources/release").and_then(|s| s.as_str()) {
                    if Path::new(release_zip).exists() {
                        return Some(release_zip.to_string());
                    }
                }
                if let Some(pre_zip) = v.pointer("/sources/prerelease").and_then(|s| s.as_str()) {
                    if Path::new(pre_zip).exists() {
                        return Some(pre_zip.to_string());
                    }
                }
            }
        }
    }

    // 2. Rutas conocidas en Roaming/Hytale
    let roaming = std::env::var("APPDATA").unwrap_or_else(|_| r"C:\Users\Administrator\AppData\Roaming".into());
    let candidates = [
        format!(r"{}\Hytale\install\release\package\game\latest\Assets.zip", roaming),
        format!(r"{}\Hytale\install\pre-release\package\game\latest\Assets.zip", roaming),
        r"C:\Users\Administrator\AppData\Roaming\Hytale\install\release\package\game\latest\Assets.zip".to_string(),
        r"C:\Users\Administrator\AppData\Roaming\Hytale\install\pre-release\package\game\latest\Assets.zip".to_string(),
    ];

    for c in candidates {
        if Path::new(&c).exists() {
            return Some(c);
        }
    }

    None
}

/// Encuentra el archivo zip-scan más reciente en HyCreator
fn find_latest_zip_scan(hycreator_dir: &Path) -> Option<PathBuf> {
    let zip_scan_dir = hycreator_dir.join("zip-scan");
    if !zip_scan_dir.exists() {
        return None;
    }

    let mut latest_file: Option<(PathBuf, std::time::SystemTime)> = None;
    if let Ok(entries) = std::fs::read_dir(zip_scan_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().map_or(false, |ext| ext == "json") {
                if let Ok(meta) = entry.metadata() {
                    let mtime = meta.modified().unwrap_or(std::time::UNIX_EPOCH);
                    if latest_file.as_ref().map_or(true, |(_, t)| mtime > *t) {
                        latest_file = Some((p, mtime));
                    }
                }
            }
        }
    }

    latest_file.map(|(p, _)| p)
}

#[tauri::command]
pub fn hycreator_get_info() -> Result<HyCreatorInfo, String> {
    let base_dir = get_hycreator_base_dir();
    let is_available = base_dir.exists();
    let assets_zip = get_default_assets_zip();

    let mut available_scans = Vec::new();
    let zip_scan_dir = base_dir.join("zip-scan");
    if zip_scan_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&zip_scan_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "json") {
                    available_scans.push(p.to_string_lossy().to_string());
                }
            }
        }
    }

    let latest_scan = find_latest_zip_scan(&base_dir);
    let active_scan_path = latest_scan.as_ref().map(|p| p.to_string_lossy().to_string());

    let mut total_prefabs = 0;
    let mut total_blockymodels = 0;
    let mut total_models = 0;
    let mut total_items = 0;

    if let Some(ref scan_path) = latest_scan {
        if let Ok(file) = File::open(scan_path) {
            let reader = std::io::BufReader::new(file);
            if let Ok(val) = serde_json::from_reader::<_, serde_json::Value>(reader) {
                if let Some(files) = val.pointer("/result/files").and_then(|f| f.as_array()) {
                    for f in files {
                        if let Some(kind) = f.get("kind").and_then(|k| k.as_str()) {
                            match kind {
                                "Prefabs" => total_prefabs += 1,
                                "blockymodel" => total_blockymodels += 1,
                                "model" => total_models += 1,
                                "Item" => total_items += 1,
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(HyCreatorInfo {
        is_available,
        hycreator_dir: base_dir.to_string_lossy().to_string(),
        assets_zip_path: assets_zip,
        available_scans,
        active_scan_path,
        total_prefabs,
        total_blockymodels,
        total_models,
        total_items,
    })
}

#[tauri::command]
pub fn hycreator_get_catalog_items(
    scan_file: Option<String>,
    filter_kind: Option<String>,
    search_term: Option<String>,
    page: usize,
    page_size: usize,
) -> Result<CatalogPageResult, String> {
    let base_dir = get_hycreator_base_dir();
    let scan_path = match scan_file {
        Some(s) if !s.is_empty() => PathBuf::from(s),
        _ => find_latest_zip_scan(&base_dir).ok_or("No se encontró ningún archivo de escaneo de HyCreator.")?,
    };

    let file = File::open(&scan_path).map_err(|e| format!("Error al abrir archivo de scan: {}", e))?;
    let reader = std::io::BufReader::new(file);
    let val: serde_json::Value = serde_json::from_reader(reader)
        .map_err(|e| format!("Error al procesar JSON de scan: {}", e))?;

    let files_arr = val
        .pointer("/result/files")
        .and_then(|f| f.as_array())
        .ok_or("Estructura de scan inválida: falta /result/files")?;

    let search_lower = search_term.as_deref().unwrap_or("").trim().to_lowercase();
    let kind_filter = filter_kind.as_deref().unwrap_or("").trim();

    let mut filtered_items = Vec::new();

    for f in files_arr {
        let kind = f.get("kind").and_then(|k| k.as_str()).unwrap_or("");
        let name = f.get("name").and_then(|n| n.as_str()).unwrap_or("");
        let rel = f.get("rel").and_then(|r| r.as_str()).unwrap_or("");

        // Solo incluir categorías relevantes para modelado 3D / prefabs
        let is_target_kind = match kind {
            "Prefabs" | "blockymodel" | "model" | "Item" | "Entity" => true,
            _ => false,
        };

        if !is_target_kind {
            continue;
        }

        // Filtro por tipo si se especifica
        if !kind_filter.is_empty() && !kind.eq_ignore_ascii_case(kind_filter) {
            continue;
        }

        // Filtro por búsqueda de texto
        if !search_lower.is_empty() {
            let name_matches = name.to_lowercase().contains(&search_lower);
            let rel_matches = rel.to_lowercase().contains(&search_lower);
            if !name_matches && !rel_matches {
                continue;
            }
        }

        filtered_items.push(HyCreatorItem {
            rel: rel.to_string(),
            name: name.to_string(),
            kind: kind.to_string(),
        });
    }

    let total = filtered_items.len();
    let actual_page = if page == 0 { 1 } else { page };
    let actual_size = if page_size == 0 { 50 } else { page_size.min(200) };

    let start_idx = ((actual_page - 1) * actual_size).min(total);
    let end_idx = (start_idx + actual_size).min(total);

    let paged_items = filtered_items[start_idx..end_idx].to_vec();

    Ok(CatalogPageResult {
        total,
        page: actual_page,
        page_size: actual_size,
        items: paged_items,
    })
}

#[tauri::command]
pub fn hycreator_read_asset(
    rel_path: String,
    assets_zip_override: Option<String>,
    working_folder: Option<String>,
) -> Result<AssetContentResult, String> {
    let clean_rel = rel_path.replace('/', "\\");

    // 1. Probar primero si existe como archivo físico en la carpeta de trabajo del servidor
    if let Some(ref wf) = working_folder {
        let wf_path = Path::new(wf);
        let candidate_paths = [
            wf_path.join(&clean_rel),
            wf_path.join("Server").join(&clean_rel),
            wf_path.join("assets").join(&clean_rel),
        ];

        for cand in candidate_paths {
            if cand.exists() && cand.is_file() {
                if let Ok(bytes) = std::fs::read(&cand) {
                    return format_asset_result(&rel_path, bytes);
                }
            }
        }
    }

    // 2. Extraer desde Assets.zip
    let zip_str = assets_zip_override
        .or_else(get_default_assets_zip)
        .ok_or_else(|| "No se encontró la ruta de Assets.zip en la configuración de HyCreator.".to_string())?;

    let zip_file = File::open(&zip_str)
        .map_err(|e| format!("No se pudo abrir Assets.zip en '{}': {}", zip_str, e))?;

    let mut archive = ZipArchive::new(zip_file)
        .map_err(|e| format!("Error al leer estructura de Assets.zip: {}", e))?;

    let normalized_rel = rel_path.replace('\\', "/");

    // Búsqueda directa por nombre normalizado
    let mut found_bytes: Option<Vec<u8>> = None;

    if let Ok(mut entry) = archive.by_name(&normalized_rel) {
        let mut buf = Vec::new();
        if entry.read_to_end(&mut buf).is_ok() {
            found_bytes = Some(buf);
        }
    }

    // Si no encontró directamente, probar con prefijo Server/ o coincidencia insensible a mayúsculas
    if found_bytes.is_none() {
        let candidates = [
            format!("Server/{}", normalized_rel),
            format!("Common/{}", normalized_rel),
        ];
        for cand in candidates {
            if let Ok(mut entry) = archive.by_name(&cand) {
                let mut buf = Vec::new();
                if entry.read_to_end(&mut buf).is_ok() {
                    found_bytes = Some(buf);
                    break;
                }
            }
        }
    }

    // Búsqueda lineal como fallback si las rutas tienen diferente mayúsculas/minúsculas
    if found_bytes.is_none() {
        let needle = normalized_rel.to_lowercase();
        for i in 0..archive.len() {
            if let Ok(mut entry) = archive.by_index(i) {
                let name_lower = entry.name().to_lowercase();
                if name_lower == needle || name_lower.ends_with(&format!("/{}", needle)) {
                    let mut buf = Vec::new();
                    if entry.read_to_end(&mut buf).is_ok() {
                        found_bytes = Some(buf);
                        break;
                    }
                }
            }
        }
    }

    let bytes = found_bytes.ok_or_else(|| format!("No se encontró '{}' en Assets.zip.", rel_path))?;
    format_asset_result(&rel_path, bytes)
}

fn format_asset_result(rel_path: &str, bytes: Vec<u8>) -> Result<AssetContentResult, String> {
    let size_bytes = bytes.len();
    let lower = rel_path.to_lowercase();

    if lower.ends_with(".png") || lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".webp") {
        use std::io::Write;
        let mime = if lower.ends_with(".png") {
            "image/png"
        } else if lower.ends_with(".webp") {
            "image/webp"
        } else {
            "image/jpeg"
        };
        // Codificar a base64 de manera segura
        let mut b64 = String::new();
        let encoded = simple_base64_encode(&bytes);
        b64.push_str(&format!("data:{};base64,{}", mime, encoded));
        Ok(AssetContentResult {
            rel_path: rel_path.to_string(),
            format: "image_data_url".into(),
            content: b64,
            size_bytes,
        })
    } else {
        // Tratar como texto (JSON / blockymodel / ui)
        match String::from_utf8(bytes) {
            Ok(text) => Ok(AssetContentResult {
                rel_path: rel_path.to_string(),
                format: "json".into(),
                content: text,
                size_bytes,
            }),
            Err(e) => {
                let text = String::from_utf8_lossy(e.as_bytes()).to_string();
                Ok(AssetContentResult {
                    rel_path: rel_path.to_string(),
                    format: "text".into(),
                    content: text,
                    size_bytes,
                })
            }
        }
    }
}

/// Codificador base64 ligero sin librerías externas adicionales
fn simple_base64_encode(input: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        out.push(CHARSET[(b0 >> 2) as usize] as char);
        out.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(b2 & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[tauri::command]
pub fn hycreator_scan_local_prefabs(folder_path: String) -> Result<Vec<HyCreatorItem>, String> {
    let root = Path::new(&folder_path);
    if !root.exists() {
        return Err("La carpeta especificada no existe.".into());
    }

    let mut items = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    // Evitar carpetas innecesarias
                    let name = p.file_name().unwrap_or_default().to_string_lossy();
                    if !name.starts_with('.') && name != "node_modules" && name != "target" {
                        stack.push(p);
                    }
                } else if p.is_file() {
                    let filename = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let lower = filename.to_lowercase();
                    let kind = if lower.ends_with(".prefab.json") {
                        Some("Prefabs")
                    } else if lower.ends_with(".blockymodel") {
                        Some("blockymodel")
                    } else if lower.ends_with(".bbmodel") {
                        Some("blockymodel")
                    } else if lower.ends_with(".obj") || lower.ends_with(".gltf") || lower.ends_with(".glb") {
                        Some("model")
                    } else {
                        None
                    };

                    if let Some(k) = kind {
                        let rel = p
                            .strip_prefix(root)
                            .unwrap_or(&p)
                            .to_string_lossy()
                            .replace('\\', "/");
                        items.push(HyCreatorItem {
                            rel,
                            name: filename,
                            kind: k.to_string(),
                        });
                    }
                }
            }
        }
    }

    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(items)
}
