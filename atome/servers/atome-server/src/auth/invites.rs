// Invitations (server/auth_invites.js): an invitation lifts a closed sign-up for one account,
// 21 days, one use, sent by mail to one address. Only the token's digest is kept, and the
// address as a keyed index (a new invitation of the same inviter to the same address replaces
// the previous one). It is consumed with the account it creates (signup.rs).
use super::devices;
use super::outcome::Outcome;
use super::proof::{Proof, digest};
use super::{Sessions, now_ms};
use crate::mail::Mail;
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

const INVITE_TTL_MS: i64 = 21 * 86_400_000;
const LINK: &str = "{link}";

// `/^[A-Za-z0-9_-]{43}$/`: a malformed token is no invitation, the same answer as a spent one.
fn well_formed(token: Option<&JsonValue>) -> Option<&str> {
    token.and_then(JsonValue::as_str).filter(|token| {
        token.len() == 43
            && token
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    })
}

pub fn valid(db: &Connection, token: Option<&JsonValue>, now: i64) -> Result<bool, String> {
    let Some(token) = well_formed(token) else {
        return Ok(false);
    };
    db.prepare(
        "SELECT invite_id FROM auth_invites WHERE token_hash = ?
         AND consumed_ms IS NULL AND revoked_ms IS NULL AND expires_ms > ?",
    )
    .and_then(|mut statement| statement.exists(params![digest(token), now]))
    .map_err(|e| e.to_string())
}

/// Before anything else of a creation (its payment included): the invitation is still open.
pub fn check(db: &Connection, token: Option<&JsonValue>, now: i64) -> Result<(), String> {
    if valid(db, token, now)? {
        Ok(())
    } else {
        Err("auth_invite_invalid".into())
    }
}

