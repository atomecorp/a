// Fastify's CORS for every atome server (server/http_server_hooks.js: @fastify/cors
// with an origin allow-list, credentials, `exposedHeaders: X-Request-Id`,
// `maxAge: 86400`), its private-network answer, and the media policy of the opaque
// native origins (server/cors_policies.js: the iOS WebView's `atome:` scheme).
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;
use std::collections::HashSet;
use std::sync::Arc;

const METHODS: &str = "GET, POST, PUT, DELETE, OPTIONS, PATCH";
// `null` is never listed: sandboxed frames, file:// pages and some redirects send
// it, and these answers carry credentials.
const LISTED: [&str; 7] = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
];
const PRIVATE_NETWORK_VARY: &str = "Origin, Access-Control-Request-Headers, Access-Control-Request-Method, Access-Control-Request-Private-Network";

const OPAQUE_SCHEMES: [&str; 3] = ["atome", "asset", "ipc"];
// The last two are the iOS local server's own (atome_server::local): the opaque page
// saves its recordings and reaches its AI providers there.
const NATIVE_MEDIA_PREFIXES: [&str; 5] = [
    "/api/uploads",
    "/api/recordings",
    "/api/extract-audio",
    "/api/user-recordings",
    "/api/eve/ai/provider-completion",
];
const OPAQUE_HEADERS: &str = "Content-Type, Authorization, Range, X-Filename, X-Original-Name, X-Atome-Id, X-Atome-Type, X-Mime-Type, X-File-Path, X-File-Name, X-User-Id, X-Username, X-Phone, X-Wallpaper-Inline";
const OPAQUE_METHODS: &str = "GET, HEAD, POST, OPTIONS";
const OPAQUE_EXPOSED: &str = "Content-Range, Content-Length, Accept-Ranges";

const ALLOW_ORIGIN: HeaderName = header::ACCESS_CONTROL_ALLOW_ORIGIN;
const REQUEST_PRIVATE_NETWORK: HeaderName =
    HeaderName::from_static("access-control-request-private-network");
const ALLOW_PRIVATE_NETWORK: HeaderName =
    HeaderName::from_static("access-control-allow-private-network");

pub struct CorsPolicy {
    origins: HashSet<String>,
}

impl CorsPolicy {
    /// The fixed allow-list and `extra` (SQUIRREL_ALLOWED_ORIGINS on the Web,
    /// the development shell's origins in a Tauri debug build).
    pub fn new(extra: impl IntoIterator<Item = String>) -> Arc<Self> {
        let origins = LISTED
            .iter()
            .map(|origin| origin.to_string())
            .chain(extra)
            .collect();
        Arc::new(Self { origins })
    }

    pub fn allows(&self, origin: &str) -> bool {
        if self.origins.contains(origin) {
            return true;
        }
        let Some((scheme, rest)) = origin.split_once("://") else {
            return false;
        };
        let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
        let host = authority.rsplit('@').next().unwrap_or("");
        let host = host.split(':').next().unwrap_or("").to_ascii_lowercase();
        match scheme.to_ascii_lowercase().as_str() {
            "tauri" => host == "localhost",
            "http" | "https" => host == "tauri.localhost",
            _ => false,
        }
    }

    /// The headers of a reply to `request` (method, path, headers), in Fastify's
    /// order: the allow-list's, then the private network's, then the opaque origins'.
    pub fn decorate(&self, path: &str, request: &HeaderMap, response: &mut HeaderMap) {
        let origin = request
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok());
        vary_origin(response);
        if let Some(origin) = origin.filter(|origin| self.allows(origin)) {
            self.credentialed(origin, response);
        }
        private_network(request, response);
        if origin.is_some_and(is_opaque_native) && is_native_media_route(path) {
            let requested = request
                .get(header::ACCESS_CONTROL_REQUEST_HEADERS)
                .cloned()
                .unwrap_or(HeaderValue::from_static(OPAQUE_HEADERS));
            response.insert(ALLOW_ORIGIN, HeaderValue::from_static("*"));
            response.remove(header::ACCESS_CONTROL_ALLOW_CREDENTIALS);
            response.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static(OPAQUE_METHODS),
            );
            response.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, requested);
            response.insert(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                HeaderValue::from_static(OPAQUE_EXPOSED),
            );
            response.insert(
                header::ACCESS_CONTROL_MAX_AGE,
                HeaderValue::from_static("86400"),
            );
            response.insert(header::VARY, HeaderValue::from_static("Origin"));
        }
    }

    fn credentialed(&self, origin: &str, response: &mut HeaderMap) {
        if let Ok(value) = HeaderValue::from_str(origin) {
            response.insert(ALLOW_ORIGIN, value);
            response.insert(
                header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
                HeaderValue::from_static("true"),
            );
            response.insert(
                header::ACCESS_CONTROL_EXPOSE_HEADERS,
                HeaderValue::from_static("X-Request-Id"),
            );
        }
    }

    /// The answer to a preflight from a listed origin; any other request is not one.
    pub fn preflight(&self, method: &Method, request: &HeaderMap) -> Option<HeaderMap> {
        let origin = request.get(header::ORIGIN)?.to_str().ok()?;
        if method != Method::OPTIONS
            || !request.contains_key(header::ACCESS_CONTROL_REQUEST_METHOD)
            || !self.allows(origin)
        {
            return None;
        }
        let mut headers = HeaderMap::new();
        headers.insert(header::VARY, HeaderValue::from_static("Origin"));
        self.credentialed(origin, &mut headers);
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static(METHODS),
        );
        headers.append(
            header::VARY,
            HeaderValue::from_static("Access-Control-Request-Headers"),
        );
        if let Some(requested) = request.get(header::ACCESS_CONTROL_REQUEST_HEADERS) {
            headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, requested.clone());
        }
        headers.insert(
            header::ACCESS_CONTROL_MAX_AGE,
            HeaderValue::from_static("86400"),
        );
        headers.insert(header::CONTENT_LENGTH, HeaderValue::from_static("0"));
        Some(headers)
    }
}

