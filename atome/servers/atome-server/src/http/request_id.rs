// Every request carries one id, the caller's own `x-request-id` when it sent a
// non-blank one, else a new one (Fastify's `genReqId`, server/server.js); the
// id goes on to whatever answers it and comes back on the reply, unless the reply
// carries `Untagged`: Fastify answers a CORS preflight before it names the request.
// A reply carrying `Failed` (a route's thrown error, a body refused before the route) is kept among
// the server's recent errors (`recordRecentError` of Fastify's `onError` hook, server/server_dedup.js),
// which `/dev/state` reports.
use axum::extract::Request;
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::Next;
use axum::response::Response;

pub const X_REQUEST_ID: HeaderName = HeaderName::from_static("x-request-id");

/// A reply extension: this reply leaves without the request's id.
#[derive(Clone, Copy)]
pub struct Untagged;

/// A reply extension: the request failed with this error's message.
#[derive(Clone)]
pub struct Failed(pub String);

// The last 100 failures, oldest first.
const RECENT_ERRORS: usize = 100;
static RECENT: std::sync::LazyLock<
    std::sync::Mutex<std::collections::VecDeque<serde_json::Value>>,
> = std::sync::LazyLock::new(std::sync::Mutex::default);

/// The last `count` failures, oldest first (`recentErrors.slice(-count)`).
pub fn recent_errors(count: usize) -> Vec<serde_json::Value> {
    let recent = RECENT.lock().expect("recent errors");
    recent
        .iter()
        .skip(recent.len().saturating_sub(count))
        .cloned()
        .collect()
}

pub async fn tag(mut request: Request, next: Next) -> Response {
    let given = request
        .headers()
        .get(&X_REQUEST_ID)
        .filter(|value| value.to_str().is_ok_and(|text| !text.trim().is_empty()))
        .cloned();
    let id = match given {
        Some(value) => value,
        None => HeaderValue::from_str(&uuid::Uuid::new_v4().to_string()).expect("uuid header"),
    };
    request.headers_mut().insert(X_REQUEST_ID, id.clone());
    let (method, url) = (request.method().to_string(), request.uri().to_string());
    let mut response = next.run(request).await;
    if let Some(Failed(message)) = response.extensions().get::<Failed>() {
        let mut recent = RECENT.lock().expect("recent errors");
        recent.push_back(serde_json::json!({ "timestamp": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            "request_id": id.to_str().unwrap_or_default(), "method": method, "url": url,
            "status_code": response.status().as_u16(), "message": message }));
        while recent.len() > RECENT_ERRORS {
            recent.pop_front();
        }
    }
    if response.extensions().get::<Untagged>().is_none() {
        response.headers_mut().insert(X_REQUEST_ID, id);
    }
    response
}
