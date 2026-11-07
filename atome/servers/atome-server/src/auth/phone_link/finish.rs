// The phone link opened (`complete`, `finishAttempt` and `pay` of server/auth_phone_link.js):
// the number proven, the attempt's device key opens its account or has its number changed; a new
// account waits for its payment, which makes it.
use super::{attempt, consume_attempt, pending, refused, sql};
use crate::auth::device_sessions::{self, public_key, text};
use crate::auth::outcome::Outcome;
use crate::auth::proof::{Proof, digest, require_handle};
use crate::auth::{Sessions, accounts, devices, now_ms, signup};
use crate::billing::Billing;
use crate::vault_router::central::{atomic, row_json};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

// A device enrolled by the SMS alone on an existing account waits a day.
const PROBATION_MS: i64 = 86_400_000;

/// `phone-link-consume` (the link's token) or `phone-link-resume` (`resume`: the
/// requester, once the link was opened elsewhere).
pub fn complete(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    input: &JsonValue,
    resume: bool,
    now: i64,
) -> Result<Outcome, String> {
    atomic(db, |db| {
        let value = attempt(db, input.get("attemptId"), false, now)?;
        let state = text(&value, "state");
        if !["sent", "approved", "verified_payment"].contains(&state) {
            return refused();
        }
        let purpose = if resume { "resume" } else { "consume" };
        Proof::consume_proof(
            db,
            input,
            purpose,
            text(&value, "attempt_id"),
            &public_key(&value)?,
            now,
        )?;
        if !resume {
            let token = require_handle(input.get("token").unwrap_or(&JsonValue::Null))?;
            if digest(token) != text(&value, "token_hash") {
                return refused();
            }
        } else if !["approved", "verified_payment"].contains(&state) {
            return Ok(Outcome::answer(pending(proof, &value, now)));
        }
        finish(db, proof, secret, &value, false, now)
    })
}

