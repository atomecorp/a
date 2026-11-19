// YouTube (R-190): Google's OAuth and the YouTube Data API v3. Videos only, sent by the resumable
// upload with the title and the visibility the person chose (an unaudited project's videos stay
// private, Google's rule); the comment threads of the channel read by the polling, answered
// under the comment.
use super::inbox::{self, Polled, Received};
use super::net::{self, Sd, Se};
use super::poll;
use super::reply::Out;
use super::{Config, Ctx};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const UPLOAD_SCOPE: &str = "https://www.googleapis.com/auth/youtube.upload";
const SCOPES: [&str; 3] = [
    UPLOAD_SCOPE,
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
];
const VISIBILITIES: [&str; 3] = ["private", "unlisted", "public"];
const TITLE_MAX: usize = 100;

pub fn configured(config: &Config) -> bool {
    config.app("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET")
}

fn api(config: &Config) -> String {
    config.api("youtube", "https://www.googleapis.com")
}

fn oauth(config: &Config) -> String {
    config.api("youtube", "https://oauth2.googleapis.com")
}

fn bearer(request: reqwest::RequestBuilder, account: &JsonValue) -> reqwest::RequestBuilder {
    request.header(
        "Authorization",
        format!("Bearer {}", net::text(account.get("access_token"))),
    )
}

/// The uploaded video removed from the channel.
pub async fn remove(config: &Config, account: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let id = net::text(remote.get("video_id"));
    if id.is_empty() {
        return Err(Se::new("social_update_unsupported"));
    }
    let url = format!(
        "{}/youtube/v3/videos?{}",
        api(config),
        form(&[("id", id.as_str())])
    );
    net::removed(bearer(http::client().delete(url), account)).await
}

pub fn authorize_url(config: &Config, state: &str, redirect: &str) -> String {
    let scope = SCOPES.join(" ");
    let pairs = [
        ("client_id", config.get("YOUTUBE_CLIENT_ID")),
        ("redirect_uri", redirect),
        ("response_type", "code"),
        ("scope", &scope),
        ("access_type", "offline"),
        ("prompt", "consent"),
        ("include_granted_scopes", "true"),
        ("state", state),
    ];
    format!(
        "{}/o/oauth2/v2/auth?{}",
        config.api("youtube", "https://accounts.google.com"),
        form(&pairs)
    )
}

fn token_fields(token: &JsonValue, now: i64) -> JsonValue {
    let scopes: Vec<String> = net::text(token.get("scope"))
        .split(' ')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let mut fields = json!({ "access_token": token["access_token"], "issued_at": now,
        "expires_at": js::number_json(now as f64 + js::number_or(token.get("expires_in"), 0.0) * 1000.0) });
    if !scopes.is_empty() {
        fields["scopes"] = json!(scopes);
    }
    if js::truthy(token.get("refresh_token")) {
        fields["refresh_token"] = token["refresh_token"].clone();
    }
    fields
}

