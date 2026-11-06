// The `auth` requests of `/ws/api` answered here (server/wsPhoneLinkAuth.js and
// server/wsAccountAuth.js, ported action by action): a device session's challenge,
// renewal, local binding and endings; the proof of the session key on this
// connection; the account's devices and approve keys; the pairing of a new device,
// recovery, the sign-up's status and challenges, an invitation (its mail, auth/invites.rs);
// the account's own snapshot, lookups,
// particles, push installations and deletion; the phone link (phone_link_ops.rs) and the
// password login and change (password_ops.rs).
// The connection's identity is its own (identity.rs): an authenticated action reads its claims
// there, a session issued here is installed there, a key proven here is recorded there; an
// operation's effects are carried out before the reply, in Fastify's order (auth_effects.rs), the
// account's directory entry projected again (social/directory/). A session this connection itself
// ended closes it once its reply is sent. Any other `auth` action is refused as a protocol the
// client must upgrade to.
use super::Connection;
use crate::auth::device_sessions;
use crate::auth::outcome::Outcome;
use crate::auth::{
    PUBLIC_ERRORS, account_actions, account_auth, devices, handles, invites, now_ms, pairing,
    recovery, signup,
};
use crate::vault_router::central::atomic;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const ACTIONS: [&str; 46] = [
    "session-challenge",
    "session-renew",
    "session-local-bind",
    "session-logout",
    "session-logout-all",
    "session-revoke-device",
    "connection-challenge",
    "connection-proof",
    "devices-list",
    "device-rename",
    "device-revoke",
    "device-class",
    "approve-key-add-challenge",
    "approve-key-add",
    "approval-challenge",
    "pair-start-challenge",
    "pair-start",
    "pair-claim",
    "pair-pending",
    "pair-view",
    "pair-approve",
    "pair-requester-challenge",
    "pair-status",
    "pair-complete",
    "pair-cancel",
    "not-my-account",
    "shared-open-challenge",
    "shared-open-start",
    "recovery-code-set",
    "recovery-start-challenge",
    "recovery-start",
    "recovery-cancel",
    "recovery-requester-challenge",
    "recovery-status",
    "recovery-complete",
    "signup-status",
    "invite-create",
    "account-create-challenge",
    "account-create",
    "me",
    "get-user",
    "list-users",
    "update-user",
    "push-register",
    "push-prune",
    "session-delete-account",
];

/// Whether this `auth` message is answered here (Fastify reads `type` untrimmed).
pub(super) fn answered_here(message: &JsonValue) -> bool {
    message.get("type").and_then(JsonValue::as_str) == Some("auth")
        && message
            .get("action")
            .and_then(JsonValue::as_str)
            .is_some_and(|action| {
                ACTIONS.contains(&action)
                    || super::phone_link_ops::ACTIONS.contains(&action)
                    || super::password_ops::ACTIONS.contains(&action)
            })
}

/// An `auth` action no owner knows: `auth_protocol_upgrade_required`, before any session check.
pub(super) async fn upgrade_required(connection: Arc<Connection>, message: JsonValue) {
    let fields =
        json!({ "success": false, "ok": false, "error": "auth_protocol_upgrade_required" });
    connection.reply(envelope(&message, fields)).await;
}

// `{ type: 'auth-response', requestId, ... }`: `requestId || request_id`, left out when undefined.
fn envelope(message: &JsonValue, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("auth-response"));
    let request_id = message
        .get("requestId")
        .filter(|id| crate::vault_router::js::truthy(Some(id)))
        .or_else(|| message.get("request_id"));
    if let Some(id) = request_id {
        reply.insert("requestId".into(), id.clone());
    }
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

