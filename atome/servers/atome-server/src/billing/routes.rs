// The two HTTP endpoints the stores impose (server/billing/billing_routes.js, ported): the
// stores push here, they cannot speak `/ws/api`. Every push is verified again (Apple
// signature chain, Google Play Developer API) before the ledger changes; a transient store
// failure answers 503 so the store retries.
use super::Billing;
use crate::http::fastify_reply;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::response::Response;
use serde_json::{Value as JsonValue, json};

const APPLE: &str = "/api/billing/apple/notifications";
const GOOGLE: &str = "/api/billing/google/rtdn";
// The routes' own `bodyLimit`.
const BODY_LIMIT: usize = 256 * 1024;
const RETRYABLE: [&str; 2] = ["billing_store_unavailable", "billing_store_unconfigured"];

pub fn claims(request: &Request) -> bool {
    request.method() == Method::POST && [APPLE, GOOGLE].contains(&request.uri().path())
}

pub async fn answer(billing: &Billing, request: Request) -> Response {
    let apple = request.uri().path() == APPLE;
    let (parts, body) = request.into_parts();
    let Ok(bytes) = axum::body::to_bytes(Body::new(body), BODY_LIMIT).await else {
        return fastify_reply::refused((
            StatusCode::PAYLOAD_TOO_LARGE,
            "FST_ERR_CTP_BODY_TOO_LARGE",
            "Payload Too Large",
            "Request body is too large",
        ));
    };
    let content_type = parts
        .headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    let body = match fastify_reply::body(content_type, &bytes) {
        Ok(body) => body.unwrap_or(JsonValue::Null),
        Err(refusal) => return fastify_reply::refused(refusal),
    };
    let handled = if apple {
        let signed = body
            .get("signedPayload")
            .cloned()
            .unwrap_or(JsonValue::Null);
        billing.apple_notification(&signed).await
    } else {
        billing.google_notification(&body).await
    };
    let (status, reply) = match handled {
        Ok(handled) => (StatusCode::OK, json!({ "ok": true, "handled": handled })),
        Err(error) => {
            let code = if error.starts_with("billing_") {
                error.as_str()
            } else {
                "billing_notification_failed"
            };
            let retry = RETRYABLE.contains(&code);
            if !retry {
                eprintln!(
                    "[billing] store notification refused {}",
                    json!({ "code": code })
                );
            }
            let status = if retry {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::BAD_REQUEST
            };
            (status, json!({ "ok": false, "error": code }))
        }
    };
    let mut response = fastify_reply::json(status, &reply);
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
