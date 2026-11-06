// `/ws/api` (server/ws_api_connection.js, ported): one client connection, who it is
// (identity.rs: its device session, its account, its live set), and each frame answered in its
// family: the vault families and the `sync` get-pending and ack (atome_ops.rs says which), the
// `atome` reads, lists and transfers (atome_requests/), the guest adoption (guest_adoption/), the phone link and account `auth` actions (auth_ops.rs, their
// effects in auth_effects.rs), the `file` family (file_ops.rs, file_reads.rs), the notification
// stack (notification_ops.rs), the contacts (contact_ops.rs), the direct messages and calls
// (message_ops.rs, the calls' SFU in visio/, which a closed connection leaves), the News, communities and forums (news_ops.rs), the shares (share_ops.rs),
// the projected bases (projection_ops.rs), the providers (provider_ops.rs), the outside sources
// (sources/), the restricted shell (shell_ops.rs) and the device seats with what crosses them
// (surface_ops.rs, surface_grant_ops.rs, teleport_ops.rs, remote_control_ops.rs, the seats
// themselves in seats.rs). A frame no family claims is logged once per connection, never answered.
mod atome_ops;
mod atome_requests;
mod auth_effects;
mod auth_ops;
mod contact_ops;
mod file_ops;
mod file_reads;
mod guest_adoption;
mod identity;
mod message_ops;
mod news_ops;
mod notification_ops;
mod password_ops;
mod phone_link_ops;
mod projection_ops;
mod provider_ops;
mod remote_commands;
mod remote_control_ops;
mod scheduled;
mod seats;
mod share_ops;
mod shell_ops;
pub(crate) mod sources;
mod surface_grant_ops;
mod surface_ops;
mod teleport_ops;
mod vault_ops;

use crate::auth::Sessions;
use crate::social::live;
use crate::vault_router::VaultRouter;
use axum::extract::ws::{self, WebSocket, WebSocketUpgrade};
use axum::extract::{FromRequestParts, Request};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

// The `ws` default @fastify/websocket kept (maxPayload, 100 MiB), for /ws/api and /ws/sync.
pub(crate) const MAX_MESSAGE_BYTES: usize = 100 * 1024 * 1024;
// Frames waiting for a slow client before its answers wait too.
const QUEUE: usize = 64;

pub struct WsApi {
    pub router: Arc<VaultRouter>,
    pub sessions: Arc<Sessions>,
    // The SMS that carries a phone link.
    pub sms: Arc<crate::auth::sms::Sms>,
    // The people's homes, where the `file` family's uploads go.
    pub storage: Arc<crate::media::Storage>,
    // The notification stacks, contacts and blocks the `notification-stack` and `contact` families reach.
    pub social: Arc<crate::social::Social>,
    // The offer, the ledger and the store proofs (`billing`, an account's creation, the stores' routes).
    pub billing: Arc<crate::billing::Billing>,
    // The websites (`site`, their public routes).
    pub site: Arc<crate::site::Site>,
    // The providers an account reaches (`ai-provider`).
    pub providers: Arc<crate::providers::Providers>,
}

impl WsApi {
    /// The file reads' resolver, on the homes and the central database of `/ws/api`.
    pub fn downloads(&self) -> crate::media::downloads::Downloads<'_> {
        crate::media::downloads::Downloads {
            storage: &self.storage,
            central: self.sessions.central(),
            news: &self.social.news,
            push: &self.social.push,
        }
    }

    /// Where a person's stored file lies, when they may read it: the file reads' own resolver,
    /// as the providers take it.
    pub fn files(self: &Arc<Self>) -> crate::providers::Files {
        let ws_api = self.clone();
        Arc::new(move |file, principal| {
            let ws_api = ws_api.clone();
            Box::pin(async move {
                let found = ws_api.downloads().target(&file, &principal).await;
                found.ok().map(|download| download.file_path)
            })
        })
    }

    /// The clocks of what time makes due, started once the server listens: the scheduled sends,
    /// the shop's releases and the health reference's monthly build.
    pub fn clocks(self: &Arc<Self>) {
        tokio::spawn(scheduled::clock(self.clone()));
        tokio::spawn(crate::social::shop::clock(self.social.clone()));
        crate::health_reference::schedule();
    }
}

pub fn claims(request: &Request) -> bool {
    request.uri().path() == "/ws/api" && crate::http::peer::is_upgrade(request.headers())
}

/// A client's upgrade with Fastify's limits, and the protocol `ws` chose by default: the first
/// the client offers.
pub(crate) fn upgrade(
    upgrade: WebSocketUpgrade,
    headers: &axum::http::HeaderMap,
) -> WebSocketUpgrade {
    let upgrade = upgrade
        .max_message_size(MAX_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES);
    let first = headers
        .get(header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok())
        .and_then(|offered| {
            offered
                .split(',')
                .map(str::trim)
                .find(|name| !name.is_empty())
        })
        .map(String::from);
    match first {
        Some(protocol) => upgrade.protocols([protocol]),
        None => upgrade,
    }
}

