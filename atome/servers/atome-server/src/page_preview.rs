//! The isolated preview origin (D18 item 11): a listener of its own, on another
//! port than the app (another origin), that serves one fixed document, the
//! preview bootstrap (`eVe/domains/page_preview/page_preview_frame.html`). A
//! person's page never reaches this server: the app sends its source over the
//! MessageChannel it hands the bootstrap, so the origin keeps no page, no file,
//! no account and needs no identity. Its whole job is the response headers: a
//! CSP that sandboxes the document (`sandbox allow-scripts`: an opaque origin
//! with no storage, no cookie and no parent, even opened alone in a tab) and
//! limits every network directive to the page's allow-list, given in the query
//! (`/page?allow=api.example.org,cdn.example.net`), each host checked by the
//! same rule as `atome/src/shared/html_page_contract.js#normalizePageHost`.
//!
//! The app asks where this origin is at `GET /page_preview/origin`
//! ([`origin_route`]), mounted on the app's own router: the configured public
//! origin (a dedicated sub-domain in production), else the host the app was
//! reached by, on the preview port.
//!
//! Self-contained (axum only), so the Web server and the Tauri listener can
//! share it.
use axum::Router;
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;

const BOOTSTRAP: &str =
    include_str!("../../../../eVe/domains/page_preview/page_preview_frame.html");
const MAX_HOSTS: usize = 32;
const MAX_HOST_LENGTH: usize = 253;

/// A host a page may reach: a lowercase DNS name of two labels at least.
pub fn page_host(value: &str) -> Option<String> {
    let host = value.trim().to_ascii_lowercase();
    if host.is_empty() || host.len() > MAX_HOST_LENGTH {
        return None;
    }
    let labels: Vec<&str> = host.split('.').collect();
    let label_ok = |label: &&str| {
        let bytes = label.as_bytes();
        !bytes.is_empty()
            && bytes.len() <= 63
            && bytes.first() != Some(&b'-')
            && bytes.last() != Some(&b'-')
            && bytes
                .iter()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
    };
    (labels.len() >= 2 && labels.iter().all(label_ok)).then_some(host)
}

/// The allow-list carried by the query: `allow=` hosts separated by commas.
/// Any invalid host refuses the whole list (the app only sends valid ones).
pub fn allowed_hosts(query: Option<&str>) -> Result<Vec<String>, &'static str> {
    let Some(raw) = query
        .unwrap_or("")
        .split('&')
        .find_map(|pair| pair.strip_prefix("allow="))
    else {
        return Ok(Vec::new());
    };
    let mut hosts: Vec<String> = Vec::new();
    for entry in raw
        .split(',')
        .flat_map(|part| part.split("%2C"))
        .flat_map(|part| part.split("%2c"))
    {
        if entry.is_empty() {
            continue;
        }
        let host = page_host(entry).ok_or("page_preview_host_invalid")?;
        if !hosts.contains(&host) {
            hosts.push(host);
        }
    }
    if hosts.len() > MAX_HOSTS {
        return Err("page_preview_hosts_too_many");
    }
    Ok(hosts)
}

/// The document's policy: sandboxed, nothing fetched but inline code, `data:`
/// and `blob:` pictures and the allowed hosts over https.
pub fn content_security_policy(hosts: &[String]) -> String {
    let sources: String = hosts
        .iter()
        .map(|host| format!(" https://{host}"))
        .collect();
    let connect = if hosts.is_empty() {
        " 'none'".to_string()
    } else {
        sources.clone()
    };
    format!(
        "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'{sources}; \
         style-src 'unsafe-inline'{sources}; img-src data: blob:{sources}; \
         media-src data: blob:{sources}; font-src data:{sources}; connect-src{connect}; \
         frame-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'"
    )
}

const PERMISSIONS: &str = "camera=(), microphone=(), geolocation=(), clipboard-read=(), \
     clipboard-write=(), usb=(), serial=(), hid=(), bluetooth=(), payment=(), display-capture=(), \
     fullscreen=(), midi=()";

fn header_value(value: &str) -> HeaderValue {
    HeaderValue::from_str(value).expect("page preview header value")
}

async fn bootstrap(uri: Uri) -> Response {
    let hosts = match allowed_hosts(uri.query()) {
        Ok(hosts) => hosts,
        Err(error) => return (StatusCode::BAD_REQUEST, error).into_response(),
    };
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        header_value(&content_security_policy(&hosts)),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        "cross-origin-resource-policy",
        HeaderValue::from_static("same-origin"),
    );
    headers.insert("permissions-policy", HeaderValue::from_static(PERMISSIONS));
    (headers, BOOTSTRAP).into_response()
}

