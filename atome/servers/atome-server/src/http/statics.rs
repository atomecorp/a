// The application's files as Fastify serves them (server/server.js, @fastify/static
// with `preCompressed`, then @fastify/compress): each prefix to its root, the most
// specific first; a `.br` or `.gz` sibling when the client takes it, else a
// compressible file encoded on the fly (brotli quality 4, as @fastify/compress);
// `public, max-age=0`, the weak ETag of @fastify/send, ranges. A file starting
// with a dot is never served (Fastify served them; refused here, stricter).
use super::static_types::TYPES;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use percent_encoding::percent_decode_str;
use std::cmp::Reverse;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tower::ServiceExt;
use tower_http::compression::predicate::Predicate;
use tower_http::compression::{Compression, CompressionLevel};
use tower_http::services::ServeDir;

// Read size of a file's stream: ServeDir's 64 KiB made 64 parallel downloads of
// the 3.4 MB renderer slower than Fastify (temp/l31_http/static_speed.probe.mjs, 2026-11-04).
const CHUNK: usize = 256 * 1024;

pub struct StaticRoots {
    roots: Vec<(String, PathBuf)>,
}

/// What a request path names under the roots.
pub enum Located {
    File(StaticFile),
    /// A name starting with a dot: refused.
    Hidden,
    /// No file: the request is someone else's (a route, a site page, a 404).
    Absent,
}

pub struct StaticFile {
    root: PathBuf,
    // The path under the root, still percent-encoded, as ServeDir reads it.
    relative: String,
    file: PathBuf,
}

impl StaticRoots {
    /// `prefix` ends with `/`; the longest prefix that matches wins.
    pub fn new(mut roots: Vec<(String, PathBuf)>) -> Self {
        roots.sort_by_key(|(prefix, _)| Reverse(prefix.len()));
        Self { roots }
    }

    /// The Web server's roots, under the project root (server/server.js).
    pub fn of_project(project: &Path) -> Self {
        Self::of_app(project, project.join("atome").join("src"))
    }

    /// The same roots with the application's own directory where a host keeps it
    /// (Tauri's bundled resources).
    pub fn of_app(project: &Path, app: PathBuf) -> Self {
        Self::new(vec![
            ("/atome/".into(), project.join("atome")),
            ("/eVe/".into(), project.join("eVe")),
            ("/src/".into(), app.clone()),
            (
                "/vendor/rubberband-wasm/".into(),
                project
                    .join("node_modules")
                    .join("rubberband-wasm")
                    .join("dist"),
            ),
            ("/".into(), app),
        ])
    }

    pub async fn locate(&self, path: &str) -> Located {
        let Some((prefix, root)) = self
            .roots
            .iter()
            .find(|(prefix, _)| path.starts_with(prefix.as_str()))
        else {
            return Located::Absent;
        };
        let relative = &path[prefix.len()..];
        let mut file = root.clone();
        for segment in relative.split('/').filter(|segment| !segment.is_empty()) {
            let Ok(segment) = percent_decode_str(segment).decode_utf8() else {
                return Located::Absent;
            };
            if segment == ".." || segment.contains(['/', '\\', '\0']) {
                return Located::Absent;
            }
            if segment.starts_with('.') {
                return Located::Hidden;
            }
            file.push(segment.as_ref());
        }
        let index = relative.is_empty() || relative.ends_with('/');
        if index {
            file.push("index.html");
        }
        match tokio::fs::metadata(&file).await {
            Ok(metadata) if metadata.is_file() => Located::File(StaticFile {
                root: root.clone(),
                relative: format!("/{relative}"),
                file,
            }),
            _ => Located::Absent,
        }
    }
}

fn content_type(file: &Path) -> (&'static str, bool) {
    let extension = file
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    TYPES
        .iter()
        .find(|(known, _, _)| *known == extension)
        .map_or(
            ("application/octet-stream", true),
            |(_, kind, compressible)| (kind, *compressible),
        )
}

// @fastify/send's validator: the size and the modification time, in hexadecimal. Node's
// `stat.mtime` is `mtimeMs` (seconds and nanoseconds in a double) rounded to the millisecond.
fn weak_etag(metadata: &std::fs::Metadata) -> Option<HeaderValue> {
    let since = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    let modified =
        (since.as_secs() as f64 * 1e3 + f64::from(since.subsec_nanos()) / 1e6 + 0.5).floor() as u64;
    HeaderValue::from_str(&format!("W/\"{:x}-{:x}\"", metadata.len(), modified)).ok()
}

fn matches_etag(request: &HeaderMap, etag: &HeaderValue) -> bool {
    let Ok(etag) = etag.to_str() else {
        return false;
    };
    request
        .get_all(header::IF_NONE_MATCH)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .map(str::trim)
        .any(|candidate| {
            candidate == "*" || candidate.trim_start_matches("W/") == etag.trim_start_matches("W/")
        })
}