fn refused(message: &JsonValue, action: &str, code: &str) -> JsonValue {
    let public = PUBLIC_ERRORS.contains(&code);
    if !public {
        // The client only sees `auth_request_rejected`; the operator needs the exact refusal.
        eprintln!(
            "[auth] request rejected {}",
            json!({ "action": action, "code": code })
        );
    }
    envelope(
        message,
        json!({ "success": false, "ok": false,
            "error": if public { code } else { "auth_request_rejected" } }),
    )
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let action = message["action"].as_str().unwrap_or_default().to_string();
    let Outcome {
        result,
        effects,
        directory,
    } = match outcome(&connection, &message, &action).await {
        Ok(outcome) => outcome,
        Err(error) => {
            // A resume refused no longer waits on its attempt.
            if action == "phone-link-resume" {
                *connection.link_attempt.lock().expect("link attempt") = None;
            }
            return connection.reply(refused(&message, &action, &error)).await;
        }
    };
    // The effects, then the session's identity, then the reply, as Fastify orders them.
    let mut revoked_here = false;
    for (kind, fields) in effects {
        match connection.effect(kind, &fields).await {
            Ok(own) => revoked_here |= own,
            Err(error) => eprintln!("[auth] effect failed {kind} {error}"),
        }
    }
    // The operation is done whatever the projection's outcome: a failure is told, not answered.
    if let Some((principal, deleted)) = directory
        && let Err(error) = connection
            .ws_api
            .social
            .directory
            .refresh(&principal, deleted)
            .await
    {
        eprintln!("[auth] directory refresh failed {principal} {error}");
    }
    if let Some(token) = result.get("token").and_then(JsonValue::as_str)
        && let Err(error) = connection.install(token).await
    {
        return connection.reply(refused(&message, &action, &error)).await;
    }
    let success = result.get("ok") == Some(&JsonValue::Bool(true));
    let mut fields = JsonMap::new();
    fields.insert("success".into(), json!(success));
    if let JsonValue::Object(result) = result {
        fields.extend(result);
    }
    connection
        .reply(envelope(&message, JsonValue::Object(fields)))
        .await;
    // This connection's own session ended: it closes once its reply is on its way.
    if revoked_here {
        connection.close_revoked().await;
    }
}

