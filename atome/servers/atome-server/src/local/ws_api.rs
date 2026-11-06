use super::provider_relay::ProviderRelay;
use super::{AppState, handle_ws_file_message, local_atome, local_atome_extended, local_auth};
use axum::extract::ws::{Message, WebSocket};
use futures_util::StreamExt;
use serde_json::{Value as JsonValue, json};

/// A reply the browser is waiting on is matched by `requestId`; a frame without
/// one is dropped by the transport, which then waits out its full ten-second
/// timeout and reports `Request timeout`. The refusal the server had already
/// answered never reached the caller, so a dead token read as a hang and the
/// dashboard never opened. Every envelope built here therefore carries the id
/// back, plus the `success`/`ok`/`error` fields the transport reads to tell a
/// refusal from an answer — `message` alone was decoded as a success.
pub fn ws_reply_envelope(mut value: JsonValue, request_id: Option<&str>) -> JsonValue {
    if let Some(object) = value.as_object_mut() {
        if let Some(request_id) = request_id {
            object.insert(
                "requestId".to_string(),
                JsonValue::String(request_id.to_string()),
            );
            object.insert(
                "request_id".to_string(),
                JsonValue::String(request_id.to_string()),
            );
        }
        if !object.contains_key("success") {
            object.insert("success".to_string(), JsonValue::Bool(false));
        }
        if !object.contains_key("ok") {
            object.insert("ok".to_string(), JsonValue::Bool(false));
        }
        if !object.contains_key("error") {
            let text = object
                .get("message")
                .and_then(|value| value.as_str())
                .unwrap_or("ws_request_failed")
                .to_string();
            object.insert("error".to_string(), JsonValue::String(text));
        }
    }
    value
}

pub fn ws_authenticated_user(data: &JsonValue, state: &AppState) -> Result<String, JsonValue> {
    let auth_state = state
        .auth_state
        .as_ref()
        .ok_or_else(|| json!({"type": "error", "message": "Auth state not initialized"}))?;
    let token = data.get("token").and_then(|value| value.as_str());
    local_auth::verified_user_id_from_token(auth_state, token)
        .ok_or_else(|| json!({"type": "error", "message": "Authentication required"}))
}

