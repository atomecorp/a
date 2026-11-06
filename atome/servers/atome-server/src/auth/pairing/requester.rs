// The requester's side once it waits: its challenges, its status, its session, its withdrawal.
use super::{REQUESTER_PURPOSES, parse, read, requester_key, sql};
use crate::auth::accounts;
use crate::auth::device_sessions::{self, public_key, same_generation, text};
use crate::auth::devices::{self, Enrollment, PROBATION_MS};
use crate::auth::outcome::Outcome;
use crate::auth::proof::Proof;
use crate::vault_router::central::atomic;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};

/// `pair-requester-challenge`: the waiting device's own challenges.
pub fn requester_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let purpose = input
        .get("purpose")
        .and_then(JsonValue::as_str)
        .filter(|purpose| REQUESTER_PURPOSES.contains(purpose))
        .ok_or("auth_request_invalid")?;
    let row = read(db, input.get("pairId"), now)?;
    let key = requester_key(&row)?;
    let challenge = proof.challenge(
        db,
        purpose,
        text(&row, "request_id"),
        key["keyId"].as_str().unwrap_or_default(),
        None,
        now,
    )?;
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge }),
    ))
}

/// `pair-status`: the waiting device asks where its request stands (after a lost socket).
pub fn status(db: &Connection, input: &JsonValue, now: i64) -> Result<Outcome, String> {
    let row = atomic(db, |db| {
        let row = read(db, input.get("pairId"), now)?;
        let jwk = requester_key(&row)?["jwk"].clone();
        Proof::consume_proof(
            db,
            input,
            "pair-resume",
            text(&row, "request_id"),
            &jwk,
            now,
        )?;
        Ok(row)
    })?;
    Ok(Outcome::answer(
        json!({ "ok": true, "state": row["state"], "expiresAt": row["expires_ms"] }),
    )
    .effect("pair", json!({ "pairId": input.get("pairId") })))
}

