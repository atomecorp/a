#[cfg(target_os = "macos")]
use std::{ffi::{CStr, CString, c_char}, sync::OnceLock};
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
#[cfg(target_os = "macos")]
extern "C" {
    fn atome_personal_read(domain: *const c_char, json: *const c_char, callback: extern "C" fn(*const c_char)) -> *mut c_char;
    fn atome_personal_free(value: *mut c_char);
}
#[cfg(target_os = "macos")]
extern "C" fn changed(domain: *const c_char) {
    let domain = unsafe { CStr::from_ptr(domain) }.to_string_lossy();
    if !["contact", "calendar_event"].contains(&domain.as_ref()) { return; }
    if let Some(app) = APP.get() {
        for window in app.webview_windows().values() {
            let _ = window.eval(&format!("window.dispatchEvent(new CustomEvent('atome:native-source-changed',{{detail:{{domain:'{domain}'}}}}));"));
        }
    }
}
#[cfg(target_os = "macos")]
pub async fn read(app: tauri::AppHandle, domain: &'static str, options: serde_json::Value) -> Result<serde_json::Value, String> {
    let _ = APP.set(app);
    tokio::task::spawn_blocking(move || {
        let domain = CString::new(domain).map_err(|_| "native_import_domain_invalid")?;
        let options = CString::new(options.to_string()).map_err(|_| "native_import_options_invalid")?;
        unsafe {
            let output = atome_personal_read(domain.as_ptr(), options.as_ptr(), changed);
            if output.is_null() { return Err("native_import_empty_response".to_string()); }
            let result = serde_json::from_slice(CStr::from_ptr(output).to_bytes()).map_err(|_| "native_import_response_invalid".to_string());
            atome_personal_free(output); result
        }
    }).await.map_err(|_| "native_import_task_failed".to_string())?
}

#[tauri::command]
pub async fn native_calendar_snapshot(app: tauri::AppHandle, cursor: Option<serde_json::Value>, start_year: Option<i32>,
    future_years: Option<i32>, collections: Option<Vec<String>>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    return read(app, "calendar_event", serde_json::json!({"cursor": cursor, "startYear": start_year,
        "futureYears": future_years, "collections": collections.unwrap_or_default()})).await;
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, cursor, start_year, future_years, collections); Err("native_calendar_unsupported".to_string()) }
}

/// This installation's identity for native imports (agenda, contacts). It lives in
/// the app's data folder, which a rebuilt debug app keeps, while its WebView storage
/// (where the page keeps its surface id) is reset: every rebuild used to look like a
/// new device, so the imports stopped resuming and later re-read the whole history.
/// The first page to ask records its own surface id.
#[tauri::command]
pub fn native_import_device_id(app: tauri::AppHandle, candidate: String) -> Result<String, String> {
    use tauri::Manager;
    let valid = |value: &str| !value.is_empty() && value.len() <= 64
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_');
    let dir = app.path().app_data_dir().map_err(|_| "app_data_dir_unavailable".to_string())?.join("squirrel").join("Data");
    let path = dir.join("import_device_id");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim();
        if valid(existing) { return Ok(existing.to_string()); }
    }
    if !valid(candidate.trim()) { return Err("import_device_id_invalid".to_string()); }
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    std::fs::write(&path, candidate.trim()).map_err(|error| error.to_string())?;
    Ok(candidate.trim().to_string())
}
