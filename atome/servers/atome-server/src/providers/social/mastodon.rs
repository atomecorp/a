// Mastodon (R-190): any instance the person names, atome registering itself there (`POST
// /api/v1/apps`) before the instance's own consent page. Statuses with their media (`/api/v2/
// media`, a video processed asynchronously), mentions and direct messages read by the polling
// (`/api/v1/notifications`), answered in the same visibility.
use super::inbox::{self, Polled, Received};
use super::net::{self, Sd, Se};
use super::poll;
use super::reply::Out;
use super::{Config, Ctx, Media};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const SCOPES: &str = "read write";

/// The instance's host, as the person typed it (`mastodon.social`, an address): none when it is
/// not a host name.
pub fn host_of(instance: &str) -> Option<String> {
    let trimmed = instance
        .trim()
        .trim_start_matches("https://")
        .trim_end_matches('/');
    let host = trimmed.split('/').next().unwrap_or("").to_ascii_lowercase();
    let shaped = (3..=253).contains(&host.len())
        && host.contains('.')
        && host
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-".contains(&c));
    shaped.then_some(host)
}

/// The instance's origin: the fake provider's when probes set one.
fn origin(config: &Config, host: &str) -> String {
    config.api("mastodon", &format!("https://{host}"))
}

fn base(config: &Config, account: &JsonValue) -> String {
    origin(config, &net::text(account.get("host")))
}

fn bearer(request: reqwest::RequestBuilder, account: &JsonValue) -> reqwest::RequestBuilder {
    request.header(
        "Authorization",
        format!("Bearer {}", net::text(account.get("access_token"))),
    )
}

/// atome registered on the instance: `{ host, client_id, client_secret }`.
pub async fn register(config: &Config, instance: &str, redirect: &str) -> Sd<JsonValue> {
    let host = host_of(instance).ok_or_else(|| Se::new("social_request_invalid"))?;
    let fields = [
        ("client_name", json!("atome")),
        ("redirect_uris", json!(redirect)),
        ("scopes", json!(SCOPES)),
        ("website", json!(config.get("SOCIAL_PUBLIC_BASE_URL"))),
    ];
    let app = net::fetch(
        net::form_post(&format!("{}/api/v1/apps", origin(config, &host)), &fields),
        false,
    )
    .await?;
    let (id, secret) = (
        net::text(app.get("client_id")),
        net::text(app.get("client_secret")),
    );
    if id.is_empty() || secret.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    Ok(
        json!({ "host": host, "client_id": id, "client_secret": secret, "origin": origin(config, &host) }),
    )
}

pub fn authorize_url(app: &JsonValue, state: &str, redirect: &str) -> String {
    let id = net::text(app.get("client_id"));
    let pairs = [
        ("client_id", id.as_str()),
        ("redirect_uri", redirect),
        ("response_type", "code"),
        ("scope", SCOPES),
        ("state", state),
    ];
    format!(
        "{}/oauth/authorize?{}",
        net::text(app.get("origin")),
        form(&pairs)
    )
}

pub async fn exchange(
    config: &Config,
    app: &JsonValue,
    code: &str,
    redirect: &str,
    now: i64,
) -> Sd<JsonValue> {
    let host = net::text(app.get("host"));
    let fields = [
        ("grant_type", json!("authorization_code")),
        ("code", json!(code)),
        ("client_id", app["client_id"].clone()),
        ("client_secret", app["client_secret"].clone()),
        ("redirect_uri", json!(redirect)),
        ("scope", json!(SCOPES)),
    ];
    let token = net::fetch(
        net::form_post(&format!("{}/oauth/token", origin(config, &host)), &fields),
        false,
    )
    .await?;
    let access = net::text(token.get("access_token"));
    if access.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let mut account = json!({ "network": "mastodon", "host": host, "access_token": access,
        "client_id": app["client_id"], "client_secret": app["client_secret"],
        "scopes": SCOPES.split(' ').collect::<Vec<_>>(), "connected_at": now });
    let url = format!(
        "{}/api/v1/accounts/verify_credentials",
        origin(config, &host)
    );
    let me = net::fetch(bearer(http::client().get(url), &account), false).await?;
    let id = net::text(me.get("id"));
    if id.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    account["identity"] = json!({ "id": id, "username": net::text(me.get("username")),
        "display_name": net::text(me.get("display_name")), "avatar_url": net::text(me.get("avatar")),
        "url": net::text(me.get("url")) });
    Ok(account)
}

