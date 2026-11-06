//! Saves a file the web layer produced (a page exported as PDF) into the user's
//! Downloads folder. WKWebView ignores `<a download>` on a blob, so the desktop
//! host writes the bytes itself; the name mirrors the one the web layer chose.
//! A page the web layer painted (one sheet as a JPEG or PNG: an ordonnance) is printed
//! in a window of its own showing that picture alone: the system print dialog of its
//! webview on macOS (WKWebView ignores `window.print()`), the webview's print elsewhere.

use base64::Engine;
use tauri::{AppHandle, Manager};

fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.');
    if trimmed.is_empty() {
        "export.pdf".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub fn export_file_save(
    app: AppHandle,
    name: String,
    data_base64: String,
) -> Result<serde_json::Value, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|error| format!("export_file_decode_failed:{error}"))?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("export_file_downloads_unavailable:{error}"))?;
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

const PRINT_TYPES: [&str; 2] = ["image/jpeg", "image/png"];

#[tauri::command]
pub fn export_file_print(
    app: AppHandle,
    name: String,
    data_base64: String,
    mime: String,
) -> Result<serde_json::Value, String> {
    if !PRINT_TYPES.contains(&mime.as_str()) {
        return Err("export_print_type_invalid".to_string());
    }
    base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|error| format!("export_file_decode_failed:{error}"))?;
    print_page(&app, &safe_file_name(&name), &mime, &data_base64)
}

#[cfg(desktop)]
fn print_page(
    app: &AppHandle,
    title: &str,
    mime: &str,
    data_base64: &str,
) -> Result<serde_json::Value, String> {
    use tauri::webview::PageLoadEvent;
    let url = tauri::Url::parse(&format!("data:{mime};base64,{data_base64}"))
        .map_err(|error| format!("export_print_url_invalid:{error}"))?;
    // One window a print, each its own label.
    static PRINTS: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let label = format!(
        "print_{}",
        PRINTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::External(url))
        .title(title)
        .inner_size(595.0, 842.0)
        .on_page_load(|window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            #[cfg(target_os = "macos")]
            let printed = window.print();
            #[cfg(not(target_os = "macos"))]
            let printed = window.eval("window.print()");
            // The dialog opens after the command answered: a failure then closes the page and is said in the log.
            if let Err(error) = printed {
                let _ = window.close();
                eprintln!("export_file_print failed: {error}");
            }
        })
        .build()
        .map_err(|error| format!("export_print_window_failed:{error}"))?;
    Ok(serde_json::json!({ "success": true }))
}

#[cfg(mobile)]
fn print_page(
    _app: &AppHandle,
    _title: &str,
    _mime: &str,
    _data_base64: &str,
) -> Result<serde_json::Value, String> {
    Err("export_print_unavailable".to_string())
}
