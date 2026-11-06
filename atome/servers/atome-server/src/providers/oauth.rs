// The official authorization round trip (server/social/social_oauth.js, ported), for the music and
// social networks alike: atome never sees a password; the browser goes to the provider's own page,
// which redirects to this server (`/api/social/oauth/callback/:network`) with a one-time code bound
// to the attempt that started it. The attempt holds what finishing it does (`Complete`: the code
// exchanged and the session sealed in the person's vault), so the callback never trusts the request.
use super::generation::now_ms;
use super::http::{Done, Failure};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use futures_util::future::BoxFuture;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

const ATTEMPT_TTL_MS: i64 = 10 * 60 * 1000;

/// Whether the attempt is still the one waited for (neither settled nor expired).
pub type Current = Arc<dyn Fn() -> bool + Send + Sync>;
/// What the provider's code becomes: the public account, else a social code.
pub type Complete = Box<
    dyn FnOnce(String, String, Current) -> BoxFuture<'static, Result<JsonValue, String>> + Send,
>;

struct Attempt {
    attempt_id: String,
    principal: String,
    network: String,
    redirect_uri: String,
    expires_at: i64,
    complete: Mutex<Option<Complete>>,
    result: watch::Sender<Option<JsonValue>>,
}

impl Attempt {
    fn settle(&self, result: JsonValue) {
        self.result.send_if_modified(|current| {
            if current.is_some() {
                return false;
            }
            *current = Some(result);
            true
        });
    }

    fn settled(&self) -> Option<JsonValue> {
        self.result.borrow().clone()
    }
}

fn failure(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

pub fn hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut buffer).expect("random");
    buffer.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The redirect a network's application registers, on the operator's public origin.
pub fn redirect_uri(base: &str, network: &str) -> Done<String> {
    let base = base.trim_end_matches('/');
    if !base.starts_with("https://") {
        return Err(social("social_not_configured"));
    }
    Ok(format!("{base}/api/social/oauth/callback/{network}"))
}

/// A social failure: its code is both the message and what travels.
pub fn social(code: &str) -> Failure {
    Failure::from(code)
}

/// The attempts under way, by their state.
#[derive(Default)]
pub struct OAuth {
    attempts: Mutex<HashMap<String, Arc<Attempt>>>,
}

