// The local `/ws/sync` socket and the `/ws/api` upgrade: the page's live events.
use super::*;

/// WebSocket handler for API calls (replaces HTTP fetch for silent connection detection)
pub(super) async fn ws_api_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_api::handle_ws_api(socket, state))
}

/// WebSocket handler for sync (compatible with sync_engine.js)
pub(super) async fn ws_sync_handler(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_sync(state.clone(), socket))
}

/// Handle WebSocket sync connection
pub(super) async fn handle_ws_sync(state: AppState, mut socket: WebSocket) {
    println!("🔗 New WebSocket sync connection");

    let now_iso = || chrono::Utc::now().to_rfc3339();
    let auth_state = match state.auth_state.as_ref() {
        Some(auth_state) => auth_state,
        None => {
            let _ = socket
                .send(Message::Text(
                    json!({"type": "error", "code": "authentication_unavailable"})
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    };
    let first_message = match timeout(Duration::from_secs(5), socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) => text,
        _ => {
            let _ = socket
                .send(Message::Text(
                    json!({"type": "error", "code": "authentication_required"})
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    };
    let auth_message: JsonValue = match serde_json::from_str(&first_message) {
        Ok(value) => value,
        Err(_) => return,
    };
    let token = auth_message
        .get("token")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let user_id = match local_auth::verified_user_id_from_token(auth_state, Some(&token)) {
        Some(user_id)
            if auth_message.get("type").and_then(|value| value.as_str()) == Some("auth") =>
        {
            user_id
        }
        _ => {
            let _ = socket
                .send(Message::Text(
                    json!({"type": "error", "code": "authentication_invalid"})
                        .to_string()
                        .into(),
                ))
                .await;
            return;
        }
    };
    let _ = socket
        .send(Message::Text(
            json!({
                "type": "welcome",
                "clientId": format!("axum_{}", Uuid::new_v4()),
                "server": "axum",
                "version": state.version.as_str(),
                "capabilities": ["events", "atome-events", "ping"],
                "timestamp": now_iso()
            })
            .to_string()
            .into(),
        ))
        .await;

    let mut sync_rx = sync_event_sender().subscribe();
    let (mut ws_sender, mut ws_receiver) = socket.split();

    loop {
        tokio::select! {
            maybe_msg = ws_receiver.next() => {
                let msg = match maybe_msg {
                    Some(Ok(m)) => m,
                    Some(Err(_)) => break,
                    None => break,
                };

                match msg {
                    Message::Text(text) => {
                        let data: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(_) => {
                                let _ = ws_sender.send(Message::Text(json!({"type": "error", "code": "invalid_json"}).to_string().into())).await;
                                continue;
                            },
                        };
                        if local_auth::verified_user_id_from_token(auth_state, Some(&token)).as_deref() != Some(user_id.as_str()) {
                            let _ = ws_sender.send(Message::Text(json!({"type": "error", "code": "authentication_expired"}).to_string().into())).await;
                            break;
                        }
                        if data.get("type").and_then(|v| v.as_str()) == Some("ping") {
                            let _ = ws_sender
                                .send(Message::Text(json!({"type": "pong", "timestamp": now_iso()}).to_string().into()))
                                .await;
                            continue;
                        }
                        if data.get("type").and_then(|v| v.as_str()) == Some("register") {
                            let _ = ws_sender
                                .send(Message::Text(json!({"type": "registered", "principal_id": user_id}).to_string().into()))
                                .await;
                            continue;
                        }
                        let _ = ws_sender
                            .send(Message::Text(json!({"type": "error", "code": "operation_not_allowed"}).to_string().into()))
                            .await;
                    }
                    Message::Ping(data) => {
                        let _ = ws_sender.send(Message::Pong(data)).await;
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            sync_msg = sync_rx.recv() => {
                match sync_msg {
                    Ok(payload) => {
                        if local_auth::verified_user_id_from_token(auth_state, Some(&token)).as_deref() != Some(user_id.as_str()) {
                            let _ = ws_sender.send(Message::Text(json!({"type": "error", "code": "authentication_expired"}).to_string().into())).await;
                            break;
                        }
                        if let Some(filtered) = state
                            .atome_state
                            .as_ref()
                            .and_then(|atome_state| local_atome::filter_sync_event_for_user(atome_state, &user_id, &payload))
                        {
                            let _ = ws_sender.send(Message::Text(filtered.to_string().into())).await;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                    Err(_) => break,
                }
            }
        }
    }

    println!("🔌 WebSocket sync connection closed");
}

// The isolated preview origin of a person's page: its own listener, another origin than the app's.
