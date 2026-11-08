// One `/ws/sync` connection: its authentication (security.rs), its source and subscriptions, their replay from a cursor, and what a published
// event becomes for it (wsSyncRuntime.js, ported).
use super::{AUTH_TIMEOUT, DIRECTORY_STREAM, SyncRuntime, envelope};
use crate::vault_router::js;
use axum::extract::ws;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;
use tokio::task::AbortHandle;

mod subscriptions;

const CONTROL_TYPES: [&str; 7] = [
    "auth",
    "auth-challenge",
    "register",
    "subscribe",
    "unsubscribe",
    "ack",
    "ping",
];
const CAPABILITIES: [&str; 8] = [
    "register",
    "subscribe",
    "subscribe-batch",
    "subscribe-batch-settlement",
    "unsubscribe",
    "ack",
    "ping",
    "replay",
];
// A reconnection subscribes every stream it holds: one message carries this many at most.
const SUBSCRIBE_BATCH_LIMIT: usize = 500;
const REPLAY_PAGE: u64 = 500;
const DIRECTORY_PAGE: u64 = 1000;
// The longest delay of Fastify's setTimeout.
const LONGEST_TIMER_MS: f64 = 2_147_483_647.0;
// The closing code of every connection this runtime ends.
const CLOSED_BY_SERVER: u16 = 4401;

#[derive(Clone, Copy)]
struct Subscription {
    cursor: u64,
    acked: u64,
}

#[derive(Default)]
struct State {
    principal: Option<String>,
    source: Option<String>,
    authenticated: bool,
    subscriptions: IndexMap<String, Subscription>,
    auth_timer: Option<AbortHandle>,
    expiry_timer: Option<AbortHandle>,
}

pub(super) struct Record {
    pub(super) id: u64,
    connection_id: String,
    // Who it is (security.rs): its opening request's bearer, its device session and account, the
    // nonce its key proofs are bound to.
    pub(super) bearer: Option<String>,
    pub(super) identity: crate::auth::connection::Identity,
    pub(super) nonce: Mutex<Option<String>>,
    out: mpsc::UnboundedSender<ws::Message>,
    state: Mutex<State>,
    last_seen: Mutex<Instant>,
    closed: AtomicBool,
}

// `Number(value)` when it is a whole number not below zero, else 0.
fn cursor_of(value: Option<&JsonValue>) -> u64 {
    let number = js::number(value);
    if number.is_finite() && number.fract() == 0.0 && number >= 0.0 {
        number as u64
    } else {
        0
    }
}

fn stream_of(message: &JsonValue) -> String {
    js::id(js::first(message, &["stream", "stream_id"]))
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |elapsed| elapsed.as_millis() as f64)
}

fn error(code: &str) -> JsonValue {
    json!({ "type": "error", "code": code })
}

