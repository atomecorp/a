// A person's social sessions (server/social/social_sessions.js, ported; several accounts per
// network since R-190): the tokens only in the person's vault (`social.<network>`), the public
// view built here, a refresh only here.
use super::accounts;
use super::linked::Entry;
use super::net::{self, Sd, Se};
use super::network::{NETWORKS, Network};
use super::ops::Env;
use super::{Config, bluesky_auth, discord, facebook, kept, mastodon, telegram};
use crate::providers::credentials::Credentials;
use crate::providers::generation::now_ms;
use crate::providers::oauth::{self, Complete, Current, OAuth};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

/// An account as one call found it: its record and state (`connected`, `expired`, `disabled`,
/// `disconnected`).
pub struct Session {
    pub network: Network,
    pub account: String,
    pub record: Option<JsonValue>,
    pub state: &'static str,
    pub error: Option<String>,
}

fn state_of(account: &JsonValue, now: i64) -> &'static str {
    if !accounts::enabled(account) {
        return "disabled";
    }
    let expires = js::truthy(account.get("expires_at"))
        && now as f64 >= js::number(account.get("expires_at"));
    if expires { "expired" } else { "connected" }
}

/// The account refreshed when its token is about to expire, the refresh stored.
async fn settled(
    network: Network,
    account: JsonValue,
    vault: &Credentials,
    config: &Config,
) -> Sd<Session> {
    let now = now_ms();
    let id = net::text(account.get("account"));
    let mut account = account;
    if accounts::enabled(&account) && network.needs_refresh(&account, now) {
        match network.refresh(config, &account, now).await {
            Ok(refreshed) => {
                let fresh = refreshed.as_object().cloned().unwrap_or_default();
                let stored = fresh.clone();
                accounts::update(vault, network, &id, move |known| {
                    if let Some(known) = known.as_object_mut() {
                        known.extend(stored);
                    }
                })
                .await?;
                if let Some(known) = account.as_object_mut() {
                    known.extend(fresh);
                }
            }
            Err(failure) if failure.code == "social_session_expired" => {
                return Ok(Session {
                    network,
                    account: id,
                    record: Some(account),
                    state: "expired",
                    error: None,
                });
            }
            Err(failure) => return Err(failure),
        }
    }
    Ok(Session {
        network,
        state: state_of(&account, now),
        account: id,
        record: Some(account),
        error: None,
    })
}

/// `loadSocialSession`: the account `wanted` names (else the first enabled one), usable or the
/// reason it is not.
pub async fn load(
    network: Network,
    wanted: Option<&str>,
    vault: &Credentials,
    config: &Config,
) -> Sd<Session> {
    let record = vault.read_record(&network.record()).await?;
    let all = accounts::list(network, record.as_ref());
    match accounts::pick(&all, wanted) {
        Some(account) => settled(network, account, vault, config).await,
        None if wanted.is_some() => Err(Se::new("social_account_not_found")),
        None => Ok(Session {
            network,
            account: String::new(),
            record: None,
            state: "disconnected",
            error: None,
        }),
    }
}

/// The Facebook account administering `page`.
pub async fn page_session(page: &str, env: &Env) -> Sd<Session> {
    let record = env.vault.read_record(&Network::Facebook.record()).await?;
    let holder = accounts::list(Network::Facebook, record.as_ref())
        .into_iter()
        .find(|account| facebook::page_of(account, page).is_ok())
        .ok_or_else(|| Se::new("social_destination_invalid"))?;
    let session = settled(Network::Facebook, holder, &env.vault, &env.config).await?;
    connected_only(session)
}

