// The iOS developer distribution (server/http_ios_ota_routes.js, ported): developer media, not an
// application command. On a server whose OTA store holds `settings.json` (`ATOME_OTA_ROOT`, else
// `/var/lib/atome/ios-ota`, read from the process environment as ota-store.mjs reads it) it answers
// the publication's status, the install page (`atome/src/ios-install.html` under its CSP), a
// tester's install session (their bearer token, under the store lock), the current manifest and
// the IPA, each behind a two-hour HMAC capability; a download in progress keeps its release
// through the minute retention sweep. The store is looked at once, when the router starts the
// module (`start`, as Fastify registered it), and the sweep starts then.
mod download;
mod store;

use crate::http::cors::CorsPolicy;
use crate::http::fastify_reply::{self, NodeError};
use crate::http::uri::{decode_uri_component, encode_uri_component};
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};
use store::Unlocked;

const ORIGIN: &str = "https://atome.one";
const SESSION_BODY_LIMIT: usize = 1024;
const IMPORT_MAP_OPEN: &str = "<script type=\"importmap\">";

// The releases being downloaded, by how many downloads.
type Downloads = Arc<Mutex<HashMap<String, usize>>>;

struct Ota {
    root: PathBuf,
    shell: PathBuf,
    active: Downloads,
}

static OTA: LazyLock<Option<Ota>> = LazyLock::new(|| {
    let root = std::env::var("ATOME_OTA_ROOT")
        .ok()
        .filter(|root| !root.is_empty())
        .map_or_else(|| PathBuf::from("/var/lib/atome/ios-ota"), PathBuf::from);
    if !root.join("settings.json").exists() {
        return None;
    }
    let project_root = std::env::current_dir().ok()?;
    let ota = Ota {
        root,
        shell: project_root
            .join("atome")
            .join("src")
            .join("ios-install.html"),
        active: Arc::default(),
    };
    tokio::spawn(retention(ota.root.clone(), ota.active.clone()));
    Some(ota)
});

// Every minute, the releases neither current, previous nor downloaded go, under the store lock.
async fn retention(root: PathBuf, active: Downloads) {
    let mut minute = tokio::time::interval(std::time::Duration::from_secs(60));
    minute.tick().await;
    loop {
        minute.tick().await;
        let (root, kept) = (
            root.clone(),
            active
                .lock()
                .expect("ota downloads")
                .keys()
                .cloned()
                .collect::<HashSet<_>>(),
        );
        let swept = tokio::task::spawn_blocking(move || {
            let now = chrono::Utc::now().timestamp_millis() as f64;
            store::with_lock(&root, || store::cleanup(&root, &kept, now))
        })
        .await;
        match swept {
            Ok(Ok(_) | Err(Unlocked::Busy)) => {}
            Ok(Err(Unlocked::Failed(error))) => {
                eprintln!("[ota] retention failed {}", error.message)
            }
            Err(error) => eprintln!("[ota] retention failed {error}"),
        }
    }
}

#[derive(Clone, PartialEq)]
enum Route {
    Status,
    Install,
    Session,
    Manifest,
    Ipa(String),
}

fn route(method: &Method, path: &str) -> Option<Route> {
    let read = matches!(*method, Method::GET | Method::HEAD);
    match path {
        "/ios/status" if read => Some(Route::Status),
        "/ios/install" if read => Some(Route::Install),
        "/ios/session" if method == Method::POST => Some(Route::Session),
        store::CURRENT_MANIFEST_PATH if read => Some(Route::Manifest),
        _ if read => {
            let id = path
                .strip_prefix("/ios/builds/")?
                .strip_suffix("/atome.ipa")?;
            (!id.is_empty() && !id.contains('/'))
                .then(|| decode_uri_component(id).ok())
                .flatten()
                .map(Route::Ipa)
        }
        _ => None,
    }
}

/// Looks at the store and starts its retention sweep, once, when the server starts.
pub fn start() {
    LazyLock::force(&OTA);
}

/// Whether `request` is one of these routes on a server holding an OTA store.
pub fn claims(request: &Request) -> bool {
    OTA.is_some() && route(request.method(), request.uri().path()).is_some()
}

pub(super) fn failed(status: StatusCode, error: &str) -> Response {
    fastify_reply::json(status, &json!({ "error": error }))
}

// Fastify's querystring: a key given twice is a list, `+` a space, a malformed escape left as written.
fn query_value(query: Option<&str>, name: &str) -> Option<JsonValue> {
    let decoded = |text: &str| {
        let text = text.replace('+', " ");
        decode_uri_component(&text).unwrap_or(text)
    };
    let values: Vec<JsonValue> = query?
        .split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| pair.split_once('=').unwrap_or((pair, "")))
        .filter(|(key, _)| decoded(key) == name)
        .map(|(_, value)| json!(decoded(value)))
        .collect();
    match values.len() {
        0 => None,
        1 => values.into_iter().next(),
        _ => Some(JsonValue::Array(values)),
    }
}

