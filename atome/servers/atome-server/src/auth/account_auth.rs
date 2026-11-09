// The approve-class operations of an existing account (server/auth_accounts.js,
// ported in part): a device adds its approve key, an approval is challenged and
// consumed, and a device is revoked or reclassed by another device of the account.
// The session names the device, its approve key proves the user, the purpose and
// subject bind the proof to one effect.
use super::approvals;
use super::device_sessions::{self, number, public_key, same_generation, text};
use super::devices::{self, Enrollment};
use super::outcome::Outcome;
use super::proof::Proof;
use crate::vault_router::central::sql_value;
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

/// The subject each approve-class purpose binds (`APPROVE_SUBJECTS`).
pub fn subject_of(purpose: &str, subject: Option<&JsonValue>) -> Result<String, String> {
    let field = |name: &str| js::text(subject.and_then(|subject| subject.get(name)));
    let reference = match purpose {
        // `backup`: the digest of the backup keys carried along, or '-'.
        "pair-approve" => {
            let approve = subject
                .and_then(|subject| subject.get("requesterApproveKeyId"))
                .filter(|id| js::truthy(Some(id)))
                .map_or_else(|| "-".to_string(), |id| js::text(Some(id)));
            format!(
                "{}:{}:{approve}:{}:{}",
                field("pairId"),
                field("requesterSessionKeyId"),
                field("choice"),
                field("backup")
            )
        }
        "recovery-code-set" => format!(
            "{}:{}:{}",
            field("verifier"),
            field("lookup"),
            field("backup")
        ),
        "recovery-cancel" => field("recoveryId"),
        "device-revoke" => field("deviceId"),
        "device-class" => format!("{}:{}", field("deviceId"), field("deviceClass")),
        _ => return Err("auth_request_invalid".into()),
    };
    if reference.is_empty()
        || reference.encode_utf16().count() > 400
        || reference.contains("undefined")
    {
        return Err("auth_request_invalid".into());
    }
    Ok(reference)
}

fn head(input: &JsonValue) -> String {
    format!(
        "{}:{}",
        js::text(input.get("sessionId")),
        js::text(input.get("generation"))
    )
}

fn live_session(db: &Connection, input: &JsonValue, now: i64) -> Result<JsonValue, String> {
    let row = device_sessions::read(db, input.get("sessionId"), now)?;
    if !same_generation(&row, input) {
        return Err("auth_session_stale".into());
    }
    Ok(row)
}

/// `approve-key-add-challenge`.
pub fn approve_key_add_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let row = live_session(db, input, now)?;
    let key = text(&row, "key_id");
    let reference = head(input);
    let challenge = proof.challenge(db, "approve-key-add", &reference, key, None, now)?;
    let register = proof.challenge(
        db,
        "approve-key-register",
        &format!("add:{reference}"),
        key,
        None,
        now,
    )?;
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge, "register": register }),
    ))
}

/// `approve-key-add`: a device enrolled before approve keys existed (or whose approve
/// key was lost) adds one, signed by its session key. The other devices are told.
pub fn approve_key_add(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let row = live_session(db, input, now)?;
    let reference = head(input);
    Proof::consume_proof(
        db,
        input,
        "approve-key-add",
        &reference,
        &public_key(&row)?,
        now,
    )?;
    let session_key = devices::by_id(db, text(&row, "key_id"))?.ok_or("device_key_missing")?;
    if text(&session_key, "device_class") != "personal" {
        return Err("auth_approve_key_required".into());
    }
    let approve = approvals::register(
        db,
        input.get("approve").unwrap_or(&JsonValue::Null),
        "approve-key-register",
        &format!("add:{reference}"),
        text(&row, "key_id"),
        now,
    )?;
    let device = devices::device_of(&session_key);
    let principal = text(&row, "principal_id");
    let sql = |sql: &str, values: &[&dyn rusqlite::ToSql]| {
        db.execute(sql, values).map(drop).map_err(|e| e.to_string())
    };
    if text(&session_key, "device_id").is_empty() {
        sql(
            "UPDATE auth_device_keys SET device_id = ? WHERE key_id = ?",
            &[&device, &text(&session_key, "key_id")],
        )?;
    }
    // A hardware approve key outlives the app (the Secure Enclave keeps it through a reinstall):
    // the same key, already known for this account, comes back. It is enrolled again in place,
    // never inserted twice (the key id is unique); another account's key is refused.
    let known = devices::by_id(db, &approve.key_id)?;
    if let Some(key) = &known
        && (text(key, "principal_id") != principal || text(key, "key_role") != "approve")
    {
        return Err("auth_approve_key_required".into());
    }
    sql(
        "UPDATE auth_device_keys SET revoked_ms = ? WHERE principal_id = ? AND device_id = ?
         AND key_role = 'approve' AND revoked_ms IS NULL AND key_id != ?",
        &[&now, &principal, &device, &approve.key_id],
    )?;
    let restricted = number(&session_key, "restricted_until_ms") as i64;
    if known.is_some() {
        sql(
            "UPDATE auth_device_keys SET revoked_ms = NULL, public_key = ?, device_id = ?, assurance = ?,
             restricted_until_ms = ?, enrolled_by = 'approve_key_add', credential_id = ?, sign_count = ?,
             last_seen_ms = ? WHERE key_id = ?",
            &[
                &approve.jwk.to_string(),
                &device,
                &approve.assurance,
                &restricted,
                &approve.credential_id,
                &approve.sign_count,
                &now,
                &approve.key_id,
            ],
        )?;
    } else {
        devices::enroll(
            db,
            &Enrollment {
                role: "approve",
                device_id: Some(&device),
                assurance: &approve.assurance,
                device_class: text(&session_key, "device_class"),
                platform: Some(text(&session_key, "platform"))
                    .filter(|p| !p.is_empty())
                    .unwrap_or("web"),
                label: text(&session_key, "label"),
                enrolled_by: Some("approve_key_add"),
                restricted_until: Some(restricted),
                credential_id: approve.credential_id.as_deref(),
                sign_count: approve.sign_count,
                ..Enrollment::session(&approve.key_id, principal, &approve.jwk)
            },
            now,
        )?;
    }
    proof.audit(
        db,
        "approve_key_added",
        Some(principal),
        Some(&approve.key_id),
        now,
    )?;
    Ok(Outcome::answer(
        json!({ "ok": true, "canApprove": approve.assurance == devices::APPROVE_ASSURANCE }),
    )
    .notify(
        principal,
        json!({ "kind": "auth-device-updated", "deviceId": device }),
        json!({ "exceptDeviceId": device }),
    ))
}

