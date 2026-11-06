// Instagram (server/social/social_instagram.js, ported): the Instagram API with Instagram Login,
// v25.0. Only professional accounts (Business or Media_Creator) can authorize it; a personal
// account has no publishing API and uses the system share sheet.
use super::net::{self, Sd, Se};
use super::{Config, Ctx};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const AUTHORIZE: &str = "https://www.instagram.com/oauth/authorize";
const TOKEN: &str = "https://api.instagram.com/oauth/access_token";
const GRAPH: &str = "https://graph.instagram.com";
const VERSION: &str = "v25.0";
const RUPLOAD: &str = "https://rupload.facebook.com/ig-api-upload";
const SCOPES: [&str; 2] = [
    "instagram_business_basic",
    "instagram_business_content_publish",
];
const DAY: f64 = 86_400_000.0;

pub fn configured(config: &Config) -> bool {
    !config.get("INSTAGRAM_APP_ID").is_empty() && !config.get("INSTAGRAM_APP_SECRET").is_empty()
}

fn graph(path: &str, params: &[(&str, &str)]) -> String {
    format!("{GRAPH}/{VERSION}/{path}?{}", form(params))
}

fn get(url: String) -> reqwest::RequestBuilder {
    http::client().get(url)
}

pub fn authorize_url(config: &Config, state: &str, redirect: &str) -> String {
    let scope = SCOPES.join(",");
    let pairs = [
        ("client_id", config.get("INSTAGRAM_APP_ID")),
        ("redirect_uri", redirect),
        ("response_type", "code"),
        ("scope", &scope),
        ("state", state),
    ];
    format!("{AUTHORIZE}?{}", form(&pairs))
}

fn text(value: Option<&JsonValue>) -> String {
    value
        .filter(|v| js::truthy(Some(v)))
        .map(js::string)
        .unwrap_or_default()
}