/// A route open to every origin without credentials (its own
/// `config.cors: { origin: '*', credentials: false }` in Fastify: `/health`,
/// `/api/server/verify`): the wildcard and the exposed request id, no Vary, then the
/// private network's answer.
pub fn decorate_open(request: &HeaderMap, response: &mut HeaderMap) {
    response.insert(ALLOW_ORIGIN, HeaderValue::from_static("*"));
    response.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("X-Request-Id"),
    );
    private_network(request, response);
}

/// That open route's preflight, from any origin or none: its methods and headers.
pub fn open_preflight(
    methods: &'static str,
    allowed_headers: &'static str,
    request: &HeaderMap,
) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static(allowed_headers),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static(methods),
    );
    headers.insert(
        header::ACCESS_CONTROL_MAX_AGE,
        HeaderValue::from_static("86400"),
    );
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from_static("0"));
    decorate_open(request, &mut headers);
    headers
}

// The private network's answer (server/http_server_hooks.js, onSend).
fn private_network(request: &HeaderMap, response: &mut HeaderMap) {
    let asked = request
        .get(&REQUEST_PRIVATE_NETWORK)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.eq_ignore_ascii_case("true"));
    if asked {
        response.insert(ALLOW_PRIVATE_NETWORK, HeaderValue::from_static("true"));
        response.insert(header::VARY, HeaderValue::from_static(PRIVATE_NETWORK_VARY));
    }
}

// Fastify names Origin in Vary on every reply, a CORS request or not.
fn vary_origin(response: &mut HeaderMap) {
    let named = response
        .get_all(header::VARY)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .any(|name| name.trim().eq_ignore_ascii_case("origin"));
    if named {
        return;
    }
    let joined = response
        .get_all(header::VARY)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .collect::<Vec<_>>()
        .join(", ");
    let value = if joined.is_empty() {
        "Origin".to_string()
    } else {
        format!("Origin, {joined}")
    };
    if let Ok(value) = HeaderValue::from_str(&value) {
        response.insert(header::VARY, value);
    }
}

// `null` passes here: this policy grants no credentials, and a page on a custom
// scheme reports either `atome://…` or a null origin depending on the WebKit build.
fn is_opaque_native(origin: &str) -> bool {
    let origin = origin.trim().to_ascii_lowercase();
    origin == "null"
        || origin
            .split_once(':')
            .is_some_and(|(scheme, _)| OPAQUE_SCHEMES.contains(&scheme))
}

/// The media routes the iOS page's opaque origin reaches (`isNativeHttpMediaRoute`).
pub fn is_native_media_route(path: &str) -> bool {
    let path = path.to_ascii_lowercase();
    path == "/api/media-token"
        || NATIVE_MEDIA_PREFIXES.iter().any(|prefix| {
            path.strip_prefix(prefix)
                .is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
        })
}

/// The whole policy as a layer, for a server that answers every route itself (Tauri).
pub async fn layer(
    State(policy): State<Arc<CorsPolicy>>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    let headers = request.headers().clone();
    // The iOS page's opaque `atome:` origin asks before an upload (Fastify's
    // `@fastify/cors` answered every preflight, `applyOpaqueNativeOriginCors` then
    // decorated it): the reply's headers are `decorate`'s.
    let opaque_preflight = request.method() == Method::OPTIONS
        && headers.contains_key(header::ACCESS_CONTROL_REQUEST_METHOD)
        && headers
            .get(header::ORIGIN)
            .and_then(|value| value.to_str().ok())
            .is_some_and(is_opaque_native)
        && is_native_media_route(&path);
    let preflight = policy
        .preflight(request.method(), &headers)
        .or_else(|| opaque_preflight.then(HeaderMap::new));
    let mut response = match preflight {
        Some(preflight) => {
            let mut response = Response::new(Body::empty());
            *response.status_mut() = StatusCode::NO_CONTENT;
            *response.headers_mut() = preflight;
            response
        }
        None => next.run(request).await,
    };
    policy.decorate(&path, &headers, response.headers_mut());
    response
}
