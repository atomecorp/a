// Who a WebSocket connection is (`/ws/api`, `/ws/sync`), as Fastify held it on its connection object
// (server/auth_session_validation.js `validateConnectionDeviceSession`, server/wsApiIdentity.js
// `resolveWsApiPrincipal`, `resolveWsApiProgramSeat`, `isWsApiPrincipalProvisioned`): the device
// session a token installed (`_wsApiDeviceClaims`, `_wsApiSessionId`), the key this connection proved
// (`_wsApiProvenKeyId`), the account it acts as (`_wsApiUserId`) and that account's expiry
// (`_wsApiAuthExpMs`). Every connection requires the proof of a key-bound token (`cnf.pop`): a copied
// bearer alone opens nothing. Joining and leaving the live set of an account is the `/ws/api`
// connection's own (ws_api/identity.rs).
use super::{Sessions, now_ms, validation};
use crate::vault_router::js;
use jsonwebtoken::Algorithm;
use jsonwebtoken::errors::ErrorKind;
use serde_json::{Value as JsonValue, json};
use std::sync::Mutex;

/// What one connection holds of its identity.
#[derive(Default)]
pub struct Held {
    pub claims: Option<JsonValue>,
    pub session_id: Option<String>,
    pub proven_key: Option<String>,
    pub user: Option<String>,
    pub expiry: Expiry,
}

/// `_wsApiAuthExpMs`: never set, set to `null`, or a time (ms). JavaScript reads `null` as 0 where it
/// takes `Number()` of it, so a cleared expiry counts as passed there.
#[derive(Clone, Copy, Default, PartialEq)]
pub enum Expiry {
    #[default]
    Unset,
    Cleared,
    At(f64),
}

impl Expiry {
    /// `typeof exp === 'number' ? exp * 1000 : null` of a token's claims.
    pub fn of(claims: &JsonValue) -> Self {
        claims
            .get("exp")
            .and_then(JsonValue::as_f64)
            .map_or(Self::Cleared, |exp| Self::At(exp * 1000.0))
    }

    /// The value as JSON (`?? null`).
    pub fn json(self) -> JsonValue {
        match self {
            Self::At(ms) => js::number_json(ms),
            _ => JsonValue::Null,
        }
    }

    /// `Number(exp)`: NaN when never set, 0 once cleared.
    pub fn number(self) -> f64 {
        match self {
            Self::Unset => f64::NAN,
            Self::Cleared => 0.0,
            Self::At(ms) => ms,
        }
    }
}

/// One connection's identity, shared by its tasks.
#[derive(Default)]
pub struct Identity(Mutex<Held>);

impl Identity {
    pub fn held(&self) -> std::sync::MutexGuard<'_, Held> {
        self.0.lock().expect("connection identity")
    }
}

/// The algorithms `jwt.verify(token, secret)` accepts with a string secret.
pub const SECRET_ALGORITHMS: [Algorithm; 3] =
    [Algorithm::HS256, Algorithm::HS384, Algorithm::HS512];

// node-jsonwebtoken's messages, which a refusal carries to the client (`errorResponse(type, message, error)`).
fn node_message(kind: &ErrorKind) -> &'static str {
    match kind {
        ErrorKind::InvalidSignature => "invalid signature",
        ErrorKind::ExpiredSignature => "jwt expired",
        ErrorKind::ImmatureSignature => "jwt not active",
        ErrorKind::InvalidAlgorithm | ErrorKind::InvalidAlgorithmName => "invalid algorithm",
        ErrorKind::InvalidToken => "jwt malformed",
        _ => "invalid token",
    }
}

// `sub || id || userId || user_id` of a token's claims (`decodedUserId`).
fn decoded_user(claims: &JsonValue) -> Option<String> {
    js::first(claims, &["sub", "id", "userId", "user_id"]).map(js::string)
}

impl Sessions {
    /// `jwt.verify(token, secret, { algorithms })`, with node-jsonwebtoken's refusals.
    pub fn verify(&self, token: &JsonValue, algorithms: &[Algorithm]) -> Result<JsonValue, String> {
        let token = match token {
            JsonValue::String(text) if text.is_empty() => return Err("jwt must be provided".into()),
            JsonValue::String(text) => text,
            JsonValue::Null => return Err("jwt must be provided".into()),
            _ => return Err("jwt must be a string".into()),
        };
        let secret = self
            .secret()
            .ok_or("JWT_SECRET must be configured with at least 32 characters")?;
        let key = jsonwebtoken::DecodingKey::from_secret(secret.as_bytes());
        jsonwebtoken::decode::<JsonValue>(token, &key, &validation(algorithms))
            .map(|data| data.claims)
            .map_err(|error| node_message(error.kind()).to_string())
    }