/// `approval-challenge` (every purpose but a pairing's approval).
pub fn approval_challenge(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let purpose = input
        .get("purpose")
        .and_then(JsonValue::as_str)
        .unwrap_or("undefined");
    let reference = format!(
        "{}:{}",
        head(input),
        subject_of(purpose, input.get("subject"))?
    );
    let row = live_session(db, input, now)?;
    let session_key = devices::by_id(db, text(&row, "key_id"))?;
    let approve = devices::require_approver(db, session_key.as_ref(), purpose, now)?;
    let challenge = approvals::challenge(db, proof, &approve, purpose, &reference, now)?;
    let credential = approve
        .get("credential_id")
        .filter(|id| js::truthy(Some(id)))
        .cloned()
        .unwrap_or(JsonValue::Null);
    Ok(Outcome::answer(
        json!({ "ok": true, "challenge": challenge, "credentialId": credential }),
    ))
}

/// An authorized approve-class operation: its session row and the device it comes from.
pub struct Authorized {
    pub session: JsonValue,
    pub device_id: String,
}

/// `authorize`, inside the caller's transaction.
pub fn authorize(
    db: &Connection,
    input: &JsonValue,
    purpose: &str,
    subject: &JsonValue,
    now: i64,
) -> Result<Authorized, String> {
    let row = live_session(db, input, now)?;
    let session_key = devices::by_id(db, text(&row, "key_id"))?;
    let approve = devices::require_approver(db, session_key.as_ref(), purpose, now)?;
    let reference = format!("{}:{}", head(input), subject_of(purpose, Some(subject))?);
    approvals::consume(
        db,
        input.get("approval").unwrap_or(&JsonValue::Null),
        purpose,
        &reference,
        &approve,
        now,
    )?;
    let device_id = session_key
        .as_ref()
        .map(devices::device_of)
        .unwrap_or_default();
    Ok(Authorized {
        session: row,
        device_id,
    })
}

/// `device-revoke`: another device of the account, and its sessions.
pub fn revoke_device(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let target = input.get("deviceId").cloned().unwrap_or(JsonValue::Null);
    let authorized = authorize(
        db,
        input,
        "device-revoke",
        &json!({ "deviceId": target }),
        now,
    )?;
    if target.as_str() == Some(authorized.device_id.as_str()) {
        return Err("auth_request_invalid".into());
    }
    let principal = text(&authorized.session, "principal_id");
    let revoked = devices::revoke_device(db, principal, &target, now)?;
    proof.audit(db, "device_revoked", Some(principal), target.as_str(), now)?;
    Ok(Outcome::answer(json!({ "ok": true }))
        .disconnect(revoked)
        .notify(
            principal,
            json!({ "kind": "auth-device-revoked", "deviceId": target }),
            json!({}),
        ))
}

/// `device-class`: a device of the account becomes personal or shared.
pub fn set_device_class(
    db: &Connection,
    proof: &Proof,
    input: &JsonValue,
    now: i64,
) -> Result<Outcome, String> {
    let class = input
        .get("deviceClass")
        .and_then(JsonValue::as_str)
        .filter(|class| ["personal", "shared"].contains(class))
        .ok_or("auth_request_invalid")?;
    let target = input.get("deviceId").cloned().unwrap_or(JsonValue::Null);
    let authorized = authorize(
        db,
        input,
        "device-class",
        &json!({ "deviceId": target, "deviceClass": class }),
        now,
    )?;
    let principal = text(&authorized.session, "principal_id");
    let device = sql_value(&target);
    let platform = db
        .query_row(
            "SELECT platform FROM auth_device_keys WHERE principal_id = ? AND (device_id = ? OR key_id = ?)
             AND revoked_ms IS NULL LIMIT 1",
            params![principal, device, device],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("auth_request_invalid")?;
    devices::resolve_class(
        platform
            .as_deref()
            .filter(|p| !p.is_empty())
            .unwrap_or("web"),
        Some(&json!(class)),
    )?;
    db.execute(
        "UPDATE auth_device_keys SET device_class = ? WHERE principal_id = ? AND (device_id = ? OR key_id = ?) AND revoked_ms IS NULL",
        params![class, principal, device, device],
    )
    .map_err(|e| e.to_string())?;
    proof.audit(
        db,
        &format!("device_class:{class}"),
        Some(principal),
        target.as_str(),
        now,
    )?;
    Ok(Outcome::answer(json!({ "ok": true })).notify(
        principal,
        json!({ "kind": "auth-device-updated", "deviceId": target }),
        json!({}),
    ))
}