impl OAuth {
    fn attempts(&self) -> std::sync::MutexGuard<'_, HashMap<String, Arc<Attempt>>> {
        self.attempts.lock().expect("authorization attempts")
    }

    /// A new attempt for `principal` on `network`, any earlier one there cancelled; the official
    /// page's address is built by `authorize` from the attempt's state and redirect.
    pub fn start(
        self: &Arc<Self>,
        principal: &str,
        network: &str,
        base: &str,
        authorize: impl FnOnce(&str, &str) -> String,
        complete: Complete,
    ) -> Done<JsonValue> {
        let now = now_ms();
        let mut attempts = self.attempts();
        attempts.retain(|_, attempt| {
            let live = now <= attempt.expires_at;
            if !live {
                attempt.settle(failure("social_authorization_expired"));
            }
            live
        });
        for attempt in attempts.values() {
            if attempt.principal == principal && attempt.network == network {
                attempt.settle(failure("social_cancelled"));
            }
        }
        let state = hex(24);
        let attempt_id = hex(16);
        let redirect = redirect_uri(base, network)?;
        let attempt = Arc::new(Attempt {
            attempt_id: attempt_id.clone(),
            principal: principal.into(),
            network: network.into(),
            redirect_uri: redirect.clone(),
            expires_at: now + ATTEMPT_TTL_MS,
            complete: Mutex::new(Some(complete)),
            result: watch::channel(None).0,
        });
        attempts.insert(state.clone(), attempt.clone());
        drop(attempts);
        let expiry = Arc::downgrade(self);
        let timed = state.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(ATTEMPT_TTL_MS as u64)).await;
            attempt.settle(failure("social_authorization_expired"));
            if let Some(oauth) = expiry.upgrade() {
                oauth.attempts().remove(&timed);
            }
        });
        Ok(
            json!({ "attempt_id": attempt_id, "authorization_url": authorize(&state, &redirect),
            "expires_at": now + ATTEMPT_TTL_MS }),
        )
    }

    fn find(
        &self,
        principal: &str,
        attempt_id: &str,
        network: Option<&str>,
    ) -> Option<Arc<Attempt>> {
        self.attempts()
            .values()
            .find(|attempt| {
                attempt.principal == principal
                    && attempt.attempt_id == attempt_id
                    && network.is_none_or(|network| attempt.network == network)
            })
            .cloned()
    }

    /// The attempt's outcome once the provider redirected back, it expired or was cancelled; an
    /// abandoned wait (the operation cancelled) cancels the attempt.
    pub async fn wait(
        &self,
        principal: &str,
        attempt_id: &str,
        network: Option<&str>,
    ) -> JsonValue {
        let Some(attempt) = self.find(principal, attempt_id, network) else {
            return failure("social_authorization_expired");
        };
        struct Abandon(Arc<Attempt>);
        impl Drop for Abandon {
            fn drop(&mut self) {
                self.0.settle(failure("social_cancelled"));
            }
        }
        let guard = Abandon(attempt.clone());
        let mut result = attempt.result.subscribe();
        let settled = result
            .wait_for(Option::is_some)
            .await
            .map(|value| value.clone().unwrap_or(JsonValue::Null))
            .unwrap_or_else(|_| failure("social_cancelled"));
        drop(guard);
        settled
    }

    /// Cancels the attempt, or with a network and no attempt every pending one of the person there.
    pub fn cancel(&self, principal: &str, attempt_id: &str, network: Option<&str>) -> bool {
        if let Some(network) = network.filter(|_| attempt_id.is_empty()) {
            let matches: Vec<Arc<Attempt>> = self
                .attempts()
                .values()
                .filter(|a| {
                    a.principal == principal && a.network == network && a.settled().is_none()
                })
                .cloned()
                .collect();
            for attempt in &matches {
                attempt.settle(failure("social_cancelled"));
            }
            return !matches.is_empty();
        }
        match self.find(principal, attempt_id, network) {
            Some(attempt) => {
                attempt.settle(failure("social_cancelled"));
                true
            }
            None => false,
        }
    }

    /// `completeSocialAuthorization`: the provider's redirect, checked against its attempt.
    async fn complete(&self, network: &str, query: &HashMap<String, String>) -> JsonValue {
        let state = query.get("state").cloned().unwrap_or_default();
        let shaped = state.len() == 48
            && state
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c));
        let attempt = if shaped {
            self.attempts().get(&state).cloned()
        } else {
            None
        };
        let Some(attempt) = attempt.filter(|a| a.settled().is_none() && a.network == network)
        else {
            return failure("social_authorization_expired");
        };
        // Taken once: a second redirect finds no completion and is refused.
        let Some(complete) = attempt.complete.lock().expect("completion").take() else {
            return failure("social_authorization_expired");
        };
        let code = query.get("code").filter(|code| !code.is_empty());
        let (true, Some(code)) = (query.get("error").is_none_or(String::is_empty), code) else {
            attempt.settle(failure("social_authorization_denied"));
            return attempt.settled().unwrap_or(JsonValue::Null);
        };
        let watched = attempt.clone();
        let current: Current =
            Arc::new(move || watched.settled().is_none() && now_ms() < watched.expires_at);
        let result = match complete(code.clone(), attempt.redirect_uri.clone(), current).await {
            Ok(account) => json!({ "ok": true, "account": account }),
            Err(code) => failure(&code),
        };
        attempt.settle(result);
        attempt.settled().unwrap_or(JsonValue::Null)
    }

    /// `GET /api/social/oauth/callback/:network`: a plain page telling the browser how it went.
    pub async fn callback(&self, network: &str, query: &HashMap<String, String>) -> Response {
        let result = self.complete(network, query).await;
        let text = if result["ok"] == json!(true) {
            "atome: the account is connected. You can close this page and return to atome."
                .to_string()
        } else {
            format!(
                "atome: the connection did not complete ({}). You can close this page and return to atome.",
                crate::vault_router::js::text(result.get("error"))
            )
        };
        let mut response = (StatusCode::OK, text).into_response();
        let headers = response.headers_mut();
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        headers.insert(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        );
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; charset=utf-8"),
        );
        response
    }
}
