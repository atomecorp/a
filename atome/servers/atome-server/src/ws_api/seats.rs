// The surface registry of server/wsApiState.js, ported: a surface is one renderable device seat
// (a browser tab, a Tauri window, an iOS app instance), named by a client-persisted
// `surface_id` that survives a reconnection, always scoped under the account that announced it.
// Only the surface, teleport and remote-control families read it. A frame to a whole account
// goes through the registry of live connections (social/live.rs); a seat retires with its
// connection's account (identity.rs `detach`) and with the connection (mod.rs).
use super::Connection;
use crate::social::live;
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, Weak};

/// The seat a connection holds, with the account it was announced under (`_wsApiSurfaceId`).
#[derive(Default)]
pub(super) struct Held(Mutex<Option<(String, String)>>);

impl Held {
    fn get(&self) -> Option<(String, String)> {
        self.0.lock().expect("held seat").clone()
    }

    fn set(&self, seat: Option<(String, String)>) {
        *self.0.lock().expect("held seat") = seat;
    }
}

struct Seat {
    connection: Weak<Connection>,
    label: String,
    platform: String,
    capabilities: JsonValue,
    // The device's form (`FORMS`), drawn by the nearby plates (R-248: an iPad is not a telephone); '' when unsaid.
    form: &'static str,
    program_id: Option<String>,
    announced_at: String,
    last_seen_at: String,
    // R-248 « à proximité »: the opaque name this seat's app announces on the local network
    // (Bonjour `_atome._tcp`), and who may find the seat by it.
    nearby_token: String,
    discoverable: &'static str,
}

// account -> its seats, in the order they were first announced.
static SEATS: LazyLock<Mutex<HashMap<String, IndexMap<String, Seat>>>> =
    LazyLock::new(Mutex::default);

const LABEL_MAX: usize = 120;
// `mcp_program`: an MCP client behind the stdio bridge, a seat that renders nothing.
const PLATFORMS: [&str; 6] = [
    "browser",
    "tauri",
    "ios",
    "android",
    "mcp_program",
    "unknown",
];
/// What a seat's device is, for its picture: its own runtime (`PLATFORMS`) says nothing of it (an iPad runs `ios`).
const FORMS: [&str; 3] = ["phone", "tablet", "computer"];
const CAPABILITIES: [&str; 5] = ["render", "pointer_input", "audio", "video", "fullscreen"];
/// Who may find a seat by its nearby token: the owner's accepted contacts (the default), or anyone.
pub(super) const DISCOVERABLE: [&str; 2] = ["contacts", "everyone"];

// 16 lowercase hex characters from the system's generator, never derived from the seat or account.
fn nearby_token() -> String {
    let mut bytes = [0u8; 8];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(super) fn now() -> String {
    js::iso(atome_js_values::dates::now_ms())
}

/// `message[a] ?? message[b]`.
pub(super) fn either<'a>(message: &'a JsonValue, a: &str, b: &str) -> Option<&'a JsonValue> {
    message
        .get(a)
        .filter(|value| !value.is_null())
        .or_else(|| message.get(b))
}

// `String(value ?? '').trim()`.
fn nullish_text(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::trim(&js::text(Some(value))).to_string(),
    }
}

/// `normalizeSurfaceId`: 1 to 64 of `[A-Za-z0-9_-]`, else empty.
pub(super) fn normalized_id(value: Option<&JsonValue>) -> String {
    let raw = nullish_text(value);
    let valid = !raw.is_empty()
        && raw.encode_utf16().count() <= 64
        && raw
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if valid { raw } else { String::new() }
}

fn public(surface_id: &str, user: &str, seat: &Seat) -> JsonValue {
    json!({ "surface_id": surface_id, "user_id": user, "label": seat.label, "platform": seat.platform, "form": seat.form,
        "capabilities": seat.capabilities, "announced_at": seat.announced_at, "last_seen_at": seat.last_seen_at,
        "program_id": seat.program_id, "online": true })
}

fn is(seat: &Seat, connection: &Connection) -> bool {
    std::ptr::eq(seat.connection.as_ptr(), connection)
}

