// The password login and the session's password (server/auth_password.js, ported): each
// step that touches the central database, run by ws_api/password_ops.rs around the
// derivations (auth/password_crypto.rs). Credentials belong to protected identity storage,
// never Atome state or history. A login answers the same for an unknown, an SMS-only and a
// password-enabled account; its failures slow the device and the source down, never the
// number alone, so a stranger cannot lock a victim out.
use super::device_sessions::{self, number, same_generation, text};
use super::devices::{self, Enrollment};
use super::outcome::Outcome;
use super::proof::{DeviceKey, Proof, public_device_key, require_handle};
use super::{accounts, device_sessions::e164};
use crate::vault_router::central::{atomic, row_json};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

const PROBATION_MS: i64 = 24 * 60 * 60 * 1000;

/// A login's checked fields: its number, its proof's reference and the device key.
pub struct Login {
    pub phone: String,
    pub reference: String,
    pub key: DeviceKey,
    failures: [String; 2],
}

/// `fields` then `limit`: the number, the client nonce and the key checked, then eight
/// tries a minute per source, per device and per number from that source.
fn login_fields(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Login, String> {
    let phone = e164(input.get("phone"))
        .ok_or("auth_phone_e164_required")?
        .to_string();
    let nonce = require_handle(input.get("clientNonce").unwrap_or(&JsonValue::Null))?;
    let key = public_device_key(input.get("publicKey").unwrap_or(&JsonValue::Null))?;
    if network.is_empty() {
        return Err("auth_proof_invalid".into());
    }
    for bucket in [
        format!("password-network:{}", proof.keyed_index(network)),
        format!("password-device:{}", key.key_id),
        format!(
            "password-phone-source:{}",
            proof.keyed_index(&format!("{phone}:{network}"))
        ),
    ] {
        Proof::limit(db, &bucket, 8, 60_000, now)?;
    }
    Ok(Login {
        reference: format!("{}:{nonce}", proof.keyed_index(&phone)),
        failures: [
            proof.keyed_index(&format!("password-device:{}", key.key_id)),
            proof.keyed_index(&format!("password-source:{phone}:{network}")),
        ],
        phone,
        key,
    })
}

/// `readPasswordCredential`: the account's verifier, or a legacy bcrypt one still held as its
/// `password_hash` particle (read only as migration input).
pub fn credential(db: &Connection, principal: &str) -> Result<Option<String>, String> {
    let current = db
        .query_row(
            "SELECT verifier FROM auth_password_credentials WHERE principal_id = ?",
            [principal],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if current.is_some() {
        return Ok(current);
    }
    let legacy = db
        .query_row(
            "SELECT p.particle_value FROM particles p JOIN atomes a ON a.atome_id = p.atome_id
             WHERE p.atome_id = ? AND p.particle_key = 'password_hash' AND a.atome_type = 'user' AND a.deleted_at IS NULL",
            [principal],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    let Some(legacy) = legacy else {
        return Ok(None);
    };
    let verifier: JsonValue = serde_json::from_str(&legacy).map_err(|e| e.to_string())?;
    Ok(verifier
        .as_str()
        .filter(|verifier| super::password_crypto::legacy(verifier))
        .map(str::to_string))
}

fn store(db: &Connection, principal: &str, verifier: &str, now: i64) -> Result<(), String> {
    db.execute(
        "INSERT INTO auth_password_credentials VALUES (?, ?, ?)
         ON CONFLICT(principal_id) DO UPDATE SET verifier = excluded.verifier, updated_ms = excluded.updated_ms",
        params![principal, verifier, now],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// `password-login-challenge`: the same answer whatever the account holds.
pub fn challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    let login = login_fields(db, proof, input, network, now)?;
    let challenge = proof.challenge(
        db,
        "password-login",
        &login.reference,
        &login.key.key_id,
        input.get("clientNonce"),
        now,
    )?;
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge }),
    ))
}