pub async fn exchange(config: &Config, code: &str, redirect: &str, now: i64) -> Sd<JsonValue> {
    let fields = [
        ("client_id", json!(config.get("INSTAGRAM_APP_ID"))),
        ("client_secret", json!(config.get("INSTAGRAM_APP_SECRET"))),
        ("grant_type", json!("authorization_code")),
        ("redirect_uri", json!(redirect)),
        ("code", json!(code)),
    ];
    let short = net::fetch(net::form_post(TOKEN, &fields), false).await?;
    let granted = match short.get("data").and_then(JsonValue::as_array) {
        Some(data) => data.first().cloned().unwrap_or(JsonValue::Null),
        None => short.clone(),
    };
    if !js::truthy(granted.get("access_token")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let short_token = js::string(&granted["access_token"]);
    let pairs = [
        ("grant_type", "ig_exchange_token"),
        ("client_secret", config.get("INSTAGRAM_APP_SECRET")),
        ("access_token", &short_token),
    ];
    let long = net::fetch(get(format!("{GRAPH}/access_token?{}", form(&pairs))), false).await?;
    if !js::truthy(long.get("access_token")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let token = js::string(&long["access_token"]);
    let fields = "user_id,username,name,account_type,profile_picture_url";
    let me = net::fetch(
        get(graph("me", &[("fields", fields), ("access_token", &token)])),
        false,
    )
    .await?;
    if !js::truthy(me.get("user_id")) {
        return Err(Se::new("social_provider_rejected"));
    }
    let permissions = match granted.get("permissions") {
        Some(JsonValue::Array(items)) => items
            .iter()
            .map(|scope| js::trim(&js::text(Some(scope))).to_string())
            .collect::<Vec<_>>(),
        other => text(other)
            .split(',')
            .map(|scope| scope.trim().to_string())
            .collect(),
    };
    let scopes: Vec<String> = permissions
        .into_iter()
        .filter(|scope| !scope.is_empty())
        .collect();
    Ok(
        json!({ "network": "instagram", "access_token": token, "issued_at": now,
        "expires_at": js::number_json(now as f64 + js::number_or(long.get("expires_in"), 0.0) * 1000.0), "scopes": scopes,
        "identity": { "id": js::string(&me["user_id"]), "username": text(me.get("username")), "display_name": text(me.get("name")),
            "account_type": text(me.get("account_type")), "avatar_url": text(me.get("profile_picture_url")) },
        "connected_at": now }),
    )
}

/// A long-lived token lasts 60 days and can be refreshed once it is a day old.
pub fn needs_refresh(record: &JsonValue, now: i64) -> bool {
    let now = now as f64;
    now - js::number(record.get("issued_at")) > DAY
        && js::number(record.get("expires_at")) - now < 7.0 * DAY
}

pub async fn refresh(record: &JsonValue, now: i64) -> Sd<JsonValue> {
    if now as f64 >= js::number(record.get("expires_at")) {
        return Err(Se::new("social_session_expired"));
    }
    let token = js::text(record.get("access_token"));
    let pairs = [
        ("grant_type", "ig_refresh_token"),
        ("access_token", token.as_str()),
    ];
    let body = net::fetch(
        get(format!("{GRAPH}/refresh_access_token?{}", form(&pairs))),
        false,
    )
    .await?;
    if !js::truthy(body.get("access_token")) {
        return Err(Se::new("social_session_expired"));
    }
    let mut refreshed = record.clone();
    refreshed["access_token"] = body["access_token"].clone();
    refreshed["issued_at"] = json!(now);
    refreshed["expires_at"] =
        js::number_json(now as f64 + js::number_or(body.get("expires_in"), 0.0) * 1000.0);
    Ok(refreshed)
}

pub fn describe(config: &Config) -> JsonValue {
    json!({ "public_media": !config.get("SOCIAL_PUBLIC_BASE_URL").is_empty() })
}

pub async fn publish(ctx: &Ctx<'_>) -> Sd<JsonValue> {
    if js::truthy(ctx.remote.get("container_id")) {
        return finish(ctx, ctx.remote.clone(), 120).await;
    }
    let Some(media) = ctx.media else {
        return Err(Se::new("social_provider_unavailable"));
    };
    let token = js::text(ctx.record.get("access_token"));
    let mut fields = if media.kind == "video" {
        vec![
            ("media_type", json!("REELS")),
            ("upload_type", json!("resumable")),
            ("caption", json!(ctx.text)),
        ]
    } else {
        vec![
            (
                "image_url",
                media
                    .public_url
                    .clone()
                    .map_or(JsonValue::Null, JsonValue::String),
            ),
            ("caption", json!(ctx.text)),
        ]
    };
    if media.kind == "image" && media.public_url.is_none() {
        return Err(Se::new("social_public_media_url_unavailable"));
    }
    fields.push(("access_token", json!(token)));
    let id = js::text(ctx.record.pointer("/identity/id"));
    let container = net::fetch(
        net::form_post(&format!("{GRAPH}/{VERSION}/{id}/media"), &fields),
        false,
    )
    .await?;
    let container_id = text(container.get("id"));
    if container_id.is_empty() {
        return Err(Se::new("social_provider_rejected"));
    }
    ctx.hooks
        .accepted(json!({ "container_id": container_id }))
        .await?;
    if media.kind == "video" {
        let file = tokio::fs::File::open(&media.path)
            .await
            .map_err(|e| Se::from(e.to_string()))?;
        let request = http::client()
            .post(format!("{RUPLOAD}/{VERSION}/{container_id}"))
            .header("Authorization", format!("OAuth {token}"))
            .header("offset", "0")
            .header("file_size", (media.size as u64).to_string())
            .body(reqwest::Body::from(file));
        net::fetch(request, false).await?;
        ctx.hooks.progress(1.0);
    }
    finish(ctx, json!({ "container_id": container_id }), 120).await
}

async fn container_status(record: &JsonValue, remote: &JsonValue) -> Sd<String> {
    let token = js::text(record.get("access_token"));
    let id = js::text(remote.get("container_id"));
    let body = net::fetch(
        get(graph(
            &id,
            &[("fields", "status_code"), ("access_token", &token)],
        )),
        false,
    )
    .await?;
    Ok(text(body.get("status_code")))
}

/// Waits for the container, then publishes it; `status` calls it again when a long video was
/// still processing at the end of the first attempt.
async fn finish(ctx: &Ctx<'_>, remote: JsonValue, attempts: usize) -> Sd<JsonValue> {
    let token = js::text(ctx.record.get("access_token"));
    for _ in 0..attempts {
        let state = container_status(ctx.record, &remote).await?;
        if state == "PUBLISHED" {
            return Ok(json!({ "status": "published", "remote": remote }));
        }
        if state == "ERROR" || state == "EXPIRED" {
            return Ok(
                json!({ "status": "failed", "remote": remote, "error": "social_provider_rejected", "provider_code": state }),
            );
        }
        if state == "FINISHED" {
            ctx.hooks.publishing(remote.clone()).await?;
            let id = js::text(ctx.record.pointer("/identity/id"));
            let fields = [
                (
                    "creation_id",
                    remote
                        .get("container_id")
                        .cloned()
                        .unwrap_or(JsonValue::Null),
                ),
                ("access_token", json!(token)),
            ];
            let request = net::form_post(&format!("{GRAPH}/{VERSION}/{id}/media_publish"), &fields);
            let published = ctx.hooks.reaching(net::fetch(request, true)).await?;
            let media_id = text(published.get("id"));
            // The post is live at this point: a failed permalink read only loses the link.
            let permalink = if media_id.is_empty() {
                JsonValue::Null
            } else {
                let url = graph(
                    &media_id,
                    &[("fields", "permalink"), ("access_token", &token)],
                );
                net::fetch(get(url), false)
                    .await
                    .ok()
                    .and_then(|body| {
                        body.get("permalink")
                            .filter(|p| js::truthy(Some(p)))
                            .cloned()
                    })
                    .unwrap_or(JsonValue::Null)
            };
            let mut remote = remote.as_object().cloned().unwrap_or_default();
            remote.insert(
                "media_id".into(),
                if media_id.is_empty() {
                    JsonValue::Null
                } else {
                    json!(media_id)
                },
            );
            return Ok(json!({ "status": "published", "remote": remote, "url": permalink }));
        }
        net::delay(5000).await;
    }
    Ok(json!({ "status": "remote_processing", "remote": remote }))
}

pub async fn status(ctx: &Ctx<'_>, verify_only: bool) -> Sd<JsonValue> {
    let state = container_status(ctx.record, &ctx.remote).await?;
    let remote = ctx.remote.clone();
    if state == "PUBLISHED" {
        return Ok(json!({ "status": "published", "remote": remote }));
    }
    if state == "ERROR" || state == "EXPIRED" {
        return Ok(
            json!({ "status": "failed", "remote": remote, "error": "social_provider_rejected", "provider_code": state }),
        );
    }
    // An unconfirmed delivery is only verified here. A container still FINISHED was never
    // published (a container publishes once): the delivery becomes retryable, the retry reusing it.
    if state == "FINISHED" && verify_only {
        return Ok(
            json!({ "status": "failed", "remote": remote, "error": "social_provider_unavailable" }),
        );
    }
    if state == "FINISHED" {
        return finish(ctx, remote, 1).await;
    }
    Ok(
        json!({ "status": if verify_only { "unconfirmed" } else { "remote_processing" }, "remote": remote }),
    )
}
