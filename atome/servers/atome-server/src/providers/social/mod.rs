// The social networks (server/social/, ported): the single server owner of social sharing,
// reached through the person's authenticated `/ws/api` provider channel (relayed unchanged by the
// Tauri and iOS hosts). The atome application is registered with each network by the operator,
// never by a user (one app per network); the tokens live only in the person's vault
// (`social.<network>`), the client receiving the public view built here; the official consent
// goes through oauth.rs; the only HTTP surfaces are the two the providers impose (`route`).
mod facebook;
mod instagram;
mod jobs;
mod media;
mod net;
mod ops;
mod plan;
mod sessions;
mod tiktok;

use super::credentials::Credentials;
use super::http::{Done, Failure};
use super::oauth::OAuth;
use crate::settings::Settings;
use crate::vault_router::js;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use jobs::Hooks;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

// `SOCIAL_CONFIG_KEYS` (server/auth_secret_config.js).
const CONFIG_KEYS: [&str; 10] = [
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_AUDITED",
    "TIKTOK_DIRECT_POST",
    "TIKTOK_PULL_FROM_URL_VERIFIED",
    "INSTAGRAM_APP_ID",
    "INSTAGRAM_APP_SECRET",
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
    "SOCIAL_PUBLIC_BASE_URL",
];

// `SOCIAL_ERRORS` (atome/src/squirrel/social/contracts.js).
pub const SOCIAL_ERRORS: [&str; 29] = [
    "social_not_configured",
    "social_not_connected",
    "social_session_expired",
    "social_authorization_denied",
    "social_authorization_expired",
    "social_permission_missing",
    "social_account_incompatible",
    "social_media_missing",
    "social_media_unreadable",
    "social_media_type_unsupported",
    "social_media_constraint",
    "social_text_only_unsupported",
    "social_content_empty",
    "social_public_media_url_unavailable",
    "social_provider_rejected",
    "social_provider_rate_limited",
    "social_provider_unavailable",
    "social_network_interrupted",
    "social_publish_unconfirmed",
    "social_job_not_found",
    "social_job_busy",
    "social_destination_invalid",
    "social_option_required",
    "social_cancelled",
    "social_app_unavailable",
    "social_handoff_unavailable",
    "social_request_invalid",
    "social_needs_person",
    "social_update_unsupported",
];

/// The networks' configuration as Fastify's environment holds it (`readSocialConfig`).
pub struct Config(HashMap<String, String>);

impl Config {
    pub fn get(&self, key: &str) -> &str {
        self.0.get(key).map_or("", String::as_str)
    }
}

/// `Private/social.env` read in development (an existing variable winning); an unreadable file
/// stops the server, as it stops Fastify's boot (`registerSocialRoutes`).
pub fn config(settings: &Settings, project_root: &Path) -> Result<Config, String> {
    let file = settings.secret_file(
        project_root,
        "ATOME_SOCIAL_ENV_FILE",
        "social.env",
        &CONFIG_KEYS,
        "social_secret_file",
    )?;
    Ok(Config(
        CONFIG_KEYS
            .iter()
            .map(|key| {
                let value = settings
                    .value(key)
                    .or_else(|| file.get(*key).cloned())
                    .unwrap_or_default();
                (key.to_string(), value)
            })
            .collect(),
    ))
}

pub use super::Files;

/// The asset a delivery sends: the prepared variant (or the original), its public URL when the
/// network pulls it.
pub struct Media {
    pub kind: String,
    pub path: PathBuf,
    pub size: f64,
    pub mime: String,
    pub probe: JsonValue,
    pub name: String,
    pub public_url: Option<String>,
}

/// What an adapter's publication or status reads.
pub struct Ctx<'a> {
    pub config: &'a Config,
    pub record: &'a JsonValue,
    pub plan: &'a JsonValue,
    pub media: Option<&'a Media>,
    pub text: &'a str,
    pub options: &'a JsonValue,
    pub view: &'a JsonValue,
    pub remote: JsonValue,
    pub hooks: &'a Hooks,
}

