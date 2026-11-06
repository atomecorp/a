// Who a `/ws/api` connection is, as Fastify's connection held it (server/wsApiState.js attach and
// detach, server/wsApiIdentity.js, server/ws_api_front.js `principalOf`/`connectionOf`,
// server/wsFileOperations.js `fileRequester`, server/wsAccountAuth.js `claimsOf`, server/wsPhoneLinkAuth.js
// `installSessionIdentity`): the device session and account (auth/connection.rs), the account's live
// set it joins and leaves (social/live.rs) with its seat (seats.rs), the pairing request and phone link
// attempt it waits on. The answers keep the shape the families read (`session_error`, `reply`,
// `principal`, `provisioned`…).
use super::{Connection, seats};
use crate::auth::AUTH_LINK_ORIGIN;
use crate::auth::connection::{Expiry, Resolved, SECRET_ALGORITHMS};
use crate::social::live;
use crate::vault_router::js;
use jsonwebtoken::Algorithm;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

// `{ type: `${type || 'error'}-response`, requestId: requestId || request_id, … 'auth_session_invalid' }`.
fn session_error(message: &JsonValue) -> JsonValue {
    let kind = message.get("type").filter(|kind| js::truthy(Some(kind)));
    let mut reply = JsonMap::new();
    let kind = kind.map_or_else(|| "error".to_string(), js::string);
    reply.insert("type".into(), json!(format!("{kind}-response")));
    if let Some(id) = js::first(message, &["requestId"]).or_else(|| message.get("request_id")) {
        reply.insert("requestId".into(), id.clone());
    }
    reply.insert("success".into(), json!(false));
    reply.insert("ok".into(), json!(false));
    reply.insert("error".into(), json!("auth_session_invalid"));
    JsonValue::Object(reply)
}

impl Connection {
    /// `attachWsApiClientToUser`: the connection joins `user`'s live set, leaving another account's.
    pub(crate) async fn attach(&self, user: &str) {
        if user.is_empty() {
            return;
        }
        let other = self.identity.held().user.clone();
        if other.is_some_and(|other| other != user) {
            self.detach();
        }
        self.identity.held().user = Some(user.to_string());
        live::attach(self.live, user).await;
    }

    /// `detachWsApiClient`: the device session forgotten, then the account and its seat left.
    pub(crate) fn detach(&self) {
        let left = {
            let mut held = self.identity.held();
            held.session_id = None;
            held.claims = None;
            let left = held.user.take().is_some();
            if left {
                held.expiry = Expiry::Cleared;
            }
            left
        };
        if left {
            live::detach(self.live);
            seats::detach(self);
        }
    }

    /// `validateConnectionDeviceSession(connection, message.token)`.
    async fn validate(&self, message: &JsonValue) -> Result<Option<JsonValue>, String> {
        let sessions = &self.ws_api.sessions;
        sessions
            .validate_connection(&self.identity, message.get("token"))
            .await
    }

    /// The device session first: its failure leaves the account and is answered as is.
    pub(super) async fn session_holds(&self, message: &JsonValue) -> Result<(), JsonValue> {
        match self.validate(message).await {
            Ok(_) => Ok(()),
            Err(_) => {
                self.detach();
                Err(session_error(message))
            }
        }
    }

    /// `resolveWsApiPrincipal(connection, message)`.
    pub(crate) async fn resolve_principal(
        &self,
        message: &JsonValue,
    ) -> Result<Option<String>, String> {
        match self
            .ws_api
            .sessions
            .resolve_principal(&self.identity, message)?
        {
            Resolved::Joined { user, expiry } => {
                self.attach(&user).await;
                self.identity.held().expiry = expiry;
                Ok(Some(user))
            }
            Resolved::Attached(user) => Ok(Some(user)),
            Resolved::Expired(_) => {
                self.detach();
                Ok(None)
            }
            Resolved::Nobody => Ok(None),
        }
    }

    /// `isWsApiPrincipalProvisioned`.
    pub(crate) async fn provisioned(&self, principal: &str) -> Result<bool, String> {
        self.ws_api.sessions.provisioned(principal).await
    }