pub async fn accept(ws_api: Arc<WsApi>, peer: SocketAddr, request: Request) -> Response {
    let (mut parts, _) = request.into_parts();
    let socket = match WebSocketUpgrade::from_request_parts(&mut parts, &()).await {
        Ok(socket) => socket,
        Err(rejection) => return rejection.into_response(),
    };
    let network = crate::http::peer::client_network(peer, &parts.headers);
    let opening = ws_api.sessions.validate_request(&parts.headers).await;
    upgrade(socket, &parts.headers).on_upgrade(move |client| join(ws_api, client, network, opening))
}

/// One client connection: its queue to the client, who it is, and the replies of its mutations
/// (atome_ops.rs).
pub(crate) struct Connection {
    ws_api: Arc<WsApi>,
    to_client: mpsc::Sender<ws::Message>,
    mutations: Mutex<atome_ops::Mutations>,
    // The client's address as Fastify read it (`request.ip`).
    network: String,
    // The nonce this connection's key proofs are bound to, drawn at its first challenge.
    connection_nonce: Mutex<Option<String>>,
    // Its device session and account (identity.rs).
    identity: crate::auth::connection::Identity,
    // The pairing request it waits on (`_authPairRequestId`) and the phone link attempt it
    // resumes (`_authLinkAttemptId`), told by auth_effects.rs.
    pair: Mutex<Option<String>>,
    link_attempt: Mutex<Option<JsonValue>>,
    // The frame types no family claimed, logged once each.
    unknown_types: Mutex<HashSet<String>>,
    // Its provider operations, remote approvals and voice sessions.
    providers: crate::providers::Attached,
    // The device seat it announced (seats.rs).
    seat: seats::Held,
    // Its place among the live connections (social/live.rs).
    live: u64,
}

impl Connection {
    pub(crate) fn router(&self) -> &VaultRouter {
        &self.ws_api.router
    }

    /// Its queue to the client.
    pub(crate) fn sender(&self) -> mpsc::Sender<ws::Message> {
        self.to_client.clone()
    }

    async fn reply(&self, reply: JsonValue) {
        let _ = self
            .to_client
            .send(ws::Message::text(reply.to_string()))
            .await;
    }

    // `ping`, and a frame no family claims (logged once per type), once its device session holds.
    async fn unclaimed(self: Arc<Self>, message: JsonValue) {
        if let Err(refused) = self.session_holds(&message).await {
            return self.reply(refused).await;
        }
        if message.get("type") == Some(&json!("ping")) {
            return self.reply(json!({ "type": "pong" })).await;
        }
        let kind = if crate::vault_router::js::truthy(message.get("type")) {
            crate::vault_router::js::string(&message["type"])
        } else {
            String::new()
        };
        if self
            .unknown_types
            .lock()
            .expect("unknown types")
            .insert(kind.clone())
        {
            eprintln!("[ws/api] Unknown message type: {kind}");
        }
    }
}

enum Route {
    Here(JsonValue),
    Atome(JsonValue),
    GuestAdoption(JsonValue),
    Auth(JsonValue),
    AuthUpgrade(JsonValue),
    File(JsonValue),
    Notice(JsonValue),
    Contact(JsonValue),
    Message(JsonValue),
    News(JsonValue),
    Share(JsonValue),
    Projection(JsonValue),
    Provider(JsonValue),
    Source(JsonValue),
    Surface(JsonValue),
    RemoteControl(JsonValue),
    Shell(JsonValue),
    Unclaimed(JsonValue),
    // `JSON.parse` refused it.
    Invalid,
    // `null`: Fastify's handler threw on it once the connection had left its account.
    Null,
}

// Where a client frame goes, read as Fastify read it (`JSON.parse(message.toString())`): each
// family by its `type` as its own handler compares it (exact, or trimmed for the chained families).
fn route(bytes: &[u8]) -> Route {
    let Ok(message) = serde_json::from_slice::<JsonValue>(bytes) else {
        return Route::Invalid;
    };
    if message.is_null() {
        return Route::Null;
    }
    let kind = match message.get("type") {
        Some(JsonValue::String(kind)) => kind.clone(),
        _ => return Route::Unclaimed(message),
    };
    let trimmed = kind.trim();
    if kind == "auth" {
        return match auth_ops::answered_here(&message) {
            true => Route::Auth(message),
            false => Route::AuthUpgrade(message),
        };
    }
    if sources::KINDS.contains(&kind.as_str()) {
        return Route::Source(message);
    }
    if kind == provider_ops::KIND {
        return Route::Provider(message);
    }
    if projection_ops::KINDS.contains(&kind.as_str()) {
        return Route::Projection(message);
    }
    if atome_ops::FAMILIES.contains(&trimmed) && atome_ops::answered_here(trimmed, &message) {
        return Route::Here(message);
    }
    if surface_ops::KINDS.contains(&trimmed) {
        return Route::Surface(message);
    }
    if kind == remote_control_ops::KIND {
        return Route::RemoteControl(message);
    }
    if kind == notification_ops::KIND {
        return Route::Notice(message);
    }
    if message_ops::KINDS.contains(&kind.as_str()) {
        return Route::Message(message);
    }
    if news_ops::KINDS.contains(&kind.as_str()) {
        return Route::News(message);
    }
    if kind == "file" {
        return Route::File(message);
    }
    if kind == guest_adoption::KIND {
        return Route::GuestAdoption(message);
    }
    if kind == "atome" {
        return Route::Atome(message);
    }
    if kind == contact_ops::KIND {
        return Route::Contact(message);
    }
    if kind == share_ops::KIND {
        return Route::Share(message);
    }
    if kind == shell_ops::KIND {
        return Route::Shell(message);
    }
    Route::Unclaimed(message)
}

