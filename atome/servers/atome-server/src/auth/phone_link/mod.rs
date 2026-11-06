// The phone link (server/auth_phone_link.js, ported but for the payment that creates an
// account, which moves with billing, L3.8): a device asks for an SMS carrying a link; the
// link opened (on this device, or on another with the pairing code it shows) proves the
// number, and the device's key opens its account, a new one once paid, or a recovery
// request when the account already has devices. The SMS goes out between two units of
// work (sms.rs); each unit is `committed`, Fastify's `withTransaction` blocks `atomic`.
mod finish;

pub use finish::{complete, pay};

use super::device_sessions::{self, public_key, same_generation, text};
use super::outcome::Outcome;
use super::proof::{Proof, digest, public_device_key, require_handle};
use super::{accounts, devices};
use crate::vault_router::central::{atomic, row_json};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Value as JsonValue, json};

pub(super) const LINK_TTL_MS: i64 = 5 * 60 * 1000;
const ORIGIN: &str = "https://atome.one";
const CHALLENGE_PURPOSES: [&str; 5] = ["consume", "resume", "resend", "cancel", "payment"];

// `reject()`'s own code.
pub(super) fn refused<T>() -> Result<T, String> {
    Err("auth_proof_invalid".into())
}

pub(super) fn sql(
    db: &Connection,
    statement: &str,
    values: &[&dyn rusqlite::ToSql],
) -> Result<usize, String> {
    db.execute(statement, values).map_err(|e| e.to_string())
}

// Separate from the SMS secret: only the requesting device receives this code.
fn pairing_code(proof: &Proof, id: &str) -> String {
    let index = proof.keyed_index(&format!("phone-link-pairing:{id}"));
    let number = u64::from_str_radix(&index[..12], 16).unwrap_or_default();
    format!("{:08}", number % 100_000_000)
}

pub(super) fn pending(proof: &Proof, value: &JsonValue, now: i64) -> JsonValue {
    let id = text(value, "attempt_id");
    let mut answer = json!({ "ok": true, "pending": true, "attemptId": id, "expiresAt": value["expires_ms"],
        "serverNow": now, "pairingCode": pairing_code(proof, id) });
    if text(value, "state") == "verified_payment" {
        answer["paymentRequired"] = json!(true);
    }
    answer
}