    /// The account the connection is attached to (`_wsApiUserId`).
    pub(crate) fn attached(&self) -> Option<String> {
        self.identity.held().user.clone()
    }

    /// `principalOf`: the device session, then `requirePrincipal` — `{ session_error }`,
    /// `{ reply }` (refused) or `{ principal }`.
    pub(crate) async fn principal_of(&self, message: &JsonValue) -> Result<JsonValue, String> {
        if let Err(refused) = self.session_holds(message).await {
            return Ok(json!({ "session_error": refused }));
        }
        let kind = js::id(message.get("type"));
        let refuse =
            |error: &str| json!({ "reply": super::atome_ops::failure(&kind, message, error) });
        let principal = match self.resolve_principal(message).await {
            Ok(principal) => principal,
            Err(error) => return Ok(refuse(&error)),
        };
        Ok(match principal {
            Some(user) if self.provisioned(&user).await? => json!({ "principal": user }),
            Some(_) => refuse("remote_account_not_provisioned"),
            None => refuse("Authentication required"),
        })
    }

    /// `connectionOf` (`ask`: `message`, and `current`, `signed`, `seat`, `expiry`): the device session,
    /// then the account the connection is — `current` as `resolveWsApiPrincipal(connection)` reads
    /// it, else as attached, or `signed` as the message's own token names it (`thrown`: why its token
    /// cannot be read) — and whether that account is provisioned; with `seat`, the program seat its
    /// key names; with `expiry`, the attached account's expiry.
    pub(crate) async fn connection_of(&self, ask: JsonValue) -> Result<JsonValue, String> {
        let message = ask.get("message").cloned().unwrap_or_else(|| json!({}));
        let flag = |name: &str| ask.get(name) == Some(&JsonValue::Bool(true));
        if let Err(refused) = self.session_holds(&message).await {
            return Ok(json!({ "session_error": refused }));
        }
        let mut answer = JsonMap::new();
        let (principal, unreadable) = if flag("signed") {
            match self.resolve_principal(&message).await {
                Ok(principal) => (principal, false),
                Err(thrown) => {
                    answer.insert("thrown".into(), json!(thrown));
                    (None, true)
                }
            }
        } else if flag("current") {
            (self.resolve_principal(&json!({})).await?, false)
        } else {
            (self.attached(), false)
        };
        let provisioned = match &principal {
            Some(user) => self.provisioned(user).await?,
            None => false,
        };
        answer.insert("principal".into(), json!(principal));
        answer.insert("unreadable".into(), json!(unreadable));
        answer.insert("provisioned".into(), json!(provisioned));
        if flag("seat") {
            match self.ws_api.sessions.program_seat(&self.identity, &message) {
                Ok(program) => answer.insert("program".into(), json!(program)),
                Err(error) => answer.insert("program_error".into(), json!(error)),
            };
        }
        if flag("expiry") {
            answer.insert("exp_ms".into(), self.identity.held().expiry.json());
        }
        Ok(JsonValue::Object(answer))
    }

    /// `fileRequester`: the device session, then the requester (`requester`) — `{ userId }` or
    /// `{ error }`.
    pub(crate) async fn file_requester(&self, message: &JsonValue) -> Result<JsonValue, String> {
        if let Err(refused) = self.session_holds(message).await {
            let mut refused = refused;
            refused["type"] = json!("file-response");
            return Ok(json!({ "session_error": refused }));
        }
        Ok(match self.requester(message).await {
            None => json!({ "error": "file_request_auth_required" }),
            Some(user) if !self.provisioned(&user).await? => {
                json!({ "error": "remote_account_not_provisioned" })
            }
            Some(user) => json!({ "userId": user }),
        })
    }

