// Persistent device-bound sessions (server/auth_sessions.js, ported): a session handle
// alone is not a credential; renewing it, binding the local identity, or ending
// sessions consumes a fresh signature of the session's device key. Each operation
// runs in the caller's transaction; the sessions it ends are disconnected by the
// caller once it is committed.
use super::outcome::Outcome;
use super::proof::{Proof, require_handle};
use super::{AUTH_LINK_ORIGIN, SESSION_AUDIENCE, accounts, handles};
use crate::vault_router::central::row_json;
use crate::vault_router::js;
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const ACCESS_TTL_SECONDS: i64 = 15 * 60;
const SESSION_IDLE_MS: i64 = 30 * 24 * 60 * 60 * 1000;
// A shared device keeps no long session: each opening is approved again.
const SHARED_SESSION_IDLE_MS: i64 = 2 * 60 * 60 * 1000;
const SESSION_MAX_MS: i64 = 90 * 24 * 60 * 60 * 1000;
const SHARED_SESSION_MAX_MS: i64 = 12 * 60 * 60 * 1000;
const PURPOSES: [&str; 9] = [
    "renew",
    "local-bind",
    "logout",
    "logout-all",
    "revoke-device",
    "delete-account",
    "change-phone",
    "set-password",
    "not-my-account",
];

pub(crate) fn number(row: &JsonValue, key: &str) -> f64 {
    js::number(row.get(key))
}

pub(crate) fn text<'a>(row: &'a JsonValue, key: &str) -> &'a str {
    row.get(key).and_then(JsonValue::as_str).unwrap_or_default()
}

// `row.generation !== input.generation`, a number on both sides.
pub(crate) fn same_generation(row: &JsonValue, input: &JsonValue) -> bool {
    input
        .get("generation")
        .and_then(JsonValue::as_f64)
        .is_some_and(|given| row.get("generation").and_then(JsonValue::as_f64) == Some(given))
}

