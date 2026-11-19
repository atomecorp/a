// The networks atome publishes to and listens on (`SOCIAL_NETWORKS`,
// atome/src/squirrel/social/contracts.js, R-190 §5 bis), and what each adapter does for them:
// one match per capability, each adapter in its own file.
use super::inbox::Polled;
use super::net::{Sd, Se};
use super::reply::Out;
use super::{
    Config, Ctx, bluesky, discord, facebook, instagram, linkedin, mastodon, telegram, threads,
    tiktok, youtube,
};
use serde_json::{Value as JsonValue, json};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash)]
pub enum Network {
    TikTok,
    Instagram,
    Facebook,
    Threads,
    YouTube,
    LinkedIn,
    Bluesky,
    Mastodon,
    Telegram,
    Discord,
}

pub const NETWORKS: [Network; 10] = [
    Network::TikTok,
    Network::Instagram,
    Network::Facebook,
    Network::Threads,
    Network::YouTube,
    Network::LinkedIn,
    Network::Bluesky,
    Network::Mastodon,
    Network::Telegram,
    Network::Discord,
];

impl Network {
    pub fn of(name: &str) -> Sd<Self> {
        NETWORKS
            .iter()
            .copied()
            .find(|network| network.name() == name)
            .ok_or_else(|| Se::new("social_request_invalid"))
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::TikTok => "tiktok",
            Self::Instagram => "instagram",
            Self::Facebook => "facebook",
            Self::Threads => "threads",
            Self::YouTube => "youtube",
            Self::LinkedIn => "linkedin",
            Self::Bluesky => "bluesky",
            Self::Mastodon => "mastodon",
            Self::Telegram => "telegram",
            Self::Discord => "discord",
        }
    }

    pub fn record(self) -> String {
        format!("social.{}", self.name())
    }

    /// Connected by a token the person enters once (a bot, a webhook), not by a consent page.
    pub fn entered(self) -> bool {
        matches!(self, Self::Telegram | Self::Discord)
    }

    pub fn polled(self) -> bool {
        matches!(
            self,
            Self::YouTube
                | Self::LinkedIn
                | Self::Bluesky
                | Self::Mastodon
                | Self::Telegram
                | Self::Discord
        )
    }

    pub fn adapter_configured(self, config: &Config) -> bool {
        match self {
            Self::TikTok => tiktok::configured(config),
            Self::Instagram => instagram::configured(config),
            Self::Facebook => facebook::configured(config),
            Self::Threads => threads::configured(config),
            Self::YouTube => youtube::configured(config),
            Self::LinkedIn => linkedin::configured(config),
            // Their applications are registered per instance or are the server's own metadata.
            Self::Bluesky | Self::Mastodon => true,
            Self::Telegram | Self::Discord => true,
        }
    }

    /// Whether the operator made the network available: its application, and the public origin
    /// a consent page returns to (a bot's or a webhook's network needs none).
    pub fn configured(self, config: &Config) -> bool {
        self.adapter_configured(config) && (self.entered() || config.public_base())
    }

    pub fn needs_refresh(self, account: &JsonValue, now: i64) -> bool {
        match self {
            Self::TikTok => tiktok::needs_refresh(account, now),
            Self::Instagram => instagram::needs_refresh(account, now),
            Self::Threads => threads::needs_refresh(account, now),
            Self::YouTube => youtube::needs_refresh(account, now),
            Self::Bluesky => bluesky::needs_refresh(account, now),
            // No refresh grant exists (Facebook's user token, LinkedIn's member token without the
            // partner program), or nothing expires (Mastodon, a bot, a webhook).
            _ => false,
        }
    }

    pub async fn refresh(self, config: &Config, account: &JsonValue, now: i64) -> Sd<JsonValue> {
        match self {
            Self::TikTok => tiktok::refresh(config, account, now).await,
            Self::Instagram => instagram::refresh(config, account, now).await,
            Self::Threads => threads::refresh(config, account, now).await,
            Self::YouTube => youtube::refresh(config, account, now).await,
            Self::Bluesky => bluesky::refresh(config, account, now).await,
            _ => Err(Se::new("social_session_expired")),
        }
    }

    pub async fn describe(self, config: &Config, account: &JsonValue) -> Sd<JsonValue> {
        match self {
            Self::TikTok => tiktok::describe(config, account).await,
            Self::Instagram | Self::Threads => Ok(instagram::describe(config)),
            _ => Ok(json!({})),
        }
    }

    pub fn authorize_url(self, config: &Config, state: &str, redirect: &str) -> Sd<String> {
        Ok(match self {
            Self::TikTok => tiktok::authorize_url(config, state, redirect),
            Self::Instagram => instagram::authorize_url(config, state, redirect),
            Self::Facebook => facebook::authorize_url(config, state, redirect),
            Self::Threads => threads::authorize_url(config, state, redirect),
            Self::YouTube => youtube::authorize_url(config, state, redirect),
            Self::LinkedIn => linkedin::authorize_url(config, state, redirect),
            _ => return Err(Se::new("social_request_invalid")),
        })
    }

    pub async fn exchange(
        self,
        config: &Config,
        code: &str,
        redirect: &str,
        now: i64,
    ) -> Sd<JsonValue> {
        match self {
            Self::TikTok => tiktok::exchange(config, code, redirect, now).await,
            Self::Instagram => instagram::exchange(config, code, redirect, now).await,
            Self::Facebook => facebook::exchange(config, code, redirect, now).await,
            Self::Threads => threads::exchange(config, code, redirect, now).await,
            Self::YouTube => youtube::exchange(config, code, redirect, now).await,
            Self::LinkedIn => linkedin::exchange(config, code, redirect, now).await,
            _ => Err(Se::new("social_request_invalid")),
        }
    }

    /// The provider's revocation where it is documented: `None` where there is none.
    pub async fn revoke(self, config: &Config, account: &JsonValue) -> Option<Sd<()>> {
        Some(match self {
            Self::TikTok => tiktok::revoke(config, account).await,
            Self::Facebook => facebook::revoke(config, account).await,
            Self::YouTube => youtube::revoke(config, account).await,
            Self::Mastodon => mastodon::revoke(config, account).await,
            _ => return None,
        })
    }

    pub async fn publish(self, ctx: &Ctx<'_>) -> Sd<JsonValue> {
        match self {
            Self::TikTok => tiktok::publish(ctx).await,
            Self::Instagram => instagram::publish(ctx).await,
            Self::Facebook => facebook::publish(ctx).await,
            Self::Threads => threads::publish(ctx).await,
            Self::YouTube => youtube::publish(ctx).await,
            Self::LinkedIn => linkedin::publish(ctx).await,
            Self::Bluesky => bluesky::publish(ctx).await,
            Self::Mastodon => mastodon::publish(ctx).await,
            Self::Telegram => telegram::publish(ctx).await,
            Self::Discord => discord::publish(ctx).await,
        }
    }

    /// A published post removed where the network's API allows it.
    pub async fn remove(self, config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
        match self {
            Self::Facebook => facebook::remove(config, account, remote).await,
            Self::Threads => threads::remove(config, account, remote).await,
            Self::YouTube => youtube::remove(config, account, remote).await,
            Self::LinkedIn => linkedin::remove(config, account, remote).await,
            Self::Bluesky => bluesky::remove(account, remote).await,
            Self::Mastodon => mastodon::remove(config, account, remote).await,
            Self::Telegram => telegram::remove(config, account, remote).await,
            Self::Discord => discord::remove(config, account, remote).await,
            Self::TikTok | Self::Instagram => Err(Se::new("social_update_unsupported")),
        }
    }

    /// What arrived since the account's cursor, and the cursor after it.
    pub async fn poll(self, config: &Config, account: &JsonValue) -> Sd<Polled> {
        match self {
            Self::YouTube => youtube::poll(config, account).await,
            Self::LinkedIn => linkedin::poll(config, account).await,
            Self::Bluesky => bluesky::poll(config, account).await,
            Self::Mastodon => mastodon::poll(config, account).await,
            Self::Telegram => telegram::poll(config, account).await,
            Self::Discord => discord::poll(config, account).await,
            _ => Ok(Polled::default()),
        }
    }

    /// A reply sent where the message came from: its remote id.
    pub async fn reply(self, out: &Out<'_>) -> Sd<String> {
        match self {
            Self::Facebook | Self::Instagram | Self::Threads => {
                super::meta_inbox::reply(self, out).await
            }
            Self::YouTube => youtube::reply(out).await,
            Self::LinkedIn => linkedin::reply(out).await,
            Self::Bluesky => bluesky::reply(out).await,
            Self::Mastodon => mastodon::reply(out).await,
            Self::Telegram => telegram::reply(out).await,
            Self::Discord => discord::reply(out).await,
            Self::TikTok => Err(Se::new("social_reply_unsupported")),
        }
    }
}