/// The seat this connection holds, empty when none.
pub(super) fn own(connection: &Connection) -> String {
    connection
        .seat
        .get()
        .map(|(_, surface)| surface)
        .unwrap_or_default()
}

/// What an announce says of its seat.
pub(super) struct Announced<'a> {
    pub label: Option<&'a JsonValue>,
    pub platform: Option<&'a JsonValue>,
    pub capabilities: Option<&'a JsonValue>,
    /// One of `FORMS`; anything else is unsaid.
    pub form: Option<&'a JsonValue>,
    pub program_id: Option<String>,
    /// One of `DISCOVERABLE`, none to keep the seat's (`contacts` for a new one).
    pub discoverable: Option<&'static str>,
}

/// An announced seat: its public descriptor and the nearby token its app announces.
pub(super) struct Attached {
    pub surface: JsonValue,
    pub nearby_token: String,
}

/// `attachWsApiSurface`: a connection carries exactly one seat; the newest connection
/// announcing a seat wins it, the one before keeps working as a plain connection.
pub(super) fn attach(
    connection: &Arc<Connection>,
    user: &str,
    surface_id: &str,
    announced: Announced<'_>,
) -> Attached {
    if connection
        .seat
        .get()
        .is_some_and(|(_, held)| held != surface_id)
    {
        detach(connection);
    }
    let platform = nullish_text(announced.platform).to_lowercase();
    let platform = PLATFORMS
        .into_iter()
        .find(|known| *known == platform)
        .unwrap_or("unknown");
    let source = announced.capabilities.and_then(JsonValue::as_object);
    let mut capabilities = JsonMap::new();
    for key in CAPABILITIES {
        let on = source.and_then(|source| source.get(key)) == Some(&json!(true));
        capabilities.insert(key.into(), json!(on));
    }
    let label = js::slice(&nullish_text(announced.label), LABEL_MAX);
    let mut seats = SEATS.lock().expect("seats");
    let surfaces = seats.entry(user.to_string()).or_default();
    let previous = surfaces.get(surface_id);
    if let Some(previous) = previous
        && !is(previous, connection)
        && let Some(stale) = previous.connection.upgrade()
    {
        stale.seat.set(None);
    }
    let at = now();
    let seat = Seat {
        connection: Arc::downgrade(connection),
        label: if label.is_empty() {
            previous.map(|p| p.label.clone()).unwrap_or_default()
        } else {
            label
        },
        platform: platform.to_string(),
        capabilities: JsonValue::Object(capabilities),
        form: FORMS
            .into_iter()
            .find(|known| announced.form.and_then(JsonValue::as_str) == Some(*known))
            .unwrap_or(""),
        program_id: announced.program_id.filter(|id| !id.is_empty()),
        announced_at: previous.map_or_else(|| at.clone(), |p| p.announced_at.clone()),
        last_seen_at: at,
        // The token lives as long as the seat: re-announcing keeps it.
        nearby_token: previous.map_or_else(nearby_token, |p| p.nearby_token.clone()),
        discoverable: announced
            .discoverable
            .or_else(|| previous.map(|p| p.discoverable))
            .unwrap_or(DISCOVERABLE[0]),
    };
    let attached = Attached {
        surface: public(surface_id, user, &seat),
        nearby_token: seat.nearby_token.clone(),
    };
    surfaces.insert(surface_id.to_string(), seat);
    connection
        .seat
        .set(Some((user.to_string(), surface_id.to_string())));
    attached
}

/// `detachWsApiSurface`: only the connection that holds a seat retires it.
pub(super) fn detach(connection: &Connection) -> Option<JsonValue> {
    let (user, surface_id) = connection.seat.get()?;
    connection.seat.set(None);
    let mut seats = SEATS.lock().expect("seats");
    let surfaces = seats.get_mut(&user)?;
    if !surfaces
        .get(&surface_id)
        .is_some_and(|seat| is(seat, connection))
    {
        return None;
    }
    let seat = surfaces.shift_remove(&surface_id)?;
    if surfaces.is_empty() {
        seats.remove(&user);
    }
    Some(public(&surface_id, &user, &seat))
}

