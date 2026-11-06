// A GPT-Live voice session (server/providerRealtimeSession.js, ported): the page's WebRTC answer is
// made here, the page's data channel only listens, and the tool calls, their results and the hang-up
// travel through this server's sideband. A session has its connection's lifetime and person; it
// ends only once OpenAI says so (connected seconds are billed).
use super::http::{self, Done, Failure, openai_failure};
use super::{Relay, catalog, speech};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tokio::sync::{OnceCell, mpsc, watch};
use tokio_tungstenite::tungstenite::Message;

const ROOT: &str = "https://api.openai.com/v1/live/sessions";
const SERVER_EVENTS: [&str; 8] = [
    "session.started",
    "session.input_transcript.delta",
    "session.output_transcript.delta",
    "session.delegation.created",
    "session.usage.updated",
    "session.closed",
    "error",
    "info",
];

pub struct Session {
    id: String,
    principal: String,
    to_openai: mpsc::Sender<Message>,
    pending: Mutex<HashSet<String>>,
    seen: Mutex<HashSet<String>>,
    closed_event: Mutex<Option<JsonValue>>,
    ended: watch::Sender<bool>,
    open: watch::Receiver<bool>,
    closing: OnceCell<Result<JsonValue, String>>,
    sessions: Arc<Sessions>,
    everyone: Arc<Everyone>,
}

/// One connection's voice sessions, by the page's id.
#[derive(Default)]
pub struct Sessions {
    active: Mutex<HashMap<String, Arc<Session>>>,
}

/// Every person's sessions, for `realtime-close-all` (a key changed or removed).
#[derive(Default)]
pub struct Everyone {
    by_principal: Mutex<HashMap<String, Vec<Arc<Session>>>>,
}

fn only(value: &JsonValue, fields: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|object| object.keys().all(|key| fields.contains(&key.as_str())))
}

fn tool_catalog(tools: &JsonValue) -> Done<()> {
    let fine = tools.as_array().is_some_and(|tools| {
        tools.len() <= catalog::session_tool_limit()
            && tools
                .iter()
                .all(|tool| tool.get("type") == Some(&json!("function")))
    });
    if fine {
        Ok(())
    } else {
        Err("provider_tool_not_authorized".into())
    }
}

// The configuration the page may choose; the server owns the model pair and the channel rights.
fn live_configuration(configuration: &JsonValue) -> Done<JsonValue> {
    let invalid = || Failure::from("provider_realtime_connect_invalid");
    let backend = configuration
        .pointer("/delegation/responses")
        .unwrap_or(&JsonValue::Null);
    let output = configuration
        .pointer("/audio/output")
        .unwrap_or(&JsonValue::Null);
    let input = configuration.get("input").and_then(JsonValue::as_array);
    let fine = only(
        configuration,
        &["model", "audio", "instructions", "input", "delegation"],
    ) && configuration.get("model").and_then(JsonValue::as_str)
        == Some(catalog::modality("voice"))
        && only(&configuration["audio"], &["output"])
        && only(output, &["voice"])
        && output.get("voice").is_some_and(JsonValue::is_string)
        && configuration.pointer("/delegation/type") == Some(&json!("responses"))
        && only(&configuration["delegation"], &["type", "responses"])
        && only(
            backend,
            &[
                "model",
                "instructions",
                "tools",
                "reasoning",
                "parallel_tool_calls",
            ],
        )
        && backend.get("model").and_then(JsonValue::as_str)
            == Some(catalog::modality("voice_backend"))
        && backend.get("parallel_tool_calls") == Some(&json!(false))
        && input.is_some_and(|input| {
            input.len() <= 128
                && input.iter().all(|item| {
                    item.get("type") == Some(&json!("message"))
                        && ["user", "assistant"]
                            .iter()
                            .any(|role| item.get("role") == Some(&json!(role)))
                })
        });
    if !fine {
        return Err(invalid());
    }
    tool_catalog(
        backend
            .get("tools")
            .filter(|t| !t.is_null())
            .unwrap_or(&json!([])),
    )?;
    let mut allowed: Vec<JsonValue> = SERVER_EVENTS
        .iter()
        .map(|kind| json!({ "type": kind }))
        .collect();
    allowed.push(json!({ "type": "response.event", "response_event": "response.completed" }));
    let mut out = configuration.clone();
    out["client"] = json!({ "data_channel": { "allowed_client_events": [], "allowed_server_events": allowed } });
    Ok(out)
}

