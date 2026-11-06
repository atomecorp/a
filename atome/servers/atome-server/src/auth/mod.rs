// A request's device session as Fastify checks it (server/auth_session_validation.js,
// server/http_request_identity.js): a token signed with the server's secret
// (`JWT_SECRET`, 32 characters at least), its claims those of a device session, its
// session and its key live in the central database. Read from the request's
// Bearer alone: Fastify registers no cookie parser, so its `access_token` cookie
// branch never reads one. The replication peers' shared token
// (`SQUIRREL_SYNC_TOKEN`) names a principal without a session.
pub mod account_actions;
pub mod account_auth;
pub mod accounts;
pub mod approvals;
pub mod connection;
pub mod device_sessions;
pub mod devices;
pub mod handles;
pub mod invites;
pub mod media_token;
pub mod outcome;
pub mod pairing;
pub mod password_crypto;
pub mod passwords;
pub mod phone_link;
pub mod proof;
pub mod recovery;
pub mod signup;
pub mod sms;
pub mod webauthn;

use proof::Proof;

use crate::vault_router::central::Central;
use crate::vault_router::js;
use axum::http::HeaderMap;
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

/// The issuer of every device session and media capability (atome/src/shared/auth_link_contract.js).
pub const AUTH_LINK_ORIGIN: &str = "https://atome.one";
const SESSION_AUDIENCE: &str = "atome-ws";

/// The refusals an `auth` request answers as they are (server/wsPhoneLinkAuth.js
/// `PUBLIC_ERRORS`, with the account and billing ones); any other is `auth_request_rejected`.
pub const PUBLIC_ERRORS: &[&str] = &[
    "auth_phone_e164_required",
    "auth_rate_limited",
    "sms_delivery_unavailable",
    "auth_attempt_expired",
    "auth_pairing_invalid",
    "auth_pairing_locked",
    "sms_configuration_required",
    "auth_session_invalid",
    "auth_session_stale",
    "auth_session_reused",
    "auth_device_cooling_off",
    "auth_password_rejected",
    "auth_password_too_short",
    "auth_password_compromised",
    "auth_password_screening_unavailable",
    "auth_argon2_unavailable",
    "auth_device_class_required",
    "auth_payment_method_invalid",
    "auth_approve_key_required",
    "auth_user_verification_required",
    "auth_webauthn_rejected",
    "auth_webauthn_invalid",
    "auth_webauthn_attestation_unsupported",
    "auth_webauthn_algorithm_unsupported",
    "auth_webauthn_counter_regressed",
    "auth_pair_unknown",
    "auth_pair_not_approved",
    "auth_recovery_unavailable",
    "auth_recovery_not_ready",
    "auth_handle_unavailable",
    "auth_connection_proof_required",
    "auth_signup_closed",
    "auth_invite_invalid",
    "auth_invite_email_invalid",
    "system_mail_unconfigured",
    "billing_proof_invalid",
    "billing_proof_untrusted",
    "billing_plan_required",
    "billing_purchase_owned_elsewhere",
    "billing_store_unconfigured",
    "billing_store_unavailable",
    "billing_store_unknown",
    "billing_period_invalid",
    "billing_product_unknown",
];

pub struct Sessions {
    // None when the configured secret is shorter than Fastify accepts: nothing verifies.
    secret: Option<String>,
    sync_token: Option<String>,
    central: Central,
    // The proof keys derived from the secret, None without one.
    proof: Option<Proof>,
}

pub(crate) fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |elapsed| elapsed.as_millis() as f64)
}

// node-jsonwebtoken's `verify`: no leeway, `nbf` checked, no claim required, the
// audience left to the caller.
pub(crate) fn validation(algorithms: &[Algorithm]) -> Validation {
    let mut validation = Validation::new(algorithms[0]);
    validation.algorithms = algorithms.to_vec();
    validation.leeway = 0;
    validation.validate_nbf = true;
    validation.validate_aud = false;
    validation.required_spec_claims = HashSet::new();
    validation
}

