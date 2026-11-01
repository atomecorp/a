use axum::{
    body::Body,
    http::{header, HeaderMap, HeaderValue, Method, Request, StatusCode},
    middleware,
    response::Response,
};

const STATIC_REVALIDATION_POLICY: &str = "public, max-age=0";

fn is_runtime_static_asset(path: &str) -> bool {
    path == "/"
        || path.starts_with("/eVe/")
        || path.starts_with("/atome/")
        || path.starts_with("/src/")
        || path.starts_with("/vendor/")
        || (!path.starts_with("/api/")
            && !path.starts_with("/file/")
            && !path.starts_with("/text/")
            && !path.starts_with("/ws/")
            && (path.ends_with(".html")
                || path.ends_with(".js")
                || path.ends_with(".mjs")
                || path.ends_with(".css")))
}

fn apply_static_revalidation_headers(path: &str, headers: &mut HeaderMap) {
    if !is_runtime_static_asset(path) {
        return;
    }
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(STATIC_REVALIDATION_POLICY),
    );
    headers.remove(header::PRAGMA);
    headers.remove(header::EXPIRES);
}

pub(super) async fn revalidate_static_asset_middleware(
    mut req: Request<Body>,
    next: middleware::Next,
) -> Response {
    let path = req.uri().path().to_string();
    let runtime_read =
        is_runtime_static_asset(&path) && matches!(*req.method(), Method::GET | Method::HEAD);
    let has_etag_validator = req.headers().contains_key(header::IF_NONE_MATCH);
    // A replacement bundle can carry older source timestamps. ServeDir's
    // "not newer than" check would retain different bytes from the old bundle.
    // Let it open the response, then accept only the exact date it now serves.
    // The streaming body is never collected or read for this comparison.
    let modified_since = if runtime_read {
        req.headers_mut().remove(header::IF_MODIFIED_SINCE)
    } else {
        None
    };
    let mut response = next.run(req).await;
    if !has_etag_validator
        && matches!(
            response.status(),
            StatusCode::OK | StatusCode::PARTIAL_CONTENT
        )
        && modified_since
            .as_ref()
            .is_some_and(|date| response.headers().get(header::LAST_MODIFIED) == Some(date))
    {
        *response.status_mut() = StatusCode::NOT_MODIFIED;
        *response.body_mut() = Body::empty();
        response.headers_mut().remove(header::CONTENT_LENGTH);
        response.headers_mut().remove(header::CONTENT_RANGE);
    }
    apply_static_revalidation_headers(&path, response.headers_mut());
    response
}

#[cfg(test)]
#[path = "../../../../tests/native/tauri_static_asset_cache.rs"]
mod tests;
