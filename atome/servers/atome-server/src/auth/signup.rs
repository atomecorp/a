// Sign-up (server/auth_accounts.js `signupStatus`, `createChallenge`, `create`): whether
// « Créer un compte » may go on, the challenges a new account's keys sign, and the account
// itself, made with its payment. A closed sign-up (`ATOME_SIGNUP_CLOSED=1`) opens to an
// invitation still valid.
use super::devices::Enrollment;
use super::outcome::Outcome;
use super::proof::{Proof, public_device_key, require_handle};
use super::{Sessions, accounts, approvals, device_sessions, devices, invites, now_ms};
use crate::billing::Billing;
use crate::vault_router::central::atomic;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

pub(crate) fn closed() -> bool {
    std::env::var("ATOME_SIGNUP_CLOSED").is_ok_and(|value| value == "1")
}

fn invite(input: &JsonValue) -> Option<&JsonValue> {
    input
        .get("invite")
        .filter(|invite| crate::vault_router::js::truthy(Some(invite)))
}

// A closed sign-up opens to an invitation still valid.
fn open_or_invited(db: &Connection, input: &JsonValue, now: i64) -> Result<(), String> {
    if closed() {
        invites::check(db, Some(invite(input).ok_or("auth_signup_closed")?), now)?;
    }
    Ok(())
}

/// `signup-status`: open, or this invitation still valid.
pub fn status(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    Proof::limit(
        db,
        &format!("signup-status:{}", proof.keyed_index(network)),
        60,
        60_000,
        now,
    )?;
    if !closed() {
        return Ok(Outcome::answer(
            json!({ "ok": true, "open": true, "invited": false }),
        ));
    }
    let invited = match invite(input) {
        Some(token) => invites::valid(db, Some(token), now)?,
        None => false,
    };
    Ok(Outcome::answer(
        json!({ "ok": true, "open": false, "invited": invited,
        "inviteInvalid": invite(input).is_some() && !invited }),
    ))
}

/// `account-create-challenge`: the challenges of the new account's session and approve keys.
pub fn create_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    network: &str,
    now: i64,
) -> Result<Outcome, String> {
    open_or_invited(db, input, now)?;
    let client_nonce = input.get("clientNonce").unwrap_or(&JsonValue::Null);
    require_handle(client_nonce)?;
    let key = public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?;
    atomic(db, |db| {
        Proof::limit(
            db,
            &format!("create-challenge:{}", proof.keyed_index(network)),
            30,
            3_600_000,
            now,
        )?;
        if devices::by_id(db, &key.key_id)?.is_some() {
            return Err("auth_request_invalid".into());
        }
        let challenge = proof.challenge(
            db,
            "create-account",
            &format!("create:{}", key.key_id),
            &key.key_id,
            Some(client_nonce),
            now,
        )?;
        let register = proof.challenge(
            db,
            "approve-key-register",
            &format!("register:{}", key.key_id),
            &key.key_id,
            None,
            now,
        )?;
        Ok(Outcome::answer(
            json!({ "ok": true, "challenge": challenge, "register": register }),
        ))
    })
}

