// TikTok (server/social/social_tiktok.js, ported): Login Kit for the web and the Content Posting
// API v2, as developers.tiktok.com documents them.
use super::media::{TIKTOK_PHOTO_DESCRIPTION, TIKTOK_VIDEO_CAPTION};
use super::net::{self, Sd, Se};
use super::{Config, Ctx, Media};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const AUTHORIZE: &str = "https://www.tiktok.com/v2/auth/authorize/";
const API: &str = "https://open.tiktokapis.com";
const MIN_CHUNK: f64 = 5.0 * 1024.0 * 1024.0;
const CHUNK: f64 = 10.0 * 1024.0 * 1024.0;
const MAX_DURATION: f64 = 600.0;
pub const PRIVACY_LEVELS: [&str; 4] = [
    "PUBLIC_TO_EVERYONE",
    "MUTUAL_FOLLOW_FRIENDS",
    "FOLLOWER_OF_CREATOR",
    "SELF_ONLY",
];

pub fn configured(config: &Config) -> bool {
    !config.get("TIKTOK_CLIENT_KEY").is_empty() && !config.get("TIKTOK_CLIENT_SECRET").is_empty()
}

// Direct Post (`video.publish`) needs TikTok's product approval; without it the route left is the
// inbox upload finished in the TikTok app.
fn scopes(config: &Config) -> Vec<&'static str> {
    let mut scopes = vec!["user.info.basic", "video.upload"];
    if config.get("TIKTOK_DIRECT_POST") != "0" {
        scopes.push("video.publish");
    }
    scopes
}

pub fn authorize_url(config: &Config, state: &str, redirect: &str) -> String {
    let scope = scopes(config).join(",");
    let pairs = [
        ("client_key", config.get("TIKTOK_CLIENT_KEY")),
        ("response_type", "code"),
        ("scope", &scope),
        ("redirect_uri", redirect),
        ("state", state),
    ];
    format!("{AUTHORIZE}?{}", form(&pairs))
}

fn bearer(request: reqwest::RequestBuilder, record: &JsonValue) -> reqwest::RequestBuilder {
    request
        .header(
            "Authorization",
            format!("Bearer {}", js::text(record.get("access_token"))),
        )
        .header("Content-Type", "application/json; charset=UTF-8")
}

fn post(path: &str, record: &JsonValue, body: JsonValue) -> reqwest::RequestBuilder {
    bearer(http::client().post(format!("{API}{path}")), record).body(body.to_string())
}

