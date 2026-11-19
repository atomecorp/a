// LinkedIn (R-190): Sign In with LinkedIn (OpenID) and the member's own posts (`w_member_social`,
// the Posts, Images and Videos APIs). Reading and answering the comments under them needs the
// Community Management access LinkedIn reviews (`r_member_social`): asked only when the operator
// has it (`LINKEDIN_COMMUNITY=1`), the polling then reading the comments of the posts atome sent.
use super::accounts;
use super::inbox::{self, Polled, Received};
use super::net::{self, Sd, Se};
use super::network::Network;
use super::poll;
use super::reply::Out;
use super::{Config, Ctx, Media};
use crate::providers::credentials::Credentials;
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const VERSION: &str = "202510";
const POSTS_KEPT: usize = 21;
const READ_SCOPE: &str = "r_member_social";

pub fn configured(config: &Config) -> bool {
    config.app("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET")
}

fn api(config: &Config) -> String {
    config.api("linkedin", "https://api.linkedin.com")
}

fn www(config: &Config) -> String {
    config.api("linkedin", "https://www.linkedin.com")
}

fn scopes(config: &Config) -> Vec<&'static str> {
    let mut scopes = vec!["openid", "profile", "w_member_social"];
    if config.get("LINKEDIN_COMMUNITY") == "1" {
        scopes.push(READ_SCOPE);
    }
    scopes
}

pub fn authorize_url(config: &Config, state: &str, redirect: &str) -> String {
    let scope = scopes(config).join(" ");
    let pairs = [
        ("response_type", "code"),
        ("client_id", config.get("LINKEDIN_CLIENT_ID")),
        ("redirect_uri", redirect),
        ("state", state),
        ("scope", &scope),
    ];
    format!("{}/oauth/v2/authorization?{}", www(config), form(&pairs))
}

fn rest(request: reqwest::RequestBuilder, account: &JsonValue) -> reqwest::RequestBuilder {
    request
        .header(
            "Authorization",
            format!("Bearer {}", net::text(account.get("access_token"))),
        )
        .header("LinkedIn-Version", VERSION)
        .header("X-Restli-Protocol-Version", "2.0.0")
}

pub async fn exchange(config: &Config, code: &str, redirect: &str, now: i64) -> Sd<JsonValue> {
    let fields = [
        ("grant_type", json!("authorization_code")),
        ("code", json!(code)),
        ("client_id", json!(config.get("LINKEDIN_CLIENT_ID"))),
        ("client_secret", json!(config.get("LINKEDIN_CLIENT_SECRET"))),
        ("redirect_uri", json!(redirect)),
    ];
    let url = format!("{}/oauth/v2/accessToken", www(config));
    let token = net::fetch(net::form_post(&url, &fields), false).await?;
    let access = net::text(token.get("access_token"));
    if access.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let scopes: Vec<String> = net::text(token.get("scope"))
        .split([',', ' '])
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let request = http::client()
        .get(format!("{}/v2/userinfo", api(config)))
        .header("Authorization", format!("Bearer {access}"));
    let me = net::fetch(request, false).await?;
    let sub = net::text(me.get("sub"));
    if sub.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    Ok(
        json!({ "network": "linkedin", "access_token": access, "connected_at": now, "scopes": scopes,
        "expires_at": js::number_json(now as f64 + js::number_or(token.get("expires_in"), 0.0) * 1000.0),
        "identity": { "id": sub, "display_name": net::text(me.get("name")), "avatar_url": net::text(me.get("picture")) } }),
    )
}

/// The member's post removed (its urn escaped in the path, as the Posts API asks).
pub async fn remove(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let urn = net::text(remote.get("post_urn"));
    if urn.is_empty() {
        return Err(Se::new("social_update_unsupported"));
    }
    let url = format!("{}/rest/posts/{}", api(config), urlencoding::encode(&urn));
    net::removed(rest(http::client().delete(url), account)).await
}

fn author(account: &JsonValue) -> String {
    format!(
        "urn:li:person:{}",
        net::text(account.pointer("/identity/id"))
    )
}