/// The preview origin's router: the bootstrap at `/page`, nothing else.
pub fn router() -> Router {
    Router::new()
        .route("/page", get(bootstrap))
        .fallback(|| async { StatusCode::NOT_FOUND })
}

/// Serves the preview origin on `listener` until it fails.
pub async fn serve(listener: tokio::net::TcpListener) -> Result<(), String> {
    axum::serve(listener, router())
        .await
        .map_err(|error| format!("page_preview_serve_failed:{error}"))
}

/// Where the app finds the preview origin.
#[derive(Clone, Debug)]
pub struct PreviewOrigin {
    /// A configured public origin (`https://preview.example.org`), used as it is.
    pub public: Option<String>,
    /// Else: the app's host, on this port, with the app's scheme (`http` locally).
    pub port: u16,
}

// The host part of a Host header (no port), only when it is a plain name or
// address: it is written back into the answer.
fn request_host(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::HOST)?.to_str().ok()?.trim();
    let host = if let Some(rest) = raw.strip_prefix('[') {
        format!("[{}]", rest.split(']').next()?)
    } else {
        raw.split(':').next()?.to_string()
    };
    let plain = host.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b':' | b'[' | b']')
    });
    (plain && !host.is_empty()).then_some(host.to_ascii_lowercase())
}

/// The origin a request to the app should use for its previews.
pub fn preview_origin_for(origin: &PreviewOrigin, headers: &HeaderMap) -> Option<String> {
    if let Some(public) = &origin.public {
        return Some(public.trim_end_matches('/').to_string());
    }
    request_host(headers).map(|host| format!("http://{host}:{}", origin.port))
}

/// `GET /page_preview/origin` on the app's own router: `{"origin":"…"}`.
pub fn origin_route<S>(origin: PreviewOrigin) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route(
        "/page_preview/origin",
        get(move |headers: HeaderMap| {
            let origin = origin.clone();
            async move {
                match preview_origin_for(&origin, &headers) {
                    Some(value) => (
                        [
                            (header::CONTENT_TYPE, "application/json"),
                            (header::CACHE_CONTROL, "no-store"),
                        ],
                        format!("{{\"origin\":\"{value}\"}}"),
                    )
                        .into_response(),
                    None => (StatusCode::BAD_REQUEST, "page_preview_host_invalid").into_response(),
                }
            }
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_follow_the_shared_rule() {
        assert_eq!(page_host("API.Meteo.fr"), Some("api.meteo.fr".into()));
        assert_eq!(page_host("localhost"), None);
        assert_eq!(page_host("a..b"), None);
        assert_eq!(page_host("-a.b"), None);
        assert_eq!(page_host("a.b;script-src *"), None);
        assert_eq!(page_host("a.b https://evil.c"), None);
    }

    #[test]
    fn the_query_gives_the_list_or_refuses_it() {
        assert_eq!(allowed_hosts(None), Ok(vec![]));
        assert_eq!(
            allowed_hosts(Some("allow=api.meteo.fr,cdn.example.net,api.meteo.fr")),
            Ok(vec!["api.meteo.fr".into(), "cdn.example.net".into()])
        );
        assert_eq!(
            allowed_hosts(Some("x=1&allow=a.b%2Cc.d")),
            Ok(vec!["a.b".into(), "c.d".into()])
        );
        assert!(allowed_hosts(Some("allow=a.b,'self'")).is_err());
    }

    #[test]
    fn no_host_means_no_network() {
        let policy = content_security_policy(&[]);
        assert!(policy.starts_with("sandbox allow-scripts;"));
        assert!(policy.contains("connect-src 'none';"));
        let policy = content_security_policy(&["api.meteo.fr".into()]);
        assert!(policy.contains("connect-src https://api.meteo.fr;"));
        assert!(!policy.contains("allow-same-origin"));
    }

    #[test]
    fn the_origin_follows_the_request_host() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:3001"));
        let origin = PreviewOrigin {
            public: None,
            port: 3201,
        };
        assert_eq!(
            preview_origin_for(&origin, &headers),
            Some("http://127.0.0.1:3201".into())
        );
        headers.insert(header::HOST, HeaderValue::from_static("evil\"host"));
        assert_eq!(preview_origin_for(&origin, &headers), None);
        let public = PreviewOrigin {
            public: Some("https://preview.atome.one/".into()),
            port: 0,
        };
        assert_eq!(
            preview_origin_for(&public, &headers),
            Some("https://preview.atome.one".into())
        );
    }
}