impl Session {
    fn detach(self: &Arc<Self>) {
        let session = self.clone();
        tokio::spawn(async move {
            let _ = session.close().await;
        });
    }

    /// The hang-up: OpenAI's own `session.closed` awaited (10 s), its billed seconds told.
    pub async fn close(self: &Arc<Self>) -> Result<JsonValue, String> {
        self.closing
            .get_or_init(|| async {
                self.sessions
                    .active
                    .lock()
                    .expect("sessions")
                    .remove(&self.id);
                {
                    let mut everyone = self.everyone.by_principal.lock().expect("everyone");
                    if let Some(list) = everyone.get_mut(&self.principal) {
                        list.retain(|session| !Arc::ptr_eq(session, self));
                        if list.is_empty() {
                            everyone.remove(&self.principal);
                        }
                    }
                }
                let result = async {
                    if self.closed_event.lock().expect("closed").is_none() {
                        if !*self.open.borrow() {
                            return Err("provider_realtime_hangup_failed".to_string());
                        }
                        let _ = self
                            .to_openai
                            .send(Message::text(
                                json!({ "type": "session.close" }).to_string(),
                            ))
                            .await;
                        let mut ended = self.ended.subscribe();
                        let wait = ended.wait_for(|ended| *ended);
                        if tokio::time::timeout(std::time::Duration::from_secs(10), wait)
                            .await
                            .is_err()
                        {
                            return Err("provider_realtime_hangup_failed".to_string());
                        }
                    }
                    let seconds = self
                        .closed_event
                        .lock()
                        .expect("closed")
                        .as_ref()
                        .and_then(|event| event.pointer("/usage/seconds").cloned());
                    Ok(match seconds {
                        Some(seconds) => json!({ "usage_seconds": seconds }),
                        None => json!({}),
                    })
                }
                .await;
                let _ = self.to_openai.send(Message::Close(None)).await;
                result
            })
            .await
            .clone()
    }
}

impl Sessions {
    /// The connection is gone: every session ends.
    pub fn end_all(&self) {
        let sessions: Vec<Arc<Session>> = self
            .active
            .lock()
            .expect("sessions")
            .values()
            .cloned()
            .collect();
        for session in sessions {
            session.detach();
        }
    }
}

pub struct Call<'a> {
    pub action: &'a str,
    pub payload: &'a JsonValue,
    pub principal: &'a str,
    pub key: &'a str,
}

