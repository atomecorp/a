// The social actions (server/social/social_operations.js, ported): every entry point — eVe
// panels, runtime tools, MCP — lands here through the person's `/ws/api` provider channel.
use super::jobs::{self, Hooks, Job, Store};
use super::net::{Sd, Se};
use super::sessions::{self, Network, Session};
use super::{Config, Ctx, Files, Media, facebook, instagram, media, plan, tiktok};
use crate::providers::catalog;
use crate::providers::credentials::Credentials;
use crate::providers::generation::now_ms;
use crate::providers::oauth::OAuth;
use crate::providers::params;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const ASSISTED_OUTCOMES: [&str; 4] = ["handed_off", "exported", "cancelled", "failed"];

/// What one social request works with.
#[derive(Clone)]
pub struct Env {
    pub config: Arc<Config>,
    pub vault: Credentials,
    pub files: Files,
    pub principal: String,
    pub store: Store,
}

/// `String(value || '')`.
fn field(object: &JsonValue, key: &str) -> String {
    let value = object.get(key);
    if js::truthy(value) {
        js::text(value)
    } else {
        String::new()
    }
}

fn truthy_or_null(object: &JsonValue, key: &str) -> JsonValue {
    object
        .get(key)
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(JsonValue::Null)
}

fn server_route(delivery: &JsonValue) -> bool {
    delivery.get("route") == Some(&json!("direct"))
        || delivery.get("transfer") == Some(&json!("provider_inbox"))
}

fn public_delivery(delivery: &JsonValue) -> JsonValue {
    let remote = delivery
        .get("remote")
        .filter(|r| js::truthy(Some(r)))
        .map_or(JsonValue::Null, |remote| {
            let kept = remote
                .as_object()
                .into_iter()
                .flatten()
                .filter(|(_, v)| v.as_str().is_some_and(|s| !s.is_empty()));
            JsonValue::Object(kept.map(|(k, v)| (k.clone(), v.clone())).collect())
        });
    let variant = delivery
        .get("variant")
        .filter(|v| js::truthy(Some(v)))
        .map_or(JsonValue::Null, |variant| {
            let mut variant = variant.as_object().cloned().unwrap_or_default();
            variant.remove("path");
            JsonValue::Object(variant)
        });
    let or_zero = |key: &str| {
        delivery
            .get(key)
            .filter(|v| js::truthy(Some(v)))
            .cloned()
            .unwrap_or(json!(0))
    };
    json!({ "destination": delivery.get("destination"), "network": delivery.get("network"), "route": delivery.get("route"),
        "transfer": truthy_or_null(delivery, "transfer"), "status": delivery.get("status"), "error": truthy_or_null(delivery, "error"),
        "provider_code": truthy_or_null(delivery, "provider_code"), "detail": truthy_or_null(delivery, "detail"),
        "notes": delivery.get("notes").filter(|n| js::truthy(Some(n))).cloned().unwrap_or(json!([])),
        "url": truthy_or_null(delivery, "url"), "attempts": or_zero("attempts"),
        "progress": delivery.get("progress").cloned().unwrap_or(JsonValue::Null),
        "confirmed_by": truthy_or_null(delivery, "confirmed_by"), "remote": remote, "variant": variant,
        "fallback": truthy_or_null(delivery, "fallback") })
}

fn read<R>(job: &Job, read: impl FnOnce(&JsonValue) -> R) -> R {
    read(&job.lock().expect("social job"))
}

fn delivery_of(job: &Job, destination: &str) -> Option<JsonValue> {
    read(job, |job| job["deliveries"].get(destination).cloned())
}

async fn exists(file: &Path) -> bool {
    tokio::fs::metadata(file).await.is_ok()
}

/// Not found and not allowed answer alike: the asset must not be probed.
async fn resolve_source(media: &JsonValue, env: &Env) -> Sd<PathBuf> {
    (env.files)(field(media, "file"), env.principal.clone())
        .await
        .ok_or_else(|| Se::new("social_media_missing"))
}