/// `touchWsApiSurface`.
pub(super) fn touch(connection: &Connection) -> Option<JsonValue> {
    let (user, surface_id) = connection.seat.get()?;
    let mut seats = SEATS.lock().expect("seats");
    let seat = seats.get_mut(&user)?.get_mut(&surface_id)?;
    if !is(seat, connection) {
        return None;
    }
    seat.last_seen_at = now();
    Some(public(&surface_id, &user, seat))
}

/// `getWsApiSurface`.
pub(super) fn get(user: &str, surface_id: &str) -> Option<JsonValue> {
    let surface_id = normalized_id(Some(&json!(surface_id)));
    let seats = SEATS.lock().expect("seats");
    let seat = seats.get(user)?.get(&surface_id)?;
    Some(public(&surface_id, user, seat))
}

/// `listWsApiSurfacesForUser`.
pub(super) fn list(user: &str, exclude: &str) -> Vec<JsonValue> {
    let excluded = normalized_id(Some(&json!(exclude)));
    let seats = SEATS.lock().expect("seats");
    seats
        .get(user)
        .into_iter()
        .flatten()
        .filter(|(surface_id, _)| excluded.is_empty() || **surface_id != excluded)
        .map(|(surface_id, seat)| public(surface_id, user, seat))
        .collect()
}

/// A seat of another account found by its nearby token: its owner, who may find it, its descriptor.
pub(super) struct Found {
    pub owner: String,
    pub discoverable: &'static str,
    pub surface: JsonValue,
}

/// The seats whose nearby token is among `tokens`, in the order the tokens were heard, the
/// account `user`'s own left out (they are listed whole by `list`). Tokens never leave this registry.
pub(super) fn by_tokens(user: &str, tokens: &[String]) -> Vec<Found> {
    let seats = SEATS.lock().expect("seats");
    let mut found: Vec<Found> = Vec::new();
    for token in tokens {
        for (owner, surfaces) in seats.iter().filter(|(owner, _)| owner.as_str() != user) {
            for (surface_id, seat) in surfaces.iter().filter(|(_, s)| &s.nearby_token == token) {
                let known = |f: &Found| f.owner == *owner && f.surface["surface_id"] == *surface_id;
                if !found.iter().any(known) {
                    found.push(Found {
                        owner: owner.clone(),
                        discoverable: seat.discoverable,
                        surface: public(surface_id, owner, seat),
                    });
                }
            }
        }
    }
    found
}

/// `wsSendJsonToSurface`: whether the seat's connection took the frame.
pub(super) async fn send(user: &str, surface_id: &str, payload: JsonValue) -> bool {
    let surface_id = normalized_id(Some(&json!(surface_id)));
    let holder = SEATS
        .lock()
        .expect("seats")
        .get(user)
        .and_then(|surfaces| surfaces.get(&surface_id))
        .and_then(|seat| seat.connection.upgrade());
    match holder {
        Some(holder) => holder
            .to_client
            .send(axum::extract::ws::Message::text(payload.to_string()))
            .await
            .is_ok(),
        None => false,
    }
}

/// `{ type: 'surface-presence' }` to the account's other connections.
pub(super) fn presence(event: &str, surface: &JsonValue) -> JsonValue {
    json!({ "type": "surface-presence", "event": event, "surface": surface, "timestamp": now() })
}

/// The connection ended (the `/ws/api` close handler): its seat retires, the account's other
/// connections hear it went offline, then its control sessions, commands and teleport offers
/// end and the objects it hosted go DISCONNECTED.
pub(super) fn leave(connection: &Arc<Connection>) {
    let Some((user, _)) = connection.seat.get() else {
        return;
    };
    let Some(surface) = detach(connection) else {
        return;
    };
    let surface_id = js::string(&surface["surface_id"]);
    let (social, live_id) = (connection.ws_api.social.clone(), connection.live);
    tokio::spawn(async move {
        live::tell_except(&user, &presence("offline", &surface), live_id).await;
        super::remote_control_ops::surface_lost(&user, &surface_id).await;
        if let Err(error) = super::teleport_ops::surface_lost(&social, &user, &surface_id).await {
            eprintln!("[ws/api] teleport surface loss failed: {error}");
        }
    });
}