async fn join(ws_api: Arc<WsApi>, client: WebSocket, network: String, opening: Option<JsonValue>) {
    let (mut client_out, mut client_in) = client.split();
    let (to_client, mut client_queue) = mpsc::channel::<ws::Message>(QUEUE);
    let live = live::next_id();
    let connection = Arc::new(Connection {
        ws_api,
        to_client: to_client.clone(),
        mutations: Mutex::new(atome_ops::Mutations::default()),
        network,
        connection_nonce: Mutex::new(None),
        identity: crate::auth::connection::Identity::default(),
        pair: Mutex::new(None),
        link_attempt: Mutex::new(None),
        unknown_types: Mutex::new(HashSet::new()),
        providers: crate::providers::Attached::default(),
        seat: seats::Held::default(),
        live,
    });
    live::open(live, &connection);
    connection.opened(opening).await;
    // The writer ends once it has written a close.
    let client_writer = tokio::spawn(async move {
        while let Some(message) = client_queue.recv().await {
            let closing = matches!(message, ws::Message::Close(_));
            if client_out.send(message).await.is_err() || closing {
                break;
            }
        }
    });
    while let Some(Ok(message)) = client_in.next().await {
        let routed = match &message {
            ws::Message::Text(text) => route(text.as_bytes()),
            ws::Message::Binary(bytes) => route(bytes),
            ws::Message::Close(_) => break,
            _ => continue,
        };
        let connection = connection.clone();
        // Fastify answered each message as it came, without waiting for the previous one.
        match routed {
            Route::Here(frame) => {
                tokio::spawn(atome_ops::answer(connection, frame));
            }
            Route::Atome(frame) => {
                tokio::spawn(atome_requests::answer(connection, frame));
            }
            Route::GuestAdoption(frame) => {
                tokio::spawn(guest_adoption::answer(connection, frame));
            }
            Route::Auth(frame) => {
                tokio::spawn(auth_ops::answer(connection, frame));
            }
            Route::AuthUpgrade(frame) => {
                tokio::spawn(auth_ops::upgrade_required(connection, frame));
            }
            Route::File(frame) => {
                tokio::spawn(file_ops::answer(connection, frame));
            }
            Route::Contact(frame) => {
                tokio::spawn(contact_ops::answer(connection, frame));
            }
            Route::Message(frame) => {
                tokio::spawn(message_ops::answer(connection, frame));
            }
            Route::Notice(frame) => {
                tokio::spawn(notification_ops::answer(connection, frame));
            }
            Route::News(frame) => {
                tokio::spawn(news_ops::answer(connection, frame));
            }
            Route::Share(frame) => {
                tokio::spawn(share_ops::answer(connection, frame));
            }
            Route::Projection(frame) => {
                tokio::spawn(projection_ops::answer(connection, frame));
            }
            Route::Provider(frame) => {
                tokio::spawn(provider_ops::answer(connection, frame));
            }
            Route::Source(frame) => {
                tokio::spawn(sources::answer(connection, frame));
            }
            Route::Surface(frame) => {
                tokio::spawn(surface_ops::answer(connection, frame));
            }
            Route::Shell(frame) => {
                tokio::spawn(shell_ops::answer(connection, frame));
            }
            Route::RemoteControl(frame) => {
                tokio::spawn(remote_control_ops::answer(connection, frame));
            }
            Route::Unclaimed(frame) => {
                tokio::spawn(connection.unclaimed(frame));
            }
            Route::Invalid => {
                connection
                    .reply(json!({ "type": "error", "message": "Invalid JSON" }))
                    .await;
            }
            Route::Null => connection.detach(),
        }
    }
    // Its room left first, as Fastify's `closeConnection` did.
    #[cfg(feature = "visio")]
    crate::visio::closed(connection.live).await;
    let _ = to_client.send(ws::Message::Close(None)).await;
    seats::leave(&connection);
    live::close(connection.live);
    connection.providers.end();
    let _ = client_writer.await;
}