async fn outcome(
    connection: &Connection,
    message: &JsonValue,
    action: &str,
) -> Result<Outcome, String> {
    if super::phone_link_ops::ACTIONS.contains(&action) {
        return super::phone_link_ops::outcome(connection, message, action).await;
    }
    if super::password_ops::ACTIONS.contains(&action) {
        return super::password_ops::outcome(connection, message, action).await;
    }
    if action == "account-create" {
        let ws_api = &connection.ws_api;
        let network = connection.network.clone();
        return signup::create(
            ws_api.sessions.clone(),
            &ws_api.billing,
            message.clone(),
            network,
        )
        .await;
    }
    let sessions = connection.ws_api.sessions.clone();
    let (Some(proof), Some(secret)) = (sessions.proof(), sessions.secret().map(str::to_string))
    else {
        return Err("auth_secret_required".into());
    };
    let unsigned_cancel =
        action == "pair-cancel" && !crate::vault_router::js::truthy(message.get("signature"));
    let claims = match action {
        "devices-list" | "device-rename" | "pair-claim" | "pair-pending" | "pair-view" | "me"
        | "get-user" | "list-users" | "update-user" | "push-register" | "push-prune"
        | "invite-create" => connection.claims_of(message).await?,
        "pair-cancel" if unsigned_cancel => connection.claims_of(message).await?,
        "connection-challenge" | "connection-proof" => {
            sessions
                .read_device_session_token(message.get("token"))
                .await?
        }
        _ => JsonValue::Null,
    };
    if action == "invite-create" {
        let mail = &connection.ws_api.providers.mail;
        return invites::create(sessions, mail, claims, message.clone()).await;
    }
    let nonce = {
        let mut nonce = connection
            .connection_nonce
            .lock()
            .expect("connection nonce");
        if action == "connection-challenge" && nonce.is_none() {
            *nonce = Some(proof.random_handle());
        }
        nonce.clone()
    };
    let network = connection.network.clone();
    let input = message.clone();
    let act = action.to_string();
    let worker = sessions.clone();
    let outcome = sessions
        .central()
        .committed(move |db| {
            let proof = worker.proof().expect("proof keys");
            let now = now_ms() as i64;
            let principal = claims["sub"].as_str().unwrap_or_default();
            let kid = claims.pointer("/cnf/kid").and_then(JsonValue::as_str).unwrap_or_default();
            // Kept as Fastify keeps what it writes outside its own transactions.
            match act.as_str() {
                "pair-start-challenge" => return pairing::start_challenge(db, proof, &input, &network, now),
                "pair-start" => return pairing::start(db, proof, &input, &network, now),
                "pair-claim" => return pairing::claim(db, proof, &input, &claims, now),
                "pair-pending" => return pairing::pending(db, &claims, now),
                "pair-view" => return pairing::view(db, &input, &claims, now),
                "pair-approve" => return pairing::approve(db, proof, &input, now),
                "pair-requester-challenge" => return pairing::requester_challenge(db, proof, &input, now),
                "pair-status" => return pairing::status(db, &input, now),
                "pair-complete" => return pairing::complete(db, proof, &secret, &input, now),
                "pair-cancel" => return pairing::cancel(db, &input, &claims, proof, now),
                "not-my-account" => return pairing::not_mine(db, proof, &input, now),
                "shared-open-challenge" => return pairing::shared_open_challenge(db, proof, &input, &network, now),
                "shared-open-start" => return pairing::shared_open_start(db, proof, &input, now),
                "recovery-code-set" => return recovery::set_code(db, proof, &input, now),
                "recovery-start-challenge" => return recovery::start_challenge(db, proof, &input, &network, now),
                "recovery-start" => return recovery::start(db, proof, &input, &network, now),
                "recovery-cancel" => return recovery::cancel(db, proof, &input, now),
                "recovery-requester-challenge" => return recovery::requester_challenge(db, proof, &input, now),
                "recovery-status" => return recovery::status(db, &input, now),
                "recovery-complete" => return recovery::complete(db, proof, &secret, &input, now),
                "signup-status" => return signup::status(db, proof, &input, &network, now),
                "account-create-challenge" => return signup::create_challenge(db, proof, &input, &network, now),
                "session-delete-account" => return account_actions::delete_account(db, proof, &input, now),
                "approval-challenge" if input.get("purpose").and_then(JsonValue::as_str) == Some("pair-approve") => {
                    return pairing::approve_challenge(db, proof, &input, now);
                }
                _ => {}
            }
            atomic(db, |db| match act.as_str() {
                "session-challenge" => device_sessions::challenge(db, proof, &input, &network, now),
                "session-renew" => device_sessions::renew(db, proof, &secret, &input, now),
                "session-local-bind" => device_sessions::local_bind(db, proof, &input, now),
                "connection-challenge" => {
                    let nonce = nonce.as_deref().unwrap_or_default();
                    let challenge = proof.challenge(db, "connection", nonce, kid, None, now)?;
                    Ok(Outcome::answer(json!({ "ok": true, "challenge": challenge })))
                }
                "connection-proof" => {
                    let key = devices::by_id(db, kid)?;
                    let (Some(nonce), Some(key)) = (nonce.as_deref(), key) else {
                        return Err("auth_session_invalid".into());
                    };
                    let public_key = serde_json::from_str(key["public_key"].as_str().unwrap_or_default())
                        .map_err(|e| e.to_string())?;
                    crate::auth::proof::Proof::consume_proof(db, &input, "connection", nonce, &public_key, now)?;
                    Ok(Outcome::answer(json!({ "ok": true })))
                }
                "devices-list" => {
                    let current = devices::by_id(db, kid)?.ok_or("device_key_missing")?;
                    let current = devices::device_of(&current);
                    let listed: Vec<JsonValue> = devices::list(db, principal)?
                        .into_iter()
                        .map(|mut device| {
                            device["current"] = json!(device["deviceId"].as_str() == Some(current.as_str()));
                            device
                        })
                        .collect();
                    let handle = handles::assign(db, principal, None, now)?;
                    let recovery = db
                        .prepare("SELECT 1 FROM auth_recovery_codes WHERE principal_id = ?")
                        .and_then(|mut statement| statement.exists([principal]))
                        .map_err(|e| e.to_string())?;
                    Ok(Outcome::answer(json!({ "ok": true, "devices": listed, "handle": handle,
                        "recoveryCode": recovery })))
                }
                "device-rename" => {
                    let label = devices::normalize_meta(Some(&json!({ "label": input.get("label") })), false);
                    let device = crate::vault_router::central::sql_value(&input["deviceId"]);
                    let changed = db
                        .execute(
                            "UPDATE auth_device_keys SET label = ? WHERE principal_id = ? AND (device_id = ? OR key_id = ?) AND revoked_ms IS NULL",
                            rusqlite::params![label["label"].as_str().unwrap_or_default(), principal, device, device],
                        )
                        .map_err(|e| e.to_string())?;
                    if changed == 0 {
                        return Err("auth_request_invalid".into());
                    }
                    Ok(Outcome::answer(json!({ "ok": true })))
                }
                "me" => account_actions::me(db, &claims),
                "get-user" => account_actions::get_user(db, &input, &claims),
                "list-users" => account_actions::list_users(db, &claims),
                "update-user" => account_actions::update_user(db, &input, &claims),
                "push-register" => account_actions::push_register(db, &input, &claims, now),
                "push-prune" => account_actions::push_prune(db, &input, &claims),
                "device-revoke" => account_auth::revoke_device(db, proof, &input, now),
                "device-class" => account_auth::set_device_class(db, proof, &input, now),
                "approve-key-add-challenge" => account_auth::approve_key_add_challenge(db, proof, &input, now),
                "approve-key-add" => account_auth::approve_key_add(db, proof, &input, now),
                "approval-challenge" => account_auth::approval_challenge(db, proof, &input, now),
                _ => device_sessions::revoke(
                    db,
                    proof,
                    &input,
                    act.strip_prefix("session-").unwrap_or(&act),
                    now,
                ),
            })
        })
        .await??;
    if action == "connection-proof" {
        connection.proven(message.get("token")).await?;
    }
    Ok(outcome)
}
