// The password `auth` requests of `/ws/api` (server/auth_password.js `challenge`, `login`,
// `set`, ported): the central steps (auth/passwords.rs) run in `committed` units around the
// derivations (auth/password_crypto.rs), which never hold the database. One Argon2
// derivation also runs for an account without a verifier, against a dummy one made once.
use super::Connection;
use crate::auth::outcome::Outcome;
use crate::auth::{now_ms, password_crypto, passwords};
use crate::vault_router::central::atomic;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use tokio::sync::OnceCell;

pub(super) const ACTIONS: [&str; 3] = [
    "password-login-challenge",
    "password-login",
    "session-set-password",
];

static DUMMY: OnceCell<String> = OnceCell::const_new();

pub(super) async fn outcome(
    connection: &Connection,
    message: &JsonValue,
    action: &str,
) -> Result<Outcome, String> {
    let sessions = connection.ws_api.sessions.clone();
    let (Some(proof), Some(_)) = (sessions.proof(), sessions.secret()) else {
        return Err("auth_secret_required".into());
    };
    let central = sessions.central();
    let input = message.clone();
    let network = connection.network.clone();
    let worker = sessions.clone();
    if action == "password-login-challenge" {
        return central
            .committed(move |db| {
                let proof = worker.proof().expect("proof keys");
                passwords::challenge(db, proof, &input, &network, now_ms() as i64)
            })
            .await?;
    }
    if action == "session-set-password" {
        // `currentPassword || ''`.
        let current = message
            .get("currentPassword")
            .filter(|current| js::truthy(Some(current)))
            .cloned()
            .unwrap_or_else(|| json!(""));
        let digest = password_crypto::request_digest(message.get("password"), &current)?;
        let (row, current) = central
            .committed(move |db| passwords::begin_set(db, &input, &digest, now_ms() as i64))
            .await??;
        // Replacing a credential is distinct from an SMS login, never an SMS-only reset.
        if let Some(verifier) = &current
            && !password_crypto::verify(message.get("currentPassword"), verifier)
                .await?
                .ok
        {
            return Err("auth_password_rejected".into());
        }
        let password = message["password"].as_str().unwrap_or_default();
        password_crypto::screen(password).await?;
        let encoded = password_crypto::hash(password, false).await?;
        let input = message.clone();
        return central
            .committed(move |db| {
                let proof = worker.proof().expect("proof keys");
                let now = now_ms() as i64;
                atomic(db, |db| {
                    passwords::finish_set(
                        db,
                        proof,
                        &input,
                        &row,
                        current.as_deref(),
                        &encoded,
                        now,
                    )
                })
            })
            .await?;
    }
    let (login, account, stored) = central
        .committed(move |db| {
            let proof = worker.proof().expect("proof keys");
            passwords::begin_login(db, proof, &input, &network, now_ms() as i64)
        })
        .await??;
    let dummy = DUMMY
        .get_or_try_init(|| {
            let seed = format!(
                "server dummy credential {}",
                proof.keyed_index("password-dummy")
            );
            async move { password_crypto::hash(&seed, false).await }
        })
        .await?;
    let password = message.get("password");
    let legacy = stored.as_deref().is_some_and(password_crypto::legacy);
    // A legacy verifier also costs one Argon2 derivation; no account flag escapes.
    let (verified, _) = tokio::try_join!(
        password_crypto::verify(password, stored.as_deref().unwrap_or(dummy)),
        async {
            if legacy {
                password_crypto::verify(password, dummy).await.map(Some)
            } else {
                Ok(None)
            }
        }
    )?;
    let (Some(account), Some(stored), true) = (account, stored, verified.ok) else {
        let worker = sessions.clone();
        central
            .committed(move |db| {
                let proof = worker.proof().expect("proof keys");
                passwords::failed_login(db, proof, &login, now_ms() as i64)
            })
            .await??;
        return Err("auth_password_rejected".into());
    };
    let upgraded = match verified.legacy {
        true => {
            let password = password.and_then(JsonValue::as_str).unwrap_or_default();
            Some(password_crypto::hash(password, true).await?)
        }
        false => None,
    };
    let worker = sessions.clone();
    central
        .committed(move |db| {
            let proof = worker.proof().expect("proof keys");
            let secret = worker.secret().expect("secret");
            let now = now_ms() as i64;
            atomic(db, |db| {
                passwords::finish_login(
                    db,
                    proof,
                    secret,
                    &login,
                    &account,
                    &stored,
                    upgraded.as_deref(),
                    now,
                )
            })
        })
        .await?
}
