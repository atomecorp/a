// A pairing asked: by a new device (`pair-start`), or by a shared device reopening its account.
use super::{
    PAIR_TTL_MS, WINDOW_MS, code_hash, free_code, match_choices, network_bucket, present, sql,
    started,
};
use crate::auth::device_sessions::{public_key, text};
use crate::auth::devices;
use crate::auth::outcome::Outcome;
use crate::auth::proof::{Proof, public_device_key};
use crate::auth::{approvals, handles};
use crate::vault_router::central::atomic;
use crate::vault_router::js;
use rusqlite::{Connection, params};
use serde_json::{Value as JsonValue, json};

/// `pair-start-challenge`: the challenge a new device's approve key registers over.
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
        &network_bucket(proof, "pair-challenge", network),
        30,
        WINDOW_MS,
        now,
    )?;
    if devices::by_id(db, &key.key_id)?.is_some() {
        return Err("auth_request_invalid".into());
    }
    let register = proof.challenge(
        db,
        "approve-key-register",
        &format!("pair:{}", key.key_id),
        &key.key_id,
        None,
        now,
    )?;
    Ok(Outcome::answer(json!({ "ok": true, "register": register })))
}

/// `pair-start`: a new device's request, routed to an account by handle or phone, or
/// left open for the device that types its code.
pub fn start(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    let key = public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?;
    let meta = devices::normalize_meta(input.get("deviceMeta"), true);
    let class = devices::resolve_class(text(&meta, "platform"), input.get("deviceClass"))?;
    // The new device's key for the backup keys (a personal device only: a shared one never holds them).
    let backup_key = match input.get("backupKey") {
        Some(backup) if js::truthy(Some(backup)) && class == "personal" => {
            Some(public_device_key(backup)?.jwk.to_string())
        }
        _ => None,
    };
    Proof::cleanup(db, now)?;
    let (pair_id, code, number, target, expires) = atomic(db, |db| {
        Proof::limit(
            db,
            &network_bucket(proof, "pair-start", network),
            10,
            WINDOW_MS,
            now,
        )?;
        Proof::limit(
            db,
            &format!("pair-start-key:{}", key.key_id),
            5,
            WINDOW_MS,
            now,
        )?;
        if devices::by_id(db, &key.key_id)?.is_some() {
            return Err("auth_request_invalid".into());
        }
        let reference = format!("pair:{}", key.key_id);
        let approve = match input.get("approve") {
            Some(approve) if js::truthy(Some(approve)) && class == "personal" => {
                Some(approvals::register(
                    db,
                    approve,
                    "approve-key-register",
                    &reference,
                    &key.key_id,
                    now,
                )?)
            }
            _ => None,
        };
        // Uniform answer whether the handle or phone exists or not; one pending request per account.
        let (by_handle, by_phone) = (present(input, "handle"), present(input, "phone"));
        if by_handle && by_phone {
            return Err("auth_request_invalid".into());
        }
        let target = if by_handle {
            handles::resolve(db, input.get("handle"))?
        } else if by_phone {
            handles::resolve_phone(db, input.get("phone"))?
        } else {
            None
        };
        if by_handle {
            let handle = js::text(input.get("handle")).to_lowercase();
            Proof::limit(
                db,
                &network_bucket(proof, "pair-handle", &handle),
                3,
                WINDOW_MS,
                now,
            )?;
        }
        if by_phone {
            let phone = js::text(input.get("phone"));
            Proof::limit(
                db,
                &network_bucket(proof, "pair-phone", &phone),
                3,
                WINDOW_MS,
                now,
            )?;
        }
        if let Some(target) = &target {
            sql(
                db,
                "UPDATE auth_pair_requests SET state = 'cancelled'
                 WHERE target_principal = ? AND kind = 'enroll' AND state IN ('pending', 'approved')",
                &[target],
            )?;
        }
        let code = free_code(db, proof)?;
        let number = 10 + i64::from(proof.random_int(90));
        let pair_id = proof.random_handle();
        let device_id = devices::new_device_id(proof);
        let expires = now + PAIR_TTL_MS;
        let session_key = json!({ "keyId": key.key_id, "jwk": key.jwk,
            "connectionProof": input.get("connectionProof") == Some(&JsonValue::Bool(true)) });
        let approve = approve.map(|approve| {
            json!({ "keyId": approve.key_id, "jwk": approve.jwk, "credentialId": approve.credential_id,
                "signCount": approve.sign_count, "assurance": approve.assurance })
            .to_string()
        });
        sql(
            db,
            "INSERT INTO auth_pair_requests (request_id, kind, requester_device_id, requester_session_key,
             requester_approve_key, device_meta, device_class, code_hash, match_number, choices, target_principal, state,
             approved_by, created_ms, expires_ms, failed_attempts, requester_backup_key)
             VALUES (?, 'enroll', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, 0, ?)",
            params![
                pair_id,
                device_id,
                session_key.to_string(),
                approve,
                meta.to_string(),
                class,
                code_hash(proof, &code),
                number,
                json!(match_choices(proof, number)).to_string(),
                target,
                now,
                expires,
                backup_key,
            ],
        )?;
        proof.audit(db, "pair_started", target.as_deref(), Some(&pair_id), now)?;
        Ok((pair_id, code, number, target, expires))
    })?;
    let mut outcome = Outcome::answer(started(&pair_id, &code, number, expires));
    if let Some(target) = target {
        outcome = outcome.notify(
            &target,
            json!({ "kind": "auth-pair-request", "pairId": pair_id }),
            json!({ "personalOnly": true, "push": true }),
        );
    }
    Ok(outcome.effect("pair", json!({ "pairId": pair_id })))
}