/// The session when it may act, else why it may not.
pub fn connected_only(session: Session) -> Sd<Session> {
    match session.state {
        "connected" => Ok(session),
        "expired" => Err(Se::new("social_session_expired")),
        _ => Err(Se::new("social_not_connected")),
    }
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

/// An account's public view: never a token.
async fn account_view(mut session: Session, config: &Config) -> JsonValue {
    let extra = describe(&mut session, config).await;
    let record = session.record.clone().unwrap_or_else(|| json!({}));
    let field = |name: &str, empty: JsonValue| {
        record
            .get(name)
            .filter(|v| js::truthy(Some(v)))
            .cloned()
            .unwrap_or(empty)
    };
    let mut view = JsonMap::new();
    view.insert("account".into(), json!(session.account));
    view.insert("label".into(), json!(accounts::label(&record)));
    view.insert("identity".into(), field("identity", JsonValue::Null));
    view.insert("state".into(), json!(session.state));
    view.insert("scopes".into(), field("scopes", json!([])));
    view.insert("expires_at".into(), field("expires_at", JsonValue::Null));
    if let Some(error) = &session.error {
        view.insert("error".into(), json!(error));
    }
    match session.network {
        Network::Facebook => {
            view.insert("pages".into(), facebook::public_pages(&record));
        }
        Network::Mastodon => {
            view.insert("host".into(), field("host", JsonValue::Null));
        }
        Network::Discord => {
            view.insert("reads".into(), json!(discord::reads(&record)));
        }
        _ => {}
    }
    view.extend(extra.as_object().cloned().unwrap_or_default());
    JsonValue::Object(view)
}

/// One network's view: whether the operator made it available, and its accounts.
pub async fn network_view(network: Network, vault: &Credentials, config: &Config) -> JsonValue {
    if !network.configured(config) {
        return json!({ "network": network.name(), "configured": false, "accounts": [] });
    }
    let record = vault.read_record(&network.record()).await;
    let all = match record {
        Ok(record) => accounts::list(network, record.as_ref()),
        Err(code) => {
            return json!({ "network": network.name(), "configured": true, "accounts": [], "error": code });
        }
    };
    let views = futures_util::future::join_all(all.into_iter().map(|account| async move {
        let id = net::text(account.get("account"));
        let session = settled(network, account.clone(), vault, config)
            .await
            .unwrap_or_else(|failure| Session {
                network,
                account: id,
                record: Some(account),
                state: "connected",
                error: Some(if failure.code.is_empty() {
                    "social_provider_unavailable".into()
                } else {
                    failure.code
                }),
            });
        account_view(session, config).await
    }))
    .await;
    json!({ "network": network.name(), "configured": true, "accounts": views })
}

/// `listSocialAccounts`: `{ networks: [{ network, configured, accounts }] }`'s list.
pub async fn accounts(vault: &Credentials, config: &Config) -> JsonValue {
    let views = futures_util::future::join_all(
        NETWORKS
            .iter()
            .map(|network| network_view(*network, vault, config)),
    )
    .await;
    JsonValue::Array(views)
}

/// The account view of the account `id` once stored.
async fn view_of(network: Network, id: &str, env: &Env) -> Sd<JsonValue> {
    let session = load(network, Some(id), &env.vault, &env.config).await?;
    Ok(account_view(session, &env.config).await)
}

/// The account stored (a new one added, a known one replaced), the linked accounts told.
pub async fn store_account(network: Network, account: JsonValue, env: &Env) -> Sd<JsonValue> {
    let id = accounts::id_of(network, &account);
    if !accounts::shaped(&id) {
        return Err(Se::new("social_provider_rejected"));
    }
    accounts::change(&env.vault, network, |all| {
        let record =
            accounts::with_account(network, Some(&accounts::record_of(network, all)), account);
        Ok((accounts::list(network, Some(&record)), ()))
    })
    .await?;
    relink(env).await?;
    view_of(network, &id, env).await
}

/// The webhooks' and the polling's view of the person: every enabled account, its remote ids.
pub async fn relink(env: &Env) -> Sd<()> {
    let mut entries = Vec::new();
    for network in NETWORKS {
        let record = env.vault.read_record(&network.record()).await?;
        for account in accounts::list(network, record.as_ref()) {
            if !accounts::enabled(&account) {
                continue;
            }
            let mut remote_ids = vec![net::text(account.pointer("/identity/id"))];
            if network == Network::Facebook {
                let pages = account.get("pages").and_then(JsonValue::as_array);
                remote_ids.extend(pages.into_iter().flatten().map(|p| net::text(p.get("id"))));
            }
            remote_ids.retain(|id| !id.is_empty());
            let polled =
                network.polled() && (network != Network::Discord || discord::reads(&account));
            entries.push(Entry {
                network: network.name().into(),
                account: net::text(account.get("account")),
                remote_ids,
                polled,
            });
        }
    }
    env.linked
        .set(&env.principal, &env.vault.social_root(), entries)
        .await
}

fn completion(network: Network, env: &Env, exchange: Exchange) -> Complete {
    let env = env.clone();
    Box::new(move |code: String, redirect: String, _current: Current| {
        Box::pin(async move {
            let stored = match exchange(code, redirect).await {
                Ok(account) => store_account(network, account, &env).await,
                Err(failure) => Err(failure),
            };
            // The callback tells only the social codes.
            stored.map_err(|failure| {
                if super::SOCIAL_ERRORS.contains(&failure.code.as_str()) {
                    failure.code
                } else {
                    "social_provider_unavailable".into()
                }
            })
        })
    })
}

type Exchange = Box<
    dyn FnOnce(String, String) -> futures_util::future::BoxFuture<'static, Sd<JsonValue>> + Send,
>;

/// `startSocialConnection`: the network's official page, its completion sealing the account.
/// Mastodon registers atome on the person's instance first; Bluesky resolves the person's
/// handle to their server and pushes the request there (atproto OAuth).
pub async fn connect(oauth: &Arc<OAuth>, payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let network = Network::of(&net::text(payload.get("network")))?;
    let config = env.config.clone();
    if network.entered() {
        return Err(Se::new("social_request_invalid"));
    }
    if !network.configured(&config) {
        return Err(Se::new("social_not_configured"));
    }
    let base = config.get("SOCIAL_PUBLIC_BASE_URL").to_string();
    let principal = env.principal.clone();
    let started = match network {
        Network::Mastodon => {
            let redirect = oauth::redirect_uri(&base, network.name()).map_err(Se::from)?;
            let app =
                mastodon::register(&config, &net::text(payload.get("instance")), &redirect).await?;
            let (settings, registered) = (config.clone(), app.clone());
            let exchange: Exchange = Box::new(move |code, redirect| {
                Box::pin(async move {
                    mastodon::exchange(&settings, &registered, &code, &redirect, now_ms()).await
                })
            });
            let complete = completion(network, env, exchange);
            let authorize =
                |state: &str, redirect: &str| mastodon::authorize_url(&app, state, redirect);
            oauth.start(&principal, network.name(), &base, authorize, complete)
        }
        Network::Bluesky => {
            let server = bluesky_auth::discover(&config, &net::text(payload.get("handle"))).await?;
            let flow = bluesky_auth::Flow::new(&config, server)?;
            let (settings, finishing) = (config.clone(), flow.clone());
            let exchange: Exchange = Box::new(move |code, redirect| {
                Box::pin(async move {
                    finishing
                        .exchange(&settings, &code, &redirect, now_ms())
                        .await
                })
            });
            let complete = completion(network, env, exchange);
            let pushed = config.clone();
            let authorize = move |state: String,
                                  redirect: String|
                  -> futures_util::future::BoxFuture<
                'static,
                Result<String, String>,
            > {
                Box::pin(async move {
                    flow.authorize(&pushed, &state, &redirect)
                        .await
                        .map_err(|failure| failure.code)
                })
            };
            oauth
                .start_pushed(&principal, network.name(), &base, authorize, complete)
                .await
        }
        _ => {
            let settings = config.clone();
            let exchange: Exchange = Box::new(move |code, redirect| {
                Box::pin(async move {
                    network
                        .exchange(&settings, &code, &redirect, now_ms())
                        .await
                })
            });
            let complete = completion(network, env, exchange);
            let url = |state: &str, redirect: &str| {
                network
                    .authorize_url(&config, state, redirect)
                    .unwrap_or_default()
            };
            oauth.start(&principal, network.name(), &base, url, complete)
        }
    };
    started.map_err(|failure| Se::new(&failure.message))
}

/// `social.credentials.save`: a Telegram bot and its channel, a Discord channel's webhook (and
/// the bot that reads it), checked with the network then kept in the vault.
pub async fn credentials(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let network = Network::of(&net::text(payload.get("network")))?;
    let fields = payload
        .get("fields")
        .filter(|f| f.is_object())
        .ok_or_else(|| Se::new("social_request_invalid"))?;
    let now = now_ms();
    let account = match network {
        Network::Telegram => telegram::connect(&env.config, fields, now).await?,
        Network::Discord => discord::connect(&env.config, fields, now).await?,
        _ => return Err(Se::new("social_request_invalid")),
    };
    store_account(network, account, env).await
}

/// `social.account.enable`: an account set aside without erasing it, or taken back.
pub async fn enable(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let network = Network::of(&net::text(payload.get("network")))?;
    let id = net::text(payload.get("account"));
    let Some(enabled) = payload.get("enabled").and_then(JsonValue::as_bool) else {
        return Err(Se::new("social_request_invalid"));
    };
    accounts::update(&env.vault, network, &id, |account| {
        account["enabled"] = json!(enabled);
    })
    .await?;
    relink(env).await?;
    view_of(network, &id, env).await
}

/// `disconnectSocialAccount`: the account's tokens (every account of the network when none is
/// named) and its kept conversations deleted from atome in every case; the provider's
/// revocation attempted where it is documented, its outcome told.
pub async fn disconnect(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let network = Network::of(&net::text(payload.get("network")))?;
    let only = net::text(payload.get("account"));
    let removed = accounts::change(&env.vault, network, |all| {
        let (gone, kept): (Vec<JsonValue>, Vec<JsonValue>) = all
            .into_iter()
            .partition(|a| only.is_empty() || net::text(a.get("account")) == only);
        if gone.is_empty() && !only.is_empty() {
            return Err(Se::new("social_account_not_found"));
        }
        Ok((kept, gone))
    })
    .await?;
    let mut told = Vec::new();
    for account in &removed {
        let revoked = if network.adapter_configured(&env.config) {
            network.revoke(&env.config, account).await
        } else {
            None
        };
        let id = net::text(account.get("account"));
        kept::erase(&env.vault.social_root(), network.name(), &id).await?;
        told.push(json!({ "account": id, "provider_revoked": revoked.map(|done| done.is_ok()) }));
    }
    relink(env).await?;
    Ok(json!({ "network": network.name(), "state": "disconnected", "accounts": told }))
}
