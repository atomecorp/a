// Threads (R-190): the Threads API v1.0 of Meta, with Threads' own login. Text, an image or a
// video, the media pulled by Threads from a public URL, through a container published once it is
// FINISHED. Replies and mentions come by the Meta webhook (meta_inbox.rs).
use super::net::{self, Sd, Se};
use super::{Config, Ctx};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const VERSION: &str = "v1.0";
const SCOPES: [&str; 5] = [
    "threads_basic",
    "threads_content_publish",
    "threads_delete",
    "threads_manage_replies",
    "threads_read_replies",
];
const DAY: f64 = 86_400_000.0;

pub fn configured(config: &Config) -> bool {
    config.app("THREADS_APP_ID", "THREADS_APP_SECRET")
}

pub fn host(config: &Config) -> String {
    config.api("threads", "https://graph.threads.net")
}

pub fn graph(config: &Config, path: &str) -> String {
    format!("{}/{VERSION}/{path}", host(config))
}

pub fn authorize_url(config: &Config, state: &str, redirect: &str) -> String {
    let scope = SCOPES.join(",");
    let pairs = [
        ("client_id", config.get("THREADS_APP_ID")),
        ("redirect_uri", redirect),
        ("scope", &scope),
        ("response_type", "code"),
        ("state", state),
    ];
    format!(
        "{}/oauth/authorize?{}",
        config.api("threads", "https://threads.net"),
        form(&pairs)
    )
}

/// A published thread removed (`threads_delete`).
pub async fn remove(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let id = net::text(remote.get("media_id"));
    if id.is_empty() {
        return Err(Se::new("social_update_unsupported"));
    }
    let token = net::text(account.get("access_token"));
    net::removed(http::client().delete(format!(
        "{}?{}",
        graph(config, &id),
        form(&[("access_token", token.as_str())])
    )))
    .await
}

fn get(url: String) -> reqwest::RequestBuilder {
    http::client().get(url)
}

pub async fn exchange(config: &Config, code: &str, redirect: &str, now: i64) -> Sd<JsonValue> {
    let fields = [
        ("client_id", json!(config.get("THREADS_APP_ID"))),
        ("client_secret", json!(config.get("THREADS_APP_SECRET"))),
        ("grant_type", json!("authorization_code")),
        ("redirect_uri", json!(redirect)),
        ("code", json!(code)),
    ];
    let url = format!("{}/oauth/access_token", host(config));
    let short = net::fetch(net::form_post(&url, &fields), false).await?;
    let short_token = net::text(short.get("access_token"));
    if short_token.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let pairs = [
        ("grant_type", "th_exchange_token"),
        ("client_secret", config.get("THREADS_APP_SECRET")),
        ("access_token", &short_token),
    ];
    let long_url = format!("{}/access_token?{}", host(config), form(&pairs));
    let long = net::fetch(get(long_url), false).await?;
    let token = net::text(long.get("access_token"));
    if token.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let fields = "id,username,name,threads_profile_picture_url";
    let me_url = format!(
        "{}?{}",
        graph(config, "me"),
        form(&[("fields", fields), ("access_token", &token)])
    );
    let me = net::fetch(get(me_url), false).await?;
    let id = net::text(me.get("id"));
    if id.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    Ok(
        json!({ "network": "threads", "access_token": token, "issued_at": now,
        "expires_at": js::number_json(now as f64 + js::number_or(long.get("expires_in"), 0.0) * 1000.0),
        "scopes": SCOPES, "connected_at": now,
        "identity": { "id": id, "username": net::text(me.get("username")), "display_name": net::text(me.get("name")),
            "avatar_url": net::text(me.get("threads_profile_picture_url")) } }),
    )
}

/// A long-lived token lasts 60 days and is refreshed once it is a day old, in its last week.
pub fn needs_refresh(account: &JsonValue, now: i64) -> bool {
    let now = now as f64;
    now - js::number(account.get("issued_at")) > DAY
        && js::number(account.get("expires_at")) - now < 7.0 * DAY
}

pub async fn refresh(config: &Config, account: &JsonValue, now: i64) -> Sd<JsonValue> {
    if now as f64 >= js::number(account.get("expires_at")) {
        return Err(Se::new("social_session_expired"));
    }
    let token = net::text(account.get("access_token"));
    let pairs = [
        ("grant_type", "th_refresh_token"),
        ("access_token", token.as_str()),
    ];
    let url = format!("{}/refresh_access_token?{}", host(config), form(&pairs));
    let body = net::fetch(get(url), false).await?;
    let fresh = net::text(body.get("access_token"));
    if fresh.is_empty() {
        return Err(Se::new("social_session_expired"));
    }
    Ok(json!({ "access_token": fresh, "issued_at": now,
        "expires_at": js::number_json(now as f64 + js::number_or(body.get("expires_in"), 0.0) * 1000.0) }))
}

/// The container's fields: a text post, or its media pulled from `url`.
pub fn container(kind: &str, text: &str, url: Option<&str>) -> Sd<Vec<(&'static str, JsonValue)>> {
    let mut fields = vec![
        ("media_type", json!(kind.to_ascii_uppercase())),
        ("text", json!(text)),
    ];
    match (kind, url) {
        ("text", _) => {}
        ("image", Some(url)) => fields.push(("image_url", json!(url))),
        ("video", Some(url)) => fields.push(("video_url", json!(url))),
        _ => return Err(Se::new("social_public_media_url_unavailable")),
    }
    Ok(fields)
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    if js::truthy(ctx.remote.get("container_id")) {
        return finish(ctx, ctx.remote.clone(), 60).await;
    }
    let kind = ctx.media.map_or("text", |media| media.kind.as_str());
    let url = ctx.media.and_then(|media| media.public_url.as_deref());
    let mut fields = container(kind, ctx.text, url)?;
    let token = net::text(ctx.record.get("access_token"));
    fields.push(("access_token", json!(token)));
    let user = net::text(ctx.record.pointer("/identity/id"));
    let created = net::fetch(
        net::form_post(&graph(ctx.config, &format!("{user}/threads")), &fields),
        false,
    )
    .await?;
    let container_id = net::text(created.get("id"));
    if container_id.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let remote = json!({ "container_id": container_id });
    ctx.hooks.accepted(remote.clone()).await?;
    finish(ctx, remote, 60).await
}