pub(super) fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// `POST /ios/session`: the tester's install link, under the store lock.
fn session(root: &std::path::Path, authorization: &str) -> Result<Response, Unlocked> {
    store::with_lock(root, || {
        let config = store::read_json(&root.join("settings.json"))?;
        let token = authorization.strip_prefix("Bearer ").filter(|token| {
            token.len() == 43
                && token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        });
        let user = token.map(store::token_hash).unwrap_or_default();
        if !store::enabled_user(&config, &json!(user))? {
            return Ok(failed(StatusCode::FORBIDDEN, "ota_access_denied"));
        }
        if !js_truthy(&store::current(root)?) {
            return Ok(failed(StatusCode::SERVICE_UNAVAILABLE, "ota_not_published"));
        }
        let cap = store::issue(
            config.get("secret"),
            &json!({ "user": user, "expires": now_ms() + store::DOWNLOAD_TTL_MS }),
        )?;
        let url = format!(
            "{ORIGIN}{}?cap={}",
            store::CURRENT_MANIFEST_PATH,
            encode_uri_component(&cap)
        );
        let install = format!(
            "itms-services://?action=download-manifest&url={}",
            encode_uri_component(&url)
        );
        Ok(fastify_reply::json(
            StatusCode::OK,
            &json!({ "install": install }),
        ))
    })
}

fn js_truthy(value: &JsonValue) -> bool {
    crate::vault_router::js::truthy(Some(value))
}

// `GET /ios/current/manifest.plist`: resolved when iOS fetches it, so one install link always
// yields the release current at that moment.
fn current_manifest(ota: &Ota, cap: Option<&JsonValue>) -> Result<Response, NodeError> {
    let config = store::read_json(&ota.root.join("settings.json"))?;
    let Some(capability) = store::verify(config.get("secret"), cap, now_ms()) else {
        return Ok(failed(StatusCode::FORBIDDEN, "ota_capability_denied"));
    };
    let user = capability.get("user").cloned().unwrap_or(JsonValue::Null);
    if capability.get("id").is_some() || !store::enabled_user(&config, &user)? {
        return Ok(failed(StatusCode::FORBIDDEN, "ota_access_denied"));
    }
    let report = store::current(&ota.root)?;
    if !js_truthy(&report) {
        return Ok(failed(StatusCode::SERVICE_UNAVAILABLE, "ota_not_published"));
    }
    let id = report.get("id").cloned().unwrap_or(JsonValue::Null);
    let cap = store::issue(
        config.get("secret"),
        &json!({ "id": id, "user": user, "expires": now_ms() + store::DOWNLOAD_TTL_MS }),
    )?;
    let id = crate::vault_router::js::text(report.get("id"));
    let ipa = format!(
        "{ORIGIN}/ios/builds/{id}/atome.ipa?cap={}",
        encode_uri_component(&cap)
    );
    let mut response = (StatusCode::OK, store::manifest(&report, &ipa)?).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/xml; charset=utf-8"),
    );
    Ok(response)
}

// `GET /ios/install`: the page, sent as a stream (@fastify/compress encodes it whatever its size).
async fn install(ota: &Ota) -> Result<Response, NodeError> {
    let page = tokio::fs::read(&ota.shell)
        .await
        .map_err(|e| fastify_reply::node_fs_error(&e, "open", &ota.shell))?;
    let csp = HeaderValue::from_str(&install_csp(&page)?).map_err(|e| NodeError {
        code: None,
        message: e.to_string(),
    })?;
    let chunk = futures_util::stream::once(async move {
        Ok::<_, std::io::Error>(axum::body::Bytes::from(page))
    });
    let mut response = Response::new(Body::from_stream(chunk));
    let fields = response.headers_mut();
    fields.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    fields.insert(header::CONTENT_SECURITY_POLICY, csp);
    Ok(response)
}