/// Handle WebSocket API connection (ADOLE v3.0)
pub(super) async fn handle_ws_api(mut socket: WebSocket, state: AppState) {
    println!("🔗 New WebSocket API connection");

    let mut provider = ProviderRelay::default();
    let mut sync_events = super::sync_event_sender().subscribe();
    let mut observed_token: Option<String> = None;
    loop {
        let msg = tokio::select! {
            notification = sync_events.recv() => {
                if let Ok(payload) = notification
                    && matches!(payload["type"].as_str(), Some("sync:status" | "sync:projection-ready")) {
                        let user = state.auth_state.as_ref().and_then(|auth| local_auth::verified_user_id_from_token(auth, observed_token.as_deref()));
                        if user.as_deref().is_some_and(|id| payload["local_user_id"].as_str() == Some(id))
                            && socket.send(Message::Text(payload.to_string().into())).await.is_err() { break; }
                    }
                continue;
            },
            incoming = socket.next() => { let Some(incoming) = incoming else { break; }; incoming },
            response = provider.receive() => {
                if let Some(response) = response
                    && socket.send(Message::Text(response.to_string().into())).await.is_err() { break; }
                continue;
            }
        };
        let msg = match msg {
            Ok(m) => m,
            Err(_) => break,
        };

        match msg {
            Message::Text(text) => {
                // Parse JSON message
                let data: serde_json::Value = match serde_json::from_str(&text) {
                    Ok(v) => v,
                    Err(_) => {
                        let _ = socket
                            .send(Message::Text(
                                ws_reply_envelope(
                                    json!({"type": "error", "message": "Invalid JSON"}),
                                    None,
                                )
                                .to_string()
                                .into(),
                            ))
                            .await;
                        continue;
                    }
                };

                let msg_type = data.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(token) = data["token"].as_str() {
                    observed_token = ws_authenticated_user(&data, &state)
                        .ok()
                        .map(|_| token.to_string());
                }
                let request_id = data
                    .get("requestId")
                    .or_else(|| data.get("request_id"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());
                let request_id = request_id.as_deref();

                // Handle ping/pong
                if msg_type == "ping" {
                    if let Some(user) = state.auth_state.as_ref().and_then(|auth| {
                        local_auth::verified_user_id_from_token(auth, observed_token.as_deref())
                    }) {
                        super::broadcast_sync_event(
                            json!({"type":"sync:connection-check", "local_user_id":user}),
                        );
                    }
                    let _ = socket
                        .send(Message::Text(json!({"type": "pong"}).to_string().into()))
                        .await;
                    continue;
                }

                if msg_type == "ai-provider" {
                    let result = match ws_authenticated_user(&data, &state) {
                        Ok(user_id) => match state.atome_state.as_ref() {
                            Some(atome) => provider.send(data.clone(), &user_id, atome).await,
                            None => Err("provider_principal_unavailable".to_string()),
                        },
                        Err(_) => Err("not_authenticated".to_string()),
                    };
                    if let Err(error) = result {
                        let response = ws_reply_envelope(
                            json!({"type":"ai-provider-response", "error":error}),
                            request_id,
                        );
                        if socket
                            .send(Message::Text(response.to_string().into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    continue;
                }

                if socket
                    .send(Message::Text(answer(data, &state).await.to_string().into()))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Message::Ping(data) => {
                let _ = socket.send(Message::Pong(data)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    println!("🔌 WebSocket API connection closed");
}

/// The answer to one `/ws/api` frame that needs no connection of its own: the page's
/// socket and the native controllers of a platform (iOS) answer through it alike.
pub async fn answer(data: JsonValue, state: &AppState) -> JsonValue {
    let msg_type = data["type"].as_str().unwrap_or("").to_string();
    let msg_type = msg_type.as_str();
    let request_id = data["requestId"]
        .as_str()
        .or_else(|| data["request_id"].as_str())
        .map(String::from);
    let request_id = request_id.as_deref();

    if super::public_relay::PUBLIC_TYPES.contains(&msg_type) {
        return super::public_relay::relay(&data).await;
    }
    if super::public_relay::ACCOUNT_TYPES.contains(&msg_type) {
        // atome.one's account frames: signed with the verified account's remote credential.
        let credential = ws_authenticated_user(&data, state).ok().and_then(|user| {
            state.atome_state.as_ref().and_then(|atome| {
                atome
                    .remote_sync_credentials
                    .lock()
                    .ok()
                    .and_then(|items| items.get(&user).cloned())
            })
        });
        return match credential {
            Some(credential) => super::public_relay::relay_signed(&data, &credential).await,
            None => ws_reply_envelope(
                json!({"type": format!("{msg_type}-response"), "ok": false, "success": false,
                    "error": "remote_account_unavailable"}),
                request_id,
            ),
        };
    }
    // A family only this platform answers (Tauri: `gps-native`, `file-selection`).
    if let Some(reply) = super::host().answer(msg_type, &data, state) {
        return reply.await;
    }
    if msg_type == "auth" {
        return match state.auth_state.as_ref() {
            Some(auth_state) => local_auth::handle_auth_message(data, auth_state).await,
            None => ws_reply_envelope(
                json!({"type": "error", "message": "Auth state not initialized"}),
                request_id,
            ),
        };
    }
    if msg_type == "file" {
        return handle_ws_file_message(data, state).await;
    }
    if !matches!(
        msg_type,
        "atome" | "events" | "state-current" | "snapshot" | "user-data" | "sync" | "history"
    ) {
        return ws_reply_envelope(
            json!({"type": "error", "message": "Unknown message type"}),
            request_id,
        );
    }
    let Some(atome_state) = state.atome_state.as_ref() else {
        return ws_reply_envelope(
            json!({"type": "error", "message": "Atome state not initialized"}),
            request_id,
        );
    };
    let user_id = match ws_authenticated_user(&data, state) {
        Ok(user_id) => user_id,
        Err(response) => return ws_reply_envelope(response, request_id),
    };
    let response = match msg_type {
        "atome" if data["action"].as_str() == Some("history") => {
            local_atome_extended::handle_history_message(data, &user_id, atome_state).await
        }
        "atome" => local_atome::handle_atome_message(data, &user_id, atome_state).await,
        "events" => local_atome::handle_events_message(data, &user_id, atome_state).await,
        "state-current" => {
            local_atome::handle_state_current_message(data, &user_id, atome_state).await
        }
        "history" => local_atome::handle_history_command(data, &user_id, atome_state).await,
        "snapshot" => {
            local_atome_extended::handle_snapshot_message(data, &user_id, atome_state).await
        }
        "user-data" => {
            local_atome_extended::handle_user_data_message(data, &user_id, atome_state).await
        }
        _ => local_atome_extended::handle_sync_message(data, &user_id, atome_state).await,
    };
    json!(response)
}