fn lowercase_hex64(value: Option<&JsonValue>) -> Option<&str> {
    value.and_then(JsonValue::as_str).filter(|text| {
        text.len() == 64
            && text
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

// `/^\+[1-9]\d{7,14}$/`.
pub(crate) fn e164(value: Option<&JsonValue>) -> Option<&str> {
    value.and_then(JsonValue::as_str).filter(|text| {
        let digits = text.strip_prefix('+').unwrap_or_default();
        (8..=15).contains(&digits.len())
            && digits.bytes().all(|byte| byte.is_ascii_digit())
            && !digits.starts_with('0')
    })
}

/// The reference a purpose's challenge binds: the session, its generation, and
/// what the purpose acts on.
pub fn reference(input: &JsonValue, purpose: &str) -> Result<String, String> {
    let head = format!(
        "{}:{}",
        js::text(input.get("sessionId")),
        js::text(input.get("generation"))
    );
    let tail = match purpose {
        "set-password" => {
            lowercase_hex64(input.get("requestDigest")).ok_or("auth_request_invalid")?
        }
        "change-phone" => e164(input.get("newPhone")).ok_or("auth_phone_e164_required")?,
        "revoke-device" => {
            lowercase_hex64(input.get("targetKeyId")).ok_or("auth_request_invalid")?
        }
        _ => return Ok(head),
    };
    Ok(format!("{head}:{tail}"))
}

/// The live session `id` with its key, else `auth_session_invalid`.
pub fn read(db: &Connection, id: Option<&JsonValue>, now: i64) -> Result<JsonValue, String> {
    let id = require_handle(id.unwrap_or(&JsonValue::Null))?;
    let row = db
        .query_row(
            "SELECT s.*, k.public_key, k.revoked_ms AS key_revoked_ms,
             k.restricted_until_ms, k.connection_proof, k.device_class, k.device_id FROM auth_device_sessions s
             JOIN auth_device_keys k ON k.key_id = s.key_id WHERE session_id = ?",
            [id],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let now = now as f64;
    match row {
        Some(row)
            if row["revoked_ms"].is_null()
                && row["key_revoked_ms"].is_null()
                && number(&row, "idle_expires_ms") > now
                && number(&row, "expires_ms") > now =>
        {
            Ok(row)
        }
        _ => Err("auth_session_invalid".into()),
    }
}

/// The device session's access token (`issueAccess`): node-jsonwebtoken's claim order.
pub fn issue_access(
    secret: &str,
    principal: &str,
    key_id: &str,
    session_id: &str,
    pop: bool,
    program: Option<&str>,
) -> Result<String, String> {
    let issued_at = (super::now_ms() / 1000.0).floor() as i64;
    let mut cnf = JsonMap::new();
    cnf.insert("kid".into(), json!(key_id));
    if pop {
        cnf.insert("pop".into(), json!(true));
    }
    let mut claims = JsonMap::new();
    claims.insert("sub".into(), json!(principal));
    claims.insert("userId".into(), json!(principal));
    claims.insert("sid".into(), json!(session_id));
    claims.insert("cnf".into(), JsonValue::Object(cnf));
    if let Some(program) = program {
        claims.insert("prg".into(), json!(program));
    }
    claims.insert("auth_version".into(), json!(1));
    claims.insert("iat".into(), json!(issued_at));
    claims.insert("exp".into(), json!(issued_at + ACCESS_TTL_SECONDS));
    claims.insert("aud".into(), json!(SESSION_AUDIENCE));
    claims.insert("iss".into(), json!(AUTH_LINK_ORIGIN));
    jsonwebtoken::encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| e.to_string())
}

fn truthy_or_null(value: Option<&JsonValue>) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(JsonValue::Null)
}

// A session's answer: its token, the session, the account (its handle given now if it had none).
fn result(
    db: &Connection,
    secret: &str,
    row: &JsonValue,
    account: &JsonValue,
    now: i64,
) -> Result<JsonValue, String> {
    let program = (text(row, "device_class") == "program").then(|| {
        Some(text(row, "device_id"))
            .filter(|id| !id.is_empty())
            .unwrap_or_else(|| text(row, "key_id"))
    });
    let token = issue_access(
        secret,
        text(row, "principal_id"),
        text(row, "key_id"),
        text(row, "session_id"),
        number(row, "connection_proof") == 1.0,
        program,
    )?;
    let user_id = text(account, "user_id");
    let name = account
        .get("username")
        .filter(|name| js::truthy(Some(name)))
        .map(js::string);
    let handle = handles::assign(db, user_id, name.as_deref(), now)?;
    Ok(json!({
        "ok": true,
        "token": token,
        "session": { "id": row["session_id"], "generation": row["generation"], "keyId": row["key_id"],
            "expiresAt": row["expires_ms"], "idleExpiresAt": row["idle_expires_ms"] },
        "user": { "id": user_id, "user_id": user_id, "username": account["username"],
            "phone": truthy_or_null(account.get("phone")), "handle": handle,
            "first_launch_version": truthy_or_null(account.get("first_launch_version")) },
    }))
}

fn idle_for(device_class: &str) -> i64 {
    if device_class == "shared" {
        SHARED_SESSION_IDLE_MS
    } else {
        SESSION_IDLE_MS
    }
}

/// A new session of `account` on the device key `key_id`, and its answer.
pub fn create(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    account: &JsonValue,
    key_id: &str,
    now: i64,
) -> Result<JsonValue, String> {
    let key = db
        .query_row(
            "SELECT connection_proof, device_class, device_id FROM auth_device_keys WHERE key_id = ?",
            [key_id],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| json!({}));
    let class = text(&key, "device_class");
    let maximum = if class == "shared" {
        SHARED_SESSION_MAX_MS
    } else {
        SESSION_MAX_MS
    };
    let row = json!({ "session_id": proof.random_handle(), "principal_id": account["user_id"], "key_id": key_id,
        "connection_proof": truthy_or_null(key.get("connection_proof")).as_i64().unwrap_or(0),
        "device_class": key["device_class"], "device_id": key["device_id"], "generation": 0,
        "created_ms": now, "idle_expires_ms": now + idle_for(class), "expires_ms": now + maximum });
    db.execute(
        "INSERT INTO auth_device_sessions VALUES (?, ?, ?, 0, ?, ?, ?, NULL)",
        params![
            text(&row, "session_id"),
            text(&row, "principal_id"),
            key_id,
            now,
            now + idle_for(class),
            now + maximum
        ],
    )
    .map_err(|e| e.to_string())?;
    audit(proof, db, "session_created", &row, now)?;
    result(db, secret, &row, account, now)
}

pub(crate) fn public_key(row: &JsonValue) -> Result<JsonValue, String> {
    serde_json::from_str(text(row, "public_key")).map_err(|e| e.to_string())
}

fn account_of(db: &Connection, row: &JsonValue) -> Result<JsonValue, String> {
    accounts::find_by_id(db, text(row, "principal_id"))?
        .ok_or_else(|| "auth_session_invalid".into())
}

pub fn audit(
    proof: &Proof,
    db: &Connection,
    event: &str,
    row: &JsonValue,
    now: i64,
) -> Result<(), String> {
    proof.audit(
        db,
        event,
        Some(text(row, "principal_id")),
        Some(text(row, "session_id")),
        now,
    )
}

/// `session-challenge`: a fresh challenge for one of the session's purposes.
pub fn challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    let purpose = input
        .get("purpose")
        .and_then(JsonValue::as_str)
        .filter(|purpose| PURPOSES.contains(purpose))
        .ok_or("auth_request_invalid")?;
    Proof::limit(
        db,
        &format!("session-challenge:{}", proof.keyed_index(network)),
        60,
        60_000,
        now,
    )?;
    let row = read(db, input.get("sessionId"), now)?;
    if !same_generation(&row, input) {
        return Err("auth_session_stale".into());
    }
    let challenge = proof.challenge(
        db,
        purpose,
        &reference(input, purpose)?,
        text(&row, "key_id"),
        None,
        now,
    )?;
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge }),
    ))
}

