// The `ai-provider` family of `/ws/api` (server/wsAiProviderOperations.js, ported): every provider an
// account reaches through this server — OpenAI (its routes, a voice session, text read aloud), the
// model catalogs, the audio and video generation services — with the account's keys and secrets
// sealed in its own vault (credentials.rs) and the platform key's bounded seats (shared_grant.rs).
// A connection keeps its own operations (cancelled by `cancel`, by their deadline, by another account
// on the same connection, and when it closes), its pending remote approvals and its voice sessions.
// The dispatch itself is dispatch.rs; what it asks of the connection is `Link`.
mod audio;
mod catalog;
mod credentials;
mod dispatch;
mod generation;
mod hosted;
pub(crate) mod http;
mod models;
mod music;
mod oauth;
mod openai;
mod params;
mod realtime;
mod shared_grant;
mod social;
mod speech;
mod strava;
mod video;

pub use dispatch::answer;
pub use http::Done;

use crate::media::storage::Storage;
use crate::settings::Settings;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use futures_util::future::BoxFuture;
use http::Failure;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

/// What a provider call asks of its connection.
pub trait Link: Send + Sync {
    /// The message's account is still the one the call began with (`provider_principal_changed`).
    fn check(&self, principal: &str) -> impl Future<Output = Done<()>> + Send;
    /// A frame to the client.
    fn send(&self, frame: JsonValue) -> impl Future<Output = ()> + Send;
    /// The connection as a voice session's watcher sees it, for as long as it lives.
    fn relay(&self) -> Relay;
    /// A frame of the person's own canonical commit and read (`events`, `state-current`), with
    /// the message's token, answered as the Atome tools are.
    fn atome(&self, frame: JsonValue) -> impl Future<Output = JsonValue> + Send;
    /// Where a person's stored file lies, when they may read it (the uploads' own resolver).
    fn files(&self) -> Files;
}

/// `(file, principal)` to the file's path, none when it is missing or not theirs.
pub type Files = Arc<dyn Fn(String, String) -> BoxFuture<'static, Option<PathBuf>> + Send + Sync>;

/// A voice session's view of its connection: the account it is attached to, and its frames.
pub struct Relay {
    pub principal: Box<dyn Fn() -> BoxFuture<'static, Option<String>> + Send + Sync>,
    pub send: Box<dyn Fn(JsonValue) -> BoxFuture<'static, ()> + Send + Sync>,
}

/// The process's providers.
pub struct Providers {
    router: Arc<VaultRouter>,
    vault_root: PathBuf,
    shared: shared_grant::SharedGrant,
    everyone: Arc<realtime::Everyone>,
    audio: audio::Audio,
    video: video::Video,
    music: music::Music,
    strava: strava::Strava,
    social: social::Social,
    // The consents under way, music's and the social networks' alike (one callback).
    oauth: Arc<oauth::OAuth>,
    /// The server's own sender and the personal mail gateway (mail/).
    pub mail: crate::mail::Mail,
}

impl Providers {
    pub fn load(
        settings: &Settings,
        project_root: &Path,
        vault_root: PathBuf,
        router: Arc<VaultRouter>,
        storage: Arc<Storage>,
        central: Central,
    ) -> Result<Self, String> {
        let social = social::config(settings, project_root)?;
        Ok(Self {
            router,
            vault_root,
            shared: shared_grant::SharedGrant::load(settings, central.clone()),
            everyone: Arc::default(),
            audio: audio::Audio::load(settings),
            video: video::Video::load(settings, project_root, storage, central),
            music: music::Music::load(settings),
            strava: strava::Strava::load(settings, project_root, &social),
            social: social::Social::new(social),
            oauth: Arc::default(),
            mail: crate::mail::Mail::load(settings)?,
        })
    }

    /// The two HTTP surfaces the networks impose (`/api/social/`): the registered consent
    /// redirect, and the pull URL of Instagram's and TikTok's photos; none for another path.
    pub async fn route(&self, path: &str, query: Option<&str>) -> Option<axum::response::Response> {
        self.social.route(&self.oauth, path, query).await
    }

    /// `handleSocialAction` in `principal`'s name, for what the server sends itself (a
    /// scheduled send, server/scheduled_send_channels.js).
    pub async fn social_action(
        &self,
        principal: &str,
        files: Files,
        action: &str,
        payload: &JsonValue,
    ) -> Done<JsonValue> {
        let vault =
            credentials::Credentials::open(&self.router, &self.vault_root, principal).await?;
        self.social
            .answer(&self.oauth, &vault, files, principal, action, payload)
            .await
    }

    /// `updateSocialPost` of each post (its destination, what its network answered when it was
    /// published), all at once, in `principal`'s name: each failure's code.
    pub async fn social_updates(
        &self,
        principal: &str,
        files: Files,
        posts: &[(String, Option<JsonValue>)],
        text: &str,
    ) -> Done<Vec<Result<JsonValue, String>>> {
        let vault =
            credentials::Credentials::open(&self.router, &self.vault_root, principal).await?;
        let updates = posts.iter().map(|(destination, remote)| {
            self.social.update(
                &vault,
                files.clone(),
                principal,
                destination,
                remote.as_ref(),
                text,
            )
        });
        Ok(futures_util::future::join_all(updates).await)
    }
}

struct Active {
    principal: String,
    action: String,
    provider: String,
    cancel: watch::Sender<bool>,
}

