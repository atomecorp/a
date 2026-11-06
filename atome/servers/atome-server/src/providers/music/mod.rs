// The music services (server/music/music_operations.js and atome/src/squirrel/music/contracts.js,
// ported): Spotify through its official consent and Web API, Deezer through its public catalog.
// The person enters the Spotify application's Client ID and the Deezer profile in Passwords &
// keys; the consent's redirect comes back to the operator's public origin. A command's input is
// checked against the registry's schema (`music_commands`), a write kept as a durable receipt.
mod deezer;
mod ledger;
mod session;
mod spotify;

use super::credentials::Credentials;
use super::credentials::Locks;
use super::http::{Done, Failure};
use super::oauth::OAuth;
use super::{Link, catalog, params};
use crate::settings::Settings;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use session::{Check, Session};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

/// A music failure: its code, and whether an effect may have happened anyway.
#[derive(Debug)]
pub struct Mf {
    pub code: String,
    pub uncertain: bool,
}

impl Mf {
    pub fn new(code: &str) -> Self {
        Self::uncertain(code, false)
    }

    pub fn uncertain(code: &str, uncertain: bool) -> Self {
        Self {
            code: code.into(),
            uncertain,
        }
    }
}

impl From<String> for Mf {
    fn from(code: String) -> Self {
        Self {
            code,
            uncertain: false,
        }
    }
}

impl From<Failure> for Mf {
    fn from(failure: Failure) -> Self {
        failure.message.into()
    }
}

const ERRORS: [&str; 24] = [
    "INVALID_ARGUMENT",
    "AUTH_REQUIRED",
    "CONTEXT_CHANGED",
    "NOT_CONFIGURED",
    "DEVELOPER_ACCESS_REQUIRED",
    "AUTHORIZATION_REQUIRED",
    "PERMISSION_DENIED",
    "AUTHORIZATION_EXPIRED",
    "CANCELLED",
    "USER_GESTURE_REQUIRED",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_REJECTED",
    "RATE_LIMITED",
    "SUBSCRIPTION_REQUIRED",
    "NO_ACTIVE_DEVICE",
    "NO_ACTIVE_MUSIC",
    "CURRENT_SONG_CHANGED",
    "AMBIGUOUS_SELECTION",
    "ITEM_NOT_FOUND",
    "OPERATION_UNCONFIRMED",
    "OPERATION_CONFLICT",
    "OPERATION_NOT_FOUND",
    "VERSION_CONFLICT",
    "COMMIT_FAILED",
];
const WRITES: [&str; 3] = ["create_playlist", "add_tracks", "favorite_current"];
const CONTROLS: [&str; 7] = [
    "play", "resume", "pause", "next", "previous", "seek", "shuffle",
];

/// `musicError`: the public code of any failure.
pub fn music_error(code: &str) -> &str {
    if let Some(known) = ERRORS.iter().find(|known| **known == code) {
        return known;
    }
    match code {
        "not_authenticated" => "AUTH_REQUIRED",
        "provider_principal_changed" => "CONTEXT_CHANGED",
        "provider_cancelled" | "social_cancelled" => "CANCELLED",
        "social_authorization_expired" => "AUTHORIZATION_EXPIRED",
        "social_authorization_denied" => "PERMISSION_DENIED",
        _ => "PROVIDER_UNAVAILABLE",
    }
}

/// `validateMusicInput`: the registry's schema, and a play names an exact item or a query.
fn valid(action: &str, input: &JsonValue) -> bool {
    let Some(schema) = catalog::command("music", action).map(|command| &command["input_schema"])
    else {
        return false;
    };
    if !params::valid(schema, input) {
        return false;
    }
    let id = js::truthy(input.get("id"));
    action != "play"
        || (id != js::truthy(input.get("query")) && (!id || js::truthy(input.get("kind"))))
}

fn not_configured(action: &str, provider: &str) -> JsonValue {
    if action == "get_state" {
        return json!({ "ok": true, "provider": provider, "supported": true, "configured": false,
            "state": "not_configured", "capabilities": [] });
    }
    json!({ "ok": false, "error": "NOT_CONFIGURED" })
}