/// `prepareDelivery`: the delivery's variant prepared (or reused) and checked against the network.
async fn prepare_delivery(job: &Job, destination: &str, store: &Store) -> Sd<()> {
    let (network, probe, source, id) = read(job, |job| {
        (
            field(&job["deliveries"][destination], "network"),
            job["probe"].clone(),
            field(job, "source"),
            field(job, "id"),
        )
    });
    let limits = media::limits(&network, &field(&probe, "kind"));
    let (violations, steps) = media::assess(&network, &probe);
    if !violations.is_empty() {
        return Err(Se::detail("social_media_constraint", &violations.join(",")));
    }
    let key = JsonValue::Array(steps.clone()).to_string();
    let known = read(job, |job| job["variants"].get(&key).cloned());
    let reusable = match &known {
        Some(variant) => exists(Path::new(&field(variant, "path"))).await,
        None => false,
    };
    let variant = match known.filter(|_| reusable) {
        Some(variant) => variant,
        None => {
            let out = jobs::temp_dir(&store.root, &id);
            let (path, prepared, original) =
                media::prepare_variant(Path::new(&source), &probe, &steps, &out).await?;
            let variant = json!({ "path": path.to_string_lossy(), "original": original, "mime": prepared.get("mime"),
                "size": prepared.get("size"), "width": prepared.get("width"), "height": prepared.get("height"),
                "duration": prepared.get("duration"), "audio": js::truthy(prepared.get("audio")), "steps": steps });
            job.lock().expect("social job")["variants"][&key] = variant.clone();
            variant
        }
    };
    if limits.is_some_and(|limits| {
        limits.max_bytes > 0.0 && js::number(variant.get("size")) > limits.max_bytes
    }) {
        return Err(Se::detail("social_media_constraint", "file_too_large"));
    }
    let any = |test: &dyn Fn(&JsonValue) -> bool| json!(steps.iter().any(test));
    let mut shown = variant.as_object().cloned().unwrap_or_default();
    shown.insert(
        "converted".into(),
        any(&|step| js::truthy(step.get("converted"))),
    );
    shown.insert(
        "flattened".into(),
        any(&|step| js::truthy(step.get("flatten"))),
    );
    shown.insert(
        "resized".into(),
        any(&|step| js::truthy(step.get("resized"))),
    );
    shown.insert(
        "transcoded".into(),
        any(&|step| step.get("type") == Some(&json!("video_h264"))),
    );
    jobs::delivery(job, destination, |delivery| {
        delivery.insert("variant_key".into(), json!(key));
        delivery.insert("variant".into(), JsonValue::Object(shown));
    });
    Ok(())
}

/// TikTok's caption limits, in UTF-16 units.
fn check_text(job: &JsonValue, delivery: &JsonValue) -> Option<&'static str> {
    let length = field(&job["content"], "text").encode_utf16().count();
    let (tiktok, kind) = (
        delivery.get("network") == Some(&json!("tiktok")),
        field(job, "kind"),
    );
    let limit = match kind.as_str() {
        "video" => media::TIKTOK_VIDEO_CAPTION,
        "image" => media::TIKTOK_PHOTO_DESCRIPTION,
        _ => return None,
    };
    (tiktok && length > limit).then_some("caption_too_long")
}

fn content_kind(content: &JsonValue) -> Option<&'static str> {
    match content.pointer("/media/kind").and_then(JsonValue::as_str) {
        Some("image") => Some("image"),
        Some("video") => Some("video"),
        _ => (!js::trim(&field(content, "text")).is_empty()).then_some("text"),
    }
}

