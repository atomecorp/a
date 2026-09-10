//! Host clipboard bridge for the desktop runtime.
//!
//! The heavy lifting is done by the official `tauri-plugin-clipboard-manager`,
//! but the plugin is deliberately NOT exposed to the web layer directly: its
//! commands are addressed as `plugin:clipboard-manager|read_text`, a name the
//! iOS bridge cannot possibly answer to. Wrapping it in three thin commands
//! named exactly like the Swift ones keeps a single call site in
//! `eVe/intuition/tools/clipboard/system_bridge.js` for every native host.
//!
//! The response shape mirrors `AppNativeClipboardController.swift` field for
//! field, so the JS facade needs one parser rather than two.

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

#[tauri::command]
pub fn clipboard_write_text(app: AppHandle, text: String) -> Result<serde_json::Value, String> {
    app.clipboard()
        .write_text(text.clone())
        .map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "success": true, "length": text.chars().count() }))
}

#[tauri::command]
pub fn clipboard_read_text(app: AppHandle) -> Result<serde_json::Value, String> {
    // An empty clipboard is a normal answer, not a failure: reporting it as an
    // error would make the JS facade treat a nominal case as a native fault and
    // stop trusting the bridge.
    let text = app.clipboard().read_text().unwrap_or_default();
    Ok(serde_json::json!({
        "success": true,
        "has_text": !text.is_empty(),
        "text": text
    }))
}

#[tauri::command]
pub fn clipboard_has_text(app: AppHandle) -> Result<serde_json::Value, String> {
    let text = app.clipboard().read_text().unwrap_or_default();
    Ok(serde_json::json!({ "success": true, "has_text": !text.is_empty() }))
}
