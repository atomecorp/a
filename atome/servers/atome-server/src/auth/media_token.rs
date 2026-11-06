// The media capability (server/media_capability.js, ported): <video>, <audio> and
// <img> cannot send an Authorization header, so a media URL carries `?media_token=`,
// a token signed by the server for media reads alone (audience `atome-media`),
// limited in time and bound to the device session that asked for it. Issued by
// `POST /api/media-token` (server/http_media_serving_routes.js) to a verified
// device session.
use super::{AUTH_LINK_ORIGIN, Sessions};
use crate::http::fastify_reply;
use crate::vault_router::js;
use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::Response;
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const MEDIA_TOKEN_AUDIENCE: &str = "atome-media";
const DEFAULT_TTL_SECONDS: u64 = 2 * 60 * 60;
const MAX_FILE_CLAIM: usize = 512;

/// `SQUIRREL_MEDIA_TOKEN_TTL_SECONDS` when between 30 s and 12 h, else two hours.
pub fn ttl_seconds(configured: Option<&str>) -> u64 {
    let configured = configured.map_or(f64::NAN, |text| js::number(Some(&json!(text))));
    if configured.is_finite() && (30.0..=12.0 * 60.0 * 60.0).contains(&configured) {
        configured.floor() as u64
    } else {
        DEFAULT_TTL_SECONDS
    }
}

fn file_claim(file: Option<&JsonValue>) -> Result<Option<String>, String> {
    let text = match file {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::text(Some(value)),
    };
    let text = js::trim(&text);
    if text.is_empty() {
        return Ok(None);
    }
    if text.encode_utf16().count() > MAX_FILE_CLAIM || text.contains(['/', '\\']) {
        return Err("media_token_file_invalid".into());
    }
    Ok(Some(text.to_string()))
}

fn issue(
    claims: &JsonValue,
    secret: &str,
    ttl: u64,
    file: Option<&JsonValue>,
) -> Result<JsonValue, String> {
    let sub = claims.get("sub").filter(|sub| js::truthy(Some(sub)));
    let sid = claims.get("sid").and_then(JsonValue::as_str);
    let kid = claims.pointer("/cnf/kid").and_then(JsonValue::as_str);
    let (Some(sub), Some(sid), Some(kid)) = (sub, sid, kid) else {
        return Err("media_token_requires_device_session".into());
    };
    let file = file_claim(file)?;
    let now = super::now_ms();
    let issued_at = (now / 1000.0).floor() as u64;
    // node-jsonwebtoken's order: the payload, then iat, exp, aud, iss, sub.
    let mut payload = JsonMap::new();
    payload.insert("sid".into(), json!(sid));
    payload.insert("kid".into(), json!(kid));
    if let Some(file) = &file {
        payload.insert("f".into(), json!(file));
    }
    payload.insert("iat".into(), json!(issued_at));
    payload.insert("exp".into(), json!(issued_at + ttl));
    payload.insert("aud".into(), json!(MEDIA_TOKEN_AUDIENCE));
    payload.insert("iss".into(), json!(AUTH_LINK_ORIGIN));
    payload.insert("sub".into(), json!(js::string(sub)));
    let token = jsonwebtoken::encode(
        &Header::new(Algorithm::HS256),
        &payload,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| e.to_string())?;
    Ok(json!({
        "token": token,
        "expiresAt": js::number_json(now + (ttl * 1000) as f64),
        "ttlSeconds": ttl,
        "file": file,
    }))
}

/// `POST /api/media-token`.
pub async fn answer(sessions: &Sessions, ttl: u64, request: Request) -> Response {
    let (parts, body) = match fastify_reply::read(request).await {
        Ok(read) => read,
        Err(refusal) => return refusal,
    };
    let Some(claims) = sessions.validate_request(&parts.headers).await else {
        return fastify_reply::json(
            StatusCode::UNAUTHORIZED,
            &json!({ "success": false, "error": "auth_required" }),
        );
    };
    let file = body.as_ref().and_then(|body| body.get("file"));
    let issued = sessions
        .secret()
        .ok_or_else(|| "JWT_SECRET must be configured with at least 32 characters".to_string())
        .and_then(|secret| issue(&claims, secret, ttl, file));
    match issued {
        Ok(issued) => {
            let mut answer = JsonMap::new();
            answer.insert("success".into(), json!(true));
            if let JsonValue::Object(fields) = issued {
                answer.extend(fields);
            }
            let mut response = fastify_reply::json(StatusCode::OK, &JsonValue::Object(answer));
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            response
        }
        Err(error) => fastify_reply::json(
            StatusCode::FORBIDDEN,
            &json!({ "success": false, "error": error }),
        ),
    }
}

/// `verifyMediaToken(token, secret, { fileParam })`: the principal a live media capability
/// names, for `file` (the route's parameter) when it is bound to one; None otherwise.
pub async fn verify(sessions: &Sessions, token: &str, file: &str) -> Option<String> {
    if token.is_empty() {
        return None;
    }
    let mut validation = super::validation(&[Algorithm::HS256]);
    validation.validate_aud = true;
    validation.set_audience(&[MEDIA_TOKEN_AUDIENCE]);
    validation.set_issuer(&[AUTH_LINK_ORIGIN]);
    let claims = sessions.decode(token, &validation)?;
    let principal = claims
        .get("sub")
        .and_then(JsonValue::as_str)
        .filter(|sub| !sub.is_empty())?
        .to_string();
    if js::truthy(claims.get("f")) {
        let requested =
            crate::http::uri::decode_uri_component(file).unwrap_or_else(|_| file.to_string());
        if claims.get("f") != Some(&json!(requested)) {
            return None;
        }
    }
    // The WebSocket's own check: the session lives, its device key too.
    sessions
        .assert_device_session(json!({
            "auth_version": 1, "iss": AUTH_LINK_ORIGIN, "aud": super::SESSION_AUDIENCE,
            "sub": principal, "sid": claims.get("sid"), "cnf": { "kid": claims.get("kid") }
        }))
        .await
        .ok()?;
    Some(principal)
}