async fn prepare(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let content = &payload["content"];
    let kind = content_kind(content).ok_or_else(|| Se::new("social_content_empty"))?;
    let handoff = payload
        .get("handoff")
        .filter(|h| !h.is_null())
        .cloned()
        .unwrap_or(json!({}));
    let store = &env.store;
    store.prune_stale().await?;
    let accounts = sessions::accounts(&env.vault, &env.config).await;
    let media_of = content
        .get("media")
        .filter(|m| js::truthy(Some(m)))
        .cloned();
    let job: Job = Arc::new(Mutex::new(
        json!({ "id": jobs::new_id(), "created_at": now_ms(), "kind": kind,
        "content": { "text": js::trim(&field(content, "text")), "media": media_of.clone().unwrap_or(JsonValue::Null) },
        "source": null, "probe": null, "variants": {}, "deliveries": {} }),
    ));
    let destinations = payload["destinations"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let plans: Vec<JsonValue> = destinations
        .iter()
        .map(|d| plan::destination(&js::string(d), &accounts, Some(kind), &handoff))
        .collect();
    let mut media_error = None;
    if let Some(asked) = media_of.as_ref().filter(|_| plans.iter().any(server_route)) {
        let probed = async {
            let source = resolve_source(asked, env).await?;
            job.lock().expect("social job")["source"] = json!(source.to_string_lossy());
            let probe = media::probe(&source).await?;
            job.lock().expect("social job")["probe"] = probe.clone();
            if probe.get("kind") != asked.get("kind") {
                return Err(Se::new("social_media_type_unsupported"));
            }
            Ok(())
        };
        media_error = probed.await.err();
    }
    let mut thumbnails: JsonMap<String, JsonValue> = JsonMap::new();
    for planned in &plans {
        let destination = field(planned, "destination");
        let routed = js::truthy(planned.get("route"));
        let delivery = json!({ "destination": planned.get("destination"), "network": planned.get("network"),
            "route": truthy_or_null(planned, "route"), "transfer": truthy_or_null(planned, "transfer"),
            "notes": planned.get("notes").filter(|n| js::truthy(Some(n))).cloned().unwrap_or(json!([])),
            "status": if routed { "ready" } else { "failed" }, "error": truthy_or_null(planned, "error"),
            "attempts": 0, "remote": null, "url": null });
        job.lock().expect("social job")["deliveries"][&destination] = delivery;
        if routed && server_route(planned) && media_of.is_some() {
            let prepared = async {
                if let Some(failure) = &media_error {
                    return Err(failure.clone());
                }
                prepare_delivery(&job, &destination, store).await?;
                let (key, path) = read(&job, |job| {
                    let delivery = &job["deliveries"][&destination];
                    (
                        field(delivery, "variant_key"),
                        field(&delivery["variant"], "path"),
                    )
                });
                if !thumbnails.contains_key(&key) {
                    let preview = media::thumbnail(Path::new(&path), kind).await?;
                    thumbnails.insert(key, preview);
                }
                Ok(())
            };
            if let Err(failure) = prepared.await {
                let fallback = plan::destination(&destination, &json!({}), Some(kind), &handoff);
                let code = if failure.code.is_empty() {
                    "social_media_unreadable".into()
                } else {
                    failure.code
                };
                jobs::delivery(&job, &destination, |delivery| {
                    delivery.extend([
                        ("status".into(), json!("failed")),
                        ("route".into(), JsonValue::Null),
                        ("error".into(), json!(code)),
                        ("detail".into(), json!(failure.detail)),
                        ("fallback".into(), fallback),
                    ]);
                });
            }
        }
        let text_error = read(&job, |job| {
            let delivery = &job["deliveries"][&destination];
            if js::truthy(delivery.get("route")) && server_route(delivery) {
                check_text(job, delivery)
            } else {
                None
            }
        });
        if let Some(detail) = text_error {
            jobs::delivery(&job, &destination, |delivery| {
                delivery.extend([
                    ("status".into(), json!("failed")),
                    ("route".into(), JsonValue::Null),
                    ("error".into(), json!("social_media_constraint")),
                    ("detail".into(), json!(detail)),
                ]);
            });
        }
    }
    store.write(&job).await?;
    let job = job.lock().expect("social job").clone();
    let probe = &job["probe"];
    let shown = (!probe.is_null()).then(|| json!({ "kind": probe.get("kind"), "mime": probe.get("mime"),
        "width": probe.get("width"), "height": probe.get("height"), "duration": probe.get("duration"),
        "size": probe.get("size"), "audio": js::truthy(probe.get("audio")) }));
    let deliveries: Vec<JsonValue> = job["deliveries"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(_, delivery)| {
            let mut shown = public_delivery(delivery);
            let key = field(delivery, "variant_key");
            shown["preview"] = if key.is_empty() {
                JsonValue::Null
            } else {
                truthy_or_null(&JsonValue::Object(thumbnails.clone()), &key)
            };
            shown
        })
        .collect();
    Ok(
        json!({ "job_id": job["id"], "kind": kind, "text": job["content"]["text"], "media": shown, "accounts": accounts,
        "deliveries": deliveries }),
    )
}

/// `mediaFor`: the asset a delivery sends, prepared again when its variant was released.
async fn media_for(job: &Job, destination: &str, env: &Env) -> Sd<Option<Media>> {
    let Some(asked) = read(job, |job| {
        job["content"]
            .get("media")
            .filter(|m| js::truthy(Some(m)))
            .cloned()
    }) else {
        return Ok(None);
    };
    let variant_path = |job: &JsonValue| {
        let key = field(&job["deliveries"][destination], "variant_key");
        job["variants"]
            .get(&key)
            .map(|variant| field(variant, "path"))
    };
    let known = read(job, variant_path);
    let ready = match &known {
        Some(path) => exists(Path::new(path)).await,
        None => false,
    };
    if !ready {
        let source = read(job, |job| field(job, "source"));
        if source.is_empty() || !exists(Path::new(&source)).await {
            let source = resolve_source(&asked, env).await?;
            job.lock().expect("social job")["source"] = json!(source.to_string_lossy());
        }
        if read(job, |job| job["probe"].is_null()) {
            let source = read(job, |job| field(job, "source"));
            let probe = media::probe(Path::new(&source)).await?;
            job.lock().expect("social job")["probe"] = probe;
        }
        prepare_delivery(job, destination, &env.store).await?;
    }
    let (kind, network, variant, mut probe, id) = read(job, |job| {
        let key = field(&job["deliveries"][destination], "variant_key");
        (
            field(job, "kind"),
            field(&job["deliveries"][destination], "network"),
            job["variants"][&key].clone(),
            job["probe"].as_object().cloned().unwrap_or_default(),
            field(job, "id"),
        )
    });
    probe.extend(variant.as_object().cloned().unwrap_or_default());
    let path = PathBuf::from(field(&variant, "path"));
    let named = field(&asked, "name");
    let named = if named.is_empty() {
        field(&asked, "file")
    } else {
        named
    };
    let stem = Path::new(&named)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty());
    let extension = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let mime = field(&variant, "mime");
    let public_url = (kind == "image" && network != "facebook")
        .then(|| {
            env.store
                .public
                .issue(env.config.get("SOCIAL_PUBLIC_BASE_URL"), &path, &mime, &id)
        })
        .flatten();
    Ok(Some(Media {
        kind,
        size: js::number(variant.get("size")),
        mime,
        probe: JsonValue::Object(probe),
        name: format!("{}{extension}", stem.as_deref().unwrap_or("atome")),
        path,
        public_url,
    }))
}

