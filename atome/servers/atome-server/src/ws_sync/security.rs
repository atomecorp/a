// Who a `/ws/sync` connection is (server/wsSyncSecurity.js, ported): the bearer of its opening
// request, or the device session an `auth` message carries once the connection signed a fresh
// challenge with that session's key (`auth-challenge`), as on `/ws/api` (auth/connection.rs). The
// account is held on the connection alone: a sync connection never joins the live set of
// `/ws/api`. Every check happens again before each control message and each delivery.
use super::SyncRuntime;
use super::record::Record;
use crate::auth::connection::{Expiry, Resolved};
use crate::auth::{devices, now_ms};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

impl Record {
    // `resolveWsApiPrincipal(connection, message, { registerClient: false })`: the account is the
    // connection's own; an expired one is left (`detachWsApiClient`).
    fn resolve(
        &self,
        runtime: &SyncRuntime,
        message: &JsonValue,
    ) -> Result<Option<String>, String> {
        match runtime
            .sessions
            .resolve_principal(&self.identity, message)?
        {
            Resolved::Joined { user, expiry } => {
                let mut held = self.identity.held();
                held.user = Some(user.clone());
                held.expiry = expiry;
                Ok(Some(user))
            }
            Resolved::Attached(user) => Ok(Some(user)),
            Resolved::Expired(_) => {
                let mut held = self.identity.held();
                held.session_id = None;
                held.claims = None;
                held.user = None;
                held.expiry = Expiry::Cleared;
                Ok(None)
            }
            Resolved::Nobody => Ok(None),
        }
    }

    /// `authenticateWsSyncRequest`: the account the opening request's bearer names, if its device
    /// session lives and needs no proof yet.
    pub(super) async fn request_principal(&self, runtime: &SyncRuntime) -> Option<String> {
        let token = json!(self.bearer.as_deref().filter(|token| !token.is_empty())?);
        let sessions = &runtime.sessions;
        sessions
            .validate_connection(&self.identity, Some(&token))
            .await
            .ok()?;
        self.resolve(runtime, &json!({ "token": token }))
            .ok()
            .flatten()
    }

    /// `issueWsSyncChallenge`: a challenge for the key of the message's device session, bound to
    /// this connection's nonce.
    pub(super) async fn challenge(
        &self,
        runtime: &SyncRuntime,
        message: &JsonValue,
    ) -> Result<JsonValue, String> {
        let sessions = &runtime.sessions;
        let claims = sessions
            .read_device_session_token(message.get("token"))
            .await?;
        let proof = sessions.proof().ok_or("auth_secret_required")?;
        let nonce = self
            .nonce
            .lock()
            .expect("sync nonce")
            .get_or_insert_with(|| proof.random_handle())
            .clone();
        let kid = js::text(claims.pointer("/cnf/kid"));
        let worker = sessions.clone();
        sessions
            .central()
            .transaction(move |db| {
                let proof = worker.proof().expect("proof keys");
                proof.challenge(db, "connection", &nonce, &kid, None, now_ms() as i64)
            })
            .await
    }

    /// `authenticateWsSyncMessage`: an `auth` message's device session, its key proven first when it
    /// answers this connection's challenge; the account it names, else none.
    pub(super) async fn message_principal(
        &self,
        runtime: &SyncRuntime,
        message: &JsonValue,
    ) -> Option<String> {
        if message.get("type") != Some(&json!("auth")) {
            return None;
        }
        let sessions = &runtime.sessions;
        let nonce = self.nonce.lock().expect("sync nonce").clone();
        if js::truthy(message.get("challengeId"))
            && let Some(nonce) = nonce
        {
            let claims = sessions
                .read_device_session_token(message.get("token"))
                .await
                .ok()?;
            let kid = js::text(claims.pointer("/cnf/kid"));
            let (input, key_id) = (message.clone(), kid.clone());
            sessions
                .central()
                .transaction(move |db| {
                    let key = devices::by_id(db, &key_id)?.ok_or("auth_device_key_missing")?;
                    let public_key =
                        serde_json::from_str(key["public_key"].as_str().unwrap_or_default())
                            .map_err(|e| e.to_string())?;
                    crate::auth::proof::Proof::consume_proof(
                        db,
                        &input,
                        "connection",
                        &nonce,
                        &public_key,
                        now_ms() as i64,
                    )
                })
                .await
                .ok()?;
            self.identity.held().proven_key = Some(kid);
        }
        sessions
            .validate_connection(&self.identity, message.get("token"))
            .await
            .ok()?;
        let token = message.get("token").cloned().unwrap_or(JsonValue::Null);
        self.resolve(runtime, &json!({ "token": token }))
            .ok()
            .flatten()
    }

    /// `validateWsSyncPrincipal`: the account, while its device session lives and has not expired.
    pub(super) async fn validated_principal(
        &self,
        runtime: &SyncRuntime,
    ) -> Result<Option<String>, String> {
        if runtime
            .sessions
            .validate_connection(&self.identity, None)
            .await
            .is_err()
        {
            return Ok(None);
        }
        self.resolve(runtime, &json!({}))
    }

    /// The account's expiry as the connection holds it (`Number(_wsApiAuthExpMs)`).
    pub(super) fn expiry_ms(&self) -> f64 {
        self.identity.held().expiry.number()
    }
}

impl SyncRuntime {
    /// `getLocalVersion().version`: `atome/src/version.json`'s, `0.0.0` when it cannot be read.
    pub(super) async fn version(&self) -> JsonValue {
        let path = self
            .project_root
            .join("atome")
            .join("src")
            .join("version.json");
        let read = tokio::fs::read_to_string(&path)
            .await
            .map_err(|error| error.to_string())
            .and_then(|text| {
                serde_json::from_str::<JsonValue>(&text).map_err(|error| error.to_string())
            });
        match read {
            Ok(version) => version
                .get("version")
                .filter(|version| js::truthy(Some(version)))
                .cloned()
                .unwrap_or(JsonValue::Null),
            Err(error) => {
                eprintln!("[ws/sync] failed to read local version.json: {error}");
                json!("0.0.0")
            }
        }
    }
}
