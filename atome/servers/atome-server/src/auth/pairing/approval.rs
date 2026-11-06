// A pairing answered on an enrolled device: its code claimed, the request viewed, then approved.
use super::{CLAIM_FAILURES, PAIR_TTL_MS, code_hash, describe, parse, read, requester_key, sql};
use crate::auth::account_auth;
use crate::auth::device_sessions::{self, text};
use crate::auth::devices;
use crate::auth::outcome::Outcome;
use crate::auth::proof::{Proof, backup_keys_digest, backup_keys_of};
use crate::vault_router::central::{atomic, row_json};
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

// `Number(value)` as `String()` writes it into a subject.
fn number_text(number: f64) -> String {
    if number.is_nan() {
        "NaN".into()
    } else if number.is_infinite() {
        if number > 0.0 {
            "Infinity"
        } else {
            "-Infinity"
        }
        .into()
    } else {
        js::string(&js::number_json(number))
    }
}

/// `pair-claim`: an enrolled device types or dictates the request code shown on the new one.
pub fn claim(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    claims: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let code = input
        .get("code")
        .filter(|code| js::truthy(Some(code)))
        .map(|code| js::text(Some(code)))
        .unwrap_or_default();
    let value: String = code.chars().filter(char::is_ascii_digit).collect();
    let principal = text(claims, "sub");
    // A failed guess is kept on its own: the refusal that follows must not undo it.
    let refusal = atomic(db, |db| {
        let bucket = format!("pair-claim:{}", js::text(claims.get("sid")));
        let failures = db
            .query_row(
                "SELECT count FROM auth_send_limits WHERE bucket = ? AND reset_ms > ?",
                params![bucket, now],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if failures.is_some_and(|count| count >= CLAIM_FAILURES) {
            return Ok(Err("auth_pairing_locked"));
        }
        let row = if value.len() == 6 {
            db.query_row(
                "SELECT * FROM auth_pair_requests WHERE code_hash = ? AND state = 'pending' AND expires_ms > ?",
                params![code_hash(proof, &value), now],
                row_json,
            )
            .optional()
            .map_err(|e| e.to_string())?
        } else {
            None
        };
        let row = match row {
            Some(row)
                if row["target_principal"].is_null()
                    || text(&row, "target_principal") == principal =>
            {
                row
            }
            _ => {
                sql(
                    db,
                    "INSERT INTO auth_send_limits VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET
                     count = CASE WHEN reset_ms <= ? THEN 1 ELSE count + 1 END,
                     reset_ms = CASE WHEN reset_ms <= ? THEN excluded.reset_ms ELSE reset_ms END",
                    params![bucket, now + PAIR_TTL_MS, now, now],
                )?;
                proof.audit(db, "pair_claim_failed", Some(principal), None, now)?;
                return Ok(Err("auth_pairing_invalid"));
            }
        };
        if row["target_principal"].is_null() {
            sql(
                db,
                "UPDATE auth_pair_requests SET target_principal = ? WHERE request_id = ? AND target_principal IS NULL",
                &[&principal, &text(&row, "request_id")],
            )?;
        }
        Ok(Ok(describe(&row)?))
    })?;
    let request = refusal.map_err(str::to_string)?;
    Ok(Outcome::answer(json!({ "ok": true, "request": request })))
}

/// `pair-pending`: requests still waiting for this account, for a device that hears
/// them live (personal, out of probation: the one that may approve; user, 4 Nov. 2026).
pub fn pending(db: &Connection, claims: &JsonValue, now: i64) -> Result<Outcome, String> {
    let kid = claims
        .pointer("/cnf/kid")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    if !devices::hears_account_requests(devices::by_id(db, kid)?.as_ref(), now) {
        return Ok(Outcome::answer(json!({ "ok": true, "requests": [] })));
    }
    let mut statement = db
        .prepare(
            "SELECT * FROM auth_pair_requests WHERE target_principal = ? AND state = 'pending'
             AND expires_ms > ? ORDER BY created_ms DESC LIMIT 5",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(params![text(claims, "sub"), now], row_json)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let requests = rows.iter().map(describe).collect::<Result<Vec<_>, _>>()?;
    Ok(Outcome::answer(json!({ "ok": true, "requests": requests })))
}

/// `pair-view`.
pub fn view(
    db: &Connection,
    input: &JsonValue,
    claims: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let row = read(db, input.get("pairId"), now)?;
    if text(&row, "target_principal") != text(claims, "sub") || text(&row, "state") != "pending" {
        return Err("auth_pair_unknown".into());
    }
    Ok(Outcome::answer(
        json!({ "ok": true, "request": describe(&row)? }),
    ))
}

fn subject_for(row: &JsonValue, choice: f64, backup: JsonValue) -> Result<JsonValue, String> {
    let approve = if js::truthy(row.get("requester_approve_key")) {
        parse(row, "requester_approve_key")?["keyId"].clone()
    } else {
        JsonValue::Null
    };
    Ok(
        json!({ "pairId": row["request_id"], "requesterSessionKeyId": requester_key(row)?["keyId"],
        "requesterApproveKeyId": approve, "choice": number_text(choice), "backup": backup }),
    )
}

// `/^([a-f0-9]{64}|-)$/.test(String(backup))`.
fn backup_reference(value: &str) -> bool {
    value == "-"
        || (value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)))
}