/// The attempt `id`, still open (a blocked one only to be cancelled).
pub(super) fn attempt(
    db: &Connection,
    id: Option<&JsonValue>,
    for_cancellation: bool,
    now: i64,
) -> Result<JsonValue, String> {
    let id = require_handle(id.unwrap_or(&JsonValue::Null))?;
    let value = db
        .query_row(
            "SELECT * FROM auth_link_attempts WHERE attempt_id = ?",
            [id],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(value) = value else {
        return refused();
    };
    if value["expires_ms"]
        .as_i64()
        .is_some_and(|expires| expires <= now)
    {
        return Err("auth_attempt_expired".into());
    }
    let state = text(&value, "state");
    if ["consumed", "cancelled"].contains(&state) || (state == "blocked" && !for_cancellation) {
        return refused();
    }
    Ok(value)
}

/// An SMS to send: the attempt as it stood and its link's token.
pub struct Delivery {
    pub attempt: JsonValue,
    pub token: String,
}

/// What a request leaves: an answer, or an SMS to send first.
pub enum Step {
    Done(Outcome),
    Send(Delivery),
}

/// Reserved only right before the provider's I/O; an uncertain delivery keeps it.
pub fn reserve(
    db: &Connection,
    delivery: &Delivery,
    daily_limit: i64,
    now: i64,
) -> Result<(), String> {
    atomic(db, |db| {
        let current = attempt(db, delivery.attempt.get("attempt_id"), false, now)?;
        if text(&current, "state") != "created" {
            return refused();
        }
        Proof::limit(db, "sms-daily", daily_limit, 86_400_000, now)
    })
}

pub fn link(delivery: &Delivery) -> String {
    format!(
        "{ORIGIN}/auth/v/{}#t={}",
        text(&delivery.attempt, "attempt_id"),
        delivery.token
    )
}

/// The provider took the SMS (`Ok`, with the link itself in development), or not.
pub fn delivered(
    db: &Connection,
    proof: &Proof,
    delivery: &Delivery,
    sent: Result<Option<String>, String>,
    now: i64,
) -> Result<Outcome, String> {
    let id = text(&delivery.attempt, "attempt_id");
    let recorded = sent.and_then(|development| {
        atomic(db, |db| {
            sql(db, "UPDATE auth_link_attempts SET state = 'sent' WHERE attempt_id = ? AND state = 'created'", &[&id])?;
            proof.audit(db, "sms_provider_accepted", None, Some(id), now)
        })
        .map(|()| development)
    });
    let Ok(development) = recorded else {
        atomic(db, |db| {
            sql(
                db,
                "UPDATE auth_link_attempts SET state = 'blocked' WHERE attempt_id = ?",
                &[&id],
            )?;
            proof.audit(db, "sms_delivery_failed", None, Some(id), now)
        })?;
        return Err("sms_delivery_unavailable".into());
    };
    let mut answer = pending(proof, &delivery.attempt, now);
    answer["pending"] = json!(false);
    if let Some(link) = development {
        answer["developmentLink"] = json!(link);
    }
    Ok(Outcome::answer(answer))
}

/// `phone-link-start` (and a number change, `change` the session that asked it).
pub fn start(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    phone: Option<&JsonValue>,
    network: &str,
    change: Option<&JsonValue>,
    now: i64,
) -> Result<Step, String> {
    let phone = device_sessions::e164(phone).ok_or("auth_phone_e164_required")?;
    let nonce = require_handle(input.get("clientNonce").unwrap_or(&JsonValue::Null))?;
    let key = public_device_key(input.get("publicKey").unwrap_or(&JsonValue::Null))?;
    if network.is_empty() {
        return Err("auth_network_identity_required".into());
    }
    let index = proof.keyed_index(phone);
    Proof::cleanup(db, now)?;
    let id = proof.random_handle();
    let token = proof.random_handle();
    // Counters are kept even when the delivery fails: an ambiguous timeout spends budget.
    atomic(db, |db| {
        Proof::limit(db, &format!("phone-minute:{index}"), 1, 60_000, now)?;
        Proof::limit(db, &format!("phone-hour:{index}"), 5, 3_600_000, now)?;
        Proof::limit(db, &format!("device:{}", key.key_id), 10, 3_600_000, now)?;
        Proof::limit(
            db,
            &format!("network:{}", proof.keyed_index(network)),
            20,
            3_600_000,
            now,
        )?;
        let account = accounts::find_by_phone(db, phone)?;
        let holder = account.as_ref().map(|account| text(account, "user_id"));
        let changing = change.map(|session| text(session, "principal_id"));
        // A number held by another account is only told once the SMS proves it: before,
        // the answer is the same whether the number is taken or not.
        if changing.is_some() && holder == changing {
            return refused();
        }
        if let Some(registered) = devices::by_id(db, &key.key_id)?
            && (!registered["revoked_ms"].is_null()
                || Some(text(&registered, "principal_id")) != changing.or(holder))
        {
            return refused();
        }
        // Only a new attempt from the same device supersedes its predecessor.
        sql(
            db,
            "UPDATE auth_link_attempts SET state = 'cancelled'
             WHERE phone_index = ? AND key_id = ? AND state IN ('verified_payment', 'created', 'sent', 'approved')",
            &[&index, &key.key_id],
        )?;
        sql(
            db,
            "INSERT INTO auth_link_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, NULL)",
            &[
                &id,
                &proof.seal_phone(phone),
                &index,
                &holder,
                &key.key_id,
                &key.jwk.to_string(),
                &nonce,
                &digest(&token),
                &now,
                &(now + LINK_TTL_MS),
            ],
        )?;
        if let Some(session) = change {
            sql(
                db,
                "INSERT INTO auth_phone_changes VALUES (?, ?, ?)",
                &[
                    &id,
                    &text(session, "principal_id"),
                    &text(session, "session_id"),
                ],
            )?;
        }
        proof.audit(db, "authentication_started", holder, Some(&id), now)
    })?;
    let attempt = attempt(db, Some(&json!(id)), false, now)?;
    Ok(Step::Send(Delivery { attempt, token }))
}

/// `phone-change-start`: the session proves the change (`authorizePhoneChange`), then a
/// link goes to the new number.
pub fn start_change(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Step, String> {
    if input.get("confirmed") != Some(&JsonValue::Bool(true)) {
        return Err("auth_confirmation_required".into());
    }
    let session = atomic(db, |db| {
        let row = device_sessions::read(db, input.get("sessionId"), now)?;
        if !same_generation(&row, input) {
            return Err("auth_session_stale".into());
        }
        if crate::vault_router::js::number(row.get("restricted_until_ms")) > now as f64 {
            return Err("auth_device_cooling_off".into());
        }
        let reference = device_sessions::reference(input, "change-phone")?;
        Proof::consume_proof(
            db,
            input,
            "change-phone",
            &reference,
            &public_key(&row)?,
            now,
        )?;
        Ok(row)
    })?;
    let key = public_device_key(input.get("publicKey").unwrap_or(&JsonValue::Null))?;
    if key.key_id != text(&session, "key_id") {
        return refused();
    }
    start(
        db,
        proof,
        input,
        input.get("newPhone"),
        network,
        Some(&session),
        now,
    )
}

/// `phone-link-challenge`: a challenge for this attempt's own device key.
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
        .filter(|purpose| CHALLENGE_PURPOSES.contains(purpose))
        .ok_or("auth_request_invalid")?;
    atomic(db, |db| {
        Proof::limit(
            db,
            &format!("challenge:{}", proof.keyed_index(network)),
            60,
            60_000,
            now,
        )?;
        let value = attempt(db, input.get("attemptId"), purpose == "cancel", now)?;
        let key_id = text(&value, "key_id");
        if input.get("keyId").and_then(JsonValue::as_str) != Some(key_id) {
            return refused();
        }
        let challenge = proof.challenge(
            db,
            purpose,
            text(&value, "attempt_id"),
            key_id,
            value.get("client_nonce"),
            now,
        )?;
        Ok(Outcome::answer(
            json!({ "ok": true, "challenge": challenge }),
        ))
    })
}

/// `phone-link-resend`: a new link for an SMS not opened yet.
pub fn resend(db: &Connection, proof: &Proof, input: &JsonValue, now: i64) -> Result<Step, String> {
    let token = proof.random_handle();
    atomic(db, |db| {
        let value = attempt(db, input.get("attemptId"), false, now)?;
        let state = text(&value, "state");
        if !["sent", "approved", "verified_payment"].contains(&state) {
            return refused();
        }
        let id = text(&value, "attempt_id");
        Proof::consume_proof(db, input, "resend", id, &public_key(&value)?, now)?;
        if state != "sent" {
            return Ok(Step::Done(Outcome::answer(pending(proof, &value, now))));
        }
        let holder = accounts::find_by_phone(db, &proof.open_phone(text(&value, "phone_sealed"))?)?;
        let candidate = value["candidate_id"].as_str();
        if holder.as_ref().map(|account| text(account, "user_id")) != candidate {
            return refused();
        }
        let index = text(&value, "phone_index");
        Proof::limit(db, &format!("phone-minute:{index}"), 1, 60_000, now)?;
        Proof::limit(db, &format!("phone-hour:{index}"), 5, 3_600_000, now)?;
        Proof::limit(
            db,
            &format!("device:{}", text(&value, "key_id")),
            10,
            3_600_000,
            now,
        )?;
        sql(
            db,
            "UPDATE auth_link_attempts SET state = 'created', token_hash = ? WHERE attempt_id = ? AND state = 'sent'",
            &[&digest(&token), &id],
        )?;
        proof.audit(db, "sms_resend_requested", candidate, Some(id), now)?;
        Ok(Step::Send(Delivery {
            attempt: value.clone(),
            token: token.clone(),
        }))
    })
}

/// `phone-link-confirm`: the link opened on another device, with the requester's
/// pairing code (failed guesses are kept apart from the approval).
pub fn confirm(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let value = attempt(db, input.get("attemptId"), false, now)?;
    let id = text(&value, "attempt_id");
    let token = require_handle(input.get("token").unwrap_or(&JsonValue::Null))?;
    if digest(token) != text(&value, "token_hash") {
        return refused();
    }
    let failure = atomic(db, |db| {
        let bucket = format!("pairing:{id}");
        let previous = db
            .query_row(
                "SELECT count FROM auth_send_limits WHERE bucket = ?",
                [&bucket],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if previous.is_some_and(|count| count >= 5) {
            return Ok(Some("auth_pairing_locked"));
        }
        if input.get("pairingCode").and_then(JsonValue::as_str)
            == Some(pairing_code(proof, id).as_str())
        {
            return Ok(None);
        }
        Proof::limit(db, &bucket, 5, LINK_TTL_MS, now)?;
        proof.audit(db, "sms_pairing_failed", None, Some(id), now)?;
        Ok(Some("auth_pairing_invalid"))
    })?;
    if let Some(code) = failure {
        return Err(code.into());
    }
    atomic(db, |db| {
        let value = attempt(db, input.get("attemptId"), false, now)?;
        let state = text(&value, "state");
        if !["sent", "approved"].contains(&state) {
            return refused();
        }
        let token = require_handle(input.get("token").unwrap_or(&JsonValue::Null))?;
        if digest(token) != text(&value, "token_hash") {
            return refused();
        }
        let ready = Outcome::answer(json!({ "ok": true, "approved": true }))
            .effect("link-ready", json!({ "attemptId": id }));
        if state == "approved" {
            return Ok(ready);
        }
        let changed = sql(
            db,
            "UPDATE auth_link_attempts SET state = 'approved', approved_by = NULL WHERE attempt_id = ? AND state = 'sent'",
            &[&id],
        )?;
        if changed != 1 {
            return refused();
        }
        proof.audit(
            db,
            "sms_link_confirmed",
            value["candidate_id"].as_str(),
            Some(id),
            now,
        )?;
        Ok(ready)
    })
}

/// `phone-link-cancel`: the attempt ends, even a blocked one.
pub fn cancel(db: &Connection, input: &JsonValue, now: i64) -> Result<Outcome, String> {
    atomic(db, |db| {
        let value = attempt(db, input.get("attemptId"), true, now)?;
        let id = text(&value, "attempt_id");
        Proof::consume_proof(db, input, "cancel", id, &public_key(&value)?, now)?;
        sql(
            db,
            "UPDATE auth_link_attempts SET state = 'cancelled' WHERE attempt_id = ?",
            &[&id],
        )?;
        Ok(Outcome::answer(json!({ "ok": true })))
    })
}

pub(super) fn consume_attempt(db: &Connection, id: &str) -> Result<(), String> {
    let changed = sql(
        db,
        "UPDATE auth_link_attempts SET state = 'consumed' WHERE attempt_id = ? AND state IN ('sent', 'approved', 'verified_payment')",
        &[&id],
    )?;
    if changed != 1 {
        return refused();
    }
    Ok(())
}
