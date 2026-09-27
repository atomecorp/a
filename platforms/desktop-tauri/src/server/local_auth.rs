// Local authentication owns durable workspace authorization independently of the
// remote session. Remote identity can be attached only by a verified device proof.
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map as JsonMap, Value as JsonValue};
use std::{path::PathBuf, sync::{Arc, Mutex}};
use uuid::Uuid;
use super::local_atome::LocalAtomeState;

#[path = "local_auth_accounts.rs"] mod accounts;
#[path = "local_auth_tokens.rs"] mod tokens;
#[path = "local_auth_device.rs"] mod device;

#[derive(Clone)]
pub struct LocalAuthState {
    pub db: Arc<Mutex<Connection>>,
    pub jwt_secret: String,
}

pub async fn handle_auth_message(message: JsonValue, state: &LocalAuthState) -> JsonValue {
    let request_id = message.get("requestId").or_else(|| message.get("request_id")).cloned().unwrap_or(JsonValue::Null);
    let action = message["action"].as_str().unwrap_or("");
    let result = match action {
        "local-link-challenge" | "local-link-complete" | "local-session-challenge"
            | "local-session-resume" | "local-session-lock" => device::handle(&message, state).await,
        "start-guest" => start_guest(&message, state),
        "leave-guest" => Ok(json!({"ok":true})),
        "me" => current(&message, state),
        _ => Err("auth_protocol_upgrade_required".into()),
    };
    let mut response = match result {
        Ok(value) => value,
        Err(error) => json!({"ok":false,"error":error}),
    };
    response["type"] = json!("auth-response");
    response["requestId"] = request_id;
    response["success"] = json!(response["ok"] == true);
    response
}

fn start_guest(message: &JsonValue, state: &LocalAuthState) -> Result<JsonValue, String> {
    let raw = message.get("guestId").or_else(|| message.get("guest_id")).and_then(JsonValue::as_str)
        .ok_or("guest_principal_required")?;
    let id = Uuid::parse_str(raw).map_err(|_| "guest_principal_invalid")?;
    if id.get_version_num() != 4 { return Err("guest_principal_invalid".into()); }
    let id = id.to_string();
    {
        let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
        // An existing account can never be reopened as an unauthenticated guest.
        let exists = db.query_row("SELECT 1 FROM atomes WHERE atome_id = ?1", [&id], |_| Ok(true))
            .optional().map_err(|_| "local_database_unavailable")?.unwrap_or(false);
        if exists { return Err("guest_principal_invalid".into()); }
        db.execute("INSERT OR IGNORE INTO guest_workspace_principals (guest_principal_id, status) VALUES (?1, 'active')", [&id])
            .map_err(|_| "local_database_write_failed")?;
    }
    let token = tokens::generate(state, &id, "Guest", None, None)?;
    Ok(json!({"ok":true,"token":token,"user":{"id":id,"user_id":id,"username":"Guest"}}))
}

fn user(db: &Connection, id: &str) -> Result<JsonValue, String> {
    let (username, created_at): (String, String) = db.query_row(
        "SELECT p.particle_value, a.created_at FROM atomes a JOIN particles p ON p.atome_id = a.atome_id
         AND p.particle_key = 'username' WHERE a.atome_id = ?1 AND a.deleted_at IS NULL", [id],
        |row| Ok((row.get(0)?, row.get(1)?))).map_err(|_| "local_account_unavailable")?;
    let username: String = serde_json::from_str(&username).map_err(|_| "local_account_invalid")?;
    let phone = accounts::read_verified_phone(db, id)?;
    Ok(json!({"id":id,"user_id":id,"username":username,"phone":phone,"created_at":created_at}))
}

fn current(message: &JsonValue, state: &LocalAuthState) -> Result<JsonValue, String> {
    let claims = tokens::verify(state, message["token"].as_str().ok_or("local_session_required")?)
        .ok_or("local_session_invalid")?;
    let db = state.db.lock().map_err(|_| "local_database_unavailable")?;
    let user = if claims.grant.is_some() { user(&db, &claims.sub)? }
        else { json!({"id":claims.sub,"user_id":claims.sub,"username":"Guest"}) };
    Ok(json!({"ok":true,"user":user}))
}

pub fn verified_user_id_from_token(state: &LocalAuthState, token: Option<&str>) -> Option<String> {
    tokens::verify(state, token?).map(|claims| claims.sub)
}

pub fn extract_user_id_from_token(state: &LocalAuthState, token: Option<&str>) -> String {
    verified_user_id_from_token(state, token).unwrap_or_else(|| "anonymous".into())
}

pub fn create_state(atome_state: &LocalAtomeState, data_dir: &PathBuf) -> LocalAuthState {
    let jwt_secret = tokens::secret(data_dir).expect("local_session_secret_unavailable");
    let state = LocalAuthState { db: atome_state.db.clone(), jwt_secret };
    device::ensure_schema(&state).expect("local_auth_schema_unavailable");
    state
}