pub async fn exchange(config: &Config, code: &str, redirect: &str, now: i64) -> Sd<JsonValue> {
    let fields = [
        ("code", json!(code)),
        ("client_id", json!(config.get("YOUTUBE_CLIENT_ID"))),
        ("client_secret", json!(config.get("YOUTUBE_CLIENT_SECRET"))),
        ("redirect_uri", json!(redirect)),
        ("grant_type", json!("authorization_code")),
    ];
    let token = net::fetch(
        net::form_post(&format!("{}/token", oauth(config)), &fields),
        false,
    )
    .await?;
    if !js::truthy(token.get("access_token")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let mut account = token_fields(&token, now);
    let url = format!("{}/youtube/v3/channels?part=snippet&mine=true", api(config));
    let channels = net::fetch(bearer(http::client().get(url), &account), false).await?;
    let channel = channels
        .pointer("/items/0")
        .cloned()
        .unwrap_or(JsonValue::Null);
    let id = net::text(channel.get("id"));
    if id.is_empty() {
        return Err(Se::new("social_account_incompatible"));
    }
    let snippet = &channel["snippet"];
    account["network"] = json!("youtube");
    account["connected_at"] = json!(now);
    account["identity"] = json!({ "id": id, "display_name": net::text(snippet.get("title")),
        "username": net::text(snippet.get("customUrl")),
        "avatar_url": net::text(snippet.pointer("/thumbnails/default/url")) });
    Ok(account)
}

pub fn needs_refresh(account: &JsonValue, now: i64) -> bool {
    now as f64 >= js::number(account.get("expires_at")) - 120_000.0
}

pub async fn refresh(config: &Config, account: &JsonValue, now: i64) -> Sd<JsonValue> {
    if !js::truthy(account.get("refresh_token")) {
        return Err(Se::new("social_session_expired"));
    }
    let fields = [
        ("client_id", json!(config.get("YOUTUBE_CLIENT_ID"))),
        ("client_secret", json!(config.get("YOUTUBE_CLIENT_SECRET"))),
        ("refresh_token", account["refresh_token"].clone()),
        ("grant_type", json!("refresh_token")),
    ];
    let token = net::fetch(
        net::form_post(&format!("{}/token", oauth(config)), &fields),
        false,
    )
    .await
    .map_err(|failure| match failure.http_status {
        Some(400 | 401) => Se::new("social_session_expired"),
        _ => failure,
    })?;
    if !js::truthy(token.get("access_token")) {
        return Err(Se::new("social_session_expired"));
    }
    Ok(token_fields(&token, now))
}

pub async fn revoke(config: &Config, account: &JsonValue) -> Sd<()> {
    let token = net::text(account.get("refresh_token"));
    let token = if token.is_empty() {
        net::text(account.get("access_token"))
    } else {
        token
    };
    let fields = [("token", json!(token))];
    net::fetch(
        net::form_post(&format!("{}/revoke", oauth(config)), &fields),
        false,
    )
    .await
    .map(|_| ())
}

/// The video's metadata from the person's options (the delivery's `options.youtube`): a title,
/// a visibility and whether it is made for children (YouTube's own declaration), all required.
pub fn metadata(options: &JsonValue, text: &str) -> Sd<JsonValue> {
    let title = js::trim(&net::text(options.get("title"))).to_string();
    let visibility = net::text(options.get("visibility"));
    if title.is_empty() || title.chars().count() > TITLE_MAX {
        return Err(Se::detail("social_option_required", "title"));
    }
    if !VISIBILITIES.contains(&visibility.as_str()) {
        return Err(Se::detail("social_option_required", "visibility"));
    }
    let Some(for_kids) = options.get("made_for_kids").and_then(JsonValue::as_bool) else {
        return Err(Se::detail("social_option_required", "made_for_kids"));
    };
    Ok(json!({ "snippet": { "title": title, "description": text },
        "status": { "privacyStatus": visibility, "selfDeclaredMadeForKids": for_kids } }))
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    if js::truthy(ctx.remote.get("video_id")) {
        return status(ctx).await;
    }
    let Some(media) = ctx.media.filter(|m| m.kind == "video") else {
        return Err(Se::new("social_media_type_unsupported"));
    };
    let body = metadata(&ctx.options["youtube"], ctx.text)?;
    let url = format!(
        "{}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        api(ctx.config)
    );
    let session = net::accepted(
        bearer(net::json_post(&url, &body), ctx.record)
            .header("X-Upload-Content-Type", media.mime.as_str())
            .header("X-Upload-Content-Length", (media.size as u64).to_string()),
        false,
    )
    .await?;
    let location = session.header("location");
    if location.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    let file = tokio::fs::File::open(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    ctx.hooks.publishing(json!({})).await?;
    let request = bearer(http::client().put(location), ctx.record)
        .header("Content-Type", media.mime.as_str())
        .header("Content-Length", (media.size as u64).to_string())
        .body(reqwest::Body::from(file));
    let video = ctx.hooks.reaching(net::fetch(request, true)).await?;
    ctx.hooks.progress(1.0);
    let id = net::text(video.get("id"));
    if id.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    let remote = json!({ "video_id": id });
    ctx.hooks.accepted(remote.clone()).await?;
    Ok(json!({ "status": "remote_processing", "remote": remote, "url": watch(&id) }))
}

fn watch(id: &str) -> String {
    format!("https://www.youtube.com/watch?v={id}")
}

pub async fn status(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let id = net::text(ctx.remote.get("video_id"));
    let url = format!(
        "{}/youtube/v3/videos?{}",
        api(ctx.config),
        form(&[("part", "status"), ("id", id.as_str())])
    );
    let found = net::fetch(bearer(http::client().get(url), ctx.record), false).await?;
    let state = net::text(found.pointer("/items/0/status/uploadStatus"));
    let remote = ctx.remote.clone();
    Ok(match state.as_str() {
        "processed" => json!({ "status": "published", "remote": remote, "url": watch(&id) }),
        "failed" | "rejected" | "deleted" => json!({ "status": "failed", "remote": remote,
            "error": "social_provider_rejected", "provider_code": state }),
        _ => json!({ "status": "remote_processing", "remote": remote, "url": watch(&id) }),
    })
}

/// The channel's comment threads newer than the cursor.
pub fn received(body: &JsonValue, since: i64) -> (Vec<Received>, i64) {
    let mut latest = since;
    let mut items = Vec::new();
    for thread in body["items"].as_array().into_iter().flatten() {
        let top = &thread["snippet"]["topLevelComment"];
        let snippet = &top["snippet"];
        let at = net::millis(&net::text(snippet.get("publishedAt")));
        if at <= since {
            continue;
        }
        latest = latest.max(at);
        let video = net::text(thread.pointer("/snippet/videoId"));
        let comment = net::text(top.get("id"));
        items.push(Received {
            kind: "comment",
            thread: video.clone(),
            remote_id: comment.clone(),
            text: net::text(snippet.get("textOriginal")),
            at,
            author: inbox::author(
                &net::text(snippet.pointer("/authorChannelId/value")),
                &net::text(snippet.get("authorDisplayName")),
                "",
                &net::text(snippet.get("authorProfileImageUrl")),
            ),
            post: inbox::with_thumbnail(
                inbox::post(&video, &watch(&video)),
                &format!("https://i.ytimg.com/vi/{video}/hqdefault.jpg"),
            ),
            reply: inbox::reply("comment", None, None),
            reference: json!({ "parent": comment }),
        });
    }
    (items, latest)
}

pub async fn poll(config: &Config, account: &JsonValue) -> Sd<Polled> {
    let channel = net::text(account.pointer("/identity/id"));
    let since = poll::cursor(account, "since").parse::<i64>().unwrap_or(0);
    let url = format!(
        "{}/youtube/v3/commentThreads?{}",
        api(config),
        form(&[
            ("part", "snippet"),
            ("allThreadsRelatedToChannelId", channel.as_str()),
            ("order", "time"),
            ("maxResults", "50"),
        ])
    );
    let body = net::fetch(bearer(http::client().get(url), account), false).await?;
    let (items, latest) = received(&body, since);
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
    // The video itself commented (a new thread), or a comment answered.
    let video = out.reference("video");
    let (body, url) = if video.is_empty() {
        let body =
            json!({ "snippet": { "parentId": out.reference("parent"), "textOriginal": out.text } });
        (
            body,
            format!("{}/youtube/v3/comments?part=snippet", api(out.config)),
        )
    } else {
        let body = json!({ "snippet": { "videoId": video,
            "topLevelComment": { "snippet": { "textOriginal": out.text } } } });
        (
            body,
            format!("{}/youtube/v3/commentThreads?part=snippet", api(out.config)),
        )
    };
    let sent = net::fetch(bearer(net::json_post(&url, &body), out.account), true).await?;
    Ok(net::text(sent.get("id")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_video_needs_its_title_and_visibility() {
        let ok = metadata(
            &json!({ "title": "Run", "visibility": "unlisted", "made_for_kids": true }),
            "about",
        )
        .unwrap();
        assert_eq!(ok["status"]["privacyStatus"], "unlisted");
        assert_eq!(ok["status"]["selfDeclaredMadeForKids"], true);
        let unsaid = metadata(&json!({ "title": "Run", "visibility": "public" }), "").unwrap_err();
        assert_eq!(unsaid.detail.as_deref(), Some("made_for_kids"));
        assert_eq!(ok["snippet"]["description"], "about");
        let none = metadata(&json!({ "visibility": "public" }), "").unwrap_err();
        assert_eq!(
            (none.code.as_str(), none.detail.as_deref()),
            ("social_option_required", Some("title"))
        );
        let wrong = metadata(
            &json!({ "title": "t", "visibility": "everyone", "made_for_kids": false }),
            "",
        )
        .unwrap_err();
        assert_eq!(wrong.detail.as_deref(), Some("visibility"));
    }

    #[test]
    fn comment_threads_newer_than_the_cursor_are_read() {
        let body = json!({ "items": [
            { "snippet": { "videoId": "v1", "topLevelComment": { "id": "c2", "snippet": {
                "textOriginal": "nice", "authorDisplayName": "Ann", "authorChannelId": { "value": "UC1" },
                "publishedAt": "2026-11-16T10:00:00Z" } } } },
            { "snippet": { "videoId": "v1", "topLevelComment": { "id": "c1", "snippet": {
                "textOriginal": "old", "publishedAt": "2026-11-15T10:00:00Z" } } } } ] });
        let since = net::millis("2026-11-16T00:00:00Z");
        let (items, latest) = received(&body, since);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].remote_id, "c2");
        assert_eq!(items[0].thread, "v1");
        assert_eq!(items[0].author["name"], "Ann");
        assert_eq!(items[0].reference["parent"], "c2");
        assert_eq!(latest, net::millis("2026-11-16T10:00:00Z"));
    }
}
