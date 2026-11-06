// A person's social sessions (server/social/social_sessions.js, ported): the tokens only in the
// person's vault (`social.<network>`), the public view built here, a refresh only here.
use super::net::{Sd, Se};
use super::{Config, facebook, instagram, tiktok};
use crate::providers::credentials::Credentials;
use crate::providers::generation::now_ms;
use crate::providers::oauth::{Complete, Current, OAuth};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq)]
pub enum Network {
    TikTok,
    Instagram,
    Facebook,
}

pub const NETWORKS: [Network; 3] = [Network::TikTok, Network::Instagram, Network::Facebook];

impl Network {
    pub fn of(name: &str) -> Sd<Self> {
        match name {
            "tiktok" => Ok(Self::TikTok),
            "instagram" => Ok(Self::Instagram),
            "facebook" => Ok(Self::Facebook),
            _ => Err(Se::new("social_request_invalid")),
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::TikTok => "tiktok",
            Self::Instagram => "instagram",
            Self::Facebook => "facebook",
        }
    }

    fn record(self) -> String {
        format!("social.{}", self.name())
    }

    fn adapter_configured(self, config: &Config) -> bool {
        match self {
            Self::TikTok => tiktok::configured(config),
            Self::Instagram => instagram::configured(config),
            Self::Facebook => facebook::configured(config),
        }
    }

    fn configured(self, config: &Config) -> bool {
        self.adapter_configured(config)
            && config.get("SOCIAL_PUBLIC_BASE_URL").starts_with("https://")
    }

    fn needs_refresh(self, record: &JsonValue, now: i64) -> bool {
        match self {
            Self::TikTok => tiktok::needs_refresh(record, now),
            Self::Instagram => instagram::needs_refresh(record, now),
            // No refresh grant exists for a user token: an expired session reconnects.
            Self::Facebook => false,
        }
    }

    async fn refresh(self, config: &Config, record: &JsonValue, now: i64) -> Sd<JsonValue> {
        match self {
            Self::TikTok => tiktok::refresh(config, record, now).await,
            Self::Instagram => instagram::refresh(record, now).await,
            Self::Facebook => Err(Se::new("social_session_expired")),
        }
    }

    async fn describe(self, config: &Config, record: &JsonValue) -> Sd<JsonValue> {
        match self {
            Self::TikTok => tiktok::describe(config, record).await,
            Self::Instagram => Ok(instagram::describe(config)),
            Self::Facebook => Ok(json!({})),
        }
    }
}

/// A session as one call found it: its record and state (`connected`, `expired`, `disconnected`).
pub struct Session {
    pub network: Network,
    pub record: Option<JsonValue>,
    pub state: &'static str,
    pub error: Option<String>,
}

/// `loadSocialSession`: a usable session or the reason there is none; an access token about to
/// expire is refreshed and stored here.
pub async fn load(network: Network, vault: &Credentials, config: &Config) -> Sd<Session> {
    let now = now_ms();
    let Some(mut record) = vault.read_record(&network.record()).await? else {
        return Ok(Session {
            network,
            record: None,
            state: "disconnected",
            error: None,
        });
    };
    if network.needs_refresh(&record, now) {
        match network.refresh(config, &record, now).await {
            Ok(refreshed) => {
                record = refreshed;
                vault
                    .store_record(&network.record(), record.clone())
                    .await?;
            }
            Err(failure) if failure.code == "social_session_expired" => {
                return Ok(Session {
                    network,
                    record: Some(record),
                    state: "expired",
                    error: None,
                });
            }
            Err(failure) => return Err(failure),
        }
    }
    let expires =
        js::truthy(record.get("expires_at")) && now as f64 >= js::number(record.get("expires_at"));
    let state = if expires { "expired" } else { "connected" };
    Ok(Session {
        network,
        record: Some(record),
        state,
        error: None,
    })
}

/// `describeSocialSession`: what the provider says of a connected account.
pub async fn describe(session: &mut Session, config: &Config) -> JsonValue {
    let Some(record) = session
        .record
        .as_ref()
        .filter(|_| session.state == "connected")
    else {
        return json!({});
    };
    match session.network.describe(config, record).await {
        Ok(view) => view,
        Err(failure) if failure.code == "social_session_expired" => {
            session.state = "expired";
            json!({})
        }
        Err(failure) => {
            json!({ "describe_error": if failure.code.is_empty() { "social_provider_unavailable".into() } else { failure.code } })
        }
    }
}