/// `session-renew`: the next generation and a new token; an old generation is a
/// copied session, revoked at once.
pub fn renew(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let mut row = read(db, input.get("sessionId"), now)?;
    let reference = format!(
        "{}:{}",
        js::text(input.get("sessionId")),
        js::text(input.get("generation"))
    );
    Proof::consume_proof(db, input, "renew", &reference, &public_key(&row)?, now)?;
    let session = text(&row, "session_id").to_string();
    if !same_generation(&row, input) {
        db.execute(
            "UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?",
            params![now, session],
        )
        .map_err(|e| e.to_string())?;
        audit(proof, db, "session_reuse_detected", &row, now)?;
        return Ok(Outcome::answer(
            json!({ "ok": false, "error": "auth_session_reused", "revoked": [session] }),
        )
        .disconnect(vec![session]));
    }
    let account = account_of(db, &row)?;
    // A client that proves its key on each connection says so once; there is no way back.
    if input.get("pop") == Some(&JsonValue::Bool(true)) && number(&row, "connection_proof") != 1.0 {
        db.execute(
            "UPDATE auth_device_keys SET connection_proof = 1 WHERE key_id = ?",
            [text(&row, "key_id")],
        )
        .map_err(|e| e.to_string())?;
        row["connection_proof"] = json!(1);
    }
    let generation = js::number(row.get("generation")) + 1.0;
    let idle =
        ((now + idle_for(text(&row, "device_class"))) as f64).min(number(&row, "expires_ms"));
    row["generation"] = js::number_json(generation);
    row["idle_expires_ms"] = js::number_json(idle);
    db.execute(
        "UPDATE auth_device_sessions SET generation = ?, idle_expires_ms = ? WHERE session_id = ?",
        params![generation as i64, idle as i64, session],
    )
    .map_err(|e| e.to_string())?;
    audit(proof, db, "session_refreshed", &row, now)?;
    Ok(Outcome::answer(result(db, secret, &row, &account, now)?))
}

/// `session-local-bind`: the device proves the account it holds locally.
pub fn local_bind(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let row = read(db, input.get("sessionId"), now)?;
    if !same_generation(&row, input) {
        return Err("auth_session_stale".into());
    }
    Proof::consume_proof(
        db,
        input,
        "local-bind",
        &reference(input, "local-bind")?,
        &public_key(&row)?,
        now,
    )?;
    let account = account_of(db, &row)?;
    audit(proof, db, "local_identity_verified", &row, now)?;
    Ok(Outcome::answer(json!({ "ok": true, "keyId": row["key_id"],
        "user": { "id": account["user_id"], "username": account["username"], "phone": account["phone"],
            "first_launch_version": truthy_or_null(account.get("first_launch_version")) } })))
}

/// `session-logout`, `session-logout-all`, `session-revoke-device`.
pub fn revoke(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    purpose: &str,
    now: i64,
) -> Result<Outcome, String> {
    let row = read(db, input.get("sessionId"), now)?;
    if !["logout", "logout-all", "revoke-device"].contains(&purpose) {
        return Err("auth_request_invalid".into());
    }
    Proof::consume_proof(
        db,
        input,
        purpose,
        &reference(input, purpose)?,
        &public_key(&row)?,
        now,
    )?;
    if !same_generation(&row, input) {
        return Err("auth_session_stale".into());
    }
    if purpose != "logout" && number(&row, "restricted_until_ms") > now as f64 {
        return Err("auth_device_cooling_off".into());
    }
    let sessions_where = |sql: &str, value: &str| -> Result<Vec<String>, String> {
        let mut statement = db.prepare(sql).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([value], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    };
    let principal = text(&row, "principal_id");
    let selected = match purpose {
        "logout" => vec![text(&row, "session_id").to_string()],
        "logout-all" => sessions_where(
            "SELECT session_id FROM auth_device_sessions WHERE principal_id = ?",
            principal,
        )?,
        _ => {
            let target = js::string(&input["targetKeyId"]);
            let owner = db
                .query_row(
                    "SELECT principal_id FROM auth_device_keys WHERE key_id = ?",
                    [&target],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            if owner.as_deref() != Some(principal) {
                return Err("auth_proof_invalid".into());
            }
            db.execute(
                "UPDATE auth_device_keys SET revoked_ms = ? WHERE key_id = ?",
                params![now, target],
            )
            .map_err(|e| e.to_string())?;
            sessions_where(
                "SELECT session_id FROM auth_device_sessions WHERE key_id = ?",
                &target,
            )?
        }
    };
    for session in &selected {
        db.execute(
            "UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?",
            params![now, session],
        )
        .and_then(|_| {
            db.execute(
                "DELETE FROM auth_push_installations WHERE session_id = ?",
                [session],
            )
        })
        .map_err(|e| e.to_string())?;
    }
    audit(proof, db, purpose, &row, now)?;
    Ok(Outcome::answer(json!({ "ok": true })).disconnect(selected))
}
