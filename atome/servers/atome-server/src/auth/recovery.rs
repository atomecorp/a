// Recovery (server/auth_recovery.js, ported): opening the space without another device.
// The recovery code opens at once (the SMS link opens its account itself, phone_link/finish.rs;
// a `phone_recovery` request left from before waits out its delay). Completing adds this device to the
// account's others (user decision, 2026-10-26: nothing is revoked) and tells them, as a
// pairing does.
use super::device_sessions::{self, text};
use super::devices::{self, Enrollment, PROBATION_MS};
use super::outcome::Outcome;
use super::proof::{
    Proof, backup_keys_digest, backup_keys_of, digest, public_device_key, require_handle,
};
use super::{account_auth, accounts, approvals, handles};
use crate::vault_router::central::{atomic, row_json, sql_value};
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};
use subtle::ConstantTimeEq;

const RECOVERY_WINDOW_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS: i64 = 3_600_000;
const DAY_MS: i64 = 86_400_000;

// `normalizeRecoveryCode` (atome/src/shared/auth_recovery_code.js): Crockford reading,
// I/L read as 1, O as 0, separators dropped.
fn normalized_code(value: Option<&JsonValue>) -> String {
    let text = value
        .filter(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default();
    text.to_uppercase()
        .chars()
        .map(|c| match c {
            'I' | 'L' => '1',
            'O' => '0',
            other => other,
        })
        .filter(|c| c.is_ascii_digit() || c.is_ascii_uppercase())
        .collect()
}

// The same domain-separated verifier on the client (creation) and here (use).
fn verifier(principal: &str, code: Option<&JsonValue>) -> String {
    digest(&format!(
        "atome.recovery.v1\0{principal}{}",
        normalized_code(code)
    ))
}

fn lookup(code: Option<&JsonValue>) -> String {
    digest(&format!(
        "atome.recovery.lookup.v1\0{}",
        normalized_code(code)
    ))
}

// A code made before it had a lookup (17–26 Oct. 2026) is found by its account's verifier,
// and its lookup written, so that the code alone opens its account like every later one.
fn unindexed(db: &Connection, code: Option<&JsonValue>) -> Result<Option<String>, String> {
    let mut statement = db
        .prepare("SELECT principal_id, verifier FROM auth_recovery_codes WHERE lookup IS NULL")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let Some((principal, _)) = rows.into_iter().find(|(principal, stored)| {
        bool::from(
            stored
                .as_bytes()
                .ct_eq(verifier(principal, code).as_bytes()),
        )
    }) else {
        return Ok(None);
    };
    db.execute(
        "UPDATE auth_recovery_codes SET lookup = ? WHERE principal_id = ?",
        [lookup(code), principal.clone()],
    )
    .map_err(|e| e.to_string())?;
    Ok(Some(principal))
}

// `/^[a-f0-9]{64}$/.test(String(value))`.
fn hex64(value: Option<&JsonValue>) -> bool {
    let text = js::text(value);
    text.len() == 64
        && text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// A request opening the account `principal` to `session_key`'s device after `delay`;
/// the recovery code's (`openRecoveryRequest`).
pub struct Opening<'a> {
    pub channel: &'a str,
    pub session_key: JsonValue,
    pub approve: Option<JsonValue>,
    pub device_meta: Option<&'a JsonValue>,
    pub delay: i64,
}

pub fn open(
    db: &Connection,
    proof: &Proof,
    principal: &str,
    opening: &Opening<'_>,
    now: i64,
) -> Result<(String, i64), String> {
    let request_id = proof.random_handle();
    let not_before = now + opening.delay;
    let session_key = opening.session_key.to_string();
    db.execute(
        "UPDATE auth_recovery_requests SET state = 'cancelled' WHERE principal_id = ? AND state = 'pending'
         AND requester_session_key = ?",
        params![principal, session_key],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO auth_recovery_requests (request_id, principal_id, channel, requester_device_id, requester_session_key,
         requester_approve_key, device_meta, state, not_before_ms, expires_ms, created_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
        params![
            request_id,
            principal,
            opening.channel,
            proof.random_handle(),
            session_key,
            opening.approve.as_ref().map(JsonValue::to_string),
            devices::normalize_meta(opening.device_meta, false).to_string(),
            not_before,
            not_before + RECOVERY_WINDOW_MS,
            now
        ],
    )
    .map_err(|e| e.to_string())?;
    proof.audit(
        db,
        &format!("recovery_started:{}", opening.channel),
        Some(principal),
        Some(&request_id),
        now,
    )?;
    Ok((request_id, not_before))
}

/// `recovery-code-set`: a new code, approved on a device of the account.
pub fn set_code(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    if !hex64(input.get("verifier")) || !hex64(input.get("lookup")) {
        return Err("auth_request_invalid".into());
    }
    let backup_keys = backup_keys_of(input.get("backupKeys"))?;
    let principal = atomic(db, |db| {
        let subject = json!({ "verifier": input["verifier"], "lookup": input["lookup"],
            "backup": backup_keys_digest(backup_keys.as_deref()) });
        let authorized = account_auth::authorize(db, input, "recovery-code-set", &subject, now)?;
        let principal = text(&authorized.session, "principal_id").to_string();
        db.execute(
            "INSERT INTO auth_recovery_codes (principal_id, verifier, lookup, created_ms, backup_keys) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(principal_id) DO UPDATE SET verifier = excluded.verifier, lookup = excluded.lookup,
             created_ms = excluded.created_ms, backup_keys = excluded.backup_keys",
            params![
                principal,
                sql_value(&input["verifier"]),
                sql_value(&input["lookup"]),
                now,
                backup_keys
            ],
        )
        .map_err(|e| e.to_string())?;
        proof.audit(db, "recovery_code_set", Some(&principal), None, now)?;
        Ok(principal)
    })?;
    Ok(Outcome::answer(json!({ "ok": true })).notify(
        &principal,
        json!({ "kind": "auth-recovery-code-set" }),
        json!({}),
    ))
}

/// `recovery-start-challenge`: the challenge a recovering device's approve key registers over.
pub fn start_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    let key = public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?;
    Proof::limit(
        db,
        &format!("recovery-challenge:{}", proof.keyed_index(network)),
        30,
        HOUR_MS,
        now,
    )?;
    let register = proof.challenge(
        db,
        "approve-key-register",
        &format!("recovery:{}", key.key_id),
        &key.key_id,
        None,
        now,
    )?;
    Ok(Outcome::answer(json!({ "ok": true, "register": register })))
}

/// `recovery-start`: the account named by its handle, its verified phone number, or
/// the code itself; the same answer and work for an unknown name and a wrong code.
pub fn start(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    let key = public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?;
    let by_phone = js::truthy(input.get("phone"));
    if js::truthy(input.get("handle")) && by_phone {
        return Err("auth_request_invalid".into());
    }
    let address = if by_phone {
        format!("phone:{}", js::text(input.get("phone")))
    } else {
        let handle = input
            .get("handle")
            .filter(|handle| js::truthy(Some(handle)))
            .map(|handle| js::text(Some(handle)))
            .unwrap_or_default();
        js::trim(&handle).to_lowercase()
    };
    let (request_id, not_before) = atomic(db, |db| {
        Proof::limit(
            db,
            &format!("recovery-network:{}", proof.keyed_index(network)),
            20,
            DAY_MS,
            now,
        )?;
        if !address.is_empty() {
            Proof::limit(
                db,
                &format!("recovery-handle:{}", proof.keyed_index(&address)),
                10,
                DAY_MS,
                now,
            )?;
        }
        let principal = if address.is_empty() {
            let found = db
                .query_row(
                    "SELECT principal_id FROM auth_recovery_codes WHERE lookup = ?",
                    [lookup(input.get("code"))],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            match found {
                Some(principal) => Some(principal),
                None => unindexed(db, input.get("code"))?,
            }
        } else if by_phone {
            handles::resolve_phone(db, input.get("phone"))?
        } else {
            handles::resolve(db, Some(&json!(address)))?
        };
        let stored = match &principal {
            Some(principal) => db
                .query_row(
                    "SELECT verifier FROM auth_recovery_codes WHERE principal_id = ?",
                    [principal],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?,
            None => None,
        };
        let candidate = verifier(
            &principal.clone().unwrap_or_else(|| proof.random_handle()),
            input.get("code"),
        );
        let valid =
            stored.is_some_and(|stored| bool::from(stored.as_bytes().ct_eq(candidate.as_bytes())));
        let principal = match principal {
            Some(principal) if valid => principal,
            unknown => {
                proof.audit(db, "recovery_code_failed", unknown.as_deref(), None, now)?;
                return Ok((proof.random_handle(), now));
            }
        };
        let reference = format!("recovery:{}", key.key_id);
        let approve = match input.get("approve") {
            Some(approve) if js::truthy(Some(approve)) => {
                let approve = approvals::register(
                    db,
                    approve,
                    "approve-key-register",
                    &reference,
                    &key.key_id,
                    now,
                )?;
                Some(
                    json!({ "keyId": approve.key_id, "jwk": approve.jwk, "credentialId": approve.credential_id,
                    "signCount": approve.sign_count, "assurance": approve.assurance }),
                )
            }
            _ => None,
        };
        let session_key = json!({ "keyId": key.key_id, "jwk": key.jwk,
            "connectionProof": input.get("connectionProof") == Some(&JsonValue::Bool(true)) });
        open(
            db,
            proof,
            &principal,
            &Opening {
                channel: "recovery_code",
                session_key,
                approve,
                device_meta: input.get("deviceMeta"),
                delay: 0,
            },
            now,
        )
    })?;
    Ok(Outcome::answer(
        json!({ "ok": true, "recoveryId": request_id, "notBefore": not_before }),
    ))
}

/// `recovery-cancel`: an enrolled device refuses a request still waiting.
pub fn cancel(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let recovery = input.get("recoveryId").cloned().unwrap_or(JsonValue::Null);
    let principal = atomic(db, |db| {
        let authorized = account_auth::authorize(
            db,
            input,
            "recovery-cancel",
            &json!({ "recoveryId": recovery }),
            now,
        )?;
        let principal = text(&authorized.session, "principal_id").to_string();
        let changed = db
            .execute(
                "UPDATE auth_recovery_requests SET state = 'cancelled' WHERE request_id = ?
                 AND principal_id = ? AND state = 'pending'",
                params![sql_value(&recovery), principal],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("auth_request_invalid".into());
        }
        proof.audit(
            db,
            "recovery_cancelled",
            Some(&principal),
            recovery.as_str(),
            now,
        )?;
        Ok(principal)
    })?;
    Ok(Outcome::answer(json!({ "ok": true })).notify(
        &principal,
        json!({ "kind": "auth-recovery-cancelled", "recoveryId": recovery }),
        json!({}),
    ))
}

/// `recovery-requester-challenge`: the waiting device signs every step with the key it announced.
pub fn requester_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let purpose = input
        .get("purpose")
        .and_then(JsonValue::as_str)
        .filter(|purpose| ["recovery-complete", "recovery-status"].contains(purpose))
        .ok_or("auth_request_invalid")?;
    let recovery = require_handle(input.get("recoveryId").unwrap_or(&JsonValue::Null))?;
    let key = public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?;
    let challenge = proof.challenge(db, purpose, recovery, &key.key_id, None, now)?;
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge }),
    ))
}