impl Sessions {
    pub fn new(secret: Option<String>, sync_token: Option<String>, central: Central) -> Self {
        let secret = secret
            .map(|secret| js::trim(&secret).to_string())
            .filter(|secret| secret.encode_utf16().count() >= 32);
        let proof = secret.as_deref().and_then(|secret| Proof::new(secret).ok());
        Self {
            secret,
            sync_token,
            central,
            proof,
        }
    }

    pub(crate) fn central(&self) -> &Central {
        &self.central
    }

    pub(crate) fn proof(&self) -> Option<&Proof> {
        self.proof.as_ref()
    }

    pub(crate) fn secret(&self) -> Option<&str> {
        self.secret.as_deref()
    }

    pub(crate) fn decode(&self, token: &str, validation: &Validation) -> Option<JsonValue> {
        let key = DecodingKey::from_secret(self.secret()?.as_bytes());
        jsonwebtoken::decode::<JsonValue>(token, &key, validation)
            .ok()
            .map(|data| data.claims)
    }

    /// The claims of a live device session, else an error (`auth_session_invalid`).
    pub async fn assert_device_session(&self, claims: JsonValue) -> Result<JsonValue, String> {
        let invalid = || "auth_session_invalid".to_string();
        let kid = claims.pointer("/cnf/kid").and_then(JsonValue::as_str);
        let valid = claims.get("auth_version").and_then(JsonValue::as_f64) == Some(1.0)
            && claims.get("iss").and_then(JsonValue::as_str) == Some(AUTH_LINK_ORIGIN)
            && claims.get("aud").and_then(JsonValue::as_str) == Some(SESSION_AUDIENCE)
            && claims.get("sid").is_some_and(JsonValue::is_string)
            && kid.is_some();
        if !valid {
            return Err(invalid());
        }
        let row = self
            .central
            .get(
                "SELECT s.principal_id, s.key_id, s.revoked_ms, s.idle_expires_ms, s.expires_ms,
                 k.revoked_ms AS key_revoked_ms FROM auth_device_sessions s
                 JOIN auth_device_keys k ON k.key_id = s.key_id WHERE s.session_id = ?",
                vec![claims["sid"].clone()],
            )
            .await?
            .ok_or_else(invalid)?;
        let now = now_ms();
        // `row.x <= now` as JavaScript compares it: null counts as 0.
        let elapsed = |key: &str| js::number(row.get(key)) <= now;
        let live = row
            .get("principal_id")
            .is_some_and(|id| Some(id) == claims.get("sub"))
            && row.get("key_id").and_then(JsonValue::as_str) == kid
            && row.get("revoked_ms") == Some(&JsonValue::Null)
            && row.get("key_revoked_ms") == Some(&JsonValue::Null)
            && !elapsed("idle_expires_ms")
            && !elapsed("expires_ms");
        if live { Ok(claims) } else { Err(invalid()) }
    }

    /// `readDeviceSessionToken`: an HS256 device-session token whose session lives.
    pub async fn read_device_session_token(
        &self,
        token: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let claims = self.verify(token.unwrap_or(&JsonValue::Null), &[Algorithm::HS256])?;
        self.assert_device_session(claims).await
    }

    /// The request's identity, as `validateToken` reads it; None when it has none valid.
    pub async fn validate_request(&self, headers: &HeaderMap) -> Option<JsonValue> {
        let header_text = |name: &str| headers.get(name).and_then(|value| value.to_str().ok());
        if let (Some(expected), Some(sent)) = (&self.sync_token, header_text("x-sync-token"))
            && sent == expected
        {
            let user = header_text("x-user-id")
                .or_else(|| header_text("x-userid"))
                .filter(|user| !user.is_empty())
                .unwrap_or("sync");
            return Some(
                json!({ "sub": user, "id": user, "userId": user, "username": "sync", "phone": null }),
            );
        }
        let token = header_text("authorization")?.strip_prefix("Bearer ")?;
        // The secret's algorithms, as `jwt.verify(token, secret)` accepts them.
        let claims = self.decode(
            token,
            &validation(&[Algorithm::HS256, Algorithm::HS384, Algorithm::HS512]),
        )?;
        self.assert_device_session(claims).await.ok()
    }
}
