// `/ws/sync` (server/wsSyncRuntime.js, ported): a device's subscriptions to the
// streams it may follow, their replay from a cursor, and the delivery of every
// committed event to the connections subscribed to its stream, projected per
// share by the vault router. Who a connection is (device session, connection proof,
// provisioning) is security.rs's. Fastify's services, while a reference Fastify runs beside this
// server for the A/B probes, reach the runtime through SERVICE frames on the control socket
// (`sync:<operation>`); the public directory's events are read from the central database and told
// by social/directory/.
mod record;
mod security;

use crate::auth::Sessions;
use crate::vault_router::{VaultRouter, js};
use axum::extract::ws::{self, WebSocket, WebSocketUpgrade};
use axum::extract::{FromRequestParts, Request};
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use record::Record;
use serde_json::{Value as JsonValue, json};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

const DIRECTORY_STREAM: &str = "directory.public";
// Fastify's defaults (wsSyncRuntime.js): five seconds to authenticate, 45 s of silence.
const AUTH_TIMEOUT: Duration = Duration::from_secs(5);
const IDLE_TIMEOUT: Duration = Duration::from_secs(45);
const SWEEP_EVERY: Duration = Duration::from_secs(15);

pub struct SyncRuntime {
    sessions: Arc<Sessions>,
    // Where the version a welcome names is read (`atome/src/version.json`).
    project_root: PathBuf,
    router: Arc<VaultRouter>,
    // In the order the connections came, as Fastify's Map kept them.
    records: Mutex<Vec<Arc<Record>>>,
    next_id: AtomicU64,
}

pub fn claims(request: &Request) -> bool {
    request.uri().path() == "/ws/sync" && crate::http::peer::is_upgrade(request.headers())
}

/// The envelope of one stream event, as a device reads it.
fn envelope(event: &JsonValue, replay: bool) -> JsonValue {
    let or_null = |key: &str| js::first(event, &[key]).cloned().unwrap_or(JsonValue::Null);
    let mut envelope = serde_json::Map::new();
    envelope.insert("type".into(), json!("event"));
    if let Some(id) = event.get("id") {
        envelope.insert("event_id".into(), id.clone());
    }
    let stream = js::first(event, &["stream_id"]).or(event.get("stream"));
    envelope.insert("stream".into(), stream.cloned().unwrap_or(JsonValue::Null));
    envelope.insert(
        "sequence".into(),
        js::number_json(js::number(event.get("sequence"))),
    );
    for key in [
        "source",
        "project_id",
        "atome_id",
        "vault_principal_id",
        "tx_id",
        "gesture_id",
    ] {
        envelope.insert(key.into(), or_null(key));
    }
    if let Some(kind) = event.get("kind") {
        envelope.insert("kind".into(), kind.clone());
    }
    envelope.insert("patch".into(), or_null("payload"));
    envelope.insert("projection".into(), or_null("projection"));
    envelope.insert("lww_decisions".into(), or_null("lww_decisions"));
    if let Some(ts) = event.get("ts") {
        envelope.insert("timestamp".into(), ts.clone());
    }
    envelope.insert("replay".into(), json!(replay));
    JsonValue::Object(envelope)
}

impl SyncRuntime {
    pub fn new(
        sessions: Arc<Sessions>,
        project_root: PathBuf,
        router: Arc<VaultRouter>,
    ) -> Arc<Self> {
        let runtime = Arc::new(Self {
            sessions,
            project_root,
            router,
            records: Mutex::new(Vec::new()),
            next_id: AtomicU64::new(0),
        });
        tokio::spawn(runtime.clone().sweep());
        runtime
    }

    fn records(&self) -> Vec<Arc<Record>> {
        self.records.lock().expect("sync records").clone()
    }

    fn forget(&self, record: &Record) {
        self.records
            .lock()
            .expect("sync records")
            .retain(|kept| kept.id != record.id);
    }

    async fn sweep(self: Arc<Self>) {
        let mut every = tokio::time::interval(SWEEP_EVERY);
        loop {
            every.tick().await;
            for record in self.records() {
                if record.idle_for() > IDLE_TIMEOUT {
                    record.close(&self, Some("heartbeat_timeout"), None).await;
                }
            }
        }
    }