pub async fn revoke(config: &Config, account: &JsonValue) -> Sd<()> {
    let fields = [
        ("client_id", account["client_id"].clone()),
        ("client_secret", account["client_secret"].clone()),
        ("token", account["access_token"].clone()),
    ];
    net::fetch(
        net::form_post(&format!("{}/oauth/revoke", base(config, account)), &fields),
        false,
    )
    .await
    .map(|_| ())
}

/// The status removed from the instance.
pub async fn remove(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let id = net::text(remote.get("status_id"));
    if id.is_empty() || !id.bytes().all(|c| c.is_ascii_alphanumeric()) {
        return Err(Se::new("social_update_unsupported"));
    }
    let url = format!("{}/api/v1/statuses/{id}", base(config, account));
    net::removed(bearer(http::client().delete(url), account)).await
}

/// The media uploaded, its id once the instance has processed it.
async fn upload(config: &Config, account: &JsonValue, media: &Media) -> Sd<String> {
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    let (kind, body) = net::multipart(&[(
        "file",
        Some((media.name.as_str(), media.mime.as_str())),
        bytes,
    )]);
    let request = bearer(
        http::client().post(format!("{}/api/v2/media", base(config, account))),
        account,
    )
    .header("Content-Type", kind)
    .body(body);
    let uploaded = net::fetch(request, false).await?;
    let id = net::text(uploaded.get("id"));
    if id.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    // A video answers 202 with no URL until it is processed.
    let mut ready = js::truthy(uploaded.get("url"));
    for _ in 0..120 {
        if ready {
            return Ok(id);
        }
        net::delay(2000).await;
        let url = format!("{}/api/v1/media/{id}", base(config, account));
        let state = net::fetch(bearer(http::client().get(url), account), false).await?;
        ready = js::truthy(state.get("url"));
    }
    Err(Se::detail(
        "social_provider_unavailable",
        "media_processing",
    ))
}

/// A status's fields.
pub fn status_fields(
    text: &str,
    media: Option<&str>,
    reply_to: Option<&str>,
    visibility: &str,
) -> Vec<(&'static str, JsonValue)> {
    let mut fields = vec![("status", json!(text)), ("visibility", json!(visibility))];
    if let Some(media) = media {
        fields.push(("media_ids[]", json!(media)));
    }
    if let Some(reply_to) = reply_to {
        fields.push(("in_reply_to_id", json!(reply_to)));
    }
    fields
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let media = match ctx.media {
        Some(media) => Some(upload(ctx.config, ctx.record, media).await?),
        None => None,
    };
    let fields = status_fields(ctx.text, media.as_deref(), None, "public");
    ctx.hooks.publishing(json!({})).await?;
    let url = format!("{}/api/v1/statuses", base(ctx.config, ctx.record));
    // The instance keeps one status per key: a retry after a lost answer publishes nothing twice.
    let key = format!(
        "atome-{}-{}",
        net::text(ctx.plan.get("destination")),
        ctx.hooks.job_id()
    );
    let request = bearer(net::form_post(&url, &fields), ctx.record).header("Idempotency-Key", key);
    let status = ctx.hooks.reaching(net::fetch(request, true)).await?;
    let id = net::text(status.get("id"));
    if id.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    Ok(
        json!({ "status": "published", "remote": { "status_id": id }, "url": net::text(status.get("url")) }),
    )
}

pub async fn status(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let id = net::text(ctx.remote.get("status_id"));
    let url = format!("{}/api/v1/statuses/{id}", base(ctx.config, ctx.record));
    let found = net::fetch(bearer(http::client().get(url), ctx.record), false).await?;
    Ok(json!({ "status": "published", "remote": ctx.remote, "url": net::text(found.get("url")) }))
}

