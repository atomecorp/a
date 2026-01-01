use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::native_recorder;

#[derive(Debug, Clone)]
struct ActiveSession {
    session_id: String,
    source: String, // "mic" | "plugin"
    file_name: String,
    user_id: String,
    sample_rate: u32,
    channels: u16,
    failed_error: Option<String>,
}

static ACTIVE: OnceLock<Mutex<Option<ActiveSession>>> = OnceLock::new();
static EVENTS: OnceLock<Mutex<Vec<Value>>> = OnceLock::new();

fn active_state() -> &'static Mutex<Option<ActiveSession>> {
    ACTIVE.get_or_init(|| Mutex::new(None))
}

fn events_state() -> &'static Mutex<Vec<Value>> {
    EVENTS.get_or_init(|| Mutex::new(Vec::new()))
}

fn push_event(evt: Value) {
    if let Ok(mut q) = events_state().lock() {
        q.push(evt);
    }
}

fn normalize_source(v: &Value) -> String {
    let s = v.as_str().unwrap_or("mic").trim().to_lowercase();
    if s == "plugin" || s == "plugin_output" {
        "plugin".to_string()
    } else {
        "mic".to_string()
    }
}

fn sanitize_file_name(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return "mic.wav".to_string();
    }
    let sanitized: String = trimmed
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => c,
            _ => '_',
        })
        .collect();
    let mut out = if sanitized.trim().is_empty() {
        "mic.wav".to_string()
    } else {
        sanitized
    };
    if !out.to_ascii_lowercase().ends_with(".wav") {
        out.push_str(".wav");
    }
    out
}

fn recording_rel_path(user_id: &str, file_name: &str) -> String {
    format!("data/users/{}/recordings/{}", user_id, file_name)
}

fn recording_abs_path(project_root: &PathBuf, user_id: &str, file_name: &str) -> PathBuf {
    project_root.join(recording_rel_path(user_id, file_name))
}

