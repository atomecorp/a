// The account's own actions on `/ws/api` (server/wsPhoneLinkAuth.js, communication_push.js
// register/prune, auth_sessions.js removeAccount, ported): its private snapshot, a
// public lookup, its particles written, its push installations, its deletion. Each
// runs for the connection's device session, its claims read on the connection (ws_api/identity.rs).
use super::accounts;
use super::device_sessions::{self, public_key, same_generation, text};
use super::outcome::Outcome;
use super::proof::Proof;
use crate::vault_router::central::atomic;
use crate::vault_router::js;
use atome_store::{append::iso_now, canonical::RESERVED_PROPERTY_KEYS, particles};
use rusqlite::{Connection, params};
use serde_json::{Value as JsonValue, json};

fn account(db: &Connection, claims: &JsonValue) -> Result<JsonValue, String> {
    accounts::find_by_id(db, text(claims, "sub"))?.ok_or_else(|| "auth_session_invalid".into())
}

// `authenticatedUserSnapshot`: the private self-authentication projection.
fn snapshot(user: &JsonValue) -> JsonValue {
    let launch = user
        .get("first_launch_version")
        .filter(|version| js::truthy(Some(version)))
        .cloned()
        .unwrap_or(JsonValue::Null);
    json!({ "id": user["user_id"], "user_id": user["user_id"], "username": user["username"],
        "phone": user["phone"], "first_launch_version": launch })
}

/// `me`: the connection's account; the connection joins its live set, held until its device
/// session's expiry (a renewal announced with `me` carries the renewed expiry: D20, 4 Nov. 2026).
pub fn me(db: &Connection, claims: &JsonValue) -> Result<Outcome, String> {
    let user = account(db, claims)?;
    Ok(
        Outcome::answer(json!({ "ok": true, "user": snapshot(&user) })).effect(
            "attach",
            json!({ "principal": claims["sub"], "exp": claims["exp"] }),
        ),
    )
}

/// `get-user`: another account's name, if it is public (never by phone).
pub fn get_user(db: &Connection, input: &JsonValue, claims: &JsonValue) -> Result<Outcome, String> {
    account(db, claims)?;
    if js::truthy(input.get("phone")) {
        return Err("auth_request_rejected".into());
    }
    let user = match input.get("userId") {
        Some(JsonValue::String(id)) => accounts::find_by_id(db, id)?,
        _ => None,
    };
    let visible = user.filter(|user| {
        text(user, "user_id") == text(claims, "sub") || user["visibility"] == json!("public")
    });
    let user = visible.map_or(
        JsonValue::Null,
        |user| json!({ "user_id": user["user_id"], "username": user["username"] }),
    );
    Ok(Outcome::answer(json!({ "ok": true, "user": user })))
}

/// `list-users`: the public accounts.
pub fn list_users(db: &Connection, claims: &JsonValue) -> Result<Outcome, String> {
    account(db, claims)?;
    Ok(Outcome::answer(
        json!({ "ok": true, "users": accounts::list_public(db)? }),
    ))
}

// `/password|token|credential|secret|phone|session/i`.
fn sensitive(key: &str) -> bool {
    let key = key.to_lowercase();
    [
        "password",
        "token",
        "credential",
        "secret",
        "phone",
        "session",
    ]
    .iter()
    .any(|word| key.contains(word))
}

/// `update-user`: one of the account's own particles (`setParticle`, authored by it);
/// its public directory entry follows.
pub fn update_user(
    db: &Connection,
    input: &JsonValue,
    claims: &JsonValue,
) -> Result<Outcome, String> {
    account(db, claims)?;
    let principal = text(claims, "sub");
    let key = match input.get("key") {
        Some(JsonValue::String(key))
            if input.get("userId") == claims.get("sub") && !sensitive(key) =>
        {
            key
        }
        _ => return Err("auth_request_rejected".into()),
    };
    // `assertCanonicalPropertyKey`: trimmed, never an envelope field.
    let key = js::trim(key);
    if key.is_empty() || RESERVED_PROPERTY_KEYS.contains(&key) {
        return Err("atome_property_key_reserved".into());
    }
    let now = iso_now();
    if particles::set_particle(
        db,
        principal,
        key,
        input.get("value"),
        Some(principal),
        &now,
        None,
    )? {
        particles::touch(db, principal, &now)?;
    }
    Ok(Outcome::answer(json!({ "ok": true })).directory(principal, false))
}

