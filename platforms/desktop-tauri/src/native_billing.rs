//! Gated entry to the store's in-app purchase for the Tauri hosts.
//!
//! `billing_invoke` is the ONLY command that reaches Google Play Billing
//! (through `tauri-plugin-billing`, which exposes nothing to JavaScript). It
//! answers the main window only. The purchase it returns grants nothing by
//! itself: the server verifies it with the Play Developer API. Desktop hosts,
//! which keep the Web payment, answer `billing_store_unavailable`.

use serde_json::{json, Value};
use tauri::{AppHandle, Runtime, WebviewWindow};

fn failure(code: &str) -> Value {
    json!({ "ok": false, "error": code })
}

#[tauri::command]
pub async fn billing_invoke<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    command: String,
    payload: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Ok(failure("billing_window_forbidden"));
    }
    if !cfg!(target_os = "android") {
        return Ok(failure("billing_store_unavailable"));
    }
    if command != "billing_store_purchase" {
        return Ok(failure("billing_command_unknown"));
    }
    let request = json!({
        "productId": payload["productId"].as_str().unwrap_or_default(),
        "kind": payload["kind"].as_str().unwrap_or_default(),
        "accountToken": payload["accountToken"].as_str().unwrap_or_default(),
    });
    let result = tauri::async_runtime::spawn_blocking(move || tauri_plugin_billing::call(&app, "purchase", request))
        .await
        .map_err(|_| "billing_native_error".to_string())?;
    Ok(result.unwrap_or_else(|error| failure(&error)))
}