/// Inside the creation's transaction: a second use, even concurrent, finds it consumed.
pub fn consume(
    db: &Connection,
    proof: &Proof,
    token: Option<&JsonValue>,
    principal: &str,
    now: i64,
) -> Result<(), String> {
    check(db, token, now)?;
    let token = well_formed(token).ok_or("auth_invite_invalid")?;
    let consumed = db
        .execute(
            "UPDATE auth_invites SET consumed_ms = ?, consumed_by = ? WHERE token_hash = ?
             AND consumed_ms IS NULL AND revoked_ms IS NULL AND expires_ms > ?",
            params![now, principal, digest(token), now],
        )
        .map_err(|e| e.to_string())?;
    if consumed != 1 {
        return Err("auth_invite_invalid".into());
    }
    let invite: String = db
        .query_row(
            "SELECT invite_id FROM auth_invites WHERE token_hash = ?",
            [digest(token)],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    proof.audit(db, "invite_consumed", Some(principal), Some(&invite), now)
}

// `String(value || '').trim()`.
fn trimmed(value: Option<&JsonValue>) -> String {
    if js::truthy(value) {
        js::trim(&js::text(value)).to_string()
    } else {
        String::new()
    }
}

// `isInviteEmail` (atome/src/shared/contact_invitation_contract.js): one address, no display name
// nor list, 254 UTF-16 units at most, a dot inside its domain.
fn invite_email(email: &str) -> bool {
    let allowed = |part: &str| {
        !part.is_empty()
            && part.chars().all(|c| {
                !crate::mail::mime::is_space(c)
                    && !matches!(
                        c,
                        '@' | '<' | '>' | '"' | '(' | ')' | ',' | ';' | ':' | '\\' | '[' | ']'
                    )
            })
    };
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    let dotted = domain
        .char_indices()
        .any(|(at, c)| c == '.' && at > 0 && at + 1 < domain.len());
    email.encode_utf16().count() <= 254 && allowed(local) && allowed(domain) && dotted
}

// One header line: no line break can reach the mail's headers.
fn header_text(value: Option<&JsonValue>, maximum: usize) -> Result<String, String> {
    let text = trimmed(value);
    if text.is_empty() || text.encode_utf16().count() > maximum || text.contains(['\r', '\n']) {
        return Err("auth_request_invalid".into());
    }
    Ok(text)
}

/// `invite-create`: any account invites, from a personal device past its probation. `clientRef`
/// (the invitation atome's id on the inviting device) makes a resend after a lost answer harmless:
/// it is mailed once. Mail is network I/O: sent after the commit; an invitation that never left is
/// withdrawn.
pub async fn create(
    sessions: Arc<Sessions>,
    mail: &Mail,
    claims: JsonValue,
    input: JsonValue,
) -> Result<Outcome, String> {
    let proof = sessions.proof().ok_or("auth_secret_required")?;
    let email = trimmed(input.get("email")).to_lowercase();
    if !invite_email(&email) {
        return Err("auth_invite_email_invalid".into());
    }
    let client_ref = if js::truthy(input.get("clientRef")) {
        js::text(input.get("clientRef"))
    } else {
        String::new()
    };
    if !(8..=64).contains(&client_ref.len())
        || !client_ref
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("auth_request_invalid".into());
    }
    let subject = header_text(input.get("subject"), 200)?;
    let from_name = header_text(input.get("fromName"), 64)?;
    let text = if js::truthy(input.get("text")) {
        js::text(input.get("text"))
    } else {
        String::new()
    };
    if text.encode_utf16().count() > 4000 || text.matches(LINK).count() != 1 {
        return Err("auth_request_invalid".into());
    }
    let token = proof.random_handle();
    let (worker, hash, address) = (sessions.clone(), digest(&token), email.clone());
    let (invite, expires, duplicate) = sessions
        .central()
        .transaction(move |db| {
            let proof = worker.proof().expect("proof keys");
            let now = now_ms() as i64;
            let principal = claims["sub"].as_str().unwrap_or_default();
            let key = devices::by_id(db, claims.pointer("/cnf/kid").and_then(JsonValue::as_str).unwrap_or_default())?;
            let Some(key) = key.filter(|key| {
                key.get("principal_id") == claims.get("sub") && key.get("revoked_ms") == Some(&JsonValue::Null)
            }) else {
                return Err("auth_session_invalid".into());
            };
            if key["device_class"] != json!("personal") || js::number(key.get("restricted_until_ms")) > now as f64 {
                return Err("auth_device_cooling_off".into());
            }
            let sent = db
                .query_row(
                    "SELECT invite_id, expires_ms FROM auth_invites WHERE inviter_principal = ? AND client_ref = ?",
                    params![principal, client_ref],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some((invite, expires)) = sent {
                return Ok((invite, expires, true));
            }
            // A flood guard for the domain's mail reputation, not a quota on invitations.
            Proof::limit(db, &format!("invite-hour:{principal}"), 34, 3_600_000, now)?;
            Proof::limit(db, &format!("invite-day:{principal}"), 144, 86_400_000, now)?;
            let index = proof.keyed_index(&format!("invite-email:{address}"));
            db.execute(
                "UPDATE auth_invites SET revoked_ms = ? WHERE inviter_principal = ? AND email_index = ?
                 AND consumed_ms IS NULL AND revoked_ms IS NULL",
                params![now, principal, index],
            )
            .map_err(|e| e.to_string())?;
            let invite = proof.random_handle();
            db.execute(
                "INSERT INTO auth_invites (invite_id, token_hash, inviter_principal, email_index, client_ref, created_ms, expires_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![invite, hash, principal, index, client_ref, now, now + INVITE_TTL_MS],
            )
            .map_err(|e| e.to_string())?;
            proof.audit(db, "invite_created", Some(principal), Some(&invite), now)?;
            Ok((invite, now + INVITE_TTL_MS, false))
        })
        .await?;
    let answer = Outcome::answer(json!({ "ok": true, "inviteId": invite, "expiresAt": expires }));
    if duplicate {
        return Ok(answer);
    }
    let link = format!("{}/#invite={token}", mail.origin());
    if let Err(error) = mail
        .send_system(&email, &from_name, &subject, &text.replacen(LINK, &link, 1))
        .await
    {
        sessions
            .central()
            .run(
                "DELETE FROM auth_invites WHERE invite_id = ?",
                vec![json!(invite)],
            )
            .await?;
        return Err(error);
    }
    Ok(answer)
}
