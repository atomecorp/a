// Discord (R-190): a channel's webhook, entered once in the settings and kept in the vault, posts
// there (text, an image or a video as its attachment). With the person's bot too (its token),
// the channel's messages are read by the polling and answered as replies; a webhook alone only
// posts (Discord gives a webhook no reading).
use super::inbox::{self, Polled, Received};
use super::net::{self, Sd, Se};
use super::poll;
use super::reply::Out;
use super::{Config, Ctx, Media};
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

fn api(config: &Config) -> String {
    config.api("discord", "https://discord.com")
}

/// A webhook URL's id and token: `https://discord.com/api/webhooks/<id>/<token>`.
pub fn webhook_of(url: &str) -> Option<(String, String)> {
    let rest = [
        "https://discord.com",
        "https://discordapp.com",
        "https://ptb.discord.com",
        "https://canary.discord.com",
    ]
    .iter()
    .find_map(|host| url.trim().strip_prefix(host))
    .or_else(|| {
        url.trim()
            .split_once("/api/webhooks/")
            .map(|(_, rest)| rest)
    })?;
    let rest = rest.strip_prefix("/api/webhooks/").unwrap_or(rest);
    let mut parts = rest.trim_end_matches('/').split('/');
    let (id, token) = (parts.next()?, parts.next()?);
    let shaped = !id.is_empty()
        && id.len() <= 20
        && id.bytes().all(|c| c.is_ascii_digit())
        && (20..=100).contains(&token.len())
        && token
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c));
    (shaped && parts.next().is_none()).then(|| (id.to_string(), token.to_string()))
}

fn webhook(config: &Config, account: &JsonValue) -> String {
    format!(
        "{}/api/webhooks/{}/{}",
        api(config),
        net::text(account.get("webhook_id")),
        net::text(account.get("webhook_token"))
    )
}

fn bot(request: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    request.header("Authorization", format!("Bot {token}"))
}

/// Whether the account reads its channel (a bot was given).
pub fn reads(account: &JsonValue) -> bool {
    !net::text(account.get("bot_token")).is_empty()
}

pub async fn connect(config: &Config, fields: &JsonValue, now: i64) -> Sd<JsonValue> {
    let (id, token) = webhook_of(&net::text(fields.get("webhook_url")))
        .ok_or_else(|| Se::new("social_credentials_invalid"))?;
    let refused = |failure: Se| match failure.http_status {
        Some(401 | 403 | 404) => Se::new("social_credentials_invalid"),
        _ => failure,
    };
    let url = format!("{}/api/webhooks/{id}/{token}", api(config));
    let hook = net::fetch(http::client().get(url), false)
        .await
        .map_err(refused)?;
    let channel = net::text(hook.get("channel_id"));
    let bot_token = js::trim(&net::text(fields.get("bot_token"))).to_string();
    if !bot_token.is_empty() {
        let url = format!("{}/api/v10/channels/{channel}", api(config));
        net::fetch(bot(http::client().get(url), &bot_token), false)
            .await
            .map_err(refused)?;
    }
    let mut account = json!({ "network": "discord", "account": id, "webhook_id": id, "webhook_token": token,
        "channel_id": channel, "guild_id": net::text(hook.get("guild_id")), "scopes": [], "connected_at": now,
        "identity": { "id": id, "display_name": net::text(hook.get("name")) } });
    if !bot_token.is_empty() {
        account["bot_token"] = json!(bot_token);
    }
    Ok(account)
}

async fn with_file(
    request: reqwest::RequestBuilder,
    payload: &JsonValue,
    media: &Media,
) -> Sd<reqwest::RequestBuilder> {
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    let (kind, body) = net::multipart(&[
        ("payload_json", None, payload.to_string().into_bytes()),
        (
            "files[0]",
            Some((media.name.as_str(), media.mime.as_str())),
            bytes,
        ),
    ]);
    Ok(request.header("Content-Type", kind).body(body))
}

fn message_url(account: &JsonValue, id: &str) -> String {
    format!(
        "https://discord.com/channels/{}/{}/{id}",
        net::text(account.get("guild_id")),
        net::text(account.get("channel_id"))
    )
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let url = format!("{}?wait=true", webhook(ctx.config, ctx.record));
    let payload = json!({ "content": ctx.text, "allowed_mentions": { "parse": [] } });
    let request = match ctx.media {
        Some(media) => with_file(http::client().post(&url), &payload, media).await?,
        None => net::json_post(&url, &payload),
    };
    ctx.hooks.publishing(json!({})).await?;
    let sent = ctx.hooks.reaching(net::fetch(request, true)).await?;
    let id = net::text(sent.get("id"));
    if id.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    Ok(
        json!({ "status": "published", "remote": { "message_id": id }, "url": message_url(ctx.record, &id) }),
    )
}

/// The webhook's message removed.
pub async fn remove(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let id = net::text(remote.get("message_id"));
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_digit()) {
        return Err(Se::new("social_update_unsupported"));
    }
    net::removed(http::client().delete(format!("{}/messages/{id}", webhook(config, account)))).await
}