/// The post's body: the member's commentary, its media when there is one.
pub fn post_body(author: &str, text: &str, media: Option<&str>) -> JsonValue {
    let mut body = json!({ "author": author, "commentary": text, "visibility": "PUBLIC",
        "distribution": { "feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": [] },
        "lifecycleState": "PUBLISHED", "isReshareDisabledByAuthor": false });
    if let Some(media) = media {
        body["content"] = json!({ "media": { "id": media } });
    }
    body
}

async fn image(ctx: &Ctx<'_>, media: &Media) -> Sd<String> {
    let url = format!("{}/rest/images?action=initializeUpload", api(ctx.config));
    let body = json!({ "initializeUploadRequest": { "owner": author(ctx.record) } });
    let init = net::fetch(rest(net::json_post(&url, &body), ctx.record), false).await?;
    let (upload, urn) = (
        net::text(init.pointer("/value/uploadUrl")),
        net::text(init.pointer("/value/image")),
    );
    if upload.is_empty() || urn.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    net::accepted(
        rest(http::client().put(upload), ctx.record).body(bytes),
        false,
    )
    .await?;
    Ok(urn)
}

async fn video(ctx: &Ctx<'_>, media: &Media) -> Sd<String> {
    let url = format!("{}/rest/videos?action=initializeUpload", api(ctx.config));
    let body = json!({ "initializeUploadRequest": { "owner": author(ctx.record),
        "fileSizeBytes": media.size as u64, "uploadCaptions": false, "uploadThumbnail": false } });
    let init = net::fetch(rest(net::json_post(&url, &body), ctx.record), false).await?;
    let value = &init["value"];
    let urn = net::text(value.get("video"));
    let parts = value["uploadInstructions"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if urn.is_empty() || parts.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    let mut tags = Vec::new();
    for part in &parts {
        let first = js::number(part.get("firstByte")) as usize;
        let last = (js::number(part.get("lastByte")) as usize).min(bytes.len().saturating_sub(1));
        if first > last {
            return Err(Se::new("social_provider_rejected"));
        }
        let request = http::client()
            .put(net::text(part.get("uploadUrl")))
            .body(bytes[first..=last].to_vec());
        let sent = net::accepted(request, false).await?;
        tags.push(sent.header("etag"));
        ctx.hooks.progress(tags.len() as f64 / parts.len() as f64);
    }
    let url = format!("{}/rest/videos?action=finalizeUpload", api(ctx.config));
    let body = json!({ "finalizeUploadRequest": { "video": urn, "uploadToken": net::text(value.get("uploadToken")),
        "uploadedPartIds": tags } });
    net::accepted(rest(net::json_post(&url, &body), ctx.record), false).await?;
    Ok(urn)
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let media = match ctx.media {
        Some(media) if media.kind == "image" => Some(image(ctx, media).await?),
        Some(media) => Some(video(ctx, media).await?),
        None => None,
    };
    let body = post_body(&author(ctx.record), ctx.text, media.as_deref());
    ctx.hooks.publishing(json!({})).await?;
    let url = format!("{}/rest/posts", api(ctx.config));
    let sent = ctx
        .hooks
        .reaching(net::accepted(
            rest(net::json_post(&url, &body), ctx.record),
            true,
        ))
        .await?;
    let urn = sent.header("x-restli-id");
    if urn.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    Ok(
        json!({ "status": "published", "remote": { "post_urn": urn },
        "url": format!("https://www.linkedin.com/feed/update/{urn}/") }),
    )
}

/// The post kept on its account, the polling reading its comments (the 21 latest).
pub async fn remember(vault: &Credentials, account: &str, result: &JsonValue) -> Sd<()> {
    let urn = net::text(result.pointer("/remote/post_urn"));
    if urn.is_empty() || result["status"] != "published" {
        return Ok(());
    }
    accounts::update(vault, Network::LinkedIn, account, |account| {
        let mut posts = account["posts"].as_array().cloned().unwrap_or_default();
        posts.push(json!(urn));
        let excess = posts.len().saturating_sub(POSTS_KEPT);
        posts.drain(..excess);
        account["posts"] = json!(posts);
    })
    .await
}

fn comments_url(config: &Config, post: &str) -> String {
    format!(
        "{}/rest/socialActions/{}/comments",
        api(config),
        urlencoding::encode(post)
    )
}

/// The comments under one post newer than the cursor.
pub fn received(post: &str, body: &JsonValue, since: i64, own: &str) -> (Vec<Received>, i64) {
    let mut latest = since;
    let mut items = Vec::new();
    for comment in body["elements"].as_array().into_iter().flatten() {
        let at = js::number(comment.pointer("/created/time")) as i64;
        let actor = net::text(comment.get("actor"));
        if at <= since || actor == own {
            continue;
        }
        latest = latest.max(at);
        let urn = [comment.get("$URN"), comment.get("commentUrn")]
            .into_iter()
            .map(net::text)
            .find(|urn| !urn.is_empty())
            .unwrap_or_default();
        items.push(Received {
            kind: "comment",
            thread: post.into(),
            remote_id: urn.clone(),
            text: net::text(comment.pointer("/message/text")),
            at,
            author: inbox::author(&actor, "", "", ""),
            post: inbox::post(
                post,
                &format!("https://www.linkedin.com/feed/update/{post}/"),
            ),
            reply: inbox::reply("comment", None, None),
            reference: json!({ "post": post, "comment": urn }),
        });
    }
    (items, latest)
}

pub async fn poll(config: &Config, account: &JsonValue) -> Sd<Polled> {
    let reads = account["scopes"]
        .as_array()
        .is_some_and(|scopes| scopes.iter().any(|s| s == READ_SCOPE));
    if !reads {
        return Ok(Polled::default());
    }
    let since = poll::cursor(account, "since").parse::<i64>().unwrap_or(0);
    let (own, mut latest, mut items) = (author(account), since, Vec::new());
    for post in account["posts"].as_array().into_iter().flatten() {
        let post = net::text(Some(post));
        let body = net::fetch(
            rest(http::client().get(comments_url(config, &post)), account),
            false,
        )
        .await?;
        let (read, last) = received(&post, &body, since, &own);
        latest = latest.max(last);
        items.extend(read);
    }
    Ok(Polled {
        items,
        cursor: Some(poll::with_cursor(
            account,
            &[("since", json!(latest.to_string()))],
        )),
    })
}

pub async fn reply(out: &Out<'_>) -> Sd<String> {
    if out.media.is_some() {
        return Err(Se::new("social_media_type_unsupported"));
    }
    let post = out.reference("post");
    let mut body =
        json!({ "actor": author(out.account), "object": post, "message": { "text": out.text } });
    // A comment answered, or the post itself commented.
    let comment = out.reference("comment");
    if !comment.is_empty() {
        body["parentComment"] = json!(comment);
    }
    let sent = net::accepted(
        rest(
            net::json_post(&comments_url(out.config, &post), &body),
            out.account,
        ),
        true,
    )
    .await?;
    let id = sent.header("x-restli-id");
    Ok(if id.is_empty() {
        net::text(sent.body.get("$URN"))
    } else {
        id
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_post_is_the_members_own() {
        let body = post_body("urn:li:person:1", "hello", Some("urn:li:image:9"));
        assert_eq!(body["author"], "urn:li:person:1");
        assert_eq!(body["content"]["media"]["id"], "urn:li:image:9");
        assert!(post_body("a", "t", None).get("content").is_none());
    }

    #[test]
    fn comments_newer_than_the_cursor_and_not_ones_own_are_read() {
        let body = json!({ "elements": [
            { "$URN": "urn:li:comment:(p,1)", "actor": "urn:li:person:2", "message": { "text": "yes" }, "created": { "time": 20 } },
            { "$URN": "urn:li:comment:(p,2)", "actor": "urn:li:person:1", "message": { "text": "mine" }, "created": { "time": 30 } },
            { "$URN": "urn:li:comment:(p,0)", "actor": "urn:li:person:2", "created": { "time": 5 } } ] });
        let (items, latest) = received("urn:li:share:7", &body, 10, "urn:li:person:1");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].reference["comment"], "urn:li:comment:(p,1)");
        assert_eq!(latest, 20);
        let config = Config::of(&[("SOCIAL_API_BASE_LINKEDIN", "http://127.0.0.1:4100")]);
        assert_eq!(
            comments_url(&config, "urn:li:share:7"),
            "http://127.0.0.1:4100/rest/socialActions/urn%3Ali%3Ashare%3A7/comments"
        );
    }
}
