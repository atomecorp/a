// Approve keys (server/auth_approvals.js, ported): their registration (a WebAuthn
// credential, or a native user-verified key) and the approval proofs over the
// shared purpose-bound challenges. A new approve key proves possession over a
// challenge issued to the session key of the same device: the two keys are bound.
use super::devices::require_assurance;
use super::proof::{Proof, public_device_key};
use super::webauthn::{self, Config};
use crate::vault_router::js;
use rusqlite::{Connection, params};
use serde_json::{Value as JsonValue, json};

/// A registered approve key.
pub struct ApproveKey {
    pub key_id: String,
    pub jwk: JsonValue,
    pub credential_id: Option<String>,
    pub sign_count: i64,
    pub assurance: String,
}

pub fn register(
    db: &Connection,
    input: &JsonValue,
    purpose: &str,
    reference: &str,
    session_key_id: &str,
    now: i64,
) -> Result<ApproveKey, String> {
    let challenge = input.get("challengeId").unwrap_or(&JsonValue::Null);
    match input.get("kind").and_then(JsonValue::as_str) {
        Some("webauthn") => {
            let config = Config::from_env()?;
            let credential = Proof::consume_challenge(
                db,
                challenge,
                purpose,
                reference,
                session_key_id,
                now,
                |message| webauthn::verify_registration(input, message, &config),
            )?;
            let exists = db
                .prepare("SELECT key_id FROM auth_device_keys WHERE credential_id = ?")
                .and_then(|mut statement| statement.exists([&credential.credential_id]))
                .map_err(|e| e.to_string())?;
            if exists {
                return Err("auth_request_invalid".into());
            }
            Ok(ApproveKey {
                key_id: credential.key_id,
                jwk: credential.jwk,
                credential_id: Some(credential.credential_id),
                sign_count: i64::from(credential.sign_count),
                assurance: "hardware_uv".into(),
            })
        }
        Some("native") => {
            // Native keys carry no attestation in V1: the platform declares its assurance.
            let key = public_device_key(input.get("publicKey").unwrap_or(&JsonValue::Null))?;
            let assurance = require_assurance(input.get("assurance"))?.to_string();
            let signature = input
                .get("signature")
                .filter(|signature| js::truthy(Some(signature)))
                .map(|signature| js::text(Some(signature)))
                .unwrap_or_default();
            let proof = json!({ "challengeId": challenge, "signature": signature });
            Proof::consume_signed(db, &proof, purpose, reference, session_key_id, &key, now)?;
            Ok(ApproveKey {
                key_id: key.key_id,
                jwk: key.jwk,
                credential_id: None,
                sign_count: 0,
                assurance,
            })
        }
        _ => Err("auth_request_invalid".into()),
    }
}

pub fn challenge(
    db: &Connection,
    proof: &Proof,
    approve_key: &JsonValue,
    purpose: &str,
    reference: &str,
    now: i64,
) -> Result<JsonValue, String> {
    proof.challenge(
        db,
        purpose,
        reference,
        approve_key["key_id"].as_str().unwrap_or_default(),
        None,
        now,
    )
}

/// The approval proof `input` of `approve_key` over its purpose and reference.
pub fn consume(
    db: &Connection,
    input: &JsonValue,
    purpose: &str,
    reference: &str,
    approve_key: &JsonValue,
    now: i64,
) -> Result<(), String> {
    let key_id = approve_key["key_id"].as_str().unwrap_or_default();
    if js::truthy(approve_key.get("credential_id")) {
        let config = Config::from_env()?;
        let challenge = input.get("challengeId").unwrap_or(&JsonValue::Null);
        let count =
            Proof::consume_challenge(db, challenge, purpose, reference, key_id, now, |message| {
                webauthn::verify_assertion(input, message, approve_key, &config)
            })?;
        db.execute(
            "UPDATE auth_device_keys SET sign_count = ?, last_seen_ms = ? WHERE key_id = ?",
            params![count, now, key_id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let public_key: JsonValue =
        serde_json::from_str(approve_key["public_key"].as_str().unwrap_or_default())
            .map_err(|e| e.to_string())?;
    let input = if input.is_object() {
        input.clone()
    } else {
        json!({})
    };
    Proof::consume_proof(db, &input, purpose, reference, &public_key, now)?;
    super::devices::touch(db, key_id, now)
}
