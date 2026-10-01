//! Gated entry to health data for the Tauri hosts.
//!
//! `health_invoke` is the ONLY command that reaches Health Connect (through
//! `tauri-plugin-health`, which exposes nothing to JavaScript). It enforces the
//! same contract as the iOS `AppNativeHealthController`:
//! - one channel token per page load of the `main` window, reset on every
//!   main-frame page load (`reset_on_page_load`);
//! - the account is the one VERIFIED by the local Axum auth (`me`) from the
//!   session token, never a user id supplied by JavaScript; guests are refused;
//! - reading requires the explicit local association `health_link`;
//! - a reply computed for an older generation is dropped.
//! Desktop hosts answer `health_host_unsupported` without loading anything.

use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Runtime, WebviewWindow};

#[derive(Default)]
pub struct HealthChannelState {
    token: Option<String>,
    closed: bool,
    generation: u64,
}

pub fn state() -> HealthChannelState {
    HealthChannelState::default()
}

fn new_token() -> String {
    uuid::Uuid::new_v4().simple().to_string() + &uuid::Uuid::new_v4().simple().to_string()
}

pub fn reset_on_page_load(channel: &Mutex<HealthChannelState>) {
    if let Ok(mut state) = channel.lock() {
        state.token = None;
        state.closed = false;
        state.generation = state.generation.wrapping_add(1);
    }
}

fn failure(code: &str) -> Value {
    json!({ "ok": false, "error": code })
}

async fn verified_account(auth: &Value) -> Result<String, &'static str> {
    let token = auth.as_str().filter(|value| !value.is_empty()).ok_or("health_account_required")?;
    let response = crate::auth_device::auth_ws_request(
        "ws://127.0.0.1:3000/ws/api".to_string(),
        json!({ "action": "me", "token": token }),
        "health_account_unverifiable",
    )
    .await
    .map_err(|_| "health_account_unverifiable")?;
    let user = &response["user"];
    let id = user["id"].as_str().filter(|value| !value.is_empty());
    let phone = user["phone"].as_str().filter(|value| !value.is_empty());
    match (response["ok"].as_bool(), id, phone) {
        // A verified phone = a real account; guests have none.
        (Some(true), Some(id), Some(_)) => Ok(id.to_string()),
        _ => Err("health_account_required"),
    }
}

fn monitors_payload(payload: &Value) -> Value {
    let ids: Vec<Value> = payload["monitors"]
        .as_array()
        .map(|items| items.iter().filter(|item| item.is_string()).take(32).cloned().collect())
        .unwrap_or_default();
    json!({ "monitors": ids })
}

fn requests_payload(payload: &Value) -> Value {
    let requests: Vec<Value> = payload["requests"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| item["id"].is_string() && item["from"].is_number() && item["to"].is_number())
                .take(32)
                .map(|item| json!({ "id": item["id"], "from": item["from"], "to": item["to"] }))
                .collect()
        })
        .unwrap_or_default();
    json!({ "requests": requests })
}

async fn plugin<R: Runtime>(app: &AppHandle<R>, method: &'static str, payload: Value) -> Result<Value, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || tauri_plugin_health::call(&app, method, payload))
        .await
        .map_err(|_| "health_native_error".to_string())?
}

#[tauri::command]
pub async fn health_invoke<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    channel: tauri::State<'_, Mutex<HealthChannelState>>,
    command: String,
    payload: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Ok(failure("health_window_forbidden"));
    }
    if !cfg!(target_os = "android") {
        return Ok(failure("health_host_unsupported"));
    }
    let generation = {
        let mut state = channel.lock().map_err(|_| "health_state_unavailable")?;
        if command == "health_channel_open" {
            if state.token.is_some() || state.closed {
                return Ok(failure("health_channel_already_open"));
            }
            let token = new_token();
            state.token = Some(token.clone());
            return Ok(json!({ "channel": token }));
        }
        let presented = payload["channel"].as_str().unwrap_or_default();
        if state.closed || state.token.as_deref() != Some(presented) || presented.is_empty() {
            return Ok(failure("health_channel_invalid"));
        }
        if command == "health_channel_close" {
            state.closed = true;
            state.generation = state.generation.wrapping_add(1);
        } else if command == "health_context_reset" {
            state.generation = state.generation.wrapping_add(1);
        }
        state.generation
    };

    let result = match command.as_str() {
        "health_channel_close" | "health_context_reset" => plugin(&app, "reset", json!({})).await,
        "health_capabilities" => plugin(&app, "capabilities", monitors_payload(&payload)).await,
        "health_link_status" | "health_link" | "health_request_access" | "health_read" | "health_observe"
        | "health_unobserve" => {
            let account = match verified_account(&payload["auth"]).await {
                Ok(account) => account,
                Err(code) => return Ok(failure(code)),
            };
            let linked = plugin(&app, "isLinked", json!({ "account": account })).await?;
            match command.as_str() {
                "health_link_status" => Ok(linked),
                "health_link" => plugin(&app, "link", json!({ "account": account })).await,
                _ if linked["linked"].as_bool() != Some(true) => return Ok(failure("health_link_required")),
                "health_request_access" => plugin(&app, "requestAccess", monitors_payload(&payload)).await,
                "health_read" => plugin(&app, "read", requests_payload(&payload)).await,
                "health_observe" => plugin(&app, "observe", monitors_payload(&payload)).await,
                _ => plugin(&app, "unobserve", monitors_payload(&payload)).await,
            }
        }
        _ => return Ok(failure("health_command_unknown")),
    };

    // A reply computed for an older page / account context is never delivered.
    let current = channel.lock().map(|state| state.generation == generation && !state.closed).unwrap_or(false);
    if !current && command != "health_channel_close" && command != "health_context_reset" {
        return Ok(failure("health_context_changed"));
    }
    Ok(result.unwrap_or_else(|error| failure(&error)))
}
