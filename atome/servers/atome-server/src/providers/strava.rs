// Strava (server/strava/strava_operations.js and strava_session.js, atome/src/squirrel/strava/contracts.js,
// ported; register R-016 lot F). The atome application is registered at Strava by the operator:
// its Client ID and Secret are the server's configuration (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`;
// in development also `Private/strava.env`), the public origin the consents' (`SOCIAL_PUBLIC_BASE_URL`).
// The tokens live only in the person's vault (`health.strava`); the device gets the public view and
// the activities as atome keeps them (`strava.activities`, #shared/activity_import_contract.js),
// which it writes through the one mutation pipeline. Every Strava URL is built here, and a Strava
// message is never passed on (it may quote a token).
use super::credentials::{Credentials, Locks};
use super::generation::now_ms;
use super::http::{self, Done, Failure};
use super::oauth::{self, Complete, Current, OAuth};
use super::{Link, catalog, params};
use crate::vault_router::js;
use futures_util::future::BoxFuture;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

const RECORD: &str = "health.strava";
const TOKEN_URL: &str = "https://www.strava.com/oauth/token";
// The scopes asked: the profile's name, and every activity the person can see, « Only You » included.
const SCOPES: [&str; 2] = ["read", "activity:read_all"];
// The days read back when none is said.
const IMPORT_DAYS: f64 = 30.0;
// Strava's largest page, and a year of daily activities and more.
const PAGE: usize = 200;
const PAGES: usize = 8;
const ACTIONS: [&str; 6] = [
    "get_state",
    "connect",
    "await_connection",
    "cancel_connection",
    "disconnect",
    "activities",
];
const ERRORS: [&str; 13] = [
    "INVALID_ARGUMENT",
    "AUTH_REQUIRED",
    "CONTEXT_CHANGED",
    "NOT_CONFIGURED",
    "AUTHORIZATION_REQUIRED",
    "PERMISSION_DENIED",
    "AUTHORIZATION_EXPIRED",
    "CANCELLED",
    "USER_GESTURE_REQUIRED",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_REJECTED",
    "RATE_LIMITED",
    "IMPORT_WRITE_FAILED",
];

/// `stravaError`.
fn strava_error(code: &str) -> &str {
    if let Some(known) = ERRORS.iter().find(|known| **known == code) {
        return known;
    }
    match code {
        "not_authenticated" => "AUTH_REQUIRED",
        "provider_principal_changed" => "CONTEXT_CHANGED",
        "provider_cancelled" | "social_cancelled" => "CANCELLED",
        "social_authorization_expired" => "AUTHORIZATION_EXPIRED",
        "social_authorization_denied" => "PERMISSION_DENIED",
        "social_not_configured" => "NOT_CONFIGURED",
        _ => "PROVIDER_UNAVAILABLE",
    }
}

type Check<'a> = Box<dyn Fn() -> BoxFuture<'a, Done<()>> + Send + Sync + 'a>;

#[derive(Clone)]
struct Config {
    client_id: String,
    client_secret: String,
    public_base: String,
}

impl Config {
    fn configured(&self) -> bool {
        let id = (1..=12).contains(&self.client_id.len())
            && self.client_id.bytes().all(|c| c.is_ascii_digit());
        let secret = (8..=200).contains(&self.client_secret.chars().count())
            && !self.client_secret.chars().any(char::is_whitespace);
        id && secret
            && url::Url::parse(&self.public_base).is_ok_and(|url| {
                url.scheme() == "https"
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.query().is_none_or(str::is_empty)
                    && url.fragment().is_none_or(str::is_empty)
                    && url.path() == "/"
            })
    }

    async fn form(&self, fields: &[(&str, &str)]) -> Done<JsonValue> {
        let mut pairs = vec![
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.as_str()),
        ];
        pairs.extend_from_slice(fields);
        fetch(
            http::client()
                .post(TOKEN_URL)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(http::form(&pairs)),
        )
        .await
    }
}

