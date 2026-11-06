// The remote control of a desktop (`/ws/control`): who may drive it, read from the environment
// and the person's profile.
use super::{AppState, HeaderMap, Json, JsonValue, StatusCode, Uuid, json, json_error};
use atome_server::local::{extract_user_id_from_headers, resolve_authenticated_user};
use axum::extract::State;
use rusqlite::params;
use std::sync::OnceLock;

pub(super) async fn status(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> (StatusCode, Json<JsonValue>) {
    let auth = require_remote_control(&headers, &state);
    let authorized = auth.is_ok();
    let user_id = auth.ok().flatten();
    (
        if authorized {
            StatusCode::OK
        } else {
            StatusCode::UNAUTHORIZED
        },
        Json(json!({
            "success": authorized,
            "runtime": "tauri",
            "enabled": remote().enabled,
            "token_required": remote().token.is_some(),
            "user_id": user_id,
            "error": if authorized { JsonValue::Null } else { JsonValue::String("remote_control_unauthorized".to_string()) }
        })),
    )
}

fn env_flag_enabled(name: &str, default_value: bool) -> bool {
    std::env::var(name)
        .ok()
        .map(|value| {
            let normalized = value.trim().to_lowercase();
            matches!(normalized.as_str(), "1" | "true" | "yes" | "on")
        })
        .unwrap_or(default_value)
}

fn default_remote_control_allowed() -> bool {
    cfg!(debug_assertions)
}

// The remote control of this desktop, read once from the environment at the server's start.
pub(super) struct RemoteControl {
    pub(super) enabled: bool,
    pub(super) token: Option<String>,
}

pub(super) fn remote() -> &'static RemoteControl {
    static REMOTE: OnceLock<RemoteControl> = OnceLock::new();
    REMOTE.get_or_init(|| {
        let enabled = env_flag_enabled("SQUIRREL_TAURI_REMOTE", cfg!(debug_assertions));
        let configured = std::env::var("SQUIRREL_TAURI_REMOTE_TOKEN")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        RemoteControl {
            enabled,
            token: enabled.then(|| configured.unwrap_or_else(|| Uuid::new_v4().to_string())),
        }
    })
}

fn extract_remote_control_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-squirrel-remote-token")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn remote_control_bool_from_value(value: &JsonValue) -> Option<bool> {
    match value {
        JsonValue::Bool(flag) => Some(*flag),
        JsonValue::String(text) => {
            let normalized = text.trim().to_lowercase();
            if matches!(normalized.as_str(), "1" | "true" | "yes" | "on" | "allowed") {
                Some(true)
            } else if matches!(normalized.as_str(), "0" | "false" | "no" | "off" | "denied") {
                Some(false)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn profile_remote_control_allowed(profile: &JsonValue) -> Option<bool> {
    let candidates = [
        profile.pointer("/preferences/security/remote_control_allowed"),
        profile.pointer("/preferences/security/remoteControlAllowed"),
        profile.pointer("/preferences/remote_control_allowed"),
        profile.pointer("/preferences/remoteControlAllowed"),
        profile.pointer("/security/remote_control_allowed"),
        profile.pointer("/security/remoteControlAllowed"),
        profile.get("remote_control_allowed"),
        profile.get("remoteControlAllowed"),
    ];
    candidates
        .into_iter()
        .flatten()
        .find_map(remote_control_bool_from_value)
}

fn parse_profile_particle_value(value: &str) -> Option<JsonValue> {
    let parsed: JsonValue = serde_json::from_str(value).ok()?;
    if let JsonValue::String(inner) = parsed {
        serde_json::from_str(inner.trim()).ok()
    } else {
        Some(parsed)
    }
}

fn remote_control_allowed_for_user(state: &AppState, user_id: &str) -> Result<bool, String> {
    let Some(atome_state) = state.atome_state.as_ref() else {
        return Ok(default_remote_control_allowed());
    };
    let db = atome_state
        .db
        .lock()
        .map_err(|error| format!("database lock failed: {error}"))?;

    let state_current_properties = db
        .query_row(
            "SELECT properties FROM state_current WHERE atome_id = ?1",
            params![user_id],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok());

    if let Some(properties) = state_current_properties.as_ref() {
        if let Some(profile) = properties.get("eve_profile")
            && let Some(allowed) = profile_remote_control_allowed(profile)
        {
            return Ok(allowed);
        }
        if let Some(allowed) = profile_remote_control_allowed(properties) {
            return Ok(allowed);
        }
    }

    let particle_profile = db
        .query_row(
            "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = 'eve_profile' LIMIT 1",
            params![user_id],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| parse_profile_particle_value(&raw));

    if let Some(profile) = particle_profile.as_ref()
        && let Some(allowed) = profile_remote_control_allowed(profile)
    {
        return Ok(allowed);
    }

    Ok(default_remote_control_allowed())
}

pub(super) fn require_remote_control(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<Option<String>, (StatusCode, Json<JsonValue>)> {
    if !remote().enabled {
        return Err(json_error(
            StatusCode::FORBIDDEN,
            "Tauri remote control is disabled",
        ));
    }
    let expected = remote().token.as_deref().ok_or_else(|| {
        json_error(
            StatusCode::FORBIDDEN,
            "Tauri remote control token is unavailable",
        )
    })?;
    let provided = extract_remote_control_token(headers)
        .ok_or_else(|| json_error(StatusCode::UNAUTHORIZED, "Missing remote control token"))?;
    if provided != expected {
        return Err(json_error(
            StatusCode::UNAUTHORIZED,
            "Invalid remote control token",
        ));
    }

    let user_id = state
        .auth_state
        .as_ref()
        .and_then(|auth_state| resolve_authenticated_user(headers, auth_state))
        .or_else(|| extract_user_id_from_headers(headers));
    if let Some(user_id) = user_id.as_deref() {
        match remote_control_allowed_for_user(state, user_id) {
            Ok(true) => {}
            Ok(false) => {
                return Err(json_error(
                    StatusCode::FORBIDDEN,
                    "Remote control is disabled for this user profile",
                ));
            }
            Err(error) => {
                return Err(json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Remote control profile check failed: {error}"),
                ));
            }
        }
    }

    Ok(user_id)
}

pub(super) fn announce() {
    if remote().enabled {
        println!(
            "🔐 Tauri remote control enabled on localhost. Token source: {}",
            if std::env::var("SQUIRREL_TAURI_REMOTE_TOKEN")
                .ok()
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false)
            {
                "SQUIRREL_TAURI_REMOTE_TOKEN"
            } else {
                "generated"
            }
        );
        if let Some(token) = remote().token.as_deref() {
            println!("🔐 Tauri remote control token: {}", token);
        }
    }
}
