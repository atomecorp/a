// Facebook (server/social/social_facebook.js, ported): Facebook Login (manual flow), the Pages
// API and the Video API's resumable upload, v25.0. Publishing exists for the Pages the person
// administers only: a personal profile has no publishing API.
use super::net::{self, Sd, Se};
use super::{Config, Ctx};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const VERSION: &str = "v25.0";
// Publishing, and since R-190 the Page's comments and Messenger conversations (read by the
// webhook, answered through `meta_inbox`).
const SCOPES: [&str; 7] = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_engagement",
    "pages_read_user_content",
    "pages_manage_metadata",
    "pages_messaging",
];

/// A Page's post, photo or video removed with the Page's token.
pub async fn remove(config: &Config, record: &JsonValue, remote: &JsonValue) -> Sd<()> {
    let page = page_of(record, &text(remote.get("page_id")))?;
    let id = ["video_id", "post_id", "photo_id"]
        .iter()
        .map(|key| text(remote.get(*key)))
        .find(|id| !id.is_empty())
        .ok_or_else(|| Se::new("social_update_unsupported"))?;
    let token = text(page.get("access_token"));
    let url = format!(
        "{}?{}",
        graph(config, &format!("/{id}")),
        form(&[("access_token", token.as_str())])
    );
    net::removed(http::client().delete(url)).await
}

pub fn graph(config: &Config, path: &str) -> String {
    format!(
        "{}/{VERSION}{path}",
        config.api("facebook", "https://graph.facebook.com")
    )
}

fn text(value: Option<&JsonValue>) -> String {
    value
        .filter(|v| js::truthy(Some(v)))
        .map(js::string)
        .unwrap_or_default()
}

pub fn configured(config: &Config) -> bool {
    config.app("FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET")
}

pub fn authorize_url(config: &Config, state: &str, redirect: &str) -> String {
    let scope = SCOPES.join(",");
    let pairs = [
        ("client_id", config.get("FACEBOOK_APP_ID")),
        ("redirect_uri", redirect),
        ("state", state),
        ("response_type", "code"),
        ("scope", &scope),
    ];
    format!(
        "{}/{VERSION}/dialog/oauth?{}",
        config.api("facebook", "https://www.facebook.com"),
        form(&pairs)
    )
}

fn get(config: &Config, path: &str, pairs: &[(&str, &str)]) -> reqwest::RequestBuilder {
    http::client().get(format!("{}?{}", graph(config, path), form(pairs)))
}