/// `approval-challenge` with `purpose: 'pair-approve'`.
pub fn approve_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let row = read(db, input.get("pairId"), now)?;
    let session = device_sessions::read(db, input.get("sessionId"), now)?;
    if text(&row, "state") != "pending"
        || text(&row, "target_principal") != text(&session, "principal_id")
    {
        return Err("auth_pair_unknown".into());
    }
    let backup = js::text(input.get("backup"));
    if !backup_reference(&backup) {
        return Err("auth_request_invalid".into());
    }
    let choice = js::number(input.get("choice"));
    let mut asked = input.clone();
    asked["purpose"] = json!("pair-approve");
    asked["subject"] = subject_for(&row, choice, input["backup"].clone())?;
    account_auth::approval_challenge(db, proof, &asked, now)
}

/// `pair-approve`: the approver's choice, proven by its approve key; a wrong number ends the request.
pub fn approve(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let choice = js::number(input.get("choice"));
    let backup_keys = backup_keys_of(input.get("backupKeys"))?;
    let (principal, pair_id, rejected) = atomic(db, |db| {
        let row = read(db, input.get("pairId"), now)?;
        let digest = backup_keys_digest(backup_keys.as_deref());
        let authorized = account_auth::authorize(
            db,
            input,
            "pair-approve",
            &subject_for(&row, choice, json!(digest))?,
            now,
        )?;
        // Backup keys go only to a device that announced its key for them.
        if backup_keys.is_some() && !js::truthy(row.get("requester_backup_key")) {
            return Err("auth_request_invalid".into());
        }
        let principal = text(&authorized.session, "principal_id").to_string();
        if text(&row, "state") != "pending" || text(&row, "target_principal") != principal {
            return Err("auth_pair_unknown".into());
        }
        let pair_id = text(&row, "request_id").to_string();
        if choice != js::number(row.get("match_number")) {
            sql(
                db,
                "UPDATE auth_pair_requests SET state = 'rejected' WHERE request_id = ?",
                &[&pair_id],
            )?;
            proof.audit(
                db,
                "pair_wrong_number",
                Some(&principal),
                Some(&pair_id),
                now,
            )?;
            return Ok((principal, pair_id, true));
        }
        sql(
            db,
            "UPDATE auth_pair_requests SET state = 'approved', approved_by = ?, backup_keys = ?
             WHERE request_id = ? AND state = 'pending'",
            params![authorized.device_id, backup_keys, pair_id],
        )?;
        proof.audit(db, "pair_approved", Some(&principal), Some(&pair_id), now)?;
        Ok((principal, pair_id, false))
    })?;
    if rejected {
        return Ok(Outcome::answer(
            json!({ "ok": true, "rejected": true, "approved": false, "pairId": pair_id }),
        )
        .notify(
            &principal,
            json!({ "kind": "auth-pair-rejected", "pairId": pair_id }),
            json!({}),
        )
        .effect(
            "pair-update",
            json!({ "pairId": pair_id, "state": "rejected" }),
        ));
    }
    Ok(
        Outcome::answer(json!({ "ok": true, "approved": true, "pairId": pair_id })).effect(
            "pair-update",
            json!({ "pairId": pair_id, "state": "approved" }),
        ),
    )
}