/// `socialAccountView`.
pub async fn account_view(network: Network, vault: &Credentials, config: &Config) -> JsonValue {
    if !network.configured(config) {
        return json!({ "network": network.name(), "configured": false, "state": "not_configured" });
    }
    let mut session = load(network, vault, config)
        .await
        .unwrap_or_else(|failure| Session {
            network,
            record: None,
            state: "disconnected",
            error: Some(if failure.code.is_empty() {
                "social_provider_unavailable".into()
            } else {
                failure.code
            }),
        });
    let extra = describe(&mut session, config).await;
    let mut view = JsonMap::new();
    view.insert("network".into(), json!(network.name()));
    view.insert("configured".into(), json!(true));
    view.insert("state".into(), json!(session.state));
    if let Some(error) = &session.error {
        view.insert("error".into(), json!(error));
    }
    let record = session.record.as_ref();
    let field = |name: &str, empty: JsonValue| {
        record
            .and_then(|r| r.get(name))
            .filter(|v| js::truthy(Some(v)))
            .cloned()
            .unwrap_or(empty)
    };
    view.insert("identity".into(), field("identity", JsonValue::Null));
    view.insert("scopes".into(), field("scopes", json!([])));
    view.insert("expires_at".into(), field("expires_at", JsonValue::Null));
    if let (Network::Facebook, Some(record)) = (network, record) {
        view.insert("pages".into(), facebook::public_pages(record));
    }
    view.extend(extra.as_object().cloned().unwrap_or_default());
    JsonValue::Object(view)
}

/// `listSocialAccounts`.
pub async fn accounts(vault: &Credentials, config: &Config) -> JsonValue {
    let views = futures_util::future::join_all(
        NETWORKS
            .iter()
            .map(|network| account_view(*network, vault, config)),
    )
    .await;
    let mut out = JsonMap::new();
    for (network, view) in NETWORKS.iter().zip(views) {
        out.insert(network.name().into(), view);
    }
    JsonValue::Object(out)
}

/// `startSocialConnection`: the network's official page, its completion sealing the session.
pub fn connect(
    oauth: &Arc<OAuth>,
    network: &str,
    principal: &str,
    vault: &Credentials,
    config: &Arc<Config>,
) -> Sd<JsonValue> {
    let network = Network::of(network)?;
    if !network.configured(config) {
        return Err(Se::new("social_not_configured"));
    }
    let (vault, settings) = (vault.clone(), config.clone());
    let complete: Complete = Box::new(move |code: String, redirect: String, _current: Current| {
        Box::pin(async move {
            let now = now_ms();
            let exchanged = match network {
                Network::TikTok => tiktok::exchange(&settings, &code, &redirect, now).await,
                Network::Instagram => instagram::exchange(&settings, &code, &redirect, now).await,
                Network::Facebook => facebook::exchange(&settings, &code, &redirect, now).await,
            };
            let stored = match exchanged {
                Ok(record) => vault
                    .store_record(&network.record(), record)
                    .await
                    .map_err(Se::from),
                Err(failure) => Err(failure),
            };
            // The callback tells only the social codes.
            stored.map_err(|failure| {
                if super::SOCIAL_ERRORS.contains(&failure.code.as_str()) {
                    failure.code
                } else {
                    "social_provider_unavailable".into()
                }
            })?;
            Ok(account_view(network, &vault, &settings).await)
        })
    });
    let authorize = |state: &str, redirect: &str| match network {
        Network::TikTok => tiktok::authorize_url(config, state, redirect),
        Network::Instagram => instagram::authorize_url(config, state, redirect),
        Network::Facebook => facebook::authorize_url(config, state, redirect),
    };
    let base = config.get("SOCIAL_PUBLIC_BASE_URL").to_string();
    oauth
        .start(principal, network.name(), &base, authorize, complete)
        .map_err(|failure| Se::new(&failure.message))
}

/// `disconnectSocialAccount`: the tokens deleted from atome in every case; the provider's
/// revocation attempted where it is documented, its outcome told.
pub async fn disconnect(network: &str, vault: &Credentials, config: &Config) -> Sd<JsonValue> {
    let network = Network::of(network)?;
    let record = vault.read_record(&network.record()).await?;
    let revocable = network != Network::Instagram;
    let mut revoked = if revocable {
        json!(false)
    } else {
        JsonValue::Null
    };
    if let Some(record) = record.filter(|_| revocable && network.adapter_configured(config)) {
        let done = match network {
            Network::TikTok => tiktok::revoke(config, &record).await,
            _ => facebook::revoke(&record).await,
        };
        revoked = json!(done.is_ok());
    }
    vault.remove_record(&network.record()).await?;
    Ok(json!({ "network": network.name(), "state": "disconnected", "provider_revoked": revoked }))
}
