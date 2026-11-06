// The teleport state model (atome/src/shared/teleport_state.js, ported for the server; the browser
// keeps the JavaScript one): the states, the transitions the manager may perform, an atome's
// teleport view read from its properties, and the property patches of each transition, committed
// by the ordinary event pipeline.
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub const LOCAL: &str = "LOCAL";
pub const PREPARING: &str = "TELEPORT_PREPARING";
pub const REMOTE: &str = "REMOTE";
const REMOTE_CONTROLLED: &str = "REMOTE_CONTROLLED";
const RETURNING: &str = "RETURNING";
pub const PERSISTED_REMOTE: &str = "PERSISTED_REMOTE";
const DISCONNECTED: &str = "DISCONNECTED";
const ERROR: &str = "ERROR";

const KNOWN: [&str; 8] = [
    LOCAL,
    PREPARING,
    REMOTE,
    REMOTE_CONTROLLED,
    RETURNING,
    PERSISTED_REMOTE,
    DISCONNECTED,
    ERROR,
];

// `ALLOWED_TRANSITIONS`: anything absent is refused rather than coerced.
fn allowed(from: &str) -> &'static [&'static str] {
    match from {
        LOCAL => &[PREPARING],
        PREPARING => &[REMOTE, LOCAL, ERROR],
        REMOTE => &[
            PREPARING,
            RETURNING,
            PERSISTED_REMOTE,
            REMOTE_CONTROLLED,
            DISCONNECTED,
        ],
        REMOTE_CONTROLLED => &[REMOTE, RETURNING, PERSISTED_REMOTE, DISCONNECTED],
        RETURNING => &[LOCAL, ERROR],
        PERSISTED_REMOTE => &[PREPARING, RETURNING, REMOTE, DISCONNECTED],
        DISCONNECTED => &[REMOTE, PERSISTED_REMOTE, RETURNING, LOCAL, ERROR],
        ERROR => &[LOCAL, RETURNING],
        _ => &[],
    }
}

// `String(value ?? '').trim().toUpperCase()`, LOCAL when unknown.
fn normalized(value: Option<&JsonValue>) -> &'static str {
    let raw = match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::trim(&js::text(Some(value))).to_uppercase(),
    };
    KNOWN
        .into_iter()
        .find(|state| *state == raw)
        .unwrap_or(LOCAL)
}

fn can_transition(from: &str, to: &str) -> bool {
    from != to && allowed(from).contains(&to)
}

/// `readTeleportState`: absent properties mean LOCAL.
pub struct View {
    pub state: &'static str,
    pub surface_id: String,
    pub origin_surface_id: String,
    pub controller_surface_id: String,
    pub session_id: String,
    pub persist: bool,
}

impl View {
    pub fn of(properties: &JsonValue) -> Self {
        let field = |key: &str| js::id(properties.get(key));
        let persist = properties.get("teleport_persist");
        Self {
            state: normalized(properties.get("teleport_state")),
            surface_id: field("teleport_surface_id"),
            origin_surface_id: field("teleport_origin_surface_id"),
            controller_surface_id: field("teleport_controller_surface_id"),
            session_id: field("teleport_session_id"),
            persist: persist == Some(&json!(true)) || persist == Some(&json!("true")),
        }
    }

    pub fn json(&self) -> JsonValue {
        json!({ "state": self.state, "surfaceId": self.surface_id, "originSurfaceId": self.origin_surface_id,
            "controllerSurfaceId": self.controller_surface_id, "sessionId": self.session_id, "persist": self.persist })
    }

    fn refused(&self) -> String {
        format!("teleport_invalid_transition_from_{}", self.state)
    }
}

/// A transition's patch, or its refusal.
pub type Built = Result<JsonValue, String>;

