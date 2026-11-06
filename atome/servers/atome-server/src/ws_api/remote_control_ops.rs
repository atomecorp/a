// The `remote-control` family of `/ws/api` (server/wsRemoteControlOperations.js, ported): a
// seat driving another's pointer or keys, an on-demand still of the driven screen, and one-shot
// commands (remote_commands.rs). A control session is a live delegation of input that dies with
// its seats; every relayed event is checked again against it, its controller's account *and*
// seat, so a replayed envelope from another connection does nothing. The sessions are the
// front's, as the seats they join.
use super::projection_ops::response;
use super::surface_ops::{action_of, failure, identity};
use super::{Connection, remote_commands, seats};
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, LazyLock, Mutex};

pub(super) const KIND: &str = "remote-control";
const ACTIONS: [&str; 13] = [
    "request",
    "grant",
    "deny",
    "revoke",
    "list",
    "pointer",
    "gesture",
    "key",
    "preview-request",
    "preview-frame",
    "preview-stop",
    "command",
    "command-result",
];
// A still image is bounded: anything larger is a stream in disguise (UTF-16 units).
const MAX_FRAME_UNITS: usize = 2 * 1024 * 1024;

// The input kinds a controller may send, and the capability each needs.
fn input_capability(action: &str) -> &'static str {
    if action == "key" {
        "remote_keyboard"
    } else {
        "remote_pointer"
    }
}

fn session_ttl_ms() -> f64 {
    let configured = js::number(
        std::env::var("REMOTE_CONTROL_SESSION_TTL_MS")
            .ok()
            .map(JsonValue::from)
            .as_ref(),
    );
    if configured.is_finite() && configured > 0.0 {
        configured
    } else {
        30.0 * 60.0 * 1000.0
    }
}

#[derive(Clone)]
struct Session {
    session_id: String,
    controller_user: String,
    controller_surface: String,
    target_user: String,
    target_surface: String,
    capabilities: Vec<String>,
    created_at: String,
    expires_ms: i64,
}

impl Session {
    fn public(&self) -> JsonValue {
        json!({ "session_id": self.session_id, "controller_surface_id": self.controller_surface,
            "target_surface_id": self.target_surface, "capabilities": self.capabilities, "state": "granted",
            "created_at": self.created_at, "expires_at": js::iso(self.expires_ms) })
    }

    fn expired(&self, now: i64) -> bool {
        self.expires_ms <= now
    }

    fn controller(&self, user: &str, surface: &str) -> bool {
        self.controller_user == user && self.controller_surface == surface
    }

    fn target(&self, user: &str, surface: &str) -> bool {
        self.target_user == user && self.target_surface == surface
    }
}

static SESSIONS: LazyLock<Mutex<IndexMap<String, Session>>> = LazyLock::new(Mutex::default);

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn session(session_id: &str) -> Option<Session> {
    SESSIONS.lock().expect("sessions").get(session_id).cloned()
}

fn session_of(message: &JsonValue) -> String {
    js::id(js::first(message, &["session_id", "sessionId"]))
}

// Both ends are told, so neither keeps a trackpad live against a dead session.
async fn drop_session(session_id: &str, reason: &str) {
    let Some(session) = SESSIONS.lock().expect("sessions").shift_remove(session_id) else {
        return;
    };
    let ends = [
        (&session.controller_user, &session.controller_surface),
        (&session.target_user, &session.target_surface),
    ];
    for (user, surface) in ends {
        let ended = json!({ "type": "remote-control-ended", "session_id": session_id, "reason": reason,
            "timestamp": seats::now() });
        seats::send(user, surface, ended).await;
    }
}

/// The session a message claims, its sender proven to be its controller (`authorizeController`).
async fn controlled(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<Session, &'static str> {
    let session_id = session_of(message);
    if session_id.is_empty() {
        return Err("remote_control_session_required");
    }
    let session = session(&session_id).ok_or("remote_control_session_unknown")?;
    if session.expired(now_ms()) {
        drop_session(&session_id, "expired").await;
        return Err("remote_control_session_expired");
    }
    if user != session.controller_user {
        return Err("remote_control_not_controller");
    }
    if seats::own(connection) != session.controller_surface {
        return Err("remote_control_not_controller_surface");
    }
    Ok(session)
}