fn finish(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    value: &JsonValue,
    paid: bool,
    now: i64,
) -> Result<Outcome, String> {
    let id = text(value, "attempt_id");
    let key_id = text(value, "key_id");
    let phone = proof.open_phone(text(value, "phone_sealed"))?;
    let existing = accounts::find_by_phone(db, &phone)?;
    // A replaced binding or a concurrent account creation invalidates stale attempts.
    if existing.as_ref().map(|account| text(account, "user_id")) != value["candidate_id"].as_str() {
        return refused();
    }
    let changing = db
        .query_row(
            "SELECT * FROM auth_phone_changes WHERE attempt_id = ?",
            [id],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let account = match (&changing, &existing) {
        (Some(changing), _) => {
            let principal = text(changing, "principal_id");
            let initiating = device_sessions::read(db, changing.get("session_id"), now)?;
            if text(&initiating, "principal_id") != principal
                || text(&initiating, "key_id") != key_id
            {
                return refused();
            }
            if crate::vault_router::js::number(initiating.get("restricted_until_ms")) > now as f64 {
                return Err("auth_device_cooling_off".into());
            }
            if existing.is_some() {
                // Proven owner of a number another account holds: nothing moves; that
                // account opens through its trusted device or its recovery code.
                consume_attempt(db, id)?;
                proof.audit(db, "phone_change_taken", Some(principal), Some(id), now)?;
                return Ok(Outcome::answer(json!({ "ok": true, "phoneTaken": true })));
            }
            accounts::replace_phone(db, principal, &phone)?;
            let account = accounts::find_by_id(db, principal)?
                .filter(|account| account["phone"].as_str() == Some(phone.as_str()));
            let Some(account) = account else {
                return refused();
            };
            proof.audit(db, "phone_changed", Some(principal), Some(id), now)?;
            account
        }
        (None, Some(account)) => account.clone(),
        (None, None) => {
            // Told only once the SMS proved the number: before, the answer is the same
            // whether it is taken or not. The new account is made by its payment.
            if signup::closed() {
                return Err("auth_signup_closed".into());
            }
            if paid {
                let principal = uuid::Uuid::new_v4().to_string();
                let launch = json!({ "first_launch_version": 1 });
                let username = format!("user_{principal}");
                let mut account =
                    accounts::create(db, &principal, &username, Some(&phone), "private", &launch)?;
                account["first_launch_version"] = json!(1);
                return opened(db, proof, secret, value, &account, None, now);
            }
            sql(
                db,
                "UPDATE auth_link_attempts SET state = 'verified_payment' WHERE attempt_id = ?",
                &[&id],
            )?;
            let mut paying = value.clone();
            paying["state"] = json!("verified_payment");
            return Ok(Outcome::answer(pending(proof, &paying, now)));
        }
    };
    opened(
        db,
        proof,
        secret,
        value,
        &account,
        Some((existing.is_some(), changing.is_some())),
        now,
    )
}

// The attempt's device key opens `account`: an existing one (`held`: whether it was, and whether
// its number changed), or the one its payment just made.
fn opened(
    db: &Connection,
    proof: &Proof,
    secret: &str,
    value: &JsonValue,
    account: &JsonValue,
    held: Option<(bool, bool)>,
    now: i64,
) -> Result<Outcome, String> {
    let id = text(value, "attempt_id");
    let key_id = text(value, "key_id");
    let (existing, changing) = held.unwrap_or((false, false));
    let principal = text(account, "user_id");
    let device = devices::by_id(db, key_id)?;
    if let Some(device) = &device
        && (!device["revoked_ms"].is_null() || text(device, "principal_id") != principal)
    {
        return refused();
    }
    let jwk = public_key(value)?;
    if device.is_none() {
        let mut key = devices::Enrollment::session(key_id, principal, &jwk);
        key.enrolled_by = Some(if existing { "phone_link" } else { "creation" });
        key.restricted_until = Some(if existing { now + PROBATION_MS } else { now });
        devices::enroll(db, &key, now)?;
        proof.audit(db, "device_enrolled", Some(principal), Some(key_id), now)?;
    }
    consume_attempt(db, id)?;
    let mut answer = device_sessions::create(db, proof, secret, account, key_id, now)?;
    answer["newAccount"] = json!(!existing && !changing);
    if device.is_some() || !existing {
        return Ok(Outcome::answer(answer));
    }
    // A new device of an existing account: it opens at once, on probation, and every other
    // device of the account is told, as for the recovery code and the pairing.
    answer["probationUntil"] = json!(now + PROBATION_MS);
    Ok(Outcome::answer(answer).notify(
        principal,
        json!({ "kind": "auth-device-added", "deviceId": key_id, "label": "", "platform": "web" }),
        json!({ "exceptDeviceId": key_id }),
    ))
}

/// `phone-link-payment`: the payment of the account a verified number makes. A receipt,
/// simulated or verified by a store, never grants a session by itself: the SMS and device
/// proofs remain mandatory; a store purchase is bound to this attempt's device key, which
/// becomes the account's key. Verified before the transaction (network I/O), settled after.
pub async fn pay(
    sessions: Arc<Sessions>,
    billing: &Billing,
    input: JsonValue,
) -> Result<Outcome, String> {
    if signup::closed() {
        return Err("auth_signup_closed".into());
    }
    let asked = input.get("attemptId").cloned();
    let pending = sessions
        .central()
        .transaction(move |db| attempt(db, asked.as_ref(), false, now_ms() as i64))
        .await?;
    let key_id = text(&pending, "key_id").to_string();
    let payment = input.get("payment").unwrap_or(&JsonValue::Null);
    let creation = billing.prepare_creation(payment, &key_id).await?;
    let worker = sessions.clone();
    let (outcome, creation) = sessions
        .central()
        .transaction(move |db| {
            let proof = worker.proof().expect("proof keys");
            let secret = worker.secret().expect("session secret");
            let now = now_ms() as i64;
            let value = attempt(db, input.get("attemptId"), false, now)?;
            let reference = crate::vault_router::js::text(input.get("attemptId"));
            Proof::consume_proof(db, &input, "payment", &reference, &public_key(&value)?, now)?;
            if text(&value, "key_id") != key_id
                || text(&value, "state") != "verified_payment"
                || crate::vault_router::js::truthy(value.get("candidate_id"))
            {
                return refused();
            }
            if accounts::find_by_phone(db, &proof.open_phone(text(&value, "phone_sealed"))?)?
                .is_some()
            {
                return refused();
            }
            proof.audit(
                db,
                &format!("payment:{}", creation.method),
                None,
                Some(&reference),
                now,
            )?;
            let mut outcome = finish(db, proof, secret, &value, true, now)?;
            let created = outcome.result["newAccount"] == json!(true);
            let user = text(&outcome.result["user"], "id").to_string();
            outcome.result["payment"] = if created && !user.is_empty() {
                creation.record(db, &user, now)?
            } else {
                JsonValue::Null
            };
            Ok((outcome, creation))
        })
        .await?;
    if crate::vault_router::js::truthy(outcome.result.get("payment")) {
        billing.settle_creation(&creation).await?;
    }
    Ok(outcome)
}