/// `stravaFetch`: a refused or lost answer as a Strava code.
async fn fetch(request: reqwest::RequestBuilder) -> Done<JsonValue> {
    let response = http::send(request)
        .await
        .map_err(|_| Failure::from("PROVIDER_UNAVAILABLE"))?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(match status {
            401 => "AUTHORIZATION_REQUIRED",
            403 => "PERMISSION_DENIED",
            429 => "RATE_LIMITED",
            500.. => "PROVIDER_UNAVAILABLE",
            _ => "PROVIDER_REJECTED",
        }
        .into());
    }
    if status == 204 {
        return Ok(JsonValue::Null);
    }
    let bytes = http::bytes(response, usize::MAX)
        .await
        .map_err(|_| Failure::from("PROVIDER_UNAVAILABLE"))?;
    serde_json::from_slice(&bytes).map_err(|_| "PROVIDER_UNAVAILABLE".into())
}

/// `tokenRecord`: Strava answers `expires_at` in seconds and a new refresh token every time.
fn token_record(token: &JsonValue, previous: &JsonValue) -> Done<JsonValue> {
    let bearer = token
        .get("token_type")
        .filter(|t| js::truthy(Some(t)))
        .map(js::string)
        .unwrap_or_default();
    let expires_at = js::number(token.get("expires_at"));
    if !js::truthy(token.get("access_token"))
        || !js::truthy(token.get("refresh_token"))
        || bearer.to_lowercase() != "bearer"
        || expires_at.is_nan()
        || expires_at <= 0.0
    {
        return Err("PROVIDER_REJECTED".into());
    }
    let mut record = previous.as_object().cloned().unwrap_or_default();
    let kept = |field: &str| {
        previous
            .get(field)
            .filter(|value| js::truthy(Some(value)))
            .cloned()
    };
    record.insert("access_token".into(), token["access_token"].clone());
    record.insert("refresh_token".into(), token["refresh_token"].clone());
    record.insert("expires_at".into(), js::number_json(expires_at * 1000.0));
    record.insert(
        "authorization_id".into(),
        kept("authorization_id").unwrap_or_else(|| json!(oauth::hex(16))),
    );
    record.insert(
        "authorized_at".into(),
        kept("authorized_at").unwrap_or_else(|| json!(now_ms())),
    );
    let scopes = match token.get("scope") {
        Some(JsonValue::String(scope)) => {
            json!(
                scope
                    .split(|c: char| c.is_whitespace() || c == ',')
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
            )
        }
        _ => kept("scopes").unwrap_or_else(|| json!([])),
    };
    record.insert("scopes".into(), scopes);
    Ok(JsonValue::Object(record))
}

fn public_state(record: Option<&JsonValue>) -> JsonValue {
    let mut state = JsonMap::new();
    state.insert(
        "state".into(),
        json!(if record.is_some() {
            "connected"
        } else {
            "disconnected"
        }),
    );
    if let Some(identity) = record
        .and_then(|record| record.get("identity"))
        .filter(|i| js::truthy(Some(i)))
    {
        state.insert("identity".into(), identity.clone());
    }
    JsonValue::Object(state)
}

fn spread(head: JsonValue, tail: JsonValue) -> JsonValue {
    let mut out = head.as_object().cloned().unwrap_or_default();
    out.extend(tail.as_object().cloned().unwrap_or_default());
    JsonValue::Object(out)
}

/// `stravaActivity`: a Strava activity summary as atome keeps it, none when it is not one.
fn activity(item: &JsonValue) -> Option<JsonValue> {
    let id = item
        .get("id")
        .filter(|id| !id.is_null())
        .map(js::string)
        .unwrap_or_default();
    let start = item
        .get("start_date")
        .filter(|date| date.is_string())
        .and_then(|date| js::date(Some(date)))?;
    let elapsed = js::number(item.get("elapsed_time"));
    let sport = js::first(item, &["sport_type", "type"])
        .map(js::string)
        .unwrap_or_default();
    let shaped = (1..=20).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_digit());
    if !shaped
        || elapsed.is_nan()
        || elapsed < 0.0
        || !(1..=40).contains(&sport.len())
        || !sport.bytes().all(|c| c.is_ascii_alphabetic())
    {
        return None;
    }
    let mut out = JsonMap::new();
    out.insert("source_id".into(), json!(id));
    out.insert("sport".into(), json!(sport));
    out.insert("start".into(), json!(js::iso(start)));
    out.insert(
        "end".into(),
        json!(js::iso((start as f64 + elapsed * 1000.0).trunc() as i64)),
    );
    let mut measures = vec![
        ("moving_s", "moving_time"),
        ("distance_m", "distance"),
        ("elevation_m", "total_elevation_gain"),
    ];
    if item.get("has_heartrate") == Some(&json!(true)) {
        measures.extend([
            ("heart_avg", "average_heartrate"),
            ("heart_max", "max_heartrate"),
        ]);
    }
    for (name, field) in measures {
        if let Some(value) = item
            .get(field)
            .filter(|v| v.as_f64().is_some_and(|n| n.is_finite() && n >= 0.0))
        {
            out.insert(name.into(), value.clone());
        }
    }
    Some(JsonValue::Object(out))
}