/// The sharing owner's state: the configuration, the jobs in flight, the public files.
pub struct Social {
    config: Arc<Config>,
    jobs: Arc<jobs::Jobs>,
    public: Arc<media::PublicFiles>,
}

impl Social {
    pub fn new(config: Config) -> Self {
        Self {
            config: Arc::new(config),
            jobs: Arc::default(),
            public: Arc::default(),
        }
    }

    fn env(&self, vault: &Credentials, files: Files, principal: &str) -> ops::Env {
        ops::Env {
            config: self.config.clone(),
            vault: vault.clone(),
            files,
            principal: principal.to_string(),
            store: jobs::Store {
                jobs: self.jobs.clone(),
                public: self.public.clone(),
                root: vault.social_root(),
            },
        }
    }

    /// `handleSocialAction`.
    pub async fn answer(
        &self,
        oauth: &Arc<OAuth>,
        vault: &Credentials,
        files: Files,
        principal: &str,
        action: &str,
        payload: &JsonValue,
    ) -> Done<JsonValue> {
        let env = self.env(vault, files, principal);
        ops::handle(&env, oauth, action, payload)
            .await
            .map_err(Failure::from)
    }

    /// `updateSocialPost`: the post a scheduled send published takes its new text in place, where
    /// its network edits one (a Facebook Page's); the failure's code.
    pub async fn update(
        &self,
        vault: &Credentials,
        files: Files,
        principal: &str,
        destination: &str,
        remote: Option<&JsonValue>,
        text: &str,
    ) -> Result<JsonValue, String> {
        let remote = remote.filter(|remote| js::truthy(Some(remote)));
        let Some(remote) = remote.filter(|_| destination.starts_with("facebook:page:")) else {
            return Err("social_update_unsupported".into());
        };
        let env = self.env(vault, files, principal);
        let (session, _) = ops::connected(sessions::Network::Facebook, &env)
            .await
            .map_err(|failure| failure.code)?;
        let record = ops::record(&session).map_err(|failure| failure.code)?;
        facebook::update(record, remote, text)
            .await
            .map_err(|failure| failure.code)
    }

    /// `GET /api/social/oauth/callback/:network` and `GET /api/social/media/:name`, else none.
    pub async fn route(&self, oauth: &OAuth, path: &str, query: Option<&str>) -> Option<Response> {
        if let Some(network) = path
            .strip_prefix("/api/social/oauth/callback/")
            .filter(|n| !n.is_empty() && !n.contains('/'))
        {
            let mut fields: HashMap<String, String> = HashMap::new();
            for (key, value) in url::form_urlencoded::parse(query.unwrap_or("").as_bytes()) {
                // A repeated field reads as JavaScript writes its array (`String([a, b])`).
                fields
                    .entry(key.into_owned())
                    .and_modify(|v| {
                        v.push(',');
                        v.push_str(&value);
                    })
                    .or_insert_with(|| value.into_owned());
            }
            return Some(oauth.callback(network, &fields).await);
        }
        let name = path
            .strip_prefix("/api/social/media/")
            .filter(|n| !n.is_empty() && !n.contains('/'))?;
        let Some((file, mime)) = self.public.resolve(name) else {
            let mut response = (StatusCode::NOT_FOUND, "not found").into_response();
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"));
            return Some(response);
        };
        let length = tokio::fs::metadata(&file).await.map(|m| m.len());
        let body = match length {
            Ok(length) => crate::media::served::streamed(&file, 0, length).await,
            Err(error) => Err(error.to_string()),
        };
        let Ok(body) = body else {
            return Some(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        };
        let mut response = Response::new(body);
        let headers = response.headers_mut();
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        if let Ok(kind) = HeaderValue::from_str(&mime) {
            headers.insert(header::CONTENT_TYPE, kind);
        }
        Some(response)
    }
}