async fn request(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let controller = seats::own(connection);
    let target = seats::normalized_id(seats::either(
        message,
        "target_surface_id",
        "targetSurfaceId",
    ));
    let refused = |error: &str| Ok(failure(KIND, message, error));
    if controller.is_empty() {
        return refused("surface_not_announced");
    }
    if target.is_empty() {
        return refused("remote_control_target_required");
    }
    if target == controller {
        return refused("remote_control_target_is_controller");
    }
    let target_user = js::first(message, &["target_user_id", "targetUserId"])
        .map_or_else(|| user.to_string(), js::string);
    if seats::get(&target_user, &target).is_none() {
        return refused("remote_control_target_offline");
    }
    let asked = message
        .get("capabilities")
        .and_then(JsonValue::as_array)
        .filter(|asked| !asked.is_empty());
    let requested: Vec<String> = match asked {
        Some(asked) => asked
            .iter()
            .map(|value| js::id(Some(value)))
            .filter(|value| !value.is_empty())
            .collect(),
        None => vec!["remote_pointer".into()],
    };
    let mut capabilities: Vec<String> = Vec::new();
    for capability in requested {
        let known = capability == "remote_pointer" || capability == "remote_keyboard";
        if known && !capabilities.contains(&capability) {
            capabilities.push(capability);
        }
    }
    if capabilities.is_empty() {
        return refused("remote_control_capabilities_invalid");
    }
    // Driving another account's device needs a grant they gave, each capability on its own.
    if target_user != user {
        let surfaces = &connection.ws_api.social.surfaces;
        for capability in &capabilities {
            if !surfaces
                .has_capability(&target_user, &target, user, capability)
                .await?
            {
                return refused("remote_control_cross_user_not_authorized");
            }
        }
    }
    let now = now_ms();
    let session = Session {
        session_id: uuid::Uuid::new_v4().to_string(),
        controller_user: user.to_string(),
        controller_surface: controller.clone(),
        target_user: target_user.clone(),
        target_surface: target.clone(),
        capabilities,
        created_at: js::iso(now),
        expires_ms: (now as f64 + session_ttl_ms()).trunc() as i64,
    };
    let public = session.public();
    let started = json!({ "type": "remote-control-started", "session": public,
        "from_surface_id": controller, "timestamp": session.created_at });
    SESSIONS
        .lock()
        .expect("sessions")
        .insert(session.session_id.clone(), session);
    // Even a session granted on its own is announced: an indicator, not silence.
    seats::send(&target_user, &target, started).await;
    Ok(response(KIND, message, true, json!({ "session": public })))
}

async fn revoke(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    let session_id = session_of(message);
    let Some(session) = session(&session_id) else {
        return failure(KIND, message, "remote_control_session_unknown");
    };
    let caller = seats::own(connection);
    let is_target = session.target(user, &caller);
    // The driven seat may always take its control back; the controller may hand it back.
    if !is_target && !session.controller(user, &caller) {
        return failure(KIND, message, "remote_control_not_party");
    }
    let reason = if is_target {
        "revoked_by_target"
    } else {
        "released_by_controller"
    };
    drop_session(&session_id, reason).await;
    response(KIND, message, true, json!({ "session_id": session_id }))
}

async fn list(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    let surface = seats::own(connection);
    let now = now_ms();
    let all: Vec<Session> = SESSIONS
        .lock()
        .expect("sessions")
        .values()
        .cloned()
        .collect();
    let mut mine = Vec::new();
    for session in all {
        if session.expired(now) {
            drop_session(&session.session_id, "expired").await;
            continue;
        }
        if session.controller(user, &surface) || session.target(user, &surface) {
            mine.push(session.public());
        }
    }
    response(KIND, message, true, json!({ "sessions": mine }))
}

async fn input(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
    action: &str,
) -> Option<JsonValue> {
    let session = match controlled(connection, message, user).await {
        Ok(session) => session,
        Err(error) => return Some(failure(KIND, message, error)),
    };
    let capability = input_capability(action);
    if !session.capabilities.iter().any(|held| held == capability) {
        let error = format!("remote_control_capability_denied:{capability}");
        return Some(failure(KIND, message, &error));
    }
    let payload = message
        .get("payload")
        .filter(|payload| payload.is_object() || payload.is_array())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let relayed = json!({ "type": "remote-control-input", "session_id": session.session_id, "input": action,
        "payload": payload, "from_surface_id": session.controller_surface, "timestamp": seats::now() });
    if !seats::send(&session.target_user, &session.target_surface, relayed).await {
        drop_session(&session.session_id, "target_unreachable").await;
        return Some(failure(KIND, message, "remote_control_target_offline"));
    }
    // Input is high frequency: acknowledged without its payload, or not at all.
    if message.get("noReply") == Some(&json!(true)) {
        return None;
    }
    let fields = json!({ "session_id": session.session_id, "delivered": true });
    Some(response(KIND, message, true, fields))
}

// A remote preview is one still on demand, never a running screen share.
async fn preview_request(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    let session = match controlled(connection, message, user).await {
        Ok(session) => session,
        Err(error) => return failure(KIND, message, error),
    };
    let asked = json!({ "type": "remote-control-preview-request", "session_id": session.session_id,
        "from_surface_id": session.controller_surface, "timestamp": seats::now() });
    if !seats::send(&session.target_user, &session.target_surface, asked).await {
        drop_session(&session.session_id, "target_unreachable").await;
        return failure(KIND, message, "remote_control_target_offline");
    }
    let fields = json!({ "session_id": session.session_id, "requested": true });
    response(KIND, message, true, fields)
}

