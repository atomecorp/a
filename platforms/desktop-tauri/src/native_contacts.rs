#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
fn read_windows_contacts() -> Result<serde_json::Value, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            WINDOWS_CONTACTS_POWERSHELL,
        ])
        .output()
        .map_err(|error| format!("windows_contacts_command_failed:{error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "unknown_powershell_failure".to_string()
        };
        return Err(format!("windows_contacts_command_failed:{message}"));
    }
    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("windows_contacts_utf8_failed:{error}"))?;
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err("windows_contacts_empty_output".to_string());
    }
    serde_json::from_str(trimmed).map_err(|error| format!("windows_contacts_json_failed:{error}"))
}

#[tauri::command]
pub async fn macos_contacts_snapshot(app: tauri::AppHandle, cursor: Option<String>, collections: Option<Vec<String>>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        return crate::native_personal_import::read(app, "contact", serde_json::json!({"cursor": cursor, "collections": collections.unwrap_or_default()})).await;
    }

    #[cfg(target_os = "windows")]
    {
        let _ = (app, cursor, collections);
        return tokio::task::spawn_blocking(read_windows_contacts)
            .await
            .map_err(|error| format!("windows_contacts_task_failed:{error}"))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, cursor, collections);
        Err("macos_contacts_unsupported".to_string())
    }
}