fn snowflake(id: &str) -> u64 {
    id.parse().unwrap_or(0)
}

/// The channel's messages after the cursor, the webhook's own and the bots' left out.
pub fn received(messages: &JsonValue, account: &JsonValue, after: &str) -> (Vec<Received>, String) {
    let (own, channel) = (
        net::text(account.get("webhook_id")),
        net::text(account.get("channel_id")),
    );
    let mut latest = after.to_string();
    let mut items = Vec::new();
    for message in messages.as_array().into_iter().flatten() {
        let id = net::text(message.get("id"));
        if snowflake(&id) <= snowflake(after) {
            continue;
        }
        if snowflake(&id) > snowflake(&latest) {
            latest = id.clone();
        }
        let author = &message["author"];
        if net::text(message.get("webhook_id")) == own || author["bot"] == true {
            continue;
        }
        let parent = net::text(message.pointer("/message_reference/message_id"));
        items.push(Received {
            kind: "comment",
            thread: if parent.is_empty() {
                channel.clone()
            } else {
                parent.clone()
            },
            remote_id: id.clone(),
            text: net::text(message.get("content")),
            at: net::millis(&net::text(message.get("timestamp"))),
            author: inbox::author(
                &net::text(author.get("id")),
                &[author.get("global_name"), author.get("username")]
                    .into_iter()
                    .map(net::text)
                    .find(|n| !n.is_empty())
                    .unwrap_or_default(),
                &net::text(author.get("username")),
                "",
            ),
            post: inbox::post(
                &parent,
                &if parent.is_empty() {
                    String::new()
                } else {
                    message_url(account, &parent)
                },
            ),
            reply: inbox::reply("comment", None, None),
            reference: json!({ "message": id }),
        });
    }
    (items, latest)
}

pub async fn poll(config: &Config, account: &JsonValue) -> Sd<Polled> {
    if !reads(account) {
        return Ok(Polled::default());
    }
    let after = poll::cursor(account, "after");
    let mut url = format!(
        "{}/api/v10/channels/{}/messages?limit=50",
        api(config),
        net::text(account.get("channel_id"))
    );
    if !after.is_empty() {
        url.push_str(&format!("&after={after}"));
    }
    let messages = net::fetch(
        bot(
            http::client().get(url),
            &net::text(account.get("bot_token")),
        ),
        false,
    )
    .await?;
    let (items, latest) = received(&messages, account, &after);
    let cursor = (latest != after).then(|| poll::with_cursor(account, &[("after", json!(latest))]));
    Ok(Polled { items, cursor })
}

pub async fn reply(out: &Out<'_>) -> Sd<String> {
    if !reads(out.account) {
        return Err(Se::new("social_reply_unsupported"));
    }
    let url = format!(
        "{}/api/v10/channels/{}/messages",
        api(out.config),
        net::text(out.account.get("channel_id"))
    );
    let payload = json!({ "content": out.text, "message_reference": { "message_id": out.reference("message") },
        "allowed_mentions": { "parse": [], "replied_user": true } });
    let token = net::text(out.account.get("bot_token"));
    let request = match out.media {
        Some(media) => with_file(bot(http::client().post(&url), &token), &payload, media).await?,
        None => bot(net::json_post(&url, &payload), &token),
    };
    let sent = net::fetch(request, true).await?;
    Ok(net::text(sent.get("id")))
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "abcdefghijklmnopqrstuvwxyz0123456789_-AB";

    #[test]
    fn a_webhook_url_is_read() {
        let url = format!("https://discord.com/api/webhooks/123456/{TOKEN}");
        assert_eq!(webhook_of(&url), Some(("123456".into(), TOKEN.into())));
        let fake = format!("http://127.0.0.1:4100/api/webhooks/9/{TOKEN}");
        assert_eq!(webhook_of(&fake).unwrap().0, "9");
        assert_eq!(webhook_of("https://discord.com/api/webhooks/x/y"), None);
        assert_eq!(webhook_of(&format!("{url}/extra")), None);
    }

    #[test]
    fn messages_after_the_cursor_are_read_and_the_webhooks_own_skipped() {
        let account = json!({ "webhook_id": "9", "channel_id": "c", "guild_id": "g" });
        let messages = json!([
            { "id": "30", "content": "mine", "webhook_id": "9", "author": { "id": "9", "bot": true } },
            { "id": "20", "content": "hi", "timestamp": "2026-11-16T10:00:00+00:00",
              "message_reference": { "message_id": "15" }, "author": { "id": "u", "username": "ann", "global_name": "Ann" } },
            { "id": "10", "content": "old", "author": { "id": "u" } } ]);
        let (items, latest) = received(&messages, &account, "10");
        assert_eq!(latest, "30");
        assert_eq!(items.len(), 1);
        assert_eq!(
            (items[0].thread.as_str(), items[0].author["name"].as_str()),
            ("15", Some("Ann"))
        );
        assert_eq!(items[0].post["url"], "https://discord.com/channels/g/c/15");
    }
}