/// Strips a status's HTML to its text: Mastodon gives `<p>` and links.
pub fn plain(html: &str) -> String {
    let spaced = html
        .replace("</p><p>", "\n\n")
        .replace("<br>", "\n")
        .replace("<br />", "\n");
    let mut out = String::new();
    let mut tag = false;
    for c in spaced.chars() {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            c if !tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

/// The mentions newer than the cursor: a direct one is a conversation, another a comment.
pub fn received(body: &JsonValue) -> (Vec<Received>, String) {
    let mut latest = String::new();
    let mut items = Vec::new();
    for notice in body.as_array().into_iter().flatten() {
        let id = net::text(notice.get("id"));
        if latest.is_empty() {
            latest = id;
        }
        let status = &notice["status"];
        if notice["type"] != "mention" || !status.is_object() {
            continue;
        }
        let who = &notice["account"];
        let direct = status["visibility"] == "direct";
        let parent = net::text(status.get("in_reply_to_id"));
        let status_id = net::text(status.get("id"));
        let thread = if direct {
            format!("dm:{}", net::text(who.get("acct")))
        } else if parent.is_empty() {
            status_id.clone()
        } else {
            parent.clone()
        };
        let mode = if direct { "dm" } else { "comment" };
        items.push(Received {
            kind: if direct {
                "dm"
            } else if parent.is_empty() {
                "mention"
            } else {
                "comment"
            },
            thread,
            remote_id: status_id.clone(),
            text: plain(&net::text(status.get("content"))),
            at: net::millis(&net::text(status.get("created_at"))),
            author: inbox::author(
                &net::text(who.get("id")),
                &net::text(who.get("display_name")),
                &net::text(who.get("acct")),
                &net::text(who.get("avatar")),
            ),
            post: inbox::post(&parent, ""),
            reply: inbox::reply(mode, None, None),
            reference: json!({ "status": status_id, "acct": net::text(who.get("acct")),
                "visibility": net::text(status.get("visibility")) }),
        });
    }
    (items, latest)
}

pub async fn poll(config: &Config, account: &JsonValue) -> Sd<Polled> {
    let since = poll::cursor(account, "since_id");
    let mut pairs = vec![("types[]", "mention"), ("limit", "40")];
    if !since.is_empty() {
        pairs.push(("since_id", since.as_str()));
    }
    let url = format!(
        "{}/api/v1/notifications?{}",
        base(config, account),
        form(&pairs)
    );
    let body = net::fetch(bearer(http::client().get(url), account), false).await?;
    let (items, latest) = received(&body);
    let cursor =
        (!latest.is_empty()).then(|| poll::with_cursor(account, &[("since_id", json!(latest))]));
    Ok(Polled { items, cursor })
}

pub async fn reply(out: &Out<'_>) -> Sd<String> {
    let media = match out.media {
        Some(media) => Some(upload(out.config, out.account, media).await?),
        None => None,
    };
    // The person answered is named; the post itself commented names nobody.
    let acct = out.reference("acct");
    let text = if acct.is_empty() {
        out.text.to_string()
    } else {
        format!("@{acct} {}", out.text)
    };
    let visibility = match out.reference("visibility").as_str() {
        "direct" => "direct",
        "private" => "private",
        "unlisted" => "unlisted",
        _ => "public",
    };
    let status = out.reference("status");
    let fields = status_fields(&text, media.as_deref(), Some(&status), visibility);
    let url = format!("{}/api/v1/statuses", base(out.config, out.account));
    let sent = net::fetch(bearer(net::form_post(&url, &fields), out.account), true).await?;
    Ok(net::text(sent.get("id")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_instance_is_a_host_name() {
        assert_eq!(
            host_of("https://Mastodon.Social/"),
            Some("mastodon.social".into())
        );
        assert_eq!(
            host_of("mastodon.social/@ann"),
            Some("mastodon.social".into())
        );
        assert_eq!(host_of("localhost"), None);
        assert_eq!(host_of("a b.c"), None);
    }

    #[test]
    fn mentions_are_read_and_a_direct_one_is_a_conversation() {
        let body = json!([
            { "id": "9", "type": "mention", "account": { "id": "2", "acct": "bob@x.y", "display_name": "Bob" },
              "status": { "id": "s9", "visibility": "direct", "content": "<p>hi &amp; bye</p>", "created_at": "2026-11-16T10:00:00Z" } },
            { "id": "8", "type": "mention", "account": { "id": "3", "acct": "eve" },
              "status": { "id": "s8", "visibility": "public", "in_reply_to_id": "s1", "content": "<p>ok</p>", "created_at": "2026-11-16T09:00:00Z" } },
            { "id": "7", "type": "favourite", "account": {} } ]);
        let (items, latest) = received(&body);
        assert_eq!(latest, "9");
        assert_eq!(items.len(), 2);
        assert_eq!(
            (items[0].kind, items[0].thread.as_str()),
            ("dm", "dm:bob@x.y")
        );
        assert_eq!(items[0].text, "hi & bye");
        assert_eq!((items[1].kind, items[1].thread.as_str()), ("comment", "s1"));
        assert_eq!(items[1].reply["mode"], "comment");
    }

    #[test]
    fn a_reply_keeps_its_thread_and_visibility() {
        let fields = status_fields("@bob hi", None, Some("s9"), "direct");
        assert!(fields.contains(&("in_reply_to_id", json!("s9"))));
        assert!(fields.contains(&("visibility", json!("direct"))));
    }
}