/// `controlProviderRealtime`.
pub async fn control(
    sessions: &Arc<Sessions>,
    everyone: &Arc<Everyone>,
    relay: Relay,
    call: Call<'_>,
) -> Done<JsonValue> {
    let Call {
        action,
        payload,
        principal,
        key,
    } = call;
    let others: Vec<Arc<Session>> = sessions
        .active
        .lock()
        .expect("sessions")
        .values()
        .filter(|session| session.principal != principal)
        .cloned()
        .collect();
    for session in others {
        let _ = session.close().await;
    }
    if action == "realtime-close-all" {
        let list = everyone
            .by_principal
            .lock()
            .expect("everyone")
            .get(principal)
            .cloned()
            .unwrap_or_default();
        for session in list {
            session.close().await.map_err(Failure::from)?;
        }
        return Ok(json!({}));
    }
    let id = crate::vault_router::js::text(
        payload
            .get("session_id")
            .filter(|v| crate::vault_router::js::truthy(Some(v))),
    );
    let shaped = (1..=100).contains(&id.len())
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-');
    if !shaped {
        return Err("provider_realtime_session_invalid".into());
    }
    if action != "realtime-connect" {
        let session = sessions.active.lock().expect("sessions").get(&id).cloned();
        let Some(session) = session.filter(|session| session.principal == principal) else {
            return Err("provider_realtime_session_missing".into());
        };
        if action == "realtime-close" {
            return session.close().await.map_err(Failure::from);
        }
        if action != "realtime-send" {
            return Err("provider_operation_not_allowed".into());
        }
        let events = payload
            .get("events")
            .and_then(JsonValue::as_array)
            .filter(|events| events.len() <= 100);
        let Some(events) = events else {
            return Err("provider_realtime_events_invalid".into());
        };
        let mut completed = HashSet::new();
        for event in events {
            match event["type"].as_str().unwrap_or("") {
                "response.item.create" => {
                    let call_id = crate::vault_router::js::text(event.pointer("/item/call_id"));
                    if event.pointer("/item/type") != Some(&json!("function_call_output"))
                        || !session.pending.lock().expect("pending").contains(&call_id)
                        || completed.contains(&call_id)
                    {
                        return Err("provider_realtime_call_not_pending".into());
                    }
                    completed.insert(call_id);
                }
                "session.update" => {
                    let delegation = event
                        .pointer("/session/delegation")
                        .unwrap_or(&JsonValue::Null);
                    if !only(&event["session"], &["delegation"])
                        || delegation.get("type") != Some(&json!("responses"))
                        || !only(delegation, &["type", "responses"])
                        || !only(&delegation["responses"], &["tools"])
                    {
                        return Err("provider_realtime_event_not_allowed".into());
                    }
                    tool_catalog(&delegation["responses"]["tools"])?;
                }
                "response.create" => {}
                _ => return Err("provider_realtime_event_not_allowed".into()),
            }
        }
        if !*session.open.borrow() {
            return Err("provider_realtime_disconnected".into());
        }
        for event in events {
            let _ = session
                .to_openai
                .send(Message::text(event.to_string()))
                .await;
        }
        let mut pending = session.pending.lock().expect("pending");
        for call_id in completed {
            pending.remove(&call_id);
        }
        return Ok(json!({}));
    }
    let sdp = crate::vault_router::js::text(
        payload
            .get("sdp")
            .filter(|v| crate::vault_router::js::truthy(Some(v))),
    );
    if !sessions.active.lock().expect("sessions").is_empty()
        || !sdp.starts_with("v=0")
        || sdp.encode_utf16().count() > 100000
    {
        return Err("provider_realtime_connect_invalid".into());
    }
    let configuration = live_configuration(
        payload
            .get("session")
            .filter(|v| crate::vault_router::js::truthy(Some(v)))
            .unwrap_or(&json!({})),
    )?;
    let safety: String = Sha256::digest(principal.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    let response = http::send(
        http::client()
            .post(ROOT)
            .header("Authorization", format!("Bearer {key}"))
            .header("Content-Type", "application/json")
            .header("OpenAI-Safety-Identifier", safety)
            .body(
                json!({ "session": configuration, "transport": { "type": "webrtc", "sdp": sdp } })
                    .to_string(),
            ),
    )
    .await?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = http::bytes(response, 20_000_000)
            .await
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(|| json!({}));
        return Err(openai_failure(
            &body,
            "provider_realtime_connect_failed",
            Some(status),
        ));
    }
    let created: JsonValue = serde_json::from_slice(&http::bytes(response, 20_000_000).await?)
        .map_err(|_| Failure::from("SyntaxError"))?;
    let live_id = created
        .pointer("/session/id")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .to_string();
    let answer = crate::vault_router::js::text(created.pointer("/transport/sdp"));
    let live_shaped = live_id.strip_prefix("live_").is_some_and(|rest| {
        !rest.is_empty()
            && rest
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
    });
    if !live_shaped || !answer.starts_with("v=0") {
        return Err("provider_realtime_call_invalid".into());
    }
    let socket = speech::open(
        &format!("wss://api.openai.com/v1/live/sessions/{live_id}/attach"),
        key,
    )
    .await
    .map_err(|_| Failure::from("provider_realtime_disconnected"))?;
    let (mut writer, mut reader) = socket.split();
    let (to_openai, mut queue) = mpsc::channel::<Message>(64);
    let (open_tx, open) = watch::channel(true);
    let (ended, _) = watch::channel(false);
    let session = Arc::new(Session {
        id: id.clone(),
        principal: principal.to_string(),
        to_openai,
        pending: Mutex::new(HashSet::new()),
        seen: Mutex::new(HashSet::new()),
        closed_event: Mutex::new(None),
        ended,
        open,
        closing: OnceCell::new(),
        sessions: sessions.clone(),
        everyone: everyone.clone(),
    });
    sessions
        .active
        .lock()
        .expect("sessions")
        .insert(id.clone(), session.clone());
    everyone
        .by_principal
        .lock()
        .expect("everyone")
        .entry(principal.to_string())
        .or_default()
        .push(session.clone());
    tokio::spawn(async move {
        while let Some(message) = queue.recv().await {
            let closing = matches!(message, Message::Close(_));
            if writer.send(message).await.is_err() || closing {
                break;
            }
        }
    });
    let watched = session.clone();
    tokio::spawn(async move {
        // An hour at most.
        let hour = tokio::time::sleep(std::time::Duration::from_secs(3600));
        tokio::pin!(hour);
        loop {
            let message = tokio::select! {
                message = reader.next() => message,
                () = &mut hour => { watched.detach(); break; }
            };
            let Some(Ok(message)) = message else {
                let _ = open_tx.send(false);
                watched.detach();
                break;
            };
            let bytes = match message {
                Message::Text(text) => text.as_bytes().to_vec(),
                Message::Binary(bytes) => bytes.to_vec(),
                Message::Close(_) => {
                    let _ = open_tx.send(false);
                    watched.detach();
                    break;
                }
                _ => continue,
            };
            let Ok(event) = serde_json::from_slice::<JsonValue>(&bytes) else {
                watched.detach();
                continue;
            };
            if event["type"] == json!("session.closed") {
                *watched.closed_event.lock().expect("closed") = Some(event);
                let _ = watched.ended.send(true);
                if watched.closing.get().is_none() {
                    watched.detach();
                }
                continue;
            }
            let current = watched
                .sessions
                .active
                .lock()
                .expect("sessions")
                .get(&watched.id)
                .cloned();
            if !current.is_some_and(|current| Arc::ptr_eq(&current, &watched)) {
                continue;
            }
            let inner = (event["type"] == json!("response.event")).then(|| &event["event"]);
            let item = inner
                .filter(|inner| {
                    inner["type"] == json!("response.output_item.done")
                        && inner.pointer("/item/type") == Some(&json!("function_call"))
                })
                .map(|inner| inner["item"].clone());
            let failed = inner.is_some_and(|inner| inner["type"] == json!("response.failed"));
            if item.is_none() && event["type"] != json!("error") && !failed {
                continue;
            }
            if (relay.principal)().await.as_deref() != Some(watched.principal.as_str()) {
                watched.detach();
                continue;
            }
            if let Some(item) = &item {
                let call_id = crate::vault_router::js::text(item.get("call_id"));
                let mut seen = watched.seen.lock().expect("seen");
                if seen.contains(&call_id) {
                    continue;
                }
                let mut pending = watched.pending.lock().expect("pending");
                if seen.len() >= 1024 || pending.len() >= 16 {
                    drop((seen, pending));
                    watched.detach();
                    continue;
                }
                seen.insert(call_id.clone());
                pending.insert(call_id);
            }
            let relayed = match item {
                Some(item) => {
                    json!({ "type": "response.output_item.done", "item": { "type": item["type"], "call_id": item["call_id"],
                    "name": item["name"], "arguments": item["arguments"] } })
                }
                None => {
                    json!({ "type": "error", "code": openai_failure(inner.unwrap_or(&event), "provider_realtime_error", None).message })
                }
            };
            (relay.send)(
                json!({ "type": "ai-realtime-event", "session_id": watched.id, "event": relayed }),
            )
            .await;
        }
    });
    Ok(json!({ "sdp": answer, "session_id": id }))
}