/// `pair-complete`: the approved device enrolls its keys and opens its session.
pub fn complete(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let (account, key_id, enrolled) = atomic(db, |db| {
        let row = read(db, input.get("pairId"), now)?;
        let requester = requester_key(&row)?;
        let key_id = requester["keyId"].as_str().unwrap_or_default().to_string();
        let jwk = &requester["jwk"];
        let pair_id = text(&row, "request_id");
        Proof::consume_proof(db, input, "pair-complete", pair_id, jwk, now)?;
        if text(&row, "state") != "approved" || !js::truthy(row.get("target_principal")) {
            return Err("auth_pair_not_approved".into());
        }
        let account = accounts::find_by_id(db, text(&row, "target_principal"))?
            .ok_or("auth_session_invalid")?;
        let principal = text(&account, "user_id");
        let completed = "UPDATE auth_pair_requests SET state = 'completed' WHERE request_id = ? AND state = 'approved'";
        if text(&row, "kind") == "shared_open" {
            // An approved opening of a shared device: a short session, no new key.
            devices::by_id(db, &key_id)?
                .filter(|key| key["revoked_ms"].is_null() && text(key, "principal_id") == principal)
                .ok_or("auth_session_invalid")?;
            sql(db, completed, &[&pair_id])?;
            proof.audit(
                db,
                "shared_open_completed",
                Some(principal),
                Some(&key_id),
                now,
            )?;
            return Ok((account, key_id, None));
        }
        let meta = parse(&row, "device_meta")?;
        let restricted = now + PROBATION_MS;
        let enrolled_by = row.get("approved_by").and_then(JsonValue::as_str);
        let device_id = text(&row, "requester_device_id");
        let enrollment = Enrollment {
            device_id: Some(device_id),
            device_class: text(&row, "device_class"),
            platform: text(&meta, "platform"),
            label: text(&meta, "label"),
            enrolled_by,
            restricted_until: Some(restricted),
            connection_proof: requester["connectionProof"] == JsonValue::Bool(true),
            ..Enrollment::session(&key_id, principal, jwk)
        };
        devices::enroll(db, &enrollment, now)?;
        let approve = if js::truthy(row.get("requester_approve_key")) {
            Some(parse(&row, "requester_approve_key")?)
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
        sql(db, completed, &[&pair_id])?;
        proof.audit(db, "device_enrolled", Some(principal), Some(&key_id), now)?;
        // The sealed backup keys are handed over once, then forgotten here.
        sql(
            db,
            "UPDATE auth_pair_requests SET backup_keys = NULL WHERE request_id = ?",
            &[&pair_id],
        )?;
        let added = json!({ "deviceId": device_id, "label": meta["label"], "platform": meta["platform"],
            "canApprove": approve.as_ref().is_some_and(|approve| approve["assurance"] == devices::APPROVE_ASSURANCE),
            "backupKeys": row["backup_keys"] });
        Ok((account, key_id, Some(added)))
    })?;
    let mut session = device_sessions::create(db, proof, secret, &account, &key_id, now)?;
    let forget = json!({ "pairId": null });
    let Some(added) = enrolled else {
        session["canApprove"] = json!(false);
        return Ok(Outcome::answer(session).effect("pair", forget));
    };
    session["canApprove"] = added["canApprove"].clone();
    session["probationUntil"] = json!(now + PROBATION_MS);
    if js::truthy(added.get("backupKeys")) {
        session["backupKeys"] = added["backupKeys"].clone();
    }
    let device = added["deviceId"].as_str().unwrap_or_default();
    Ok(Outcome::answer(session)
        .notify(
            text(&account, "user_id"),
            json!({ "kind": "auth-device-added", "deviceId": device, "label": added["label"],
                "platform": added["platform"] }),
            json!({ "exceptDeviceId": device }),
        )
        .effect("pair", forget))
}

/// `pair-cancel`: the requester withdraws with its key; any device of the targeted account may refuse.
pub fn cancel(
    db: &Connection,
    input: &JsonValue,
    claims: &JsonValue,
    proof: &Proof,
    now: i64,
) -> Result<Outcome, String> {
    let target = atomic(db, |db| {
        let row = read(db, input.get("pairId"), now)?;
        let target = row.get("target_principal").and_then(JsonValue::as_str);
        let caller = claims
            .get("sub")
            .and_then(JsonValue::as_str)
            .filter(|sub| !sub.is_empty());
        if caller.is_none() || target != caller {
            let jwk = requester_key(&row)?["jwk"].clone();
            Proof::consume_proof(
                db,
                input,
                "pair-cancel",
                text(&row, "request_id"),
                &jwk,
                now,
            )?;
        }
        sql(
            db,
            "UPDATE auth_pair_requests SET state = 'cancelled' WHERE request_id = ? AND state IN ('pending', 'approved')",
            &[&text(&row, "request_id")],
        )?;
        proof.audit(
            db,
            "pair_cancelled",
            target,
            Some(text(&row, "request_id")),
            now,
        )?;
        Ok(target.map(str::to_string))
    })?;
    let pair_id = input.get("pairId").cloned().unwrap_or(JsonValue::Null);
    let mut outcome = Outcome::answer(json!({ "ok": true }));
    if let Some(target) = target.filter(|target| !target.is_empty()) {
        outcome = outcome.notify(
            &target,
            json!({ "kind": "auth-pair-cancelled", "pairId": pair_id }),
            json!({}),
        );
    }
    Ok(outcome.effect(
        "pair-update",
        json!({ "pairId": pair_id, "state": "cancelled" }),
    ))
}

/// `not-my-account`: the new device withdraws its own keys at once, probation or not.
pub fn not_mine(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let (principal, device, revoked) = atomic(db, |db| {
        let row = device_sessions::read(db, input.get("sessionId"), now)?;
        if !same_generation(&row, input) {
            return Err("auth_session_stale".into());
        }
        let reference = format!(
            "{}:{}",
            js::text(input.get("sessionId")),
            js::text(input.get("generation"))
        );
        Proof::consume_proof(
            db,
            input,
            "not-my-account",
            &reference,
            &public_key(&row)?,
            now,
        )?;
        let key = devices::by_id(db, text(&row, "key_id"))?.ok_or("device_key_missing")?;
        let device = devices::device_of(&key);
        let principal = text(&row, "principal_id").to_string();
        let revoked = devices::revoke_device(db, &principal, &json!(device), now)?;
        proof.audit(db, "device_not_mine", Some(&principal), Some(&device), now)?;
        Ok((principal, device, revoked))
    })?;
    Ok(Outcome::answer(json!({ "ok": true })).disconnect(revoked).notify(
        &principal,
        json!({ "kind": "auth-device-revoked", "deviceId": device, "reason": "not_my_account" }),
        json!({}),
    ))
}