/// The driven seat answering with one frame; a controller cannot push a picture onto the
/// screen it drives.
async fn preview_frame(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Option<JsonValue> {
    let session_id = session_of(message);
    let refused = |error: &str| Some(failure(KIND, message, error));
    let Some(session) = session(&session_id) else {
        return refused("remote_control_session_unknown");
    };
    if user != session.target_user {
        return refused("remote_control_not_target");
    }
    if seats::own(connection) != session.target_surface {
        return refused("remote_control_not_target_surface");
    }
    if session.expired(now_ms()) {
        drop_session(&session_id, "expired").await;
        return refused("remote_control_session_expired");
    }
    let frame = message
        .get("frame")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    if frame.is_empty() {
        return refused("remote_control_preview_frame_missing");
    }
    if frame.encode_utf16().count() > MAX_FRAME_UNITS {
        return refused("remote_control_preview_frame_too_large");
    }
    let side = |key: &str| {
        let number = js::number(message.get(key).filter(|value| js::truthy(Some(value))));
        if number == 0.0 || number.is_nan() {
            JsonValue::Null
        } else {
            js::number_json(number)
        }
    };
    let still = json!({ "type": "remote-control-preview-frame", "session_id": session_id, "frame": frame,
        "width": side("width"), "height": side("height"), "timestamp": seats::now() });
    seats::send(&session.controller_user, &session.controller_surface, still).await;
    if message.get("noReply") == Some(&json!(true)) {
        return None;
    }
    let fields = json!({ "session_id": session_id, "delivered": true });
    Some(response(KIND, message, true, fields))
}

async fn preview_stop(connection: &Connection, message: &JsonValue, user: &str) -> JsonValue {
    let session_id = session_of(message);
    let Some(session) = session(&session_id) else {
        return failure(KIND, message, "remote_control_session_unknown");
    };
    let caller = seats::own(connection);
    if !session.controller(user, &caller) && !session.target(user, &caller) {
        return failure(KIND, message, "remote_control_not_party");
    }
    let ends = [
        (&session.controller_user, &session.controller_surface),
        (&session.target_user, &session.target_surface),
    ];
    for (party, surface) in ends {
        let stopped = json!({ "type": "remote-control-preview-stopped", "session_id": session_id,
            "timestamp": seats::now() });
        seats::send(party, surface, stopped).await;
    }
    let fields = json!({ "session_id": session_id, "stopped": true });
    response(KIND, message, true, fields)
}

async fn reply(connection: &Connection, message: &JsonValue) -> Option<JsonValue> {
    let action = action_of(message);
    let refusal = (!ACTIONS.contains(&action.as_str())).then(|| {
        let named = if action.is_empty() {
            "missing"
        } else {
            &action
        };
        format!("Unknown remote-control action: {named}")
    });
    let user = match identity(connection, KIND, message, refusal).await {
        Ok(who) => who.user,
        Err(reply) => return Some(reply),
    };
    let user = user.as_str();
    Some(match action.as_str() {
        "request" => request(connection, message, user)
            .await
            .unwrap_or_else(|error| failure(KIND, message, &error)),
        "revoke" | "deny" => revoke(connection, message, user).await,
        "list" => list(connection, message, user).await,
        "preview-request" => preview_request(connection, message, user).await,
        "preview-frame" => return preview_frame(connection, message, user).await,
        "preview-stop" => preview_stop(connection, message, user).await,
        "command" | "command-result" => {
            let outcome = if action == "command" {
                remote_commands::relay(connection, message, user).await
            } else {
                Ok(remote_commands::settle_result(connection, message, user))
            };
            match outcome {
                Ok(outcome) => {
                    let mut fields = outcome.fields;
                    if let Some(error) = &outcome.error {
                        fields["error"] = json!(error);
                    }
                    response(KIND, message, outcome.error.is_none(), fields)
                }
                Err(error) => failure(KIND, message, &error),
            }
        }
        // Reserved for the cross-account flow: a same-account session is granted on request.
        "grant" => failure(KIND, message, "remote_control_grant_not_required"),
        _ => return input(connection, message, user, &action).await,
    })
}

/// One `remote-control` frame; an input event may opt out of its reply.
pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    if let Some(reply) = reply(&connection, &message).await {
        connection.reply(reply).await;
    }
}

/// A seat disappeared: its commands end, and every session it was part of.
pub(super) async fn surface_lost(user: &str, surface_id: &str) {
    remote_commands::surface_lost(user, surface_id);
    let ended: Vec<String> = SESSIONS
        .lock()
        .expect("sessions")
        .values()
        .filter(|session| session.controller(user, surface_id) || session.target(user, surface_id))
        .map(|session| session.session_id.clone())
        .collect();
    for session_id in ended {
        drop_session(&session_id, "surface_lost").await;
    }
}