pub(super) async fn connected(network: Network, env: &Env) -> Sd<(Session, JsonValue)> {
    let mut session = sessions::load(network, &env.vault, &env.config).await?;
    if session.state != "connected" {
        return Err(Se::new(if session.state == "expired" {
            "social_session_expired"
        } else {
            "social_not_connected"
        }));
    }
    let view = sessions::describe(&mut session, &env.config).await;
    Ok((session, view))
}

pub(super) fn record(session: &Session) -> Sd<&JsonValue> {
    session
        .record
        .as_ref()
        .ok_or_else(|| Se::new("social_not_connected"))
}

async fn send(env: Env, job: Job, destination: String, hooks: Hooks) -> Sd<JsonValue> {
    let plan = delivery_of(&job, &destination).unwrap_or(JsonValue::Null);
    let network = Network::of(&field(&plan, "network"))?;
    let (session, view) = connected(network, &env).await?;
    let media = media_for(&job, &destination, &env).await?;
    let plan = delivery_of(&job, &destination).unwrap_or(JsonValue::Null);
    let text = read(&job, |job| field(&job["content"], "text"));
    let options = plan
        .get("options")
        .filter(|o| js::truthy(Some(o)))
        .cloned()
        .unwrap_or(json!({}));
    let ctx = Ctx {
        config: &env.config,
        record: record(&session)?,
        plan: &plan,
        media: media.as_ref(),
        text: &text,
        options: &options,
        view: &view,
        remote: plan.get("remote").cloned().unwrap_or(JsonValue::Null),
        hooks: &hooks,
    };
    match network {
        Network::TikTok => tiktok::publish(&ctx).await,
        Network::Instagram => instagram::publish(&ctx).await,
        Network::Facebook => facebook::publish(&ctx).await,
    }
}