/// `account-create`: an account without phone, email or password, its device's session key
/// (and approve key, on a personal device) and its first session, made with its payment. A
/// closed sign-up takes no payment; a store's proof is verified before the transaction
/// (network I/O) and settled after it.
pub async fn create(
    sessions: Arc<Sessions>,
    billing: &Billing,
    input: JsonValue,
    network: String,
) -> Result<Outcome, String> {
    if sessions.proof().is_none() || sessions.secret().is_none() {
        return Err("auth_secret_required".into());
    }
    let checked = input.clone();
    sessions
        .central()
        .transaction(move |db| open_or_invited(db, &checked, now_ms() as i64))
        .await?;
    let key = public_device_key(input.get("sessionKey").unwrap_or(&JsonValue::Null))?;
    let meta = devices::normalize_meta(input.get("deviceMeta"), false);
    let platform = meta["platform"].as_str().unwrap_or("web").to_string();
    let class = devices::resolve_class(&platform, input.get("deviceClass"))?;
    let payment = input.get("payment").unwrap_or(&JsonValue::Null);
    let creation = billing.prepare_creation(payment, &key.key_id).await?;
    let worker = sessions.clone();
    let (result, creation) = sessions
        .central()
        .transaction(move |db| {
            let proof = worker.proof().expect("proof keys");
            let secret = worker.secret().expect("session secret");
            let now = now_ms() as i64;
            let index = proof.keyed_index(&network);
            let key_id = key.key_id.as_str();
            Proof::limit(db, &format!("account-create:{index}"), 5, 3_600_000, now)?;
            // A day's bound too: accounts created in series would each get their own contact-request quotas.
            Proof::limit(
                db,
                &format!("account-create-day:{index}"),
                10,
                86_400_000,
                now,
            )?;
            Proof::limit(
                db,
                &format!("account-create-key:{key_id}"),
                3,
                3_600_000,
                now,
            )?;
            if devices::by_id(db, key_id)?.is_some() {
                return Err("auth_request_invalid".into());
            }
            let reference = format!("create:{key_id}");
            Proof::consume_proof(db, &input, "create-account", &reference, &key.jwk, now)?;
            // A shared machine never approves: it creates no approve key.
            let approve = match input.get("approve") {
                Some(approve)
                    if crate::vault_router::js::truthy(Some(approve)) && class == "personal" =>
                {
                    let reference = format!("register:{key_id}");
                    Some(approvals::register(
                        db,
                        approve,
                        "approve-key-register",
                        &reference,
                        key_id,
                        now,
                    )?)
                }
                _ => None,
            };
            let principal = uuid::Uuid::new_v4().to_string();
            let launch = json!({ "first_launch_version": 1 });
            let mut account = accounts::create(
                db,
                &principal,
                &format!("user_{principal}"),
                None,
                "private",
                &launch,
            )?;
            account["first_launch_version"] = json!(1);
            // Consumed with the account: a failed creation leaves the invitation open, a second use finds it spent.
            if closed() {
                invites::consume(db, proof, invite(&input), &principal, now)?;
            }
            let device = devices::new_device_id(proof);
            let label = meta["label"].as_str().unwrap_or_default();
            let session_key = Enrollment {
                device_id: Some(&device),
                device_class: &class,
                platform: &platform,
                label,
                enrolled_by: Some("creation"),
                connection_proof: input.get("connectionProof") == Some(&json!(true)),
                ..Enrollment::session(key_id, &principal, &key.jwk)
            };
            devices::enroll(db, &session_key, now)?;
            if let Some(approve) = &approve {
                let approve_key = Enrollment {
                    key_id: &approve.key_id,
                    jwk: &approve.jwk,
                    role: "approve",
                    assurance: &approve.assurance,
                    credential_id: approve.credential_id.as_deref(),
                    sign_count: approve.sign_count,
                    connection_proof: false,
                    ..session_key
                };
                devices::enroll(db, &approve_key, now)?;
            }
            proof.audit(db, "account_created", Some(&principal), Some(key_id), now)?;
            proof.audit(
                db,
                &format!("payment:{}", creation.method),
                Some(&principal),
                Some(key_id),
                now,
            )?;
            let payment = creation.record(db, &principal, now)?;
            let mut session = device_sessions::create(db, proof, secret, &account, key_id, now)?;
            session["newAccount"] = json!(true);
            session["canApprove"] =
                json!(approve.is_some_and(|approve| approve.assurance == "hardware_uv"));
            session["payment"] = payment;
            Ok((session, creation))
        })
        .await?;
    if crate::vault_router::js::truthy(result.get("payment")) {
        billing.settle_creation(&creation).await?;
    }
    Ok(Outcome::answer(result))
}