// A shared device's live session key.
fn shared_key(db: &Connection, session_key: Option<&JsonValue>) -> Result<JsonValue, String> {
    let key = public_device_key(session_key.unwrap_or(&JsonValue::Null))?;
    devices::by_id(db, &key.key_id)?
        .filter(|row| {
            row["revoked_ms"].is_null()
                && text(row, "key_role") == "session"
                && text(row, "device_class") == "shared"
        })
        .ok_or_else(|| "auth_request_invalid".into())
}

/// `shared-open-challenge`.
pub fn shared_open_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    Proof::limit(
        db,
        &network_bucket(proof, "shared-open-challenge", network),
        30,
        WINDOW_MS,
        now,
    )?;
    let key = shared_key(db, input.get("sessionKey"))?;
    let key_id = text(&key, "key_id");
    let challenge = proof.challenge(
        db,
        "shared-open",
        &format!("shared:{key_id}"),
        key_id,
        None,
        now,
    )?;
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge }),
    ))
}

/// `shared-open-start`: a shared device asks its owner to approve this opening.
pub fn shared_open_start(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let (pair_id, code, number, principal, expires) = atomic(db, |db| {
        let key = shared_key(db, input.get("sessionKey"))?;
        let key_id = text(&key, "key_id");
        Proof::limit(db, &format!("shared-open:{key_id}"), 5, WINDOW_MS, now)?;
        let jwk = public_key(&key)?;
        Proof::consume_proof(
            db,
            input,
            "shared-open",
            &format!("shared:{key_id}"),
            &jwk,
            now,
        )?;
        let device = devices::device_of(&key);
        sql(
            db,
            "UPDATE auth_pair_requests SET state = 'cancelled' WHERE requester_device_id = ? AND kind = 'shared_open'
             AND state IN ('pending', 'approved')",
            &[&device],
        )?;
        let code = free_code(db, proof)?;
        let number = 10 + i64::from(proof.random_int(90));
        let pair_id = proof.random_handle();
        let expires = now + PAIR_TTL_MS;
        let platform = Some(text(&key, "platform"))
            .filter(|p| !p.is_empty())
            .unwrap_or("web");
        let principal = text(&key, "principal_id").to_string();
        sql(
            db,
            "INSERT INTO auth_pair_requests (request_id, kind, requester_device_id, requester_session_key,
             requester_approve_key, device_meta, device_class, code_hash, match_number, choices, target_principal, state,
             approved_by, created_ms, expires_ms, failed_attempts)
             VALUES (?, 'shared_open', ?, ?, NULL, ?, 'shared', ?, ?, ?, ?, 'pending', NULL, ?, ?, 0)",
            params![
                pair_id,
                device,
                json!({ "keyId": key_id, "jwk": jwk }).to_string(),
                json!({ "platform": platform, "label": text(&key, "label") }).to_string(),
                code_hash(proof, &code),
                number,
                json!(match_choices(proof, number)).to_string(),
                principal,
                now,
                expires,
            ],
        )?;
        proof.audit(
            db,
            "shared_open_started",
            Some(&principal),
            Some(&pair_id),
            now,
        )?;
        Ok((pair_id, code, number, principal, expires))
    })?;
    Ok(Outcome::answer(started(&pair_id, &code, number, expires))
        .notify(
            &principal,
            json!({ "kind": "auth-pair-request", "pairId": pair_id }),
            json!({ "personalOnly": true, "push": true }),
        )
        .effect("pair", json!({ "pairId": pair_id })))
}