// A model listing or a credential status is no provider work (a status reads our own vault): a
// launch asks one per provider at once, and with the assistant's own question they took the four
// places of the provider calls and the assistant was refused.
const CATALOG_ACTIONS: [&str; 6] = [
    "models",
    "credential.status",
    "secret.list",
    "secret.read",
    "secret.store",
    "secret.remove",
];

/// One connection's provider state.
#[derive(Default)]
pub struct Attached {
    active: Mutex<HashMap<String, Active>>,
    hosted: hosted::Sessions,
    realtime: Arc<realtime::Sessions>,
}

impl Attached {
    fn active(&self) -> std::sync::MutexGuard<'_, HashMap<String, Active>> {
        self.active.lock().expect("provider operations")
    }

    /// The connection is gone: its operations stop and its voice sessions end.
    pub fn end(&self) {
        for (_, entry) in self.active().drain() {
            let _ = entry.cancel.send(true);
        }
        self.realtime.end_all();
    }

    /// Whether the operation `id` runs here.
    pub fn holds(&self, id: &str) -> bool {
        self.active().contains_key(id)
    }

    /// A changed account must not inherit an old request.
    fn abort_others(&self, principal: &str) {
        for entry in self.active().values() {
            if entry.principal != principal {
                let _ = entry.cancel.send(true);
            }
        }
    }

    /// `cancel`: whether the operation was this account's.
    fn cancel(&self, principal: &str, id: &str) -> bool {
        let active = self.active();
        let Some(entry) = active.get(id).filter(|entry| entry.principal == principal) else {
            return false;
        };
        let _ = entry.cancel.send(true);
        true
    }

    /// An account's other OpenAI operations stop once its key changes.
    fn abort_openai(&self, principal: &str, except: &str) {
        for (id, entry) in self.active().iter() {
            if id != except && entry.principal == principal && entry.provider == "openai" {
                let _ = entry.cancel.send(true);
            }
        }
    }

    /// The operation taken in, within the connection's limits.
    fn admit(
        &self,
        principal: &str,
        action: &str,
        id: &str,
        provider: String,
    ) -> Result<watch::Receiver<bool>, &'static str> {
        let mut active = self.active();
        if action == "realtime-connect" && active.values().any(|entry| entry.action == action) {
            return Err("provider_realtime_connect_pending");
        }
        let catalogs = active
            .values()
            .filter(|entry| CATALOG_ACTIONS.contains(&entry.action.as_str()))
            .count();
        let full = if CATALOG_ACTIONS.contains(&action) {
            catalogs >= 8
        } else {
            active.len() - catalogs >= 4
        };
        if full {
            return Err("provider_concurrency_limit");
        }
        if id.is_empty() || active.contains_key(id) {
            return Err("provider_request_id_invalid");
        }
        let (cancel, cancelled) = watch::channel(false);
        active.insert(
            id.to_string(),
            Active {
                principal: principal.into(),
                action: action.into(),
                provider,
                cancel,
            },
        );
        Ok(cancelled)
    }

    fn finish(&self, id: &str) {
        self.active().remove(id);
    }
}

const SHARED_CREDIT_FAILURES: [&str; 4] = [
    "insufficient_quota",
    "billing_hard_limit_reached",
    "billing_not_active",
    "provider_http_402",
];
const KNOWN_PREFIXES: [&str; 7] = [
    "provider_",
    "social_",
    "not_authenticated",
    "no_ai_key_configured",
    "invalid_api_key",
    "insufficient_quota",
    "rate_limit_exceeded",
];

// The provider's transport failing, as fetch threw it (http.rs): the provider unreachable, its answer
// cut, its answer unreadable. Each is told as its own cause, never as a failure of this server.
const TRANSPORT_FAILURES: [(&str, &str); 3] = [
    ("fetch failed", "provider_unreachable"),
    ("terminated", "provider_stream_incomplete"),
    ("SyntaxError", "provider_invalid_response"),
];

/// The failure's reply fields: a known code travels, any other text stays here; a credit refusal on
/// the platform key is eVe's shared credit, never the person's own key.
fn failed(failure: &Failure, cancelled: bool, shared: bool) -> JsonValue {
    let known = KNOWN_PREFIXES
        .iter()
        .any(|prefix| failure.message.starts_with(prefix))
        || audio::ERRORS.contains(&failure.message.as_str())
        || video::ERRORS.contains(&failure.message.as_str());
    let transport = TRANSPORT_FAILURES
        .iter()
        .find(|(text, _)| *text == failure.message)
        .map(|(_, code)| *code);
    let code = if cancelled {
        "provider_cancelled".to_string()
    } else if !failure.provider_code.is_empty() {
        failure.provider_code.clone()
    } else if known {
        failure.message.clone()
    } else if let Some(code) = transport {
        code.into()
    } else {
        "provider_operation_failed".into()
    };
    let code = if shared && SHARED_CREDIT_FAILURES.contains(&code.as_str()) {
        "provider_shared_quota_exceeded".to_string()
    } else {
        code
    };
    let mut fields = serde_json::json!({ "error": code, "http_status": failure.http_status });
    if code.starts_with("social_") {
        fields["detail"] = serde_json::json!(failure.detail);
        fields["provider_code"] = serde_json::json!(failure.social_code);
    }
    fields
}

#[cfg(test)]
#[path = "../../../../../tests/server/provider_failure_codes.rs"]
mod tests;
