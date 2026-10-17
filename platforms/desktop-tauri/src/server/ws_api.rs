use super::{local_atome, local_atome_extended, local_auth, handle_ws_file_message, AppState};
use axum::extract::ws::{Message, WebSocket};
use futures_util::StreamExt;
use serde_json::{json, Value as JsonValue};
use super::provider_relay::ProviderRelay;
#[path = "file_selection.rs"]
mod file_selection;
#[path = "gps_native.rs"]
mod gps_native;

/// A reply the browser is waiting on is matched by `requestId`; a frame without
/// one is dropped by the transport, which then waits out its full ten-second
/// timeout and reports `Request timeout`. The refusal the server had already
/// answered never reached the caller, so a dead token read as a hang and the
/// dashboard never opened. Every envelope built here therefore carries the id
/// back, plus the `success`/`ok`/`error` fields the transport reads to tell a
/// refusal from an answer — `message` alone was decoded as a success.
fn ws_reply_envelope(mut value: JsonValue, request_id: Option<&str>) -> JsonValue {
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

fn ws_authenticated_user(data: &JsonValue, state: &AppState) -> Result<String, JsonValue> {
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
                if let Ok(payload) = notification {
                    if matches!(payload["type"].as_str(), Some("sync:status" | "sync:projection-ready")) {
                        let user = state.auth_state.as_ref().and_then(|auth| local_auth::verified_user_id_from_token(auth, observed_token.as_deref()));
                        if user.as_deref().is_some_and(|id| payload["local_user_id"].as_str() == Some(id)) {
                            if socket.send(Message::Text(payload.to_string())).await.is_err() { break; }
                        }
                    }
                }
                continue;
            },
            incoming = socket.next() => { let Some(incoming) = incoming else { break; }; incoming },
            response = provider.receive() => {
                if let Some(response) = response {
                    if socket.send(Message::Text(response.to_string())).await.is_err() { break; }
                }
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
                                .to_string(),
                            ))
                            .await;
                        continue;
                    }
                };

                let msg_type = data.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(token) = data["token"].as_str() {
                    observed_token = ws_authenticated_user(&data, &state).ok().map(|_| token.to_string());
                }
                let request_id = data
                    .get("requestId")
                    .or_else(|| data.get("request_id"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());
                let request_id = request_id.as_deref();

                // Handle ping/pong
                if msg_type == "ping" {
                    if let Some(user) = state.auth_state.as_ref().and_then(|auth| local_auth::verified_user_id_from_token(auth, observed_token.as_deref())) {
                        super::broadcast_sync_event(json!({"type":"sync:connection-check", "local_user_id":user}));
                    }
                    let _ = socket
                        .send(Message::Text(json!({"type": "pong"}).to_string()))
                        .await;
                    continue;
                }

                if super::public_relay::PUBLIC_TYPES.contains(&msg_type) {
                    let response = super::public_relay::relay(&data).await;
                    if socket.send(Message::Text(response.to_string())).await.is_err() { break; }
                    continue;
                }

                if msg_type == "gps-native" {
                    // Local, data-free capability revocation must still work after logout.
                    if data.get("action").and_then(JsonValue::as_str) == Some("release") {
                        let response = gps_native::release(&data).await;
                        if socket.send(Message::Text(response.to_string())).await.is_err() { break; }
                        continue;
                    }
                    let response = match (ws_authenticated_user(&data, &state), state.atome_state.as_ref()) {
                        (Ok(user), Some(atome)) => gps_native::handle(&data, &user, atome, state.auth_state.as_ref()).await,
                        _ => ws_reply_envelope(json!({"type":"gps-native-response", "error":"AUTH_REQUIRED"}), request_id),
                    };
                    if socket.send(Message::Text(response.to_string())).await.is_err() { break; }
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
                        let response = ws_reply_envelope(json!({"type":"ai-provider-response", "error":error}), request_id);
                        if socket.send(Message::Text(response.to_string())).await.is_err() { break; }
                    }
                    continue;
                }

                if msg_type == "file-selection" {
                    let response = match ws_authenticated_user(&data, &state) {
                        Ok(_) => file_selection::handle(&data).await,
                        Err(response) => response,
                    };
                    if socket.send(Message::Text(ws_reply_envelope(response, request_id).to_string())).await.is_err() { break; }
                    continue;
                }
                
                // Route to atome handler
                if msg_type == "atome" {
                    if let Some(ref atome_state) = state.atome_state {
                        let user_id = match ws_authenticated_user(&data, &state) {
                            Ok(user_id) => user_id,
                            Err(response) => {
                                let _ = socket
                                    .send(Message::Text(
                                        ws_reply_envelope(response, request_id).to_string(),
                                    ))
                                    .await;
                                continue;
                            }
                        };
                        let response = if data.get("action").and_then(|value| value.as_str()) == Some("history") {
                            local_atome_extended::handle_history_message(data, &user_id, atome_state).await
                        } else {
                            local_atome::handle_atome_message(data, &user_id, atome_state).await
                        };
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                ws_reply_envelope(
                                    json!({"type": "error", "message": "Atome state not initialized"}),
                                    request_id,
                                )
                                .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to events handler (event log + state projection)
                if msg_type == "events" {
                    if let Some(ref atome_state) = state.atome_state {
                        let user_id = match ws_authenticated_user(&data, &state) {
                            Ok(user_id) => user_id,
                            Err(response) => {
                                let _ = socket
                                    .send(Message::Text(
                                        ws_reply_envelope(response, request_id).to_string(),
                                    ))
                                    .await;
                                continue;
                            }
                        };
                        let response =
                            local_atome::handle_events_message(data, &user_id, atome_state).await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                ws_reply_envelope(
                                    json!({"type": "error", "message": "Atome state not initialized"}),
                                    request_id,
                                )
                                .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to state-current handler (projection cache)
                if msg_type == "state-current" {
                    if let Some(ref atome_state) = state.atome_state {
                        let user_id = match ws_authenticated_user(&data, &state) {
                            Ok(user_id) => user_id,
                            Err(response) => {
                                let _ = socket
                                    .send(Message::Text(
                                        ws_reply_envelope(response, request_id).to_string(),
                                    ))
                                    .await;
                                continue;
                            }
                        };
                        let response =
                            local_atome::handle_state_current_message(data, &user_id, atome_state)
                                .await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                ws_reply_envelope(
                                    json!({"type": "error", "message": "Atome state not initialized"}),
                                    request_id,
                                )
                                .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                if matches!(msg_type, "snapshot" | "user-data" | "sync" | "history") {
                    if let Some(ref atome_state) = state.atome_state {
                        let user_id = match ws_authenticated_user(&data, &state) {
                            Ok(user_id) => user_id,
                            Err(response) => {
                                let _ = socket
                                    .send(Message::Text(
                                        ws_reply_envelope(response, request_id).to_string(),
                                    ))
                                    .await;
                                continue;
                            }
                        };
                        let response = match msg_type {
                            "history" => local_atome::handle_history_command(data, &user_id, atome_state).await,
                            "snapshot" => local_atome_extended::handle_snapshot_message(data, &user_id, atome_state).await,
                            "user-data" => local_atome_extended::handle_user_data_message(data, &user_id, atome_state).await,
                            _ => local_atome_extended::handle_sync_message(data, &user_id, atome_state).await,
                        };
                        let _ = socket
                            .send(Message::Text(serde_json::to_string(&response).unwrap_or_default()))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                ws_reply_envelope(
                                    json!({"type": "error", "message": "Atome state not initialized"}),
                                    request_id,
                                )
                                .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                // Route to auth handler
                if msg_type == "auth" {
                    if let Some(ref auth_state) = state.auth_state {
                        let response = local_auth::handle_auth_message(data, auth_state).await;
                        let _ = socket
                            .send(Message::Text(
                                serde_json::to_string(&response).unwrap_or_default(),
                            ))
                            .await;
                    } else {
                        let _ = socket
                            .send(Message::Text(
                                ws_reply_envelope(
                                    json!({"type": "error", "message": "Auth state not initialized"}),
                                    request_id,
                                )
                                .to_string(),
                            ))
                            .await;
                    }
                    continue;
                }

                if msg_type == "file" {
                    let response = handle_ws_file_message(data, &state).await;
                    let _ = socket.send(Message::Text(response.to_string())).await;
                    continue;
                }

                // Unknown message type
                let _ = socket
                    .send(Message::Text(
                        ws_reply_envelope(
                            json!({"type": "error", "message": "Unknown message type"}),
                            request_id,
                        )
                        .to_string(),
                    ))
                    .await;
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