/// The person's Strava session as one call sees it.
struct Session<'a> {
    config: &'a Config,
    vault: &'a Credentials,
    principal: &'a str,
    locks: &'a Locks,
    check: Check<'a>,
}

impl Session<'_> {
    /// `stravaSession`: a usable session, refreshed when its access token ends within the minute.
    async fn record(&self) -> Done<JsonValue> {
        (self.check)().await?;
        let usable = |record: &JsonValue| {
            (now_ms() as f64) < js::number(record.get("expires_at")) - 60_000.0
        };
        let Some(record) = self.vault.read_record(RECORD).await? else {
            return Err("AUTHORIZATION_REQUIRED".into());
        };
        (self.check)().await?;
        if usable(&record) {
            return Ok(record);
        }
        let _refreshing = self.locks.refreshing(self.principal).await;
        // Another call may have refreshed it meanwhile.
        let Some(record) = self.vault.read_record(RECORD).await? else {
            return Err("AUTHORIZATION_REQUIRED".into());
        };
        (self.check)().await?;
        if usable(&record) {
            return Ok(record);
        }
        let refresh = js::text(record.get("refresh_token"));
        let answered = self
            .config
            .form(&[("grant_type", "refresh_token"), ("refresh_token", &refresh)])
            .await;
        let updated = answered
            .and_then(|token| token_record(&token, &record))
            .map_err(|failure| {
                let lost = ["PROVIDER_REJECTED", "AUTHORIZATION_REQUIRED"]
                    .contains(&failure.message.as_str());
                if lost {
                    "AUTHORIZATION_REQUIRED".into()
                } else {
                    failure
                }
            })?;
        let _writing = self.locks.writing(self.principal).await;
        (self.check)().await?;
        let current = self.vault.read_record(RECORD).await?;
        (self.check)().await?;
        if current.as_ref().and_then(|c| c.get("authorization_id"))
            != record.get("authorization_id")
        {
            return Err("CONTEXT_CHANGED".into());
        }
        self.vault.store_record(RECORD, updated.clone()).await?;
        Ok(updated)
    }

    async fn activities(&self, record: &JsonValue, days: f64) -> Done<Vec<JsonValue>> {
        let after = ((now_ms() as f64 - days * 86_400_000.0) / 1000.0).floor();
        let mut found = Vec::new();
        for page in 1..=PAGES {
            (self.check)().await?;
            let pairs = [
                ("after", js::string(&js::number_json(after))),
                ("page", page.to_string()),
                ("per_page", PAGE.to_string()),
            ];
            let url = format!(
                "https://www.strava.com/api/v3/athlete/activities?{}",
                http::form(&pairs)
            );
            let bearer = format!("Bearer {}", js::text(record.get("access_token")));
            let list = fetch(http::client().get(url).header("Authorization", bearer)).await?;
            let Some(list) = list.as_array() else {
                return Err("PROVIDER_REJECTED".into());
            };
            found.extend(list.iter().filter_map(activity));
            if list.len() < PAGE {
                break;
            }
        }
        (self.check)().await?;
        Ok(found)
    }
}

