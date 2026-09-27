//! Saves a file the web layer produced (a page exported as PDF) into the user's
//! Downloads folder. WKWebView ignores `<a download>` on a blob, so the desktop
//! host writes the bytes itself; the name mirrors the one the web layer chose.

use base64::Engine;
use tauri::{AppHandle, Manager};

fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') { c } else { '_' })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.');
    if trimmed.is_empty() { "export.pdf".to_string() } else { trimmed.to_string() }
}

#[tauri::command]
pub fn export_file_save(app: AppHandle, name: String, data_base64: String) -> Result<serde_json::Value, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|error| format!("export_file_decode_failed:{error}"))?;
    let dir = app.path().download_dir().map_err(|error| format!("export_file_downloads_unavailable:{error}"))?;
    let file_name = safe_file_name(&name);
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((stem, ext)) => (stem.to_string(), format!(".{ext}")),
        None => (file_name.clone(), String::new()),
    };
    // Never overwrite an earlier export: « page (2).pdf » like a browser would.
    let mut path = dir.join(&file_name);
    let mut index = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({index}){ext}"));
        index += 1;
    }
    std::fs::write(&path, &bytes).map_err(|error| format!("export_file_write_failed:{error}"))?;
    Ok(serde_json::json!({ "success": true, "path": path.to_string_lossy(), "bytes": bytes.len() }))
}