    pub async fn accept(self: Arc<Self>, request: Request) -> Response {
        let (mut parts, _) = request.into_parts();
        let upgrade = match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
            Ok(upgrade) => upgrade,
            Err(rejection) => return rejection.into_response(),
        };
        // `requestToken`: the bearer of the opening request (no cookie is read).
        let bearer = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .map(js::trim)
            .filter(|value| value.len() >= 7 && value[..7].eq_ignore_ascii_case("bearer "))
            .map(|value| js::trim(&value[7..]).to_string());
        crate::ws_api::upgrade(upgrade, &parts.headers)
            .on_upgrade(move |client| self.run(client, bearer))
    }

    async fn run(self: Arc<Self>, client: WebSocket, bearer: Option<String>) {
        let (mut client_out, mut client_in) = client.split();
        // Like Fastify's sends, a slow device's frames wait for it without holding back the others.
        let (to_client, mut client_queue) = mpsc::unbounded_channel::<ws::Message>();
        let record = Arc::new(Record::new(
            self.next_id.fetch_add(1, Ordering::Relaxed),
            bearer,
            to_client,
        ));
        self.records
            .lock()
            .expect("sync records")
            .push(record.clone());
        let client_writer = tokio::spawn(async move {
            while let Some(message) = client_queue.recv().await {
                let closing = matches!(message, ws::Message::Close(_));
                if client_out.send(message).await.is_err() || closing {
                    break;
                }
            }
        });
        let messages = async {
            record.attach(&self).await;
            // One message at a time, in order, as Fastify queued them.
            while let Some(Ok(message)) = client_in.next().await {
                let bytes = match &message {
                    ws::Message::Text(text) => text.as_bytes(),
                    ws::Message::Binary(bytes) => bytes.as_ref(),
                    ws::Message::Close(_) => break,
                    _ => continue,
                };
                if let Err(error) = record.receive(&self, bytes).await {
                    // The client reconnects and replays every stream it holds: the cause must be traceable.
                    eprintln!(
                        "{}",
                        json!({ "component": "ws/sync", "message": "sync_processing_failed",
                            "data": { "principal_id": record.principal(), "error": error } })
                    );
                    record
                        .close(&self, Some("sync_processing_failed"), None)
                        .await;
                }
                if record.is_closed() {
                    break;
                }
            }
        };
        messages.await;
        // Closed by the client or by this runtime: nothing more is delivered to it.
        record.close(&self, None, Some("closed")).await;
        let _ = client_writer.await;
    }

    /// An event told to every connection following its stream (`sync:publish`).
    pub async fn publish(&self, event: &JsonValue) -> Result<usize, String> {
        let stream = js::id(js::first(event, &["stream_id", "stream"]));
        if stream.is_empty() {
            return Ok(0);
        }
        let mut delivered = 0;
        for record in self.records() {
            if record.deliver(self, &stream, event).await? {
                delivered += 1;
            }
        }
        Ok(delivered)
    }

    /// A directory event (social/directory/) told to every connection following its stream.
    pub fn publish_directory(&self, event: &JsonValue) -> usize {
        self.records()
            .iter()
            .filter(|record| record.deliver_directory(event))
            .count()
    }

    pub(crate) async fn replay_principal_stream(
        &self,
        principal: &str,
        stream: &str,
    ) -> Result<usize, String> {
        let followers: Vec<Arc<Record>> = self
            .records()
            .into_iter()
            .filter(|record| {
                record.principal().as_deref() == Some(principal) && record.follows(stream)
            })
            .collect();
        let replays = followers
            .iter()
            .map(|record| record.replay(self, stream, true));
        for replayed in futures_util::future::join_all(replays).await {
            replayed?;
        }
        Ok(followers.len())
    }

    // The connections of `principal`, open or still authenticating.
    fn connections_of(&self, principal: &str) -> Vec<Arc<Record>> {
        self.records()
            .into_iter()
            .filter(|record| {
                record.principal().as_deref() == Some(principal) && !record.is_closed()
            })
            .collect()
    }

    pub(crate) fn grant_stream(&self, principal: &str, stream: &str) -> usize {
        let connections = self.connections_of(principal);
        for record in &connections {
            record.send(json!({ "type": "stream-available", "stream": stream }));
        }
        connections.len()
    }

    pub(crate) fn revoke_stream(&self, principal: &str, stream: &str) -> usize {
        let connections = self.connections_of(principal);
        for record in &connections {
            record.revoke(stream);
        }
        connections.len()
    }

    /// At the server's end every connection is told so.
    pub async fn stop(&self) {
        for record in self.records() {
            record.close(self, None, Some("server_shutdown")).await;
        }
    }

    /// One SERVICE request from Fastify: `sync:<operation>` and its JSON payload.
    pub async fn service(&self, operation: &str, payload: &JsonValue) -> Result<JsonValue, String> {
        let at = |key: &str| js::string(payload.get(key).unwrap_or(&JsonValue::Null));
        let event = payload.get("event").unwrap_or(&JsonValue::Null);
        match operation {
            "sync:publish" => Ok(json!(self.publish(event).await?)),
            "sync:replay-principal" => Ok(json!(
                self.replay_principal_stream(&at("principal_id"), &at("stream"))
                    .await?
            )),
            "sync:grant" => Ok(json!(self.grant_stream(&at("principal_id"), &at("stream")))),
            "sync:revoke" => Ok(json!(
                self.revoke_stream(&at("principal_id"), &at("stream"))
            )),
            "sync:snapshot" => Ok(JsonValue::Array(
                self.records()
                    .iter()
                    .map(|record| record.describe())
                    .collect(),
            )),
            _ => Err(format!("sync_operation_unknown:{operation}")),
        }
    }
}