/// The account a login names and its verifier, once the slowed-down source and device
/// may try again and the device signed this attempt.
pub fn begin_login(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<(Login, Option<JsonValue>, Option<String>), String> {
    let login = login_fields(db, proof, input, network, now)?;
    for bucket in &login.failures {
        let row = db
            .query_row(
                "SELECT * FROM auth_password_failures WHERE bucket = ?",
                [bucket],
                row_json,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if row.is_some_and(|row| {
            number(&row, "expires_ms") > now as f64 && number(&row, "next_ms") > now as f64
        }) {
            return Err("auth_password_rejected".into());
        }
    }
    atomic(db, |db| {
        Proof::consume_proof(
            db,
            input,
            "password-login",
            &login.reference,
            &login.key.jwk,
            now,
        )
    })?;
    let account = accounts::find_by_phone(db, &login.phone)?;
    let stored = match &account {
        Some(account) => credential(db, text(account, "user_id"))?,
        None => None,
    };
    Ok((login, account, stored))
}

/// A refused login: each of its buckets waits twice as long as before (250 ms, up to ten
/// minutes), for an hour.
pub fn failed_login(db: &Connection, proof: &Proof, login: &Login, now: i64) -> Result<(), String> {
    atomic(db, |db| {
        for bucket in &login.failures {
            let row = db
                .query_row(
                    "SELECT * FROM auth_password_failures WHERE bucket = ?",
                    [bucket],
                    row_json,
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let count = match row {
                Some(row) if number(&row, "expires_ms") > now as f64 => {
                    number(&row, "count") as i64 + 1
                }
                _ => 1,
            };
            let delay = (250_i64 << (count - 1).min(12)).min(600_000);
            db.execute(
                "INSERT INTO auth_password_failures VALUES (?, ?, ?, ?)
                 ON CONFLICT(bucket) DO UPDATE SET count = excluded.count, next_ms = excluded.next_ms, expires_ms = excluded.expires_ms",
                params![bucket, count, now + delay, now + 3_600_000],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })?;
    proof.audit(
        db,
        "password_login_failed",
        None,
        Some(&login.key.key_id),
        now,
    )
}

/// A proven login: its device enrolled on probation if new, a legacy verifier upgraded,
/// the slowdowns lifted, and a session issued; refused if anything changed meanwhile.
pub fn finish_login(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    login: &Login,
    account: &JsonValue,
    stored: &str,
    upgraded: Option<&str>,
    now: i64,
) -> Result<Outcome, String> {
    let rejected = || "auth_password_rejected".to_string();
    let principal = text(account, "user_id");
    let same_holder = accounts::find_by_phone(db, &login.phone)?
        .is_some_and(|holder| text(&holder, "user_id") == principal);
    if credential(db, principal)?.as_deref() != Some(stored) || !same_holder {
        return Err(rejected());
    }
    let key_id = login.key.key_id.as_str();
    match devices::by_id(db, key_id)? {
        Some(device)
            if !device["revoked_ms"].is_null() || text(&device, "principal_id") != principal =>
        {
            return Err(rejected());
        }
        Some(_) => {}
        None => {
            let enrollment = Enrollment {
                enrolled_by: Some("password"),
                restricted_until: Some(now + PROBATION_MS),
                ..Enrollment::session(key_id, principal, &login.key.jwk)
            };
            devices::enroll(db, &enrollment, now)?;
            proof.audit(db, "device_enrolled", Some(principal), Some(key_id), now)?;
        }
    }
    if let Some(upgraded) = upgraded {
        store(db, principal, upgraded, now)?;
        proof.audit(
            db,
            "password_algorithm_upgraded",
            Some(principal),
            None,
            now,
        )?;
    }
    proof.audit(
        db,
        "password_login_succeeded",
        Some(principal),
        Some(key_id),
        now,
    )?;
    for bucket in &login.failures {
        db.execute(
            "DELETE FROM auth_password_failures WHERE bucket = ?",
            [bucket],
        )
        .map_err(|e| e.to_string())?;
    }
    let mut result = device_sessions::create(db, proof, secret, account, key_id, now)?;
    result["passwordAuthenticated"] = json!(true);
    Ok(Outcome::answer(result))
}

/// `session-set-password`, first half: the live session, out of probation, signed this very
/// change; four changes a minute per key. Its row and the account's current verifier.
pub fn begin_set(
    db: &Connection,
    input: &JsonValue,
    digest: &str,
    now: i64,
) -> Result<(JsonValue, Option<String>), String> {
    let row = device_sessions::read(db, input.get("sessionId"), now)?;
    if !same_generation(&row, input) {
        return Err("auth_session_stale".into());
    }
    if number(&row, "restricted_until_ms") > now as f64 {
        return Err("auth_device_cooling_off".into());
    }
    let reference = format!(
        "{}:{}:{digest}",
        crate::vault_router::js::text(input.get("sessionId")),
        crate::vault_router::js::text(input.get("generation"))
    );
    let public_key = device_sessions::public_key(&row)?;
    atomic(db, |db| {
        Proof::consume_proof(db, input, "set-password", &reference, &public_key, now)
    })?;
    Proof::limit(
        db,
        &format!("password-set:{}", text(&row, "key_id")),
        4,
        60_000,
        now,
    )?;
    let current = credential(db, text(&row, "principal_id"))?;
    Ok((row, current))
}

/// `session-set-password`, second half: the new verifier stored and every other session of
/// the account ended, unless the session or the verifier changed meanwhile.
pub fn finish_set(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    row: &JsonValue,
    current: Option<&str>,
    encoded: &str,
    now: i64,
) -> Result<Outcome, String> {
    let principal = text(row, "principal_id");
    let active = device_sessions::read(db, input.get("sessionId"), now)?;
    if !same_generation(&active, input)
        || number(&active, "restricted_until_ms") > now as f64
        || credential(db, principal)?.as_deref() != current
        || accounts::find_by_id(db, principal)?.is_none()
    {
        return Err("auth_proof_invalid".into());
    }
    store(db, principal, encoded, now)?;
    let mut statement = db
        .prepare(
            "SELECT session_id FROM auth_device_sessions WHERE principal_id = ? AND session_id != ? AND revoked_ms IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let others: Vec<String> = statement
        .query_map(params![principal, text(row, "session_id")], |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    for session in &others {
        db.execute(
            "UPDATE auth_device_sessions SET revoked_ms = ? WHERE session_id = ?",
            params![now, session],
        )
        .map_err(|e| e.to_string())?;
    }
    proof.audit(
        db,
        "password_changed",
        Some(principal),
        Some(text(row, "key_id")),
        now,
    )?;
    Ok(Outcome::answer(json!({ "ok": true })).disconnect(others))
}