fn token_record(token: &JsonValue, now: i64) -> Sd<JsonValue> {
    if !js::truthy(token.get("access_token")) || !js::truthy(token.get("open_id")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let seconds = |field: &str| js::number_or(token.get(field), 0.0) * 1000.0;
    let scopes: Vec<String> = token
        .get("scope")
        .filter(|s| js::truthy(Some(s)))
        .map(js::string)
        .unwrap_or_default()
        .split(',')
        .map(|scope| scope.trim().to_string())
        .filter(|scope| !scope.is_empty())
        .collect();
    Ok(
        json!({ "network": "tiktok", "access_token": token["access_token"],
        "refresh_token": token.get("refresh_token").filter(|t| js::truthy(Some(t))).cloned().unwrap_or(JsonValue::Null),
        "expires_at": js::number_json(now as f64 + seconds("expires_in")),
        "refresh_expires_at": js::number_json(now as f64 + seconds("refresh_expires_in")),
        "scopes": scopes, "identity": { "id": token["open_id"] }, "connected_at": now }),
    )
}

fn token_form(config: &Config, fields: &[(&str, JsonValue)]) -> reqwest::RequestBuilder {
    let mut all = vec![
        ("client_key", json!(config.get("TIKTOK_CLIENT_KEY"))),
        ("client_secret", json!(config.get("TIKTOK_CLIENT_SECRET"))),
    ];
    all.extend_from_slice(fields);
    net::form_post(&format!("{API}/v2/oauth/token/"), &all)
}

pub async fn exchange(config: &Config, code: &str, redirect: &str, now: i64) -> Sd<JsonValue> {
    let fields = [
        ("code", json!(code)),
        ("grant_type", json!("authorization_code")),
        ("redirect_uri", json!(redirect)),
    ];
    let token = net::fetch(token_form(config, &fields), false).await?;
    let mut record = token_record(&token, now)?;
    let url = format!("{API}/v2/user/info/?fields=open_id,avatar_url,display_name");
    let info = net::fetch(bearer(http::client().get(url), &record), false).await?;
    let user = info
        .pointer("/data/user")
        .filter(|u| js::truthy(Some(u)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    if !js::truthy(user.get("open_id")) || user.get("open_id") != record.pointer("/identity/id") {
        return Err(Se::new("social_provider_rejected"));
    }
    let text = |field: &str| {
        user.get(field)
            .filter(|v| js::truthy(Some(v)))
            .map(js::string)
            .unwrap_or_default()
    };
    record["identity"] = json!({ "id": user["open_id"], "display_name": text("display_name"), "avatar_url": text("avatar_url") });
    Ok(record)
}

pub async fn refresh(config: &Config, record: &JsonValue, now: i64) -> Sd<JsonValue> {
    if !js::truthy(record.get("refresh_token"))
        || now as f64 >= js::number(record.get("refresh_expires_at"))
    {
        return Err(Se::new("social_session_expired"));
    }
    let fields = [
        ("grant_type", json!("refresh_token")),
        ("refresh_token", record["refresh_token"].clone()),
    ];
    let token = net::fetch(token_form(config, &fields), false).await?;
    let mut refreshed = token_record(&token, now)?;
    refreshed["identity"] = record.get("identity").cloned().unwrap_or(JsonValue::Null);
    refreshed["connected_at"] = record
        .get("connected_at")
        .cloned()
        .unwrap_or(JsonValue::Null);
    Ok(refreshed)
}

pub fn needs_refresh(record: &JsonValue, now: i64) -> bool {
    now as f64 >= js::number(record.get("expires_at")) - 60_000.0
}

pub async fn revoke(config: &Config, record: &JsonValue) -> Sd<()> {
    let fields = [
        ("client_key", json!(config.get("TIKTOK_CLIENT_KEY"))),
        ("client_secret", json!(config.get("TIKTOK_CLIENT_SECRET"))),
        (
            "token",
            record
                .get("access_token")
                .cloned()
                .unwrap_or(JsonValue::Null),
        ),
    ];
    net::fetch(
        net::form_post(&format!("{API}/v2/oauth/revoke/"), &fields),
        false,
    )
    .await
    .map(|_| ())
}

/// The upload page names the creator and offers exactly the privacy levels TikTok returns for
/// them; an unaudited client may only post SELF_ONLY.
pub async fn describe(config: &Config, record: &JsonValue) -> Sd<JsonValue> {
    let audited = config.get("TIKTOK_AUDITED") == "1";
    let pull = config.get("TIKTOK_PULL_FROM_URL_VERIFIED") == "1"
        && !config.get("SOCIAL_PUBLIC_BASE_URL").is_empty();
    let mut view = json!({ "photo_pull": pull, "audited": audited, "creator": null });
    let publishes = record
        .get("scopes")
        .and_then(JsonValue::as_array)
        .is_some_and(|s| s.iter().any(|s| s == "video.publish"));
    if !publishes {
        return Ok(view);
    }
    let info = net::fetch(
        post("/v2/post/publish/creator_info/query/", record, json!({})),
        false,
    )
    .await?;
    let data = info
        .get("data")
        .filter(|d| js::truthy(Some(d)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let offered: Vec<JsonValue> = data
        .get("privacy_level_options")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter(|level| PRIVACY_LEVELS.iter().any(|known| *level == known))
        .cloned()
        .collect();
    let levels: Vec<JsonValue> = if audited {
        offered
    } else {
        offered.into_iter().filter(|l| l == "SELF_ONLY").collect()
    };
    let text = |field: &str| {
        data.get(field)
            .filter(|v| js::truthy(Some(v)))
            .map(js::string)
            .unwrap_or_default()
    };
    let max = js::number_or(data.get("max_video_post_duration_sec"), MAX_DURATION);
    view["creator"] = json!({ "username": text("creator_username"), "nickname": text("creator_nickname"),
        "privacy_level_options": levels, "comment_disabled": data.get("comment_disabled") == Some(&json!(true)),
        "duet_disabled": data.get("duet_disabled") == Some(&json!(true)),
        "stitch_disabled": data.get("stitch_disabled") == Some(&json!(true)),
        "max_video_post_duration_sec": js::number_json(max) });
    Ok(view)
}

// Required by TikTok's content sharing guidelines: the privacy level chosen explicitly from the
// creator's options, interactions opt-in.
fn direct_post_info(
    options: &JsonValue,
    view: &JsonValue,
    kind: &str,
) -> Sd<JsonMap<String, JsonValue>> {
    let creator = &view["creator"];
    let allowed = creator
        .get("privacy_level_options")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let level = options.get("privacy_level").filter(|l| js::truthy(Some(l)));
    let Some(level) = level.filter(|level| allowed.contains(level)) else {
        return Err(Se::detail("social_option_required", "privacy_level"));
    };
    let off = |option: &str, disabled: &str| {
        options.get(option) != Some(&json!(false)) || js::truthy(creator.get(disabled))
    };
    let mut info = JsonMap::new();
    info.insert("privacy_level".into(), level.clone());
    info.insert(
        "disable_comment".into(),
        json!(off("disable_comment", "comment_disabled")),
    );
    if kind == "video" {
        info.insert(
            "disable_duet".into(),
            json!(off("disable_duet", "duet_disabled")),
        );
        info.insert(
            "disable_stitch".into(),
            json!(off("disable_stitch", "stitch_disabled")),
        );
    }
    let branded = options.get("brand_content_toggle") == Some(&json!(true));
    if branded && level == "SELF_ONLY" {
        return Err(Se::detail(
            "social_option_required",
            "branded_content_visibility",
        ));
    }
    info.insert("brand_content_toggle".into(), json!(branded));
    info.insert(
        "brand_organic_toggle".into(),
        json!(options.get("brand_organic_toggle") == Some(&json!(true))),
    );
    Ok(info)
}

/// The media transfer guide: chunks of 5–64 MB, a video under 5 MB one chunk, the last chunk
/// taking the remainder, at most 1000 chunks.
fn chunk_plan(size: f64) -> Sd<(f64, f64)> {
    if size < MIN_CHUNK {
        return Ok((size, 1.0));
    }
    let count = (size / CHUNK).floor();
    if count > 1000.0 {
        return Err(Se::detail("social_media_constraint", "file_too_large"));
    }
    Ok((CHUNK, count))
}

async fn upload_chunks(ctx: &Ctx<'_>, url: &str, media: &Media, chunk: f64, count: f64) -> Sd<()> {
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    let mut file = tokio::fs::File::open(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    let count = count as u64;
    for index in 0..count {
        let start = index * chunk as u64;
        let end = if index == count - 1 {
            media.size as u64 - 1
        } else {
            start + chunk as u64 - 1
        };
        let mut bytes = vec![0u8; (end - start + 1) as usize];
        file.seek(std::io::SeekFrom::Start(start))
            .await
            .map_err(|e| Se::from(e.to_string()))?;
        let mut filled = 0;
        while filled < bytes.len() {
            let read = file
                .read(&mut bytes[filled..])
                .await
                .map_err(|e| Se::from(e.to_string()))?;
            if read == 0 {
                break;
            }
            filled += read;
        }
        let request = http::client()
            .put(url)
            .header("Content-Type", media.mime.as_str())
            .header("Content-Length", bytes.len().to_string())
            .header(
                "Content-Range",
                format!("bytes {start}-{end}/{}", media.size as u64),
            )
            .body(bytes);
        // Once the last chunk may have arrived, TikTok can publish: a lost answer from that point
        // on is unconfirmed, not retryable.
        let last = index == count - 1;
        if last {
            ctx.hooks.reaching(net::fetch(request, true)).await?;
        } else {
            net::fetch(request, false).await?;
        }
        ctx.hooks.progress((end + 1) as f64 / media.size);
    }
    Ok(())
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let Some(media) = ctx.media else {
        return Err(Se::new("social_text_only_unsupported"));
    };
    let direct = ctx.plan.get("route") == Some(&json!("direct"));
    let post_info = if direct {
        Some(direct_post_info(ctx.options, ctx.view, &media.kind)?)
    } else {
        None
    };
    let length = ctx.text.encode_utf16().count();
    if media.kind == "video" {
        if length > TIKTOK_VIDEO_CAPTION {
            return Err(Se::detail("social_media_constraint", "caption_too_long"));
        }
        let limit = js::number_or(
            ctx.view.pointer("/creator/max_video_post_duration_sec"),
            MAX_DURATION,
        );
        if direct && js::number(media.probe.get("duration")) > limit {
            return Err(Se::detail(
                "social_media_constraint",
                "duration_above_creator_limit",
            ));
        }
        let (chunk, count) = chunk_plan(media.size)?;
        let mut body = JsonMap::new();
        if let Some(mut info) = post_info {
            info.insert("title".into(), json!(ctx.text));
            body.insert("post_info".into(), JsonValue::Object(info));
        }
        body.insert(
            "source_info".into(),
            json!({ "source": "FILE_UPLOAD", "video_size": js::number_json(media.size),
            "chunk_size": js::number_json(chunk), "total_chunk_count": js::number_json(count) }),
        );
        let path = if direct {
            "/v2/post/publish/video/init/"
        } else {
            "/v2/post/publish/inbox/video/init/"
        };
        let init = net::fetch(post(path, ctx.record, JsonValue::Object(body)), false).await?;
        let publish_id = init
            .pointer("/data/publish_id")
            .filter(|v| js::truthy(Some(v)))
            .map(js::string)
            .unwrap_or_default();
        let upload = init
            .pointer("/data/upload_url")
            .filter(|v| js::truthy(Some(v)))
            .map(js::string);
        let (false, Some(upload)) = (publish_id.is_empty(), upload) else {
            return Err(Se::new("social_provider_rejected"));
        };
        ctx.hooks
            .accepted(json!({ "publish_id": publish_id }))
            .await?;
        upload_chunks(ctx, &upload, media, chunk, count).await?;
        return wait_for_status(ctx, json!({ "publish_id": publish_id })).await;
    }
    if length > TIKTOK_PHOTO_DESCRIPTION {
        return Err(Se::detail("social_media_constraint", "caption_too_long"));
    }
    let Some(url) = &media.public_url else {
        return Err(Se::new("social_public_media_url_unavailable"));
    };
    // A single request both transfers and posts: a lost answer is unconfirmed.
    let mut info = post_info.unwrap_or_default();
    info.insert("description".into(), json!(ctx.text));
    let body = json!({ "post_info": info,
        "source_info": { "source": "PULL_FROM_URL", "photo_images": [url], "photo_cover_index": 0 },
        "post_mode": if direct { "DIRECT_POST" } else { "MEDIA_UPLOAD" }, "media_type": "PHOTO" });
    let init = ctx
        .hooks
        .reaching(net::fetch(
            post("/v2/post/publish/content/init/", ctx.record, body),
            true,
        ))
        .await?;
    let publish_id = init
        .pointer("/data/publish_id")
        .filter(|v| js::truthy(Some(v)))
        .map(js::string)
        .unwrap_or_default();
    if publish_id.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    ctx.hooks
        .accepted(json!({ "publish_id": publish_id }))
        .await?;
    wait_for_status(ctx, json!({ "publish_id": publish_id })).await
}

pub async fn status(record: &JsonValue, remote: &JsonValue, view: &JsonValue) -> Sd<JsonValue> {
    let body = net::fetch(
        post(
            "/v2/post/publish/status/fetch/",
            record,
            json!({ "publish_id": remote.get("publish_id") }),
        ),
        false,
    )
    .await?;
    let data = body
        .get("data")
        .filter(|d| js::truthy(Some(d)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let state = data.get("status");
    if state == Some(&json!("PUBLISH_COMPLETE")) {
        let post = data
            .pointer("/publicaly_available_post_id/0")
            .filter(|p| js::truthy(Some(p)))
            .map(js::string);
        let username = view
            .pointer("/creator/username")
            .filter(|u| js::truthy(Some(u)))
            .map(js::string);
        let mut remote = remote.as_object().cloned().unwrap_or_default();
        remote.insert(
            "post_id".into(),
            post.clone().map_or(JsonValue::Null, JsonValue::String),
        );
        let url = match (post, username) {
            (Some(post), Some(username)) => {
                json!(format!("https://www.tiktok.com/@{username}/video/{post}"))
            }
            _ => JsonValue::Null,
        };
        return Ok(json!({ "status": "published", "remote": remote, "url": url }));
    }
    if state == Some(&json!("SEND_TO_USER_INBOX")) {
        return Ok(json!({ "status": "handed_off", "remote": remote }));
    }
    if state == Some(&json!("FAILED")) {
        let reason = data
            .get("fail_reason")
            .filter(|r| js::truthy(Some(r)))
            .map(js::string)
            .unwrap_or_default();
        let error = if reason == "auth_removed" {
            "social_session_expired"
        } else {
            "social_provider_rejected"
        };
        let code = if reason.is_empty() {
            JsonValue::Null
        } else {
            json!(reason)
        };
        return Ok(
            json!({ "status": "failed", "remote": remote, "error": error, "provider_code": code }),
        );
    }
    Ok(json!({ "status": "remote_processing", "remote": remote }))
}

async fn wait_for_status(ctx: &Ctx<'_>, remote: JsonValue) -> Sd<JsonValue> {
    for _ in 0..30 {
        let result = status(ctx.record, &remote, ctx.view).await?;
        if result["status"] != json!("remote_processing") {
            return Ok(result);
        }
        net::delay(3000).await;
    }
    Ok(json!({ "status": "remote_processing", "remote": remote }))
}