// Marks a reply ServeDir took from a `.br`/`.gz` sibling.
#[derive(Clone, Copy)]
struct Precompressed;

#[derive(Clone, Copy)]
struct Compressible(bool);

impl Predicate for Compressible {
    fn should_compress<B: axum::body::HttpBody>(&self, response: &axum::http::Response<B>) -> bool {
        self.0
            && response.status() == StatusCode::OK
            && !response.headers().contains_key(header::CONTENT_ENCODING)
            && !response.headers().contains_key(header::CONTENT_RANGE)
    }
}

/// The answer for a file `locate` found.
pub async fn serve(found: StaticFile, mut request: Request) -> Response {
    let Ok(metadata) = tokio::fs::metadata(&found.file).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let (kind, compressible) = content_type(&found.file);
    let etag = weak_etag(&metadata);
    if let Some(etag) = etag
        .as_ref()
        .filter(|etag| matches_etag(request.headers(), etag))
    {
        let mut response = StatusCode::NOT_MODIFIED.into_response();
        response.headers_mut().insert(header::ETAG, etag.clone());
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=0"),
        );
        return response;
    }
    // An ETag that did not match decides alone (RFC 9110 §13.2.2).
    if request.headers().contains_key(header::IF_NONE_MATCH) {
        request.headers_mut().remove(header::IF_MODIFIED_SINCE);
    }
    let Ok(uri) = found.relative.parse() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    *request.uri_mut() = uri;
    let head = request.method() == Method::HEAD;
    let files = ServeDir::new(&found.root)
        .precompressed_br()
        .precompressed_gzip()
        .append_index_html_on_directories(true)
        .with_buf_chunk_size(CHUNK);
    let typed = tower::service_fn(move |request: Request| {
        let files = files.clone();
        async move {
            let mut response = files.oneshot(request).await?;
            if response.headers().contains_key(header::CONTENT_ENCODING) {
                response.extensions_mut().insert(Precompressed);
            }
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static(kind));
            Ok::<_, std::convert::Infallible>(response)
        }
    });
    let service = Compression::new(typed)
        .quality(CompressionLevel::Precise(4))
        .compress_when(Compressible(compressible && !head));
    let Ok(response) = service.oneshot(request).await;
    let (mut parts, body) = response.into_parts();
    let encoded = parts.headers.contains_key(header::CONTENT_ENCODING);
    let precompressed = parts.extensions.get::<Precompressed>().is_some();
    parts.headers.remove(header::VARY);
    if encoded && !precompressed {
        parts
            .headers
            .insert(header::VARY, HeaderValue::from_static("accept-encoding"));
    }
    if matches!(parts.status, StatusCode::OK | StatusCode::PARTIAL_CONTENT) {
        parts.headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=0"),
        );
        parts
            .headers
            .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
        if let Some(etag) = etag {
            parts.headers.insert(header::ETAG, etag);
        }
        return Response::from_parts(parts, Body::new(body));
    }
    if parts.status == StatusCode::RANGE_NOT_SATISFIABLE {
        // Fastify's error body (@fastify/send through Fastify's error serializer).
        let range = parts.headers.get(header::CONTENT_RANGE).cloned();
        let mut response = (
            StatusCode::RANGE_NOT_SATISFIABLE,
            [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
            "{\"statusCode\":416,\"error\":\"Range Not Satisfiable\",\"message\":\"Range Not Satisfiable\"}",
        )
            .into_response();
        if let Some(range) = range {
            response.headers_mut().insert(header::CONTENT_RANGE, range);
        }
        return response;
    }
    parts.headers.remove(header::CONTENT_TYPE);
    Response::from_parts(parts, Body::new(body))
}

/// The whole answer of a server whose only files are these roots (Tauri): a file,
/// else Fastify's not-found reply.
pub async fn answer(roots: &StaticRoots, request: Request) -> Response {
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    if !matches!(method, Method::GET | Method::HEAD) {
        return not_found(&method, &path);
    }
    match roots.locate(&path).await {
        Located::File(file) => serve(file, request).await,
        Located::Hidden | Located::Absent => not_found(&method, &path),
    }
}

/// Fastify's not-found reply (server/site_http.js), for a name refused here.
pub fn not_found(method: &Method, path: &str) -> Response {
    let body = format!(
        "{{\"message\":\"Route {method}:{} not found\",\"error\":\"Not Found\",\"statusCode\":404}}",
        path.replace('\\', "\\\\").replace('"', "\\\"")
    );
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        body,
    )
        .into_response()
}
