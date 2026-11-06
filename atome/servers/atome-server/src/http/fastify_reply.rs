// A route's request body and JSON reply as Fastify 5 hands them (server/server.js,
// server/http_server_hooks.js): the body parsed by its content-type parsers, a body
// they cannot read refused with Fastify's own error reply, and a reply of 1 KiB or
// more encoded as @fastify/compress encodes it (brotli, else gzip).
use axum::body::{Body, Bytes};
use axum::extract::Request;
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value as JsonValue, json};
use tower::ServiceExt;
use tower_http::compression::predicate::Predicate;
use tower_http::compression::{Compression, CompressionLevel};

// Fastify's `bodyLimit` (server/server.js).
const BODY_LIMIT: usize = 1024 * 1024 * 1024;
// @fastify/compress `threshold`.
const THRESHOLD: usize = 1024;

/// Fastify's refusal of a body it cannot parse: its status, code, error and message.
pub type Refusal = (StatusCode, &'static str, &'static str, &'static str);

pub fn json(status: StatusCode, body: &JsonValue) -> Response {
    let mut response = (status, body.to_string()).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    response
}

pub fn refused((status, code, error, message): Refusal) -> Response {
    let mut response = json(
        status,
        &json!({ "statusCode": status.as_u16(), "code": code, "error": error, "message": message }),
    );
    response
        .extensions_mut()
        .insert(super::request_id::Failed(message.to_string()));
    response
}

// secure-json-parse's refusals, Fastify's defaults: a `__proto__` key, or a
// `constructor` holding a `prototype`, anywhere in the body.
fn poisoned(value: &JsonValue) -> bool {
    match value {
        JsonValue::Object(object) => object.iter().any(|(key, inner)| {
            key == "__proto__"
                || (key == "constructor" && inner.get("prototype").is_some())
                || poisoned(inner)
        }),
        JsonValue::Array(items) => items.iter().any(poisoned),
        _ => false,
    }
}

/// The body as Fastify's parsers hand it to a route: JSON for `application/json`;
/// text for `text/plain` or no type and bytes for `application/octet-stream`, which
/// carry no JSON field (None).
pub fn body(content_type: Option<&str>, bytes: &Bytes) -> Result<Option<JsonValue>, Refusal> {
    let media = content_type.map(|value| {
        value
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
    });
    match media.as_deref() {
        Some("application/json") => {
            if bytes.is_empty() {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "FST_ERR_CTP_EMPTY_JSON_BODY",
                    "Bad Request",
                    "Body cannot be empty when content-type is set to 'application/json'",
                ));
            }
            match serde_json::from_slice::<JsonValue>(bytes) {
                Ok(value) if !poisoned(&value) => Ok(Some(value)),
                _ => Err((
                    StatusCode::BAD_REQUEST,
                    "FST_ERR_CTP_INVALID_JSON_BODY",
                    "Bad Request",
                    "Body is not valid JSON but content-type is set to 'application/json'",
                )),
            }
        }
        // A body without a type meets no parser (Fastify registers no catch-all one).
        None if !bytes.is_empty() => Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
            "Unsupported Media Type",
            "Unsupported Media Type",
        )),
        None | Some("text/plain") | Some("application/octet-stream") => Ok(None),
        Some(_) => Err((
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "FST_ERR_CTP_INVALID_MEDIA_TYPE",
            "Unsupported Media Type",
            "Unsupported Media Type",
        )),
    }
}

/// A Node `fs` failure as a route sees it: its `code`, when Node gives one, and its message.
pub struct NodeError {
    pub code: Option<&'static str>,
    pub message: String,
}

/// `error` of `syscall` on `path` as Node words it (`ENOENT: no such file or directory, open '…'`).
pub fn node_fs_error(error: &std::io::Error, syscall: &str, path: &std::path::Path) -> NodeError {
    use std::io::ErrorKind;
    let (code, text) = match error.kind() {
        ErrorKind::NotFound => ("ENOENT", "no such file or directory"),
        ErrorKind::PermissionDenied => ("EACCES", "permission denied"),
        ErrorKind::AlreadyExists => ("EEXIST", "file already exists"),
        ErrorKind::IsADirectory => ("EISDIR", "illegal operation on a directory"),
        ErrorKind::NotADirectory => ("ENOTDIR", "not a directory"),
        ErrorKind::DirectoryNotEmpty => ("ENOTEMPTY", "directory not empty"),
        _ => {
            return NodeError {
                code: None,
                message: error.to_string(),
            };
        }
    };
    NodeError {
        code: Some(code),
        message: format!("{code}: {text}, {syscall} '{}'", path.display()),
    }
}