fn spread(head: JsonValue, tail: JsonValue) -> JsonValue {
    let mut out = head.as_object().cloned().unwrap_or_default();
    out.extend(tail.as_object().cloned().unwrap_or_default());
    JsonValue::Object(out)
}

/// The music services' own state: the operator's public origin and the sessions' locks.
pub struct Music {
    public_base: String,
    locks: Arc<Locks>,
}

impl Music {
    pub fn load(settings: &Settings) -> Self {
        let base = settings.get("MUSIC_PUBLIC_BASE_URL").unwrap_or_default();
        Self {
            public_base: base.trim_end_matches('/').to_string(),
            locks: Arc::default(),
        }
    }

    /// A served HTTPS origin with nothing else (`spotifyConfigured`, beside the Client ID).
    fn served(&self) -> bool {
        url::Url::parse(&self.public_base).is_ok_and(|url| {
            url.scheme() == "https"
                && url.username().is_empty()
                && url.password().is_none()
                && url.query().is_none_or(str::is_empty)
                && url.fragment().is_none_or(str::is_empty)
                && url.path() == "/"
        })
    }

    pub fn holds_credential(provider: &str) -> bool {
        provider == "spotify" || provider == "deezer"
    }

    /// The Spotify Client ID's shape, or the Deezer profile found in its catalog.
    pub async fn validate_key(provider: &str, key: &str) -> Done<()> {
        if provider == "deezer" {
            return deezer::verify(key).await;
        }
        if key.len() != 32 || !key.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("provider_key_invalid".into());
        }
        Ok(())
    }

    /// A Spotify session belongs to the application that authorized it: removing the Client ID
    /// disconnects it.
    pub async fn removed(
        &self,
        oauth: &OAuth,
        vault: &Credentials,
        principal: &str,
        provider: &str,
    ) -> Done<()> {
        if provider != "spotify" {
            return Ok(());
        }
        let session = Session {
            vault,
            client_id: String::new(),
            principal,
            locks: &self.locks,
            check: Box::new(|| Box::pin(async { Ok(()) })),
            pending: false,
            accepted: AtomicBool::new(false),
        };
        session::disconnect(oauth, &session)
            .await
            .map(|_| ())
            .map_err(|failure| failure.code.into())
    }

    /// `handleMusicAction`: a failure is told in the answer, unless the account changed meanwhile.
    pub async fn answer<L: Link>(
        &self,
        oauth: &Arc<OAuth>,
        link: &L,
        vault: &Credentials,
        principal: &str,
        action: &str,
        payload: &JsonValue,
    ) -> Done<JsonValue> {
        let name = action.strip_prefix("music.").unwrap_or(action);
        let input = payload
            .get("input")
            .filter(|input| js::truthy(Some(input)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        if !valid(name, &input) {
            return Ok(json!({ "ok": false, "error": "INVALID_ARGUMENT" }));
        }
        let idempotency = payload
            .get("idempotency_key")
            .filter(|key| js::truthy(Some(key)))
            .map(js::string);
        link.check(principal).await?;
        let check: Check =
            Box::new(move || Box::pin(async move { Ok(link.check(principal).await?) }));
        let call = Call {
            music: self,
            oauth,
            link,
            vault,
            principal,
            check,
        };
        match call
            .run(name, &input, &idempotency.unwrap_or_default())
            .await
        {
            Ok(answer) => Ok(answer),
            Err(failure) => {
                link.check(principal).await?;
                Ok(json!({ "ok": false, "error": music_error(&failure.code) }))
            }
        }
    }
}

struct Call<'a, L: Link> {
    music: &'a Music,
    oauth: &'a Arc<OAuth>,
    link: &'a L,
    vault: &'a Credentials,
    principal: &'a str,
    check: Check<'a>,
}