pub fn prepare(current: &JsonValue, target: &str, source: &str, session_id: &str) -> Built {
    let state = View::of(current);
    let (target, source) = (js::trim(target), js::trim(source));
    if target.is_empty() {
        return Err("teleport_target_required".into());
    }
    if session_id.is_empty() {
        return Err("teleport_session_required".into());
    }
    if target == state.surface_id {
        return Err("teleport_already_on_target".into());
    }
    if state.surface_id.is_empty() && target == source {
        return Err("teleport_target_is_source".into());
    }
    if !can_transition(state.state, PREPARING) {
        return Err(state.refused());
    }
    // The origin is captured once, on the first hop.
    let origin = if state.origin_surface_id.is_empty() {
        source.to_string()
    } else {
        state.origin_surface_id.clone()
    };
    Ok(
        json!({ "teleport_state": PREPARING, "teleport_session_id": session_id,
        "teleport_origin_surface_id": origin }),
    )
}

pub fn commit(current: &JsonValue, target: &str, session_id: &str) -> Built {
    let state = View::of(current);
    let target = js::trim(target);
    if target.is_empty() {
        return Err("teleport_target_required".into());
    }
    if state.session_id != session_id {
        return Err("teleport_session_mismatch".into());
    }
    if !can_transition(state.state, REMOTE) {
        return Err(state.refused());
    }
    Ok(
        json!({ "teleport_state": REMOTE, "teleport_surface_id": target,
        "teleport_controller_surface_id": state.origin_surface_id, "teleport_session_id": "" }),
    )
}

/// The rollback of a declined, timed out or unreachable offer.
pub fn cancel(current: &JsonValue, session_id: &str) -> Built {
    let state = View::of(current);
    if state.state != PREPARING {
        return Err(format!("teleport_not_preparing_{}", state.state));
    }
    if !session_id.is_empty() && state.session_id != session_id {
        return Err("teleport_session_mismatch".into());
    }
    let back = if state.surface_id.is_empty() {
        LOCAL
    } else {
        REMOTE
    };
    Ok(json!({ "teleport_state": back, "teleport_session_id": "" }))
}

/// The patch and the surface the object goes back to.
pub fn back_home(current: &JsonValue, to_surface_id: &str) -> Result<(JsonValue, String), String> {
    let state = View::of(current);
    if state.surface_id.is_empty() {
        return Err("teleport_not_remote".into());
    }
    let destination = match js::trim(to_surface_id) {
        "" => state.origin_surface_id.clone(),
        to => to.to_string(),
    };
    if destination.is_empty() {
        return Err("teleport_origin_unknown".into());
    }
    if !can_transition(state.state, RETURNING) {
        return Err(state.refused());
    }
    let patch = json!({ "teleport_state": LOCAL, "teleport_surface_id": "", "teleport_controller_surface_id": "",
        "teleport_origin_surface_id": "", "teleport_session_id": "", "teleport_persist": false });
    Ok((patch, destination))
}

pub fn persist(current: &JsonValue) -> Built {
    let state = View::of(current);
    if state.surface_id.is_empty() {
        return Err("teleport_not_remote".into());
    }
    if !can_transition(state.state, PERSISTED_REMOTE) {
        return Err(state.refused());
    }
    Ok(json!({ "teleport_state": PERSISTED_REMOTE, "teleport_persist": true }))
}

pub fn disconnect(current: &JsonValue, surface_id: &str) -> Built {
    let state = View::of(current);
    let lost = js::trim(surface_id);
    if lost.is_empty() || state.surface_id != lost {
        return Err("teleport_surface_not_active".into());
    }
    if !can_transition(state.state, DISCONNECTED) {
        return Err(state.refused());
    }
    Ok(json!({ "teleport_state": DISCONNECTED, "teleport_session_id": "" }))
}

pub fn reconnect(current: &JsonValue, surface_id: &str) -> Built {
    let state = View::of(current);
    let back = js::trim(surface_id);
    if state.state != DISCONNECTED {
        return Err(format!("teleport_not_disconnected_{}", state.state));
    }
    if back.is_empty() || state.surface_id != back {
        return Err("teleport_surface_not_active".into());
    }
    let restored = if state.persist {
        PERSISTED_REMOTE
    } else {
        REMOTE
    };
    if !can_transition(state.state, restored) {
        return Err(state.refused());
    }
    Ok(json!({ "teleport_state": restored }))
}