// The page's CSP: its import map resolves the '#squirrel/', '#shared/' and '#utils/' specifiers
// its modules import (as atome/src/index.html does), and is the one inline script it admits, by
// its hash; without it the page's modules fail to resolve and it stays white.
fn install_csp(page: &[u8]) -> Result<String, NodeError> {
    let html = String::from_utf8_lossy(page);
    let map = html
        .split_once(IMPORT_MAP_OPEN)
        .and_then(|(_, rest)| rest.split_once("</script>"))
        .map(|(map, _)| map)
        .ok_or_else(|| NodeError {
            code: None,
            message: "ios-install.html carries no import map".to_owned(),
        })?;
    let hash = STANDARD.encode(Sha256::digest(map.as_bytes()));
    Ok(format!(
        "default-src 'none'; script-src 'self' 'sha256-{hash}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    ))
}

// `POST /ios/session`'s body as Fastify reads it before the handler (`bodyLimit: 1024`): a type no
// parser reads (or a body without a type), then the size, then the JSON. Its refusal carries none
// of the handler's headers.
async fn unparsed(request: Request) -> Option<Response> {
    let (parts, body) = request.into_parts();
    let kind = parts
        .headers
        .get(header::CONTENT_TYPE)
        .and_then(|kind| kind.to_str().ok());
    let refused = match kind {
        Some(_) => fastify_reply::body(kind, &axum::body::Bytes::from_static(b"{}")).err(),
        None => {
            let sized = parts
                .headers
                .get(header::CONTENT_LENGTH)
                .is_some_and(|length| length != "0");
            (sized || parts.headers.contains_key(header::TRANSFER_ENCODING)).then_some((
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "FST_ERR_CTP_INVALID_MEDIA_TYPE",
                "Unsupported Media Type",
                "Unsupported Media Type",
            ))
        }
    };
    if let Some(refusal) = refused {
        return Some(fastify_reply::refused(refusal));
    }
    let Ok(bytes) = axum::body::to_bytes(body, SESSION_BODY_LIMIT).await else {
        return Some(fastify_reply::refused((
            StatusCode::PAYLOAD_TOO_LARGE,
            "FST_ERR_CTP_BODY_TOO_LARGE",
            "Payload Too Large",
            "Request body is too large",
        )));
    };
    fastify_reply::body(kind, &bytes)
        .err()
        .map(fastify_reply::refused)
}

async fn routed(
    ota: &Ota,
    route: Route,
    cap: Option<JsonValue>,
    headers: &HeaderMap,
    head: bool,
) -> Result<Response, NodeError> {
    match route {
        Route::Status => {
            let report = store::current(&ota.root)?;
            if !js_truthy(&report) {
                return Ok(fastify_reply::json(
                    StatusCode::SERVICE_UNAVAILABLE,
                    &json!({ "published": false }),
                ));
            }
            let mut body = serde_json::Map::new();
            body.insert("published".into(), json!(true));
            for name in ["id", "version", "build"] {
                if let Some(value) = report.get(name) {
                    body.insert(name.into(), value.clone());
                }
            }
            Ok(fastify_reply::json(
                StatusCode::OK,
                &JsonValue::Object(body),
            ))
        }
        Route::Install => install(ota).await,
        Route::Session => {
            let authorization = headers
                .get(header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .unwrap_or("")
                .to_string();
            let root = ota.root.clone();
            let answered = tokio::task::spawn_blocking(move || session(&root, &authorization))
                .await
                .map_err(|e| NodeError {
                    code: None,
                    message: e.to_string(),
                })?;
            match answered {
                Ok(response) => Ok(response),
                Err(Unlocked::Busy) => Ok(failed(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "ota_publication_busy",
                )),
                Err(Unlocked::Failed(error)) => Err(error),
            }
        }
        Route::Manifest => current_manifest(ota, cap.as_ref()),
        Route::Ipa(id) => {
            download::ipa(&ota.root, &ota.active, id, cap.as_ref(), headers, head).await
        }
    }
}

/// The answer to a request `claims` took.
pub async fn answer(cors: &CorsPolicy, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let headers = request.headers().clone();
    let (Some(ota), Some(route)) = (OTA.as_ref(), route(&method, &path)) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let head = method == Method::HEAD;
    let streamed = matches!(route, Route::Install | Route::Ipa(_));
    let cap = query_value(request.uri().query(), "cap");
    if matches!(route, Route::Session)
        && let Some(mut refusal) = unparsed(request).await
    {
        cors.decorate(&path, &headers, refusal.headers_mut());
        return refusal;
    }
    let mut response = match routed(ota, route, cap, &headers, head).await {
        Ok(response) if head || streamed => response,
        Ok(response) => fastify_reply::compressed(&headers, response).await,
        Err(error) => fastify_reply::thrown(&error),
    };
    if !head && path == "/ios/install" && response.status() == StatusCode::OK {
        response = fastify_reply::compressed_stream(&headers, response).await;
    }
    let fields = response.headers_mut();
    fields.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    fields.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    fields.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    cors.decorate(&path, &headers, response.headers_mut());
    response
}

#[cfg(test)]
#[path = "../../../../../tests/atome_server/ota_install_csp.rs"]
mod install_csp_parity;