/// Fastify's reply to a route that threw `error`: 500, its code and its message.
pub fn thrown(error: &NodeError) -> Response {
    let mut body = serde_json::Map::new();
    body.insert("statusCode".into(), json!(500));
    if let Some(code) = error.code {
        body.insert("code".into(), json!(code));
    }
    body.insert("error".into(), json!("Internal Server Error"));
    body.insert("message".into(), json!(error.message));
    let mut response = json(StatusCode::INTERNAL_SERVER_ERROR, &JsonValue::Object(body));
    response
        .extensions_mut()
        .insert(super::request_id::Failed(error.message.clone()));
    response
}

/// The request's head and its JSON body, or the reply Fastify gives before the route.
pub async fn read(request: Request) -> Result<(Parts, Option<JsonValue>), Response> {
    read_bytes(request)
        .await
        .map(|(parts, body, _)| (parts, body))
}

/// `read`, with the body's bytes (an `application/octet-stream` upload's Buffer).
pub async fn read_bytes(request: Request) -> Result<(Parts, Option<JsonValue>, Bytes), Response> {
    let (parts, request_body) = request.into_parts();
    let bytes = axum::body::to_bytes(Body::new(request_body), BODY_LIMIT)
        .await
        .map_err(|_| StatusCode::PAYLOAD_TOO_LARGE.into_response())?;
    let content_type = parts
        .headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok());
    let body = body(content_type, &bytes).map_err(refused)?;
    Ok((parts, body, bytes))
}

#[derive(Clone, Copy)]
struct Always;

impl Predicate for Always {
    fn should_compress<B: axum::body::HttpBody>(&self, _: &axum::http::Response<B>) -> bool {
        true
    }
}

/// `reply` as @fastify/compress sends it to a client that sent `request`: encoded
/// when its payload is 1 KiB or more and the client accepts brotli or gzip, its
/// `Vary` then naming `accept-encoding` after the values it had.
pub async fn compressed(request: &HeaderMap, reply: Response) -> Response {
    encoded(request, reply, THRESHOLD).await
}

/// A file's reply: @fastify/compress encodes a stream whatever its size, as it streams, a
/// byte range too, and keeps its `Accept-Ranges` and its `Content-Range`.
pub async fn compressed_stream(request: &HeaderMap, mut reply: Response) -> Response {
    let ranges = reply.headers().get(header::ACCEPT_RANGES).cloned();
    // tower-http never encodes a range.
    let range = reply.headers_mut().remove(header::CONTENT_RANGE);
    let mut response = negotiated(request, reply).await;
    let fields = response.headers_mut();
    if let Some(ranges) = ranges {
        fields.insert(header::ACCEPT_RANGES, ranges);
    }
    if let Some(range) = range {
        fields.insert(header::CONTENT_RANGE, range);
    }
    response
}

/// A file's reply under its `Content-Type`: a stream encoded only when that type is one
/// @fastify/compress compresses.
pub async fn compressed_file(request: &HeaderMap, reply: Response) -> Response {
    let kind = reply
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|kind| kind.to_str().ok())
        .unwrap_or("application/json");
    if compressible(kind) {
        compressed_stream(request, reply).await
    } else {
        reply
    }
}