/// The authorization's own end: the code exchanged, the activities' scope granted, the athlete read.
async fn authorized(session: &Session<'_>, code: &str) -> Done<JsonValue> {
    let token = session
        .config
        .form(&[("grant_type", "authorization_code"), ("code", code)])
        .await?;
    let mut record = token_record(&token, &json!({}))?;
    (session.check)().await?;
    // Unticked on Strava's page, the activities cannot be read: nothing is kept.
    let scopes = record["scopes"].as_array().cloned().unwrap_or_default();
    if !scopes
        .iter()
        .any(|scope| scope == "activity:read" || scope == "activity:read_all")
    {
        return Err("PERMISSION_DENIED".into());
    }
    let athlete = token
        .get("athlete")
        .filter(|a| js::truthy(Some(a)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let id = athlete
        .get("id")
        .filter(|id| !id.is_null())
        .map(js::string)
        .unwrap_or_default();
    if !(1..=20).contains(&id.len()) || !id.bytes().all(|c| c.is_ascii_digit()) {
        return Err("PROVIDER_REJECTED".into());
    }
    let name: Vec<String> = ["firstname", "lastname"]
        .iter()
        .map(|part| {
            athlete
                .get(*part)
                .filter(|p| js::truthy(Some(p)))
                .map(js::string)
                .unwrap_or_default()
                .trim()
                .to_string()
        })
        .filter(|part| !part.is_empty())
        .collect();
    record["identity"] = json!({ "id": id, "name": name.join(" ") });
    let _writing = session.locks.writing(session.principal).await;
    (session.check)().await?;
    session.vault.store_record(RECORD, record.clone()).await?;
    (session.check)().await?;
    Ok(public_state(Some(&record)))
}

/// Strava's application configuration, read once (an unreadable development file fails each call).
pub struct Strava {
    config: Result<Config, String>,
    locks: Arc<Locks>,
}

impl Strava {
    /// `readStravaConfig`, over the consents' configuration `social` (its public origin).
    pub fn load(
        settings: &crate::settings::Settings,
        project_root: &std::path::Path,
        social: &super::social::Config,
    ) -> Self {
        let keys = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"];
        let config = settings
            .secret_file(
                project_root,
                "ATOME_STRAVA_ENV_FILE",
                "strava.env",
                &keys,
                "strava_secret_file",
            )
            .map(|file| {
                let value = |name: &str| {
                    settings
                        .value(name)
                        .or_else(|| file.get(name).cloned())
                        .unwrap_or_default()
                        .trim()
                        .to_string()
                };
                let base = social.get("SOCIAL_PUBLIC_BASE_URL");
                Config {
                    client_id: value(keys[0]),
                    client_secret: value(keys[1]),
                    public_base: base.trim().trim_end_matches('/').to_string(),
                }
            });
        Self {
            config,
            locks: Arc::default(),
        }
    }

    /// `handleStravaAction`: a failure is told in the answer, unless the account changed meanwhile.
    pub async fn answer<L: Link>(
        &self,
        oauth: &Arc<OAuth>,
        link: &L,
        vault: &Credentials,
        principal: &str,
        action: &str,
        payload: &JsonValue,
    ) -> Done<JsonValue> {
        let name = action.strip_prefix("strava.").unwrap_or(action);
        let input = payload
            .get("input")
            .filter(|input| js::truthy(Some(input)))
            .cloned()
            .unwrap_or_else(|| json!({}));
        let contract = if name == "activities" { "import" } else { name };
        let valid = catalog::command("strava", contract)
            .is_some_and(|command| params::valid(&command["input_schema"], &input));
        if !ACTIONS.contains(&name) || !valid {
            return Ok(json!({ "ok": false, "error": "INVALID_ARGUMENT" }));
        }
        match self.run(oauth, link, vault, principal, name, &input).await {
            Ok(answer) => Ok(answer),
            Err(failure) => {
                link.check(principal).await?;
                Ok(json!({ "ok": false, "error": strava_error(&failure.message) }))
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn run<L: Link>(
        &self,
        oauth: &Arc<OAuth>,
        link: &L,
        vault: &Credentials,
        principal: &str,
        name: &str,
        input: &JsonValue,
    ) -> Done<JsonValue> {
        link.check(principal).await?;
        let config = self
            .config
            .as_ref()
            .map_err(|failure| Failure::from(failure.as_str()))?;
        let configured = config.configured();
        let check: Check = Box::new(move || Box::pin(link.check(principal)));
        let session = Session {
            config,
            vault,
            principal,
            locks: &self.locks,
            check,
        };
        let attempt = js::text(input.get("attempt_id"));
        match name {
            "get_state" => {
                if !configured {
                    return Ok(
                        json!({ "ok": true, "configured": false, "state": "not_configured" }),
                    );
                }
                let record = vault.read_record(RECORD).await?;
                (session.check)().await?;
                Ok(spread(
                    json!({ "ok": true, "configured": true }),
                    public_state(record.as_ref()),
                ))
            }
            "connect" => {
                if !configured {
                    return Err("NOT_CONFIGURED".into());
                }
                (session.check)().await?;
                Ok(spread(
                    json!({ "ok": true }),
                    self.connect(oauth, config, vault, principal)?,
                ))
            }
            "await_connection" => {
                let result = oauth.wait(principal, &attempt, Some("strava")).await;
                if result["ok"] == json!(true) {
                    return Ok(spread(
                        json!({ "ok": true, "configured": true }),
                        result["account"].clone(),
                    ));
                }
                Ok(json!({ "ok": false, "error": strava_error(&js::text(result.get("error"))) }))
            }
            "cancel_connection" => Ok(
                json!({ "ok": true, "cancelled": oauth.cancel(principal, &attempt, Some("strava")) }),
            ),
            "disconnect" => Ok(spread(
                json!({ "ok": true }),
                self.disconnect(oauth, &session, configured).await?,
            )),
            _ => {
                if !configured {
                    return Err("NOT_CONFIGURED".into());
                }
                let record = session.record().await?;
                let days = input
                    .get("days")
                    .filter(|days| !days.is_null())
                    .map_or(IMPORT_DAYS, |days| js::number(Some(days)));
                Ok(json!({ "ok": true, "activities": session.activities(&record, days).await? }))
            }
        }
    }

    /// `startStravaConnection`: Strava's own page, its completion sealing the session.
    fn connect(
        &self,
        oauth: &Arc<OAuth>,
        config: &Config,
        vault: &Credentials,
        principal: &str,
    ) -> Done<JsonValue> {
        let (config_owned, vault, locks, owner) = (
            config.clone(),
            vault.clone(),
            self.locks.clone(),
            principal.to_string(),
        );
        let complete: Complete =
            Box::new(move |code: String, _redirect: String, current: Current| {
                Box::pin(async move {
                    let check: Check = Box::new(move || {
                        let current = current.clone();
                        Box::pin(async move {
                            if current() {
                                Ok(())
                            } else {
                                Err(Failure::from("social_cancelled"))
                            }
                        })
                    });
                    let session = Session {
                        config: &config_owned,
                        vault: &vault,
                        principal: &owner,
                        locks: &locks,
                        check,
                    };
                    let ended = tokio::time::timeout(
                        std::time::Duration::from_secs(20),
                        authorized(&session, &code),
                    )
                    .await
                    .unwrap_or_else(|_| Err("PROVIDER_UNAVAILABLE".into()));
                    // The shared callback tells only its typed codes.
                    ended.map_err(|failure| match failure.message.as_str() {
                        "social_cancelled" => failure.message,
                        code => strava_error(code).to_string(),
                    })
                })
            });
        let authorize = |state: &str, redirect: &str| {
            let pairs = [
                ("client_id", config.client_id.as_str()),
                ("redirect_uri", redirect),
                ("response_type", "code"),
                ("approval_prompt", "auto"),
                ("scope", &SCOPES.join(",")),
                ("state", state),
            ];
            format!(
                "https://www.strava.com/oauth/authorize?{}",
                http::form(&pairs)
            )
        };
        oauth.start(
            principal,
            "strava",
            &config.public_base,
            authorize,
            complete,
        )
    }

    /// `disconnectStrava`: the tokens removed from atome in every case; Strava's revocation asked
    /// and its outcome said, never assumed.
    async fn disconnect(
        &self,
        oauth: &OAuth,
        session: &Session<'_>,
        configured: bool,
    ) -> Done<JsonValue> {
        (session.check)().await?;
        oauth.cancel(session.principal, "", Some("strava"));
        let record = session.vault.read_record(RECORD).await?;
        (session.check)().await?;
        let mut revoked = false;
        if let Some(record) = record.filter(|_| configured) {
            use base64::Engine;
            let config = session.config;
            let basic = base64::engine::general_purpose::STANDARD
                .encode(format!("{}:{}", config.client_id, config.client_secret));
            let body = http::form(&[
                ("token", js::text(record.get("refresh_token"))),
                ("token_type_hint", "refresh_token".into()),
            ]);
            let request = http::client()
                .post("https://www.strava.com/oauth/revoke")
                .header("Authorization", format!("Basic {basic}"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(body);
            revoked = fetch(request).await.is_ok();
        }
        {
            let _writing = session.locks.writing(session.principal).await;
            (session.check)().await?;
            session.vault.remove_record(RECORD).await?;
        }
        (session.check)().await?;
        Ok(json!({ "state": "disconnected", "provider_revoked": revoked }))
    }
}