    /// `validateConnectionDeviceSession(connection, token)`: a token installs its device session on
    /// the connection (its claims returned); without one, the session already installed must still
    /// live. A key-bound token needs this connection's proof of that key.
    pub async fn validate_connection(
        &self,
        identity: &Identity,
        token: Option<&JsonValue>,
    ) -> Result<Option<JsonValue>, String> {
        let proven = |claims: &JsonValue, identity: &Identity| {
            let kid = claims.pointer("/cnf/kid").and_then(JsonValue::as_str);
            let bound = claims.pointer("/cnf/pop") == Some(&JsonValue::Bool(true));
            if bound && identity.held().proven_key.as_deref() != kid {
                return Err("auth_connection_proof_required".to_string());
            }
            Ok(())
        };
        if js::truthy(token) {
            let claims = self.read_device_session_token(token).await?;
            proven(&claims, identity)?;
            let mut held = identity.held();
            held.session_id = js::truthy(claims.get("sid")).then(|| js::string(&claims["sid"]));
            held.claims = held.session_id.is_some().then(|| claims.clone());
            return Ok(Some(claims));
        }
        let Some(claims) = identity.held().claims.clone() else {
            return Ok(None);
        };
        if js::number(claims.get("exp")) * 1000.0 <= now_ms() {
            return Err("auth_session_invalid".into());
        }
        let claims = self.assert_device_session(claims).await?;
        proven(&claims, identity)?;
        Ok(None)
    }

    /// `resolveWsApiPrincipal(connection, message)`: the account the message's token names (then
    /// the connection's, with that token's expiry), else the connection's while it has not expired.
    /// `Resolved::Joined` and `Resolved::Expired` tell the caller to join or leave that account's set.
    pub fn resolve_principal(
        &self,
        identity: &Identity,
        message: &JsonValue,
    ) -> Result<Resolved, String> {
        let token = message
            .get("token")
            .and_then(JsonValue::as_str)
            .map(js::trim)
            .unwrap_or_default();
        if !token.is_empty() {
            let claims = self.verify(&json!(token), &SECRET_ALGORITHMS)?;
            let Some(user) = decoded_user(&claims) else {
                return Ok(Resolved::Nobody);
            };
            return Ok(Resolved::Joined {
                user,
                expiry: Expiry::of(&claims),
            });
        }
        let held = identity.held();
        let expiry = held.expiry.number();
        match &held.user {
            Some(user) if !expiry.is_finite() || expiry > now_ms() => {
                Ok(Resolved::Attached(user.clone()))
            }
            Some(user) => Ok(Resolved::Expired(user.clone())),
            None => Ok(Resolved::Nobody),
        }
    }

    /// `resolveWsApiProgramSeat`: the `prg` claim of the message's token, else of the session installed.
    pub fn program_seat(
        &self,
        identity: &Identity,
        message: &JsonValue,
    ) -> Result<Option<String>, String> {
        let token = message
            .get("token")
            .and_then(JsonValue::as_str)
            .map(js::trim)
            .unwrap_or_default();
        let claims = if token.is_empty() {
            identity.held().claims.clone()
        } else {
            Some(self.verify(&json!(token), &SECRET_ALGORITHMS)?)
        };
        Ok(claims
            .as_ref()
            .and_then(|claims| claims.get("prg"))
            .and_then(JsonValue::as_str)
            .filter(|program| !program.is_empty())
            .map(String::from))
    }

    /// `isWsApiPrincipalProvisioned`: an account is a live `user` atome of the central database.
    pub async fn provisioned(&self, principal: &str) -> Result<bool, String> {
        if principal.is_empty() {
            return Ok(false);
        }
        let row = self
            .central()
            .get(
                "SELECT atome_type FROM atomes WHERE atome_id = ? AND deleted_at IS NULL",
                vec![json!(principal)],
            )
            .await?;
        Ok(row.is_some_and(|row| row["atome_type"] == "user"))
    }
}

/// What `resolve_principal` found.
pub enum Resolved {
    /// The message's token names `user`, with that token's expiry: the connection is theirs now.
    Joined {
        user: String,
        expiry: Expiry,
    },
    /// The account the connection is attached to, still valid.
    Attached(String),
    /// The connection's account expired: it leaves it.
    Expired(String),
    Nobody,
}
