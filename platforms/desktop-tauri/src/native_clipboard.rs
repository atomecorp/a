//! The host supplies clipboard representations; Axum owns all file access.
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[cfg(target_os = "macos")]
extern "C" {
    fn atome_clipboard_snapshot() -> *mut std::ffi::c_char;
    fn atome_clipboard_mark(key: *const std::ffi::c_char) -> bool;
    fn atome_clipboard_free(value: *mut std::ffi::c_char);
}

pub(crate) fn read_snapshot() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let output = atome_clipboard_snapshot();
        if output.is_null() { return Err("clipboard_snapshot_failed".into()); }
        let result = serde_json::from_slice(std::ffi::CStr::from_ptr(output).to_bytes())
            .map_err(|_| "clipboard_snapshot_invalid".to_string());
        atome_clipboard_free(output);
        result
    }
    #[cfg(not(target_os = "macos"))]
    { Err("clipboard_typed_read_unsupported".into()) }
}

#[tauri::command]
pub fn clipboard_write_text(app: AppHandle, text: String, copy_key: Option<String>) -> Result<serde_json::Value, String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    if let Some(key) = copy_key {
        let key = std::ffi::CString::new(key).map_err(|_| "clipboard_copy_key_invalid")?;
        if !unsafe { atome_clipboard_mark(key.as_ptr()) } { return Err("clipboard_copy_identity_failed".into()); }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = copy_key;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn clipboard_read_items() -> Result<serde_json::Value, String> {
    let mut result = tokio::task::spawn_blocking(read_snapshot).await.map_err(|e| e.to_string())??;
    // Filesystem paths never leave the Axum/native boundary.
    if let Some(items) = result.get_mut("items").and_then(|v| v.as_array_mut()) {
        for item in items { if let Some(fields) = item.as_object_mut() { fields.remove("file_url"); } }
    }
    Ok(result)
}

#[tauri::command]
pub fn clipboard_read_text(app: AppHandle) -> Result<serde_json::Value, String> {
    let text = app.clipboard().read_text().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "has_text": !text.is_empty(), "text": text }))
}

#[tauri::command]
pub fn clipboard_has_text(app: AppHandle) -> Result<serde_json::Value, String> {
    let has_text = app.clipboard().read_text().is_ok_and(|text| !text.is_empty());
    Ok(serde_json::json!({ "success": true, "has_text": has_text }))
}