// The request, after the proof of the key it was opened for (else the key the caller names).
fn read_own(
    db: &Connection,
    input: &JsonValue,
    purpose: &str,
    now: i64,
) -> Result<JsonValue, String> {
    let recovery = input.get("recoveryId").cloned().unwrap_or(JsonValue::Null);
    let row = db
        .query_row(
            "SELECT * FROM auth_recovery_requests WHERE request_id = ?",
            [sql_value(&recovery)],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let jwk = match &row {
        Some(row) => serde_json::from_str::<JsonValue>(text(row, "requester_session_key"))
            .map_err(|e| e.to_string())?["jwk"]
            .clone(),
        None => public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?.jwk,
    };
    Proof::consume_proof(db, input, purpose, &js::text(Some(&recovery)), &jwk, now)?;
    row.ok_or_else(|| "auth_recovery_unavailable".into())
}

/// `recovery-status`.
pub fn status(db: &Connection, input: &JsonValue, now: i64) -> Result<Outcome, String> {
    let row = atomic(db, |db| read_own(db, input, "recovery-status", now))?;
    Ok(Outcome::answer(
        json!({ "ok": true, "state": row["state"], "notBefore": row["not_before_ms"] }),
    ))
}

/// `recovery-complete`: the device enrolls its keys and opens its session; the code is consumed.
pub fn complete(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let (account, key_id, added) = atomic(db, |db| {
        let row = read_own(db, input, "recovery-complete", now)?;
        if text(&row, "state") != "pending" || js::number(row.get("expires_ms")) <= now as f64 {
            return Err("auth_recovery_unavailable".into());
        }
        if js::number(row.get("not_before_ms")) > now as f64 {
            return Err("auth_recovery_not_ready".into());
        }
        let principal = text(&row, "principal_id");
        let account = accounts::find_by_id(db, principal)?.ok_or("auth_recovery_unavailable")?;
        let requester: JsonValue =
            serde_json::from_str(text(&row, "requester_session_key")).map_err(|e| e.to_string())?;
        let meta: JsonValue =
            serde_json::from_str(text(&row, "device_meta")).map_err(|e| e.to_string())?;
        let key_id = requester["keyId"].as_str().unwrap_or_default().to_string();
        let channel = text(&row, "channel");
        let device_id = text(&row, "requester_device_id");
        // The client says whether it proves its key on each connection (never the native shells yet).
        let enrollment = Enrollment {
            device_id: Some(device_id),
            platform: text(&meta, "platform"),
            label: text(&meta, "label"),
            enrolled_by: Some(channel),
            restricted_until: Some(now + PROBATION_MS),
            connection_proof: requester["connectionProof"] == JsonValue::Bool(true),
            ..Enrollment::session(&key_id, principal, &requester["jwk"])
        };
        devices::enroll(db, &enrollment, now)?;
        let approve: Option<JsonValue> = if js::truthy(row.get("requester_approve_key")) {
            Some(
                serde_json::from_str(text(&row, "requester_approve_key"))
                    .map_err(|e| e.to_string())?,
            )
        } else {
            None
        };
        if let Some(approve) = &approve {
            devices::enroll(
                db,
                &Enrollment {
                    key_id: approve["keyId"].as_str().unwrap_or_default(),
                    jwk: &approve["jwk"],
                    role: "approve",
                    assurance: approve["assurance"].as_str().unwrap_or("undefined"),
                    credential_id: approve["credentialId"].as_str(),
                    sign_count: approve["signCount"].as_i64().unwrap_or(0),
                    connection_proof: false,
                    ..enrollment
                },
                now,
            )?;
        }
        // The code's wrapped backup keys go to the device that typed it, then with the code.
        let backup_keys = if channel == "recovery_code" {
            let kept = db
                .query_row(
                    "SELECT backup_keys FROM auth_recovery_codes WHERE principal_id = ?",
                    [principal],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            db.execute(
                "DELETE FROM auth_recovery_codes WHERE principal_id = ?",
                [principal],
            )
            .map_err(|e| e.to_string())?;
            kept
        } else {
            None
        };
        db.execute(
            "UPDATE auth_recovery_requests SET state = 'completed' WHERE request_id = ?",
            [text(&row, "request_id")],
        )
        .and_then(|_| {
            db.execute(
                "UPDATE auth_recovery_requests SET state = 'cancelled' WHERE principal_id = ? AND state = 'pending'",
                [principal],
            )
        })
        .map_err(|e| e.to_string())?;
        proof.audit(
            db,
            "recovery_completed",
            Some(principal),
            Some(text(&row, "request_id")),
            now,
        )?;
        let added = json!({ "deviceId": device_id, "label": meta["label"], "platform": meta["platform"],
            "canApprove": approve.as_ref().is_some_and(|approve| approve["assurance"] == devices::APPROVE_ASSURANCE),
            "backupKeys": backup_keys.filter(|keys| !keys.is_empty()) });
        Ok((account, key_id, added))
    })?;
    let mut session = device_sessions::create(db, proof, secret, &account, &key_id, now)?;
    // The code is consumed: the user is asked to create a new one right away.
    session["canApprove"] = added["canApprove"].clone();
    session["recoveryCodeRequired"] = json!(true);
    session["probationUntil"] = json!(now + PROBATION_MS);
    if !added["backupKeys"].is_null() {
        session["backupKeys"] = added["backupKeys"].clone();
    }
    let device = added["deviceId"].as_str().unwrap_or_default();
    Ok(Outcome::answer(session).notify(
        text(&account, "user_id"),
        json!({ "kind": "auth-device-added", "deviceId": device, "label": added["label"],
            "platform": added["platform"] }),
        json!({ "exceptDeviceId": device }),
    ))
}