async fn publish(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let store = &env.store;
    let (job, _held) = store.acquire(&field(payload, "job_id")).await?;
    let asked = payload["deliveries"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let results = futures_util::future::join_all(asked.iter().map(|asked| {
        let (job, destination) = (job.clone(), field(asked, "id"));
        async move {
            let Some(delivery) = delivery_of(&job, &destination) else {
                return Ok(json!({ "destination": destination, "status": "failed", "error": "social_destination_invalid" }));
            };
            if !server_route(&delivery) {
                return Ok(public_delivery(&delivery));
            }
            if let Some(options) = asked.get("options").filter(|o| js::truthy(Some(o))) {
                jobs::delivery(&job, &destination, |delivery| delivery.insert("options".into(), options.clone()));
            }
            let (env, sent, target) = (env.clone(), job.clone(), destination.clone());
            jobs::run(store, &job, &destination, &env.principal.clone(), move |hooks| {
                Box::pin(send(env, sent, target, hooks))
            })
            .await?;
            Ok::<_, Se>(public_delivery(&delivery_of(&job, &destination).unwrap_or(JsonValue::Null)))
        }
    }))
    .await
    .into_iter()
    .collect::<Sd<Vec<_>>>()?;
    store.release_if_settled(&job, false).await?;
    store.write(&job).await?;
    Ok(json!({ "job_id": read(&job, |job| job["id"].clone()), "deliveries": results }))
}

fn listed(job: &Job) -> JsonValue {
    read(job, |job| {
        let deliveries: Vec<JsonValue> = job["deliveries"]
            .as_object()
            .into_iter()
            .flatten()
            .map(|(_, d)| public_delivery(d))
            .collect();
        json!({ "job_id": job["id"], "deliveries": deliveries })
    })
}

fn destinations(job: &Job) -> Vec<String> {
    read(job, |job| {
        job["deliveries"]
            .as_object()
            .map(|d| d.values().map(|d| field(d, "destination")).collect())
            .unwrap_or_default()
    })
}

async fn check(env: &Env, job: &Job, destination: &str, delivery: &JsonValue) -> Sd<JsonValue> {
    let network = Network::of(&field(delivery, "network"))?;
    let (session, view) = connected(network, env).await?;
    let record = record(&session)?;
    let remote = delivery["remote"].clone();
    match network {
        Network::TikTok => tiktok::status(record, &remote, &view).await,
        Network::Facebook => facebook::status(record, &remote).await,
        Network::Instagram => {
            let hooks = Hooks::new(env.store.clone(), job.clone(), destination);
            let ctx = Ctx {
                config: &env.config,
                record,
                plan: delivery,
                media: None,
                text: "",
                options: &json!({}),
                view: &view,
                remote,
                hooks: &hooks,
            };
            instagram::status(&ctx, delivery.get("status") == Some(&json!("unconfirmed"))).await
        }
    }
}

async fn status(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let store = &env.store;
    let (job, _held) = store.acquire(&field(payload, "job_id")).await?;
    let id = read(&job, |job| field(job, "id"));
    for destination in destinations(&job) {
        let Some(delivery) = delivery_of(&job, &destination) else {
            continue;
        };
        let open = ["remote_processing", "unconfirmed"]
            .iter()
            .any(|s| delivery.get("status") == Some(&json!(s)));
        if !server_route(&delivery) || !open || !js::truthy(delivery.get("remote")) {
            continue;
        }
        let Some(_lock) = store.lock(&env.principal, &id, &destination) else {
            continue;
        };
        let checked = check(env, &job, &destination, &delivery).await;
        jobs::delivery(&job, &destination, |delivery| match checked {
            Ok(result) => {
                let mut remote = delivery
                    .get("remote")
                    .and_then(JsonValue::as_object)
                    .cloned()
                    .unwrap_or_default();
                remote.extend(
                    result
                        .get("remote")
                        .and_then(JsonValue::as_object)
                        .cloned()
                        .unwrap_or_default(),
                );
                let url = truthy_or_null(&result, "url");
                let url = if url.is_null() {
                    truthy_or_null(&JsonValue::Object(delivery.clone()), "url")
                } else {
                    url
                };
                delivery.extend([
                    (
                        "status".into(),
                        result.get("status").cloned().unwrap_or(JsonValue::Null),
                    ),
                    ("remote".into(), JsonValue::Object(remote)),
                    ("url".into(), url),
                    ("error".into(), truthy_or_null(&result, "error")),
                    (
                        "provider_code".into(),
                        truthy_or_null(&result, "provider_code"),
                    ),
                ]);
            }
            Err(failure) => {
                let code = if failure.code.is_empty() {
                    "social_provider_unavailable".to_string()
                } else {
                    failure.code
                };
                let mut notes = delivery
                    .get("notes")
                    .and_then(JsonValue::as_array)
                    .cloned()
                    .unwrap_or_default();
                if !notes.contains(&json!(code)) {
                    notes.push(json!(code));
                }
                delivery.insert("notes".into(), JsonValue::Array(notes));
            }
        });
    }
    store.release_if_settled(&job, false).await?;
    store.write(&job).await?;
    Ok(listed(&job))
}

async fn cancel(payload: &JsonValue, env: &Env) -> Sd<JsonValue> {
    let store = &env.store;
    let (job, _held) = store.acquire(&field(payload, "job_id")).await?;
    let (id, only) = (
        read(&job, |job| field(job, "id")),
        field(payload, "destination"),
    );
    for destination in destinations(&job) {
        if !only.is_empty() && destination != only {
            continue;
        }
        if store.cancel_run(&env.principal, &id, &destination).await {
            continue;
        }
        jobs::delivery(&job, &destination, |delivery| {
            let status = delivery.get("status");
            if status == Some(&json!("ready")) || status == Some(&json!("failed")) {
                delivery.extend([
                    ("status".into(), json!("cancelled")),
                    ("updated_at".into(), json!(now_ms())),
                ]);
            }
        });
    }
    store.release_if_settled(&job, only.is_empty()).await?;
    store.write(&job).await?;
    Ok(listed(&job))
}

/// The client reports what happened to an assisted transfer (share sheet, copied text, export).
/// atome cannot see into the other app: `handed_off` is the most it ever records, never
/// `published`.
async fn record_outcome(payload: &JsonValue, env: &Env, handoff: bool) -> Sd<JsonValue> {
    let store = &env.store;
    let (job, _held) = store.acquire(&field(payload, "job_id")).await?;
    let destination = field(payload, "destination");
    let delivery =
        delivery_of(&job, &destination).ok_or_else(|| Se::new("social_destination_invalid"))?;
    let outcome = payload
        .get("outcome")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let status = delivery
        .get("status")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let patch = if handoff {
        let assisted = !server_route(&delivery)
            && (js::truthy(delivery.get("route"))
                || js::truthy(delivery.pointer("/fallback/route")));
        if !assisted
            || !ASSISTED_OUTCOMES.contains(&outcome)
            || !["ready", "failed", "cancelled"].contains(&status)
        {
            return Err(Se::new("social_request_invalid"));
        }
        let told = payload
            .get("error")
            .and_then(JsonValue::as_str)
            .unwrap_or("");
        let error = match outcome {
            "failed"
                if ["social_app_unavailable", "social_handoff_unavailable"].contains(&told) =>
            {
                json!(told)
            }
            "failed" => json!("social_handoff_unavailable"),
            _ => JsonValue::Null,
        };
        let target = payload
            .get("target")
            .and_then(JsonValue::as_str)
            .map_or(JsonValue::Null, |t| json!(js::slice(t, 200)));
        json!({ "status": outcome, "error": error, "target": target, "updated_at": now_ms() })
    } else {
        if status != "unconfirmed" || !["published", "not_published"].contains(&outcome) {
            return Err(Se::new("social_request_invalid"));
        }
        let (status, error) = if outcome == "published" {
            ("published", JsonValue::Null)
        } else {
            ("failed", json!("social_publish_unconfirmed"))
        };
        json!({ "status": status, "error": error, "confirmed_by": "user", "updated_at": now_ms() })
    };
    jobs::delivery(&job, &destination, |delivery| {
        delivery.extend(patch.as_object().cloned().unwrap_or_default())
    });
    store.release_if_settled(&job, false).await?;
    store.write(&job).await?;
    Ok(public_delivery(
        &delivery_of(&job, &destination).unwrap_or(JsonValue::Null),
    ))
}

/// `handleSocialAction`.
pub async fn handle(
    env: &Env,
    oauth: &Arc<OAuth>,
    action: &str,
    payload: &JsonValue,
) -> Sd<JsonValue> {
    let name = action.strip_prefix("social.").unwrap_or(action);
    let attempt = field(payload, "attempt_id");
    match name {
        "connect.start" => {
            return sessions::connect(
                oauth,
                &field(payload, "network"),
                &env.principal,
                &env.vault,
                &env.config,
            );
        }
        "connect.await" => return Ok(oauth.wait(&env.principal, &attempt, None).await),
        "connect.cancel" => {
            return Ok(json!({ "cancelled": oauth.cancel(&env.principal, &attempt, None) }));
        }
        "handoff" | "confirm" => return record_outcome(payload, env, name == "handoff").await,
        _ => {}
    }
    let schema = catalog::command("social", name).map(|command| &command["input_schema"]);
    if !schema.is_some_and(|schema| params::valid(schema, payload)) {
        return Err(Se::new("social_request_invalid"));
    }
    match name {
        "accounts" => Ok(json!({ "accounts": sessions::accounts(&env.vault, &env.config).await })),
        "disconnect" => {
            sessions::disconnect(&field(payload, "network"), &env.vault, &env.config).await
        }
        "prepare" => prepare(payload, env).await,
        "publish" => publish(payload, env).await,
        "status" => status(payload, env).await,
        "cancel" => cancel(payload, env).await,
        _ => Err(Se::new("social_request_invalid")),
    }
}