    /// The requester of a `file` or an `atome` request (server/wsFileOperations.js `fileRequester`,
    /// server/ws_api_atome_request.js): the account attached (an expired one left), else the one
    /// the message's token names, the connection joining it.
    pub(crate) async fn requester(&self, message: &JsonValue) -> Option<String> {
        let mut requester = self.attached();
        // Read apart: the held identity stays locked through an `if let` scrutinee, and detaching locks it.
        let expiry = self.identity.held().expiry;
        if let Expiry::At(expiry) = expiry
            && requester.is_some()
            && expiry != 0.0
            && crate::auth::now_ms() >= expiry
        {
            self.detach();
            requester = None;
        }
        if requester.is_none() && js::truthy(message.get("token")) {
            let token = json!(js::string(&message["token"]));
            if let Ok(claims) = self.ws_api.sessions.verify(&token, &SECRET_ALGORITHMS)
                && let Some(user) = js::first(&claims, &["userId", "id", "user_id", "sub"])
            {
                let user = js::string(user);
                self.attach(&user).await;
                if let Expiry::At(ms) = Expiry::of(&claims) {
                    self.identity.held().expiry = Expiry::At(ms);
                }
                requester = Some(user);
            }
        }
        requester
    }

    /// `claimsOf`: the device session the message's token installs, else the one installed.
    pub(crate) async fn claims_of(&self, message: &JsonValue) -> Result<JsonValue, String> {
        let claims = match self.validate(message).await? {
            Some(claims) => Some(claims),
            None => self.identity.held().claims.clone(),
        };
        match claims {
            Some(claims) if claims.get("auth_version").and_then(JsonValue::as_f64) == Some(1.0) => {
                Ok(claims)
            }
            _ => Err("auth_session_invalid".into()),
        }
    }

    /// `connection-proof`, once the proof was consumed: the key is this connection's, its session installed.
    pub(crate) async fn proven(&self, token: Option<&JsonValue>) -> Result<(), String> {
        let claims = self
            .ws_api
            .sessions
            .read_device_session_token(token)
            .await?;
        self.identity.held().proven_key = claims
            .pointer("/cnf/kid")
            .and_then(JsonValue::as_str)
            .map(String::from);
        self.ws_api
            .sessions
            .validate_connection(&self.identity, token)
            .await
            .map(|_| ())
    }

    /// `installSessionIdentity`: a connection issued a device session is that session's from now on.
    pub(crate) async fn install(&self, token: &str) -> Result<(), String> {
        *self.link_attempt.lock().expect("link attempt") = None;
        let claims = self
            .ws_api
            .sessions
            .verify(&json!(token), &[Algorithm::HS256])?;
        if claims.get("iss").and_then(JsonValue::as_str) != Some(AUTH_LINK_ORIGIN) {
            return Err(format!("jwt issuer invalid. expected: {AUTH_LINK_ORIGIN}"));
        }
        if claims.get("aud").and_then(JsonValue::as_str) != Some("atome-ws") {
            return Err("jwt audience invalid. expected: atome-ws".into());
        }
        let user = js::text(claims.get("sub"));
        self.attach(&user).await;
        {
            let mut held = self.identity.held();
            held.session_id = Some(js::text(claims.get("sid")));
            held.expiry = Expiry::At(js::number(claims.get("exp")) * 1000.0);
            held.proven_key = Some(js::text(claims.pointer("/cnf/kid")));
            held.claims = Some(claims);
        }
        if let Err(error) = self.ws_api.social.directory.refresh(&user, false).await {
            eprintln!("[auth] directory refresh failed {user} {error}");
        }
        Ok(())
    }

    /// The opening request's bearer (`validateToken`): its account, unless the token is key-bound
    /// (a key proves nothing before the connection's proof).
    pub(crate) async fn opened(&self, claims: Option<JsonValue>) {
        let Some(claims) = claims else {
            return;
        };
        let user = js::first(&claims, &["id", "userId", "user_id", "sub"])
            .or_else(|| js::first(&claims, &["username", "name"]))
            .map(|user| js::trim(&js::string(user)).to_string())
            .filter(|user| !user.is_empty());
        let Some(user) = user.filter(|user| user != "anonymous") else {
            return;
        };
        if claims.pointer("/cnf/pop") == Some(&JsonValue::Bool(true)) {
            return;
        }
        self.attach(&user).await;
        if let Expiry::At(ms) = Expiry::of(&claims) {
            self.identity.held().expiry = Expiry::At(ms);
        }
    }
}
