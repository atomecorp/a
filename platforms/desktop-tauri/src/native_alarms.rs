use crate::native_communication::is_canonical_main_window;
use serde_json::{Value, json};
use tauri::{AppHandle, Runtime, WebviewWindow};

// The phone's own alarms and calendars on Android, the same commands as the iOS bridge
// (eVe/intuition/tools/calendar_alarm_native.js, calendar_device_export.js): the Kotlin host arms
// AlarmManager (AtomeAlarms.kt) and writes eVe's appointments into the device calendar
// (AtomeDeviceCalendar.kt). Only the canonical main page calls them.
const ALARM_COMMANDS: &[&str] = &[
    "calendar_alarm_platform",
    "calendar_alarm_authorization",
    "calendar_alarm_schedule",
    "calendar_alarm_cancel",
    "calendar_alarm_list",
    "calendar_alarm_opened_take",
    "calendar_alarm_sync",
    "calendar_alarm_sound_has",
    "calendar_alarm_sound_store",
];
const CALENDAR_COMMANDS: &[&str] = &["calendar_export_authorization", "calendar_export_sync"];

async fn forward<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    method: &'static str,
    allowed: &[&str],
    command: String,
    payload: Value,
) -> Result<Value, String> {
    if !is_canonical_main_window(&window) {
        return Err("device_host_window_forbidden".into());
    }
    if !cfg!(target_os = "android") {
        return Err("device_host_unsupported".into());
    }
    if !allowed.contains(&command.as_str()) {
        return Err("device_host_command_invalid".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        tauri_plugin_mobile_host::call(&app, method, json!({"command":command,"payload":payload}))
    })
    .await
    .map_err(|_| "device_host_unavailable".to_string())?
}

#[tauri::command]
pub async fn alarms_invoke<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    command: String,
    payload: Value,
) -> Result<Value, String> {
    forward(app, window, "alarms", ALARM_COMMANDS, command, payload).await
}

#[tauri::command]
pub async fn device_calendar_invoke<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    command: String,
    payload: Value,
) -> Result<Value, String> {
    forward(
        app,
        window,
        "deviceCalendar",
        CALENDAR_COMMANDS,
        command,
        payload,
    )
    .await
}
