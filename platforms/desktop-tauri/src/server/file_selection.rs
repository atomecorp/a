//! Explicit local file acquisition; Axum alone reads the selected bytes.
use serde_json::{json, Value};

const MAX_TEXT_BYTES: u64 = 32 * 1024 * 1024;

fn options(data: &Value) -> Result<(&str, u64), &'static str> {
    let extension = data.get("extension").and_then(Value::as_str).unwrap_or("");
    let max_bytes = data.get("max_bytes").and_then(Value::as_u64).unwrap_or(0);
    if data.get("action").and_then(Value::as_str) != Some("read-text")
        || extension.is_empty() || extension.len() > 12
        || !extension.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        || max_bytes == 0 || max_bytes > MAX_TEXT_BYTES {
        return Err("file_selection_options_invalid");
    }
    Ok((extension, max_bytes))
}

#[cfg(target_os = "macos")]
fn read_selected(extension: &str, max_bytes: u64) -> Result<Value, String> {
    use std::{ffi::{CStr, CString, c_char}, io::Read};
    extern "C" {
        fn atome_file_selection_path(extension: *const c_char) -> *mut c_char;
        fn atome_file_selection_free(value: *mut c_char);
    }
    let extension_arg = CString::new(extension).map_err(|_| "file_selection_options_invalid")?;
    let selected: Value = unsafe {
        let raw = atome_file_selection_path(extension_arg.as_ptr());
        if raw.is_null() { return Err("file_selection_native_failed".into()); }
        let parsed = serde_json::from_slice(CStr::from_ptr(raw).to_bytes());
        atome_file_selection_free(raw);
        parsed.map_err(|_| "file_selection_response_invalid")?
    };
    if selected.get("ok").and_then(Value::as_bool) != Some(true) { return Ok(selected); }
    let path = std::path::Path::new(selected.get("path").and_then(Value::as_str)
        .ok_or("file_selection_path_invalid")?);
    if path.extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()).as_deref() != Some(extension) {
        return Err("file_selection_extension_invalid".into());
    }
    let file = std::fs::File::open(path).map_err(|_| "file_selection_read_failed")?;
    let meta = file.metadata().map_err(|_| "file_selection_read_failed")?;
    if !meta.is_file() || meta.len() > max_bytes { return Err("file_selection_too_large".into()); }
    let mut bytes = Vec::new();
    file.take(max_bytes + 1).read_to_end(&mut bytes).map_err(|_| "file_selection_read_failed")?;
    if bytes.len() as u64 > max_bytes { return Err("file_selection_too_large".into()); }
    let content = String::from_utf8(bytes).map_err(|_| "file_selection_encoding_invalid")?;
    Ok(json!({ "ok": true, "success": true, "name": path.file_name().and_then(|s| s.to_str()), "content": content }))
}

pub async fn handle(data: &Value) -> Value {
    let (extension, max_bytes) = match options(data) {
        Ok(value) => value,
        Err(error) => return json!({ "ok": false, "success": false, "error": error }),
    };
    #[cfg(target_os = "macos")]
    {
        let extension = extension.to_owned();
        match tokio::task::spawn_blocking(move || read_selected(&extension, max_bytes)).await {
            Ok(Ok(value)) => value,
            Ok(Err(error)) => json!({ "ok": false, "success": false, "error": error }),
            Err(_) => json!({ "ok": false, "success": false, "error": "file_selection_task_failed" }),
        }
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (extension, max_bytes); json!({ "ok": false, "success": false, "error": "file_selection_native_unsupported" }) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requests_cannot_supply_paths_or_unbounded_reads() {
        assert!(options(&json!({ "action": "read-text", "extension": "ics", "max_bytes": 1024 })).is_ok());
        for value in [json!({ "action": "read-path", "path": "/etc/passwd", "extension": "ics", "max_bytes": 1024 }),
            json!({ "action": "read-text", "extension": "../ics", "max_bytes": 1024 }),
            json!({ "action": "read-text", "extension": "ics", "max_bytes": MAX_TEXT_BYTES + 1 })] {
            assert!(options(&value).is_err());
        }
    }
}