impl Record {
    pub(super) fn new(
        id: u64,
        bearer: Option<String>,
        out: mpsc::UnboundedSender<ws::Message>,
    ) -> Self {
        Self {
            id,
            connection_id: format!("sync_{}", uuid::Uuid::new_v4()),
            bearer,
            identity: crate::auth::connection::Identity::default(),
            nonce: Mutex::new(None),
            out,
            state: Mutex::new(State::default()),
            last_seen: Mutex::new(Instant::now()),
            closed: AtomicBool::new(false),
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().expect("sync record")
    }

    pub(super) fn send(&self, frame: JsonValue) {
        let _ = self.out.send(ws::Message::text(frame.to_string()));
    }

    pub(super) fn principal(&self) -> Option<String> {
        self.state().principal.clone()
    }

    // Closed, or its device gone (its writer stopped on a failed send): a replay queued for
    // a phone sent to the background stops at once, instead of holding the vault for minutes.
    pub(super) fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst) || self.out.is_closed()
    }

    pub(super) fn follows(&self, stream: &str) -> bool {
        self.state().subscriptions.contains_key(stream)
    }

    pub(super) fn idle_for(&self) -> Duration {
        self.last_seen.lock().expect("sync record").elapsed()
    }

    fn touch(&self) {
        *self.last_seen.lock().expect("sync record") = Instant::now();
    }

    /// Ends the connection once: its error code first, then the close (code 4401).
    pub(super) async fn close(
        &self,
        runtime: &SyncRuntime,
        code: Option<&str>,
        reason: Option<&str>,
    ) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        if let Some(code) = code {
            self.send(error(code));
        }
        {
            let mut state = self.state();
            for timer in [state.auth_timer.take(), state.expiry_timer.take()]
                .into_iter()
                .flatten()
            {
                timer.abort();
            }
        }
        runtime.forget(self);
        let reason = reason.or(code).unwrap_or("closed");
        let _ = self.out.send(ws::Message::Close(Some(ws::CloseFrame {
            code: CLOSED_BY_SERVER,
            reason: reason.into(),
        })));
    }

    pub(super) fn revoke(&self, stream: &str) {
        self.state().subscriptions.shift_remove(stream);
        self.send(json!({ "type": "revoked", "stream": stream }));
    }

    pub(super) fn describe(&self) -> JsonValue {
        let state = self.state();
        json!({ "connection_id": self.connection_id, "principal_id": state.principal,
            "source": state.source, "authenticated": state.authenticated,
            "streams": state.subscriptions.keys().collect::<Vec<_>>() })
    }

    // The request's own credential (header, cookie), then five seconds for an `auth` message.
    pub(super) async fn attach(self: &Arc<Self>, runtime: &Arc<SyncRuntime>) {
        let principal = self.request_principal(runtime).await.unwrap_or_default();
        let attached = self.activate(runtime, &principal).await;
        if attached.is_err() {
            self.close(runtime, Some("authentication_invalid"), None)
                .await;
            return;
        }
        if !self.state().authenticated && !self.is_closed() {
            let (record, runtime) = (self.clone(), runtime.clone());
            let timer = tokio::spawn(async move {
                tokio::time::sleep(AUTH_TIMEOUT).await;
                record
                    .close(&runtime, Some("authentication_required"), None)
                    .await;
            });
            self.state().auth_timer = Some(timer.abort_handle());
        }
    }

    async fn activate(
        self: &Arc<Self>,
        runtime: &Arc<SyncRuntime>,
        principal: &str,
    ) -> Result<bool, String> {
        if principal.is_empty() || self.is_closed() {
            return Ok(false);
        }
        if !runtime.sessions.provisioned(principal).await? {
            self.close(runtime, Some("remote_account_not_provisioned"), None)
                .await;
            return Ok(false);
        }
        {
            let mut state = self.state();
            state.principal = Some(principal.to_string());
            state.authenticated = true;
            if let Some(timer) = state.auth_timer.take() {
                timer.abort();
            }
        }
        self.touch();
        // The credential's expiry as the connection holds it (`Number()` of it).
        let expiry = self.expiry_ms();
        if expiry.is_finite() {
            let remaining = expiry - now_ms();
            if remaining <= 0.0 {
                self.close(runtime, Some("authentication_expired"), None)
                    .await;
                return Ok(false);
            }
            let delay = Duration::from_millis(remaining.min(LONGEST_TIMER_MS) as u64);
            let (record, runtime) = (self.clone(), runtime.clone());
            let timer = tokio::spawn(async move {
                tokio::time::sleep(delay).await;
                record
                    .close(&runtime, Some("authentication_expired"), None)
                    .await;
            });
            self.state().expiry_timer = Some(timer.abort_handle());
        }
        self.send(json!({
            "type": "welcome",
            "connection_id": self.connection_id,
            "server": "atome-server",
            "version": runtime.version().await,
            "capabilities": CAPABILITIES,
            "timestamp": atome_store::append::iso_now(),
        }));
        Ok(true)
    }

    pub(super) async fn receive(
        self: &Arc<Self>,
        runtime: &Arc<SyncRuntime>,
        bytes: &[u8],
    ) -> Result<(), String> {
        if self.is_closed() {
            return Ok(());
        }
        let Ok(message) = serde_json::from_slice::<JsonValue>(bytes) else {
            self.close(runtime, Some("invalid_json"), None).await;
            return Ok(());
        };
        self.touch();
        let kind = js::id(message.get("type"));
        let authenticated = self.state().authenticated;
        if !CONTROL_TYPES.contains(&kind.as_str()) {
            if authenticated {
                self.send(error("operation_not_allowed"));
            } else {
                self.close(runtime, Some("authentication_required"), None)
                    .await;
            }
            return Ok(());
        }
        if !authenticated {
            return self.authenticate(runtime, &kind, &message).await;
        }
        let validated = self
            .validated_principal(runtime)
            .await?
            .filter(|id| !id.is_empty());
        if validated.is_none() || validated != self.principal() {
            self.close(runtime, Some("authentication_expired"), None)
                .await;
            return Ok(());
        }
        match kind.as_str() {
            "auth" => self.send(error("already_authenticated")),
            "register" => self.register(runtime, &message).await?,
            "subscribe" => self.subscribe(runtime, &message).await?,
            "unsubscribe" => {
                let stream = stream_of(&message);
                self.state().subscriptions.shift_remove(&stream);
                self.send(json!({ "type": "unsubscribed", "stream": stream }));
            }
            "ack" => self.ack(&message),
            _ => self.send(json!({ "type": "pong", "timestamp": atome_store::append::iso_now() })),
        }
        Ok(())
    }

    // Before its welcome a connection may only ask for the challenge its key signs, or authenticate.
    async fn authenticate(
        self: &Arc<Self>,
        runtime: &Arc<SyncRuntime>,
        kind: &str,
        message: &JsonValue,
    ) -> Result<(), String> {
        if kind == "auth-challenge" {
            match self.challenge(runtime, message).await {
                Ok(challenge) => {
                    self.send(json!({ "type": "auth-challenge", "challenge": challenge }))
                }
                Err(_) => {
                    self.close(runtime, Some("authentication_invalid"), None)
                        .await;
                }
            }
            return Ok(());
        }
        if kind != "auth" {
            self.close(runtime, Some("authentication_required"), None)
                .await;
            return Ok(());
        }
        let principal = self
            .message_principal(runtime, message)
            .await
            .filter(|principal| !principal.is_empty());
        match principal {
            None => {
                self.close(runtime, Some("authentication_required"), None)
                    .await;
            }
            Some(principal) => {
                if self.activate(runtime, &principal).await.is_err() {
                    self.close(runtime, Some("authentication_invalid"), None)
                        .await;
                }
            }
        }
        Ok(())
    }

    async fn register(&self, runtime: &SyncRuntime, message: &JsonValue) -> Result<(), String> {
        let source = js::id(js::first(message, &["source", "client_id", "clientId"]));
        if source.is_empty() {
            self.send(error("source_required"));
            return Ok(());
        }
        self.state().source = Some(source.clone());
        let principal = self.principal();
        let streams = runtime
            .router
            .service(
                "router:streams-authorized",
                &json!({ "principal_id": principal }),
            )
            .await?;
        self.send(
            json!({ "type": "registered", "connection_id": self.connection_id,
            "principal_id": principal, "source": source, "streams": streams }),
        );
        Ok(())
    }

    async fn access(&self, runtime: &SyncRuntime, stream: &str) -> Result<bool, String> {
        let access = runtime
            .router
            .service(
                "router:stream-access",
                &json!({ "principal_id": self.principal(), "stream_id": stream }),
            )
            .await?;
        Ok(js::truthy(Some(&access)))
    }

    /// What a committed event of `stream` becomes for this connection; true when it was told something.
    pub(super) async fn deliver(
        &self,
        runtime: &SyncRuntime,
        stream: &str,
        event: &JsonValue,
    ) -> Result<bool, String> {
        if !self.state().authenticated || self.is_closed() {
            return Ok(false);
        }
        let validated = self
            .validated_principal(runtime)
            .await?
            .filter(|id| !id.is_empty());
        if validated != self.principal() {
            self.close(runtime, Some("authentication_expired"), None)
                .await;
            return Ok(false);
        }
        let access = self.access(runtime, stream).await?;
        if !self.follows(stream) {
            if access {
                self.send(json!({ "type": "stream-available", "stream": stream }));
            }
            return Ok(access);
        }
        if !access {
            self.revoke(stream);
            return Ok(true);
        }
        let source = self.state().source.clone();
        if let (Some(source), Some(origin)) = (source, js::first(event, &["source"]))
            && source == js::string(origin)
        {
            return Ok(false);
        }
        let projected = runtime
            .router
            .service(
                "router:project-event",
                &json!({ "principal_id": self.principal(), "event": event }),
            )
            .await?;
        if projected.is_null() {
            return Ok(false);
        }
        let sequence = js::number(event.get("sequence"));
        let behind = {
            let state = self.state();
            match state.subscriptions.get(stream) {
                Some(subscription) => sequence <= subscription.cursor as f64,
                None => return Ok(false),
            }
        };
        if behind {
            return Ok(false);
        }
        self.send(envelope(&projected, false));
        self.advance(stream, sequence);
        Ok(true)
    }

    pub(super) fn deliver_directory(&self, event: &JsonValue) -> bool {
        let sequence = js::number(event.get("sequence"));
        {
            let state = self.state();
            let Some(subscription) = state.subscriptions.get(DIRECTORY_STREAM) else {
                return false;
            };
            if !state.authenticated || self.is_closed() || sequence <= subscription.cursor as f64 {
                return false;
            }
        }
        self.send(envelope(event, false));
        self.advance(DIRECTORY_STREAM, sequence);
        true
    }
}