// The types mime-db marks compressible that @fastify/compress's own pattern leaves out
// (mime-db as installed with Fastify, read on 2026-11-05).
const COMPRESSIBLE: [&str; 38] = [
    "application/dart",
    "application/ecmascript",
    "application/javascript",
    "application/postscript",
    "application/raml+yaml",
    "application/rtf",
    "application/tar",
    "application/toml",
    "application/vnd.dart",
    "application/vnd.ms-fontobject",
    "application/vnd.ms-opentype",
    "application/wasm",
    "application/x-httpd-php",
    "application/x-javascript",
    "application/x-ns-proxy-autoconfig",
    "application/x-sh",
    "application/x-tar",
    "application/x-virtualbox-hdd",
    "application/x-virtualbox-ova",
    "application/x-virtualbox-ovf",
    "application/x-virtualbox-vbox",
    "application/x-virtualbox-vdi",
    "application/x-virtualbox-vhd",
    "application/x-virtualbox-vmdk",
    "application/x-www-form-urlencoded",
    "application/xml-dtd",
    "font/otf",
    "font/ttf",
    "image/bmp",
    "image/vnd.adobe.photoshop",
    "image/vnd.microsoft.icon",
    "image/vnd.ms-dds",
    "image/x-icon",
    "image/x-ms-bmp",
    "message/rfc822",
    "model/gltf-binary",
    "x-shader/x-fragment",
    "x-shader/x-vertex",
];

// `/(?:\+|\/)word(?:;|$)/` and `/word(?:;|$)/`: `word` after one of `after`, ending the type or
// a parameter's start.
fn ends_with_word(kind: &str, word: &str, after: &[char]) -> bool {
    kind.match_indices(word).any(|(at, _)| {
        let closed = matches!(kind[at + word.len()..].chars().next(), None | Some(';'));
        closed && (after.is_empty() || kind[..at].ends_with(after))
    })
}

/// @fastify/compress's `shouldCompress`: its default type pattern, else mime-db's `compressible`.
pub fn compressible(kind: &str) -> bool {
    let pattern = (kind.starts_with("text/") && !kind[5..].starts_with("event-stream"))
        || ["json", "text", "xml"]
            .iter()
            .any(|word| ends_with_word(kind, word, &['+', '/']))
        || ends_with_word(kind, "octet-stream", &[]);
    let base = kind.split(';').next().unwrap_or("").trim().to_lowercase();
    pattern || COMPRESSIBLE.contains(&base.as_str())
}

async fn encoded(request: &HeaderMap, reply: Response, threshold: usize) -> Response {
    let (parts, reply_body) = reply.into_parts();
    let Ok(bytes) = axum::body::to_bytes(reply_body, usize::MAX).await else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    if bytes.len() < threshold || bytes.is_empty() {
        return Response::from_parts(parts, Body::from(bytes));
    }
    negotiated(request, Response::from_parts(parts, Body::from(bytes))).await
}

// `reply` encoded in the client's accepted encoding, its `Vary` then naming `accept-encoding`
// after the values it had; left as it was when nothing is encoded.
async fn negotiated(request: &HeaderMap, reply: Response) -> Response {
    // A client sending `x-no-compression` is never sent an encoding.
    if request.contains_key("x-no-compression") {
        return reply;
    }
    let vary: Vec<String> = reply
        .headers()
        .get_all(header::VARY)
        .iter()
        .filter_map(|value| value.to_str().ok().map(str::to_string))
        .collect();
    let mut asked = Request::new(Body::empty());
    if let Some(accepted) = request.get(header::ACCEPT_ENCODING) {
        asked
            .headers_mut()
            .insert(header::ACCEPT_ENCODING, accepted.clone());
    }
    let prepared = std::sync::Mutex::new(Some(reply));
    let service = tower::service_fn(move |_: Request| {
        let reply = prepared.lock().expect("prepared reply").take();
        async move { Ok::<_, std::convert::Infallible>(reply.expect("one reply")) }
    });
    let Ok(response) = Compression::new(service)
        .quality(CompressionLevel::Precise(4))
        .compress_when(Always)
        .oneshot(asked)
        .await;
    let (mut parts, encoded) = response.into_parts();
    // tower-http names `accept-encoding` even when it encodes nothing; @fastify/compress only
    // when it encodes.
    parts.headers.remove(header::VARY);
    let mut names = vary;
    if parts.headers.contains_key(header::CONTENT_ENCODING) {
        names.push("accept-encoding".to_string());
    }
    if !names.is_empty()
        && let Ok(value) = HeaderValue::from_str(&names.join(", "))
    {
        parts.headers.insert(header::VARY, value);
    }
    Response::from_parts(parts, Body::new(encoded))
}