// `/^[a-f0-9-]{36}$/`.
fn installation(value: Option<&JsonValue>) -> Option<&str> {
    value.and_then(JsonValue::as_str).filter(|id| {
        id.len() == 36
            && id
                .bytes()
                .all(|byte| byte == b'-' || byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn device_token(provider: &str, input: &JsonValue) -> bool {
    let Some(token) = input.get("deviceToken").and_then(JsonValue::as_str) else {
        return false;
    };
    if provider == "apns" {
        (64..=200).contains(&token.len())
            && token
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    } else {
        token.len() == 22
            && token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            && input.get("environment").and_then(JsonValue::as_str) == Some("production")
    }
}

/// `push-register`: this device key's installation (APNs or FCM), one of 20 per kind.
pub fn push_register(
    db: &Connection,
    input: &JsonValue,
    claims: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    account(db, claims)?;
    let (principal, session) = (text(claims, "sub"), text(claims, "sid"));
    let kid = claims
        .pointer("/cnf/kid")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    if principal.is_empty() || session.is_empty() || kid.is_empty() {
        return Err("auth_session_invalid".into());
    }
    let provider = input
        .get("provider")
        .filter(|provider| js::truthy(Some(provider)))
        .map_or_else(|| "apns".to_string(), js::string);
    let kind = input
        .get("kind")
        .and_then(JsonValue::as_str)
        .filter(|kind| ["alert", "voip"].contains(kind));
    let environment = input
        .get("environment")
        .and_then(JsonValue::as_str)
        .filter(|environment| ["sandbox", "production"].contains(environment));
    let (Some(id), Some(kind), Some(environment), true) = (
        installation(input.get("installationId")),
        kind,
        environment,
        ["apns", "fcm"].contains(&provider.as_str()) && device_token(&provider, input),
    ) else {
        return Err("push_registration_invalid".into());
    };
    let token = input["deviceToken"].as_str().unwrap_or_default();
    let row = db
        .query_row(
            "SELECT key_id, provider FROM auth_push_installations WHERE installation_id = ? AND kind = ?",
            params![id, kind],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            error => Err(error.to_string()),
        })?;
    // An installation cannot be reassigned by a foreign device key.
    match &row {
        Some((key, owner))
            if key.as_deref() != Some(kid) || owner.as_deref() != Some(&provider) =>
        {
            return Err("push_registration_invalid".into());
        }
        Some(_) => {}
        None => {
            let total: i64 = db
                .query_row(
                    "SELECT count(*) FROM auth_push_installations WHERE principal_id = ? AND kind = ?",
                    params![principal, kind],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if total >= 20 {
                return Err("push_installation_limit".into());
            }
        }
    }
    db.execute(
        "DELETE FROM auth_push_installations WHERE token = ? AND kind = ? AND environment = ? AND key_id = ? AND provider = ?",
        params![token, kind, environment, kid, provider],
    )
    .and_then(|_| {
        db.execute(
            "INSERT INTO auth_push_installations
             (installation_id, kind, principal_id, key_id, session_id, token, environment, updated_ms, provider)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(installation_id, kind) DO UPDATE SET principal_id = excluded.principal_id,
             session_id = excluded.session_id, token = excluded.token, environment = excluded.environment,
             updated_ms = excluded.updated_ms",
            params![id, kind, principal, kid, session, token, environment, now, provider],
        )
    })
    .map_err(|e| e.to_string())?;
    Ok(Outcome::answer(json!({ "ok": true })))
}

/// `push-prune`: the kinds this installation no longer takes.
pub fn push_prune(
    db: &Connection,
    input: &JsonValue,
    claims: &JsonValue,
) -> Result<Outcome, String> {
    account(db, claims)?;
    let principal = text(claims, "sub");
    let kid = claims
        .pointer("/cnf/kid")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    let kinds = input.get("kinds").and_then(JsonValue::as_array);
    let (Some(id), Some(kinds)) = (installation(input.get("installationId")), kinds) else {
        return Err("push_registration_invalid".into());
    };
    let known = |kind: &JsonValue| {
        kind.as_str()
            .is_some_and(|kind| ["alert", "voip"].contains(&kind))
    };
    if principal.is_empty() || kid.is_empty() || !kinds.iter().all(known) {
        return Err("push_registration_invalid".into());
    }
    for kind in ["alert", "voip"]
        .into_iter()
        .filter(|kind| !kinds.contains(&json!(kind)))
    {
        db.execute(
            "DELETE FROM auth_push_installations WHERE installation_id = ? AND principal_id = ? AND key_id = ? AND kind = ?",
            params![id, principal, kid, kind],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(Outcome::answer(json!({ "ok": true })))
}

/// `session-delete-account`: proven by the session key, confirmed; every session ends.
pub fn delete_account(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    if input.get("confirmed") != Some(&JsonValue::Bool(true)) {
        return Err("auth_confirmation_required".into());
    }
    let (revoked, principal) = atomic(db, |db| {
        let row = device_sessions::read(db, input.get("sessionId"), now)?;
        if !same_generation(&row, input) {
            return Err("auth_session_stale".into());
        }
        if js::number(row.get("restricted_until_ms")) > now as f64 {
            return Err("auth_device_cooling_off".into());
        }
        let reference = device_sessions::reference(input, "delete-account")?;
        Proof::consume_proof(
            db,
            input,
            "delete-account",
            &reference,
            &public_key(&row)?,
            now,
        )?;
        let principal = text(&row, "principal_id");
        accounts::delete(db, principal, &iso_now())?;
        let mut statement = db
            .prepare("SELECT session_id FROM auth_device_sessions WHERE principal_id = ?")
            .map_err(|e| e.to_string())?;
        let sessions = statement
            .query_map([principal], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for sql in [
            "UPDATE auth_device_sessions SET revoked_ms = ?1 WHERE principal_id = ?2",
            "UPDATE auth_device_keys SET revoked_ms = ?1 WHERE principal_id = ?2",
        ] {
            db.execute(sql, params![now, principal])
                .map_err(|e| e.to_string())?;
        }
        for sql in [
            "DELETE FROM auth_push_installations WHERE principal_id = ?",
            "DELETE FROM auth_password_credentials WHERE principal_id = ?",
        ] {
            db.execute(sql, [principal]).map_err(|e| e.to_string())?;
        }
        proof.audit(
            db,
            "account_deleted",
            Some(principal),
            Some(text(&row, "session_id")),
            now,
        )?;
        Ok((sessions, principal.to_string()))
    })?;
    // The account leaves the public directory.
    Ok(Outcome::answer(json!({ "ok": true }))
        .disconnect(revoked)
        .directory(&principal, true))
}