impl<L: Link> Call<'_, L> {
    async fn run(self, name: &str, input: &JsonValue, idempotency: &str) -> Result<JsonValue, Mf> {
        let client_id = self.vault.read("spotify").await?.unwrap_or_default();
        let deezer_profile = self.vault.read("deezer").await?.unwrap_or_default();
        (self.check)().await?;
        let provider = js::text(input.get("provider"));
        if provider == "deezer" {
            if deezer_profile.is_empty() {
                return Ok(not_configured(name, "deezer"));
            }
            return deezer::catalog(name, input, &self.check).await;
        }
        let ledger = ledger::Ledger::new(self.link, self.principal, &provider);
        if name == "operation_status" {
            let request_id = js::text(input.get("request_id"));
            let saved = ledger.read(&request_id).await?;
            if saved["properties"]["request"].get("provider") != Some(&json!(provider)) {
                return Err(Mf::new("OPERATION_NOT_FOUND"));
            }
            return Ok(ledger::receipt(&saved, &request_id));
        }
        let configured = !client_id.is_empty() && self.music.served();
        if name == "get_state" && !configured {
            return Ok(not_configured(name, "spotify"));
        }
        let session = Session {
            vault: self.vault,
            client_id: client_id.clone(),
            principal: self.principal,
            locks: &self.music.locks,
            check: self.check,
            pending: false,
            accepted: AtomicBool::new(false),
        };
        let attempt = js::text(input.get("attempt_id"));
        match name {
            "connect" => {
                if !configured {
                    return Err(Mf::new("NOT_CONFIGURED"));
                }
                (session.check)().await?;
                let started = session::connect(
                    self.oauth,
                    self.vault.clone(),
                    &client_id,
                    &self.music.public_base,
                    self.music.locks.clone(),
                    self.principal,
                )?;
                return Ok(spread(json!({ "ok": true }), started));
            }
            "await_connection" => {
                let result = self
                    .oauth
                    .wait(self.principal, &attempt, Some("spotify"))
                    .await;
                if result["ok"] == json!(true) {
                    return Ok(result);
                }
                return Ok(
                    json!({ "ok": false, "error": music_error(&js::text(result.get("error"))) }),
                );
            }
            "cancel_connection" => {
                let cancelled = self.oauth.cancel(self.principal, &attempt, Some("spotify"));
                return Ok(json!({ "ok": true, "cancelled": cancelled }));
            }
            "disconnect" => {
                return Ok(spread(
                    json!({ "ok": true }),
                    session::disconnect(self.oauth, &session).await?,
                ));
            }
            _ => {}
        }
        if !configured {
            return Err(Mf::new("NOT_CONFIGURED"));
        }
        if name == "open_item" {
            let kind = js::text(input.get("kind"));
            let path = if kind == "song" {
                "track"
            } else {
                kind.as_str()
            };
            return Ok(
                json!({ "ok": true, "url": format!("https://open.spotify.com/{path}/{}", js::text(input.get("id"))),
                "playback": "opened_unconfirmed" }),
            );
        }
        let record = match session.record().await {
            Ok(record) => record,
            Err(failure) if name == "get_state" && failure.code == "AUTHORIZATION_REQUIRED" => {
                return Ok(
                    json!({ "ok": true, "provider": "spotify", "supported": true, "configured": true,
                    "state": "disconnected", "capabilities": ["connect"] }),
                );
            }
            Err(failure) => return Err(failure),
        };
        if name == "get_state" {
            let mut head = JsonMap::new();
            for (key, value) in [
                ("ok", json!(true)),
                ("provider", json!("spotify")),
                ("supported", json!(true)),
                ("configured", json!(true)),
                ("state", json!("connected")),
            ] {
                head.insert(key.into(), value);
            }
            head.insert("capabilities".into(), json!(catalog::music_actions()));
            head.insert(
                "identity".into(),
                record.get("identity").cloned().unwrap_or(JsonValue::Null),
            );
            let state = spotify::read(&session, &record, name, &json!({})).await?;
            return Ok(spread(JsonValue::Object(head), state));
        }
        if WRITES.contains(&name) {
            return ledger::write(&ledger, &session, &record, name, input, idempotency).await;
        }
        if CONTROLS.contains(&name) {
            return spotify::control(&session, &record, name, input).await;
        }
        Ok(spread(
            json!({ "ok": true }),
            spotify::read(&session, &record, name, input).await?,
        ))
    }
}