async fn container_status(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<String> {
    let token = net::text(account.get("access_token"));
    let id = net::text(remote.get("container_id"));
    let url = format!(
        "{}?{}",
        graph(config, &id),
        form(&[("fields", "status"), ("access_token", &token)])
    );
    Ok(net::text(net::fetch(get(url), false).await?.get("status")))
}

async fn finish(ctx: &Ctx<'_>, remote: JsonValue, attempts: usize) -> Sd<JsonValue> {
    let token = net::text(ctx.record.get("access_token"));
    for _ in 0..attempts {
        let state = container_status(ctx.config, ctx.record, &remote).await?;
        match state.as_str() {
            "PUBLISHED" => return Ok(json!({ "status": "published", "remote": remote })),
            "ERROR" | "EXPIRED" => {
                return Ok(json!({ "status": "failed", "remote": remote,
                    "error": "social_provider_rejected", "provider_code": state }));
            }
            "FINISHED" => {
                ctx.hooks.publishing(remote.clone()).await?;
                let user = net::text(ctx.record.pointer("/identity/id"));
                let fields = [
                    ("creation_id", remote["container_id"].clone()),
                    ("access_token", json!(token)),
                ];
                let url = graph(ctx.config, &format!("{user}/threads_publish"));
                let published = ctx
                    .hooks
                    .reaching(net::fetch(net::form_post(&url, &fields), true))
                    .await?;
                let media_id = net::text(published.get("id"));
                // The post is live: a failed permalink read only loses the link.
                let link = format!(
                    "{}?{}",
                    graph(ctx.config, &media_id),
                    form(&[("fields", "permalink"), ("access_token", &token)])
                );
                let url = net::fetch(get(link), false)
                    .await
                    .map(|body| net::text(body.get("permalink")))
                    .unwrap_or_default();
                let mut remote = remote.as_object().cloned().unwrap_or_default();
                remote.insert("media_id".into(), json!(media_id));
                let url = if url.is_empty() {
                    JsonValue::Null
                } else {
                    json!(url)
                };
                return Ok(json!({ "status": "published", "remote": remote, "url": url }));
            }
            _ => net::delay(3000).await,
        }
    }
    Ok(json!({ "status": "remote_processing", "remote": remote }))
}

pub async fn status(ctx: &Ctx<'_>, verify_only: bool) -> Sd<JsonValue> {
    let state = container_status(ctx.config, ctx.record, &ctx.remote).await?;
    let remote = ctx.remote.clone();
    match state.as_str() {
        "PUBLISHED" => Ok(json!({ "status": "published", "remote": remote })),
        "ERROR" | "EXPIRED" => Ok(json!({ "status": "failed", "remote": remote,
            "error": "social_provider_rejected", "provider_code": state })),
        // Never published (a container publishes once): retryable, the retry reusing it.
        "FINISHED" if verify_only => Ok(json!({ "status": "failed", "remote": remote,
            "error": "social_provider_unavailable" })),
        "FINISHED" => finish(ctx, remote, 1).await,
        _ => Ok(
            json!({ "status": if verify_only { "unconfirmed" } else { "remote_processing" }, "remote": remote }),
        ),
    }
}

/// A reply under a post or a reply: a TEXT container answering it, then published.
pub async fn answer(
    config: &Config,
    account: &JsonValue,
    reply_to: &str,
    text: &str,
) -> Sd<String> {
    let token = net::text(account.get("access_token"));
    let user = net::text(account.pointer("/identity/id"));
    let fields = [
        ("media_type", json!("TEXT")),
        ("text", json!(text)),
        ("reply_to_id", json!(reply_to)),
        ("access_token", json!(token)),
    ];
    let created = net::fetch(
        net::form_post(&graph(config, &format!("{user}/threads")), &fields),
        false,
    )
    .await?;
    let creation = net::text(created.get("id"));
    if creation.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let fields = [
        ("creation_id", json!(creation)),
        ("access_token", json!(token)),
    ];
    let url = graph(config, &format!("{user}/threads_publish"));
    let published = net::fetch(net::form_post(&url, &fields), true).await?;
    Ok(net::text(published.get("id")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_container_names_its_kind_and_its_pulled_media() {
        let text = container("text", "hi", None).unwrap();
        assert_eq!(text[0], ("media_type", json!("TEXT")));
        let image = container("image", "", Some("https://x/a.jpg")).unwrap();
        assert_eq!(image[2], ("image_url", json!("https://x/a.jpg")));
        let video = container("video", "", None).unwrap_err();
        assert_eq!(video.code, "social_public_media_url_unavailable");
    }

    #[test]
    fn the_fake_base_replaces_every_host() {
        let config = Config::of(&[("SOCIAL_API_BASE_THREADS", "http://127.0.0.1:4100/")]);
        assert_eq!(graph(&config, "me"), "http://127.0.0.1:4100/v1.0/me");
        let url = authorize_url(&config, "s", "r");
        assert!(url.starts_with("http://127.0.0.1:4100/oauth/authorize?"));
        let official = Config::of(&[]);
        assert_eq!(graph(&official, "me"), "https://graph.threads.net/v1.0/me");
    }
}