pub async fn exchange(config: &Config, code: &str, redirect: &str, now: i64) -> Sd<JsonValue> {
    let (id, secret) = (
        config.get("FACEBOOK_APP_ID"),
        config.get("FACEBOOK_APP_SECRET"),
    );
    let short = net::fetch(
        get(
            config,
            "/oauth/access_token",
            &[
                ("client_id", id),
                ("redirect_uri", redirect),
                ("client_secret", secret),
                ("code", code),
            ],
        ),
        false,
    )
    .await?;
    // A long-lived user token (about 60 days); the Page tokens read with it do not expire.
    let short_token = text(short.get("access_token"));
    let long = net::fetch(
        get(
            config,
            "/oauth/access_token",
            &[
                ("grant_type", "fb_exchange_token"),
                ("client_id", id),
                ("client_secret", secret),
                ("fb_exchange_token", &short_token),
            ],
        ),
        false,
    )
    .await?;
    if !js::truthy(long.get("access_token")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let token = js::string(&long["access_token"]);
    let (me, permissions, accounts) = tokio::try_join!(
        net::fetch(
            get(
                config,
                "/me",
                &[("fields", "id,name"), ("access_token", &token)]
            ),
            false
        ),
        net::fetch(
            get(config, "/me/permissions", &[("access_token", &token)]),
            false
        ),
        net::fetch(
            get(
                config,
                "/me/accounts",
                &[
                    ("fields", "id,name,access_token,tasks"),
                    ("access_token", &token)
                ]
            ),
            false
        ),
    )?;
    if !js::truthy(me.get("id")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let rows = |body: &JsonValue| {
        body.get("data")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default()
    };
    let scopes: Vec<String> = rows(&permissions)
        .iter()
        .filter(|entry| entry.get("status") == Some(&json!("granted")))
        .map(|entry| js::text(entry.get("permission")))
        .collect();
    let pages: Vec<JsonValue> = rows(&accounts).iter().map(|page| {
        let tasks: Vec<String> = page.get("tasks").and_then(JsonValue::as_array).map(|tasks| tasks.iter().map(|t| js::text(Some(t))).collect()).unwrap_or_default();
        json!({ "id": js::text(page.get("id")), "name": text(page.get("name")), "access_token": text(page.get("access_token")), "tasks": tasks })
    }).collect();
    let expires = if js::truthy(long.get("expires_in")) {
        js::number_json(now as f64 + js::number(long.get("expires_in")) * 1000.0)
    } else {
        JsonValue::Null
    };
    Ok(
        json!({ "network": "facebook", "access_token": token, "expires_at": expires, "scopes": scopes,
        "identity": { "id": js::string(&me["id"]), "display_name": text(me.get("name")) }, "pages": pages, "connected_at": now }),
    )
}

pub async fn revoke(config: &Config, record: &JsonValue) -> Sd<()> {
    let token = js::text(record.get("access_token"));
    let request = http::client().delete(format!(
        "{}?{}",
        graph(config, "/me/permissions"),
        form(&[("access_token", token.as_str())])
    ));
    net::fetch(request, false).await.map(|_| ())
}

pub fn public_pages(record: &JsonValue) -> JsonValue {
    let pages = record
        .get("pages")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    json!(
        pages
            .iter()
            .map(|page| {
                let can_post = page
                    .get("tasks")
                    .and_then(JsonValue::as_array)
                    .is_some_and(|tasks| tasks.iter().any(|t| t == "CREATE_CONTENT"));
                json!({ "id": page.get("id"), "name": page.get("name"), "can_post": can_post })
            })
            .collect::<Vec<_>>()
    )
}

pub fn page_of(record: &JsonValue, page_id: &str) -> Sd<JsonValue> {
    let pages = record
        .get("pages")
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    let Some(page) = pages
        .into_iter()
        .find(|page| page.get("id") == Some(&json!(page_id)))
    else {
        return Err(Se::new("social_destination_invalid"));
    };
    let creates = page
        .get("tasks")
        .and_then(JsonValue::as_array)
        .is_some_and(|tasks| tasks.iter().any(|t| t == "CREATE_CONTENT"));
    if !js::truthy(page.get("access_token")) || !creates {
        return Err(Se::new("social_permission_missing"));
    }
    Ok(page)
}

async fn published(config: &Config, page: &JsonValue, remote: JsonValue) -> Sd<JsonValue> {
    let id = [remote.get("post_id"), remote.get("photo_id")]
        .into_iter()
        .map(text)
        .find(|id| !id.is_empty());
    let Some(id) = id else {
        return Err(Se::reached("social_provider_rejected"));
    };
    // The post exists at this point: a failed permalink read only loses the link.
    let token = js::text(page.get("access_token"));
    let url = net::fetch(
        get(
            config,
            &format!("/{id}"),
            &[("fields", "permalink_url"), ("access_token", &token)],
        ),
        false,
    )
    .await
    .ok()
    .and_then(|body| {
        body.get("permalink_url")
            .filter(|u| js::truthy(Some(u)))
            .cloned()
    })
    .unwrap_or(JsonValue::Null);
    let mut remote = remote.as_object().cloned().unwrap_or_default();
    remote.insert("page_id".into(), page["id"].clone());
    Ok(json!({ "status": "published", "remote": remote, "url": url }))
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    let destination = js::text(ctx.plan.get("destination"));
    let page = page_of(ctx.record, destination.split(':').nth(2).unwrap_or(""))?;
    let page_id = js::text(page.get("id"));
    let page_token = js::text(page.get("access_token"));
    let Some(media) = ctx.media else {
        ctx.hooks.publishing(json!({})).await?;
        let fields = [
            ("message", json!(ctx.text)),
            ("access_token", json!(page_token)),
        ];
        let post = ctx
            .hooks
            .reaching(net::fetch(
                net::form_post(&graph(ctx.config, &format!("/{page_id}/feed")), &fields),
                true,
            ))
            .await?;
        return published(
            ctx.config,
            &page,
            json!({ "post_id": text(post.get("id")) }),
        )
        .await;
    };
    let bytes = tokio::fs::read(&media.path)
        .await
        .map_err(|e| Se::from(e.to_string()))?;
    if media.kind == "image" {
        let mut parts = vec![(
            "source",
            Some((media.name.as_str(), media.mime.as_str())),
            bytes,
        )];
        if !ctx.text.is_empty() {
            parts.push(("caption", None, ctx.text.as_bytes().to_vec()));
        }
        parts.push(("access_token", None, page_token.as_bytes().to_vec()));
        let (kind, body) = net::multipart(&parts);
        ctx.hooks.publishing(json!({})).await?;
        let request = http::client()
            .post(graph(ctx.config, &format!("/{page_id}/photos")))
            .header("Content-Type", kind)
            .body(body);
        let photo = ctx.hooks.reaching(net::fetch(request, true)).await?;
        return published(
            ctx.config,
            &page,
            json!({ "photo_id": text(photo.get("id")), "post_id": text(photo.get("post_id")) }),
        )
        .await;
    }
    let size = bytes.len().to_string();
    let user_token = js::text(ctx.record.get("access_token"));
    let pairs = [
        ("file_name", media.name.as_str()),
        ("file_length", &size),
        ("file_type", media.mime.as_str()),
        ("access_token", &user_token),
    ];
    let url = format!(
        "{}?{}",
        graph(
            ctx.config,
            &format!("/{}/uploads", ctx.config.get("FACEBOOK_APP_ID"))
        ),
        form(&pairs)
    );
    let session = net::fetch(http::client().post(url), false).await?;
    let session_id = text(session.get("id"));
    if !session_id.starts_with("upload:") {
        return Err(Se::new("social_provider_rejected"));
    }
    let request = http::client()
        .post(graph(ctx.config, &format!("/{session_id}")))
        .header("Authorization", format!("OAuth {user_token}"))
        .header("file_offset", "0")
        .body(bytes);
    let uploaded = net::fetch(request, false).await?;
    if !js::truthy(uploaded.get("h")) {
        return Err(Se::new("social_provider_rejected"));
    }
    ctx.hooks.progress(1.0);
    ctx.hooks.publishing(json!({})).await?;
    let description = if ctx.text.is_empty() {
        JsonValue::Null
    } else {
        json!(ctx.text)
    };
    let fields = [
        ("description", description),
        ("fbuploader_video_file_chunk", uploaded["h"].clone()),
        ("access_token", json!(page_token)),
    ];
    let url = format!(
        "{}/{VERSION}/{page_id}/videos",
        ctx.config
            .api("facebook", "https://graph-video.facebook.com")
    );
    let video = ctx
        .hooks
        .reaching(net::fetch(net::form_post(&url, &fields), true))
        .await?;
    let video_id = text(video.get("id"));
    if video_id.is_empty() {
        return Err(Se::reached("social_provider_rejected"));
    }
    ctx.hooks
        .accepted(json!({ "video_id": video_id, "page_id": page_id }))
        .await?;
    status(
        ctx.config,
        ctx.record,
        &json!({ "video_id": video_id, "page_id": page_id }),
    )
    .await
}

pub async fn status(config: &Config, record: &JsonValue, remote: &JsonValue) -> Sd<JsonValue> {
    if !js::truthy(remote.get("video_id")) {
        let status = if js::truthy(remote.get("post_id")) {
            "published"
        } else {
            "unconfirmed"
        };
        return Ok(json!({ "status": status, "remote": remote }));
    }
    let page = page_of(record, &js::text(remote.get("page_id")))?;
    let token = js::text(page.get("access_token"));
    let id = js::text(remote.get("video_id"));
    let body = net::fetch(
        get(
            config,
            &format!("/{id}"),
            &[("fields", "status"), ("access_token", &token)],
        ),
        false,
    )
    .await?;
    let state = text(body.pointer("/status/video_status"));
    if state == "ready" {
        return Ok(json!({ "status": "published", "remote": remote }));
    }
    if state == "error" || state == "expired" {
        return Ok(
            json!({ "status": "failed", "remote": remote, "error": "social_provider_rejected", "provider_code": state }),
        );
    }
    Ok(json!({ "status": "remote_processing", "remote": remote }))
}

/// A scheduled update (Q4 of 28 Oct. 2026): a Page's post takes its new text in place, a video
/// its description.
pub async fn update(
    config: &Config,
    record: &JsonValue,
    remote: &JsonValue,
    text_value: &str,
) -> Sd<JsonValue> {
    let page = page_of(record, &js::text(remote.get("page_id")))?;
    let video = text(remote.get("video_id"));
    let id = [
        remote.get("video_id"),
        remote.get("post_id"),
        remote.get("photo_id"),
    ]
    .into_iter()
    .map(text)
    .find(|id| !id.is_empty());
    let Some(id) = id else {
        return Err(Se::new("social_update_unsupported"));
    };
    let field = if video.is_empty() {
        "message"
    } else {
        "description"
    };
    let fields = [
        (field, json!(text_value)),
        ("access_token", page["access_token"].clone()),
    ];
    net::fetch(
        net::form_post(&graph(config, &format!("/{id}")), &fields),
        true,
    )
    .await?;
    Ok(json!({ "status": "published", "remote": remote }))
}