/// Receives messages from the WebView (window.__toDSP) and routes them to native actions.
///
/// Expected message shape (JS):
/// { type:'iplug', action:'record_start'|'record_stop', sessionId, fileName, source:'mic'|'plugin', sampleRate, channels }
#[tauri::command]
pub fn iplug_send(paths: tauri::State<crate::ProjectPaths>, msg: Value) -> Result<Value, String> {
    let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    if msg_type != "iplug" {
        return Ok(json!({ "success": false, "error": "Unsupported message type" }));
    }

    let action = msg.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "record_start" => {
            if let Ok(guard) = active_state().lock() {
                if guard.is_some() {
                    let session_id = msg
                        .get("sessionId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                    push_event(json!({
                        "type": "record_error",
                        "payload": {
                            "session_id": session_id,
                            "error": "Recording already in progress"
                        }
                    }));
                    return Ok(json!({ "success": false, "session_id": session_id }));
                }
            }

            let file_name = sanitize_file_name(
                msg.get("fileName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("mic.wav"),
            );

            let user_id = msg
                .get("userId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();

            let sample_rate = msg
                .get("sampleRate")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32)
                .unwrap_or(16000);
            let channels = msg
                .get("channels")
                .and_then(|v| v.as_u64())
                .map(|v| v as u16)
                .unwrap_or(1);
            let source = normalize_source(msg.get("source").unwrap_or(&Value::Null));

            let session_id = msg
                .get("sessionId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

            // In Tauri we must know the user id to write into data/users/<userId>/recordings.
            // If missing, we fail fast and emit record_error.
            let mut failed_error: Option<String> = None;

            if user_id.is_empty() {
                failed_error = Some("Missing userId for native recording".to_string());
            } else {
                let abs_path = recording_abs_path(&paths.project_root, &user_id, &file_name);
                let parent = abs_path
                    .parent()
                    .ok_or_else(|| "Invalid output path".to_string())?
                    .to_path_buf();
                if let Err(e) = std::fs::create_dir_all(&parent) {
                    failed_error = Some(format!("Unable to create recordings directory: {e}"));
                } else {
                    let abs_str = abs_path
                        .to_str()
                        .ok_or_else(|| "Output path contains invalid UTF-8".to_string())?
                        .to_string();
                    if let Err(e) = native_recorder::start(&abs_str, sample_rate, channels, &source)
                    {
                        failed_error = Some(e);
                    }
                }
            }

            if let Some(err) = failed_error {
                push_event(json!({
                    "type": "record_error",
                    "payload": {
                        "session_id": session_id,
                        "error": err,
                        "file_name": file_name
                    }
                }));
                return Ok(json!({ "success": false, "session_id": session_id }));
            }

            let rel_path = recording_rel_path(&user_id, &file_name);
            push_event(json!({
                "type": "record_started",
                "payload": {
                    "session_id": session_id,
                    "source": source,
                    "path": rel_path,
                    "sample_rate": sample_rate,
                    "channels": channels,
                    "file_name": file_name
                }
            }));

            if let Ok(mut st) = active_state().lock() {
                *st = Some(ActiveSession {
                    session_id: session_id.clone(),
                    source: source.clone(),
                    file_name: file_name.clone(),
                    user_id: user_id.clone(),
                    sample_rate,
                    channels,
                    failed_error: None,
                });
            }

            Ok(json!({ "success": true, "session_id": session_id }))
        }

        "record_stop" => {
            let requested_session_id = msg
                .get("sessionId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_default();

            let (session_id, source, file_name, user_id, sample_rate, channels, failed_error) = {
                let guard = active_state()
                    .lock()
                    .map_err(|_| "State lock poisoned".to_string())?;
                if let Some(s) = guard.clone() {
                    (
                        s.session_id,
                        s.source,
                        s.file_name,
                        s.user_id,
                        s.sample_rate,
                        s.channels,
                        s.failed_error,
                    )
                } else {
                    push_event(json!({
                        "type": "record_error",
                        "payload": {
                            "session_id": requested_session_id,
                            "error": "No active recording session"
                        }
                    }));
                    return Ok(json!({ "success": false }));
                }
            };

            if !requested_session_id.is_empty() && requested_session_id != session_id {
                push_event(json!({
                    "type": "record_error",
                    "payload": {
                        "session_id": requested_session_id,
                        "error": "Session id mismatch"
                    }
                }));
                return Ok(json!({ "success": false }));
            }

            // If start failed, emit record_error now so JS stop() resolves.
            if let Some(err) = failed_error {
                push_event(json!({
                    "type": "record_error",
                    "payload": {
                        "session_id": session_id,
                        "error": err,
                        "file_name": file_name
                    }
                }));
            } else {
                match native_recorder::stop() {
                    Ok(duration_sec) => {
                        let rel_path = recording_rel_path(&user_id, &file_name);
                        push_event(json!({
                            "type": "record_done",
                            "payload": {
                                "session_id": session_id,
                                "file_name": file_name,
                                "path": rel_path,
                                "source": source,
                                "sample_rate": sample_rate,
                                "channels": channels,
                                "duration_sec": duration_sec
                            }
                        }));
                    }
                    Err(e) => {
                        push_event(json!({
                            "type": "record_error",
                            "payload": {
                                "session_id": session_id,
                                "error": e,
                                "file_name": file_name
                            }
                        }));
                    }
                }
            }

            if let Ok(mut st) = active_state().lock() {
                *st = None;
            }

            Ok(json!({ "success": true }))
        }

        _ => Ok(json!({ "success": false, "error": "Unsupported action" })),
    }
}

/// Called from JS poller to fetch queued native->UI events.
#[tauri::command]
pub fn iplug_poll_events() -> Vec<Value> {
    if let Ok(mut q) = events_state().lock() {
        let out = q.drain(..).collect::<Vec<_>>();
        return out;
    }
    Vec::new()
}
