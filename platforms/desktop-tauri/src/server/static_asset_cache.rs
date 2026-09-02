use axum::{
    body::Body,
    http::{header, HeaderMap, HeaderValue, Request},
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
    req: Request<Body>,
    next: middleware::Next,
) -> Response {
    let path = req.uri().path().to_string();
    let mut response = next.run(req).await;
    apply_static_revalidation_headers(&path, response.headers_mut());
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_code_uses_conditional_revalidation_instead_of_no_store() {
        for path in [
            "/",
            "/eVe/intuition/tools/communication.js",
            "/atome/src/squirrel/kickstart.js",
            "/src/index.mjs",
            "/vendor/rubberband-wasm/index.esm.js",
            "/sw.js",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
            headers.insert(header::EXPIRES, HeaderValue::from_static("0"));
            apply_static_revalidation_headers(path, &mut headers);
            assert_eq!(
                headers
                    .get(header::CACHE_CONTROL)
                    .and_then(|value| value.to_str().ok()),
                Some(STATIC_REVALIDATION_POLICY),
                "unexpected cache policy for {path}"
            );
            assert!(
                !headers.contains_key(header::PRAGMA),
                "stale pragma header for {path}"
            );
            assert!(
                !headers.contains_key(header::EXPIRES),
                "stale expires header for {path}"
            );
        }
    }

    #[test]
    fn private_and_dynamic_routes_never_receive_public_cache_headers() {
        for path in [
            "/api/server-info",
            "/api/uploads/private.js",
            "/file/data/users/private/profile.js",
            "/text/private.css",
            "/ws/api",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            apply_static_revalidation_headers(path, &mut headers);
            assert_eq!(
                headers
                    .get(header::CACHE_CONTROL)
                    .and_then(|value| value.to_str().ok()),
                Some("no-store"),
                "dynamic route cache policy changed for {path}"
            );
        }
    }
}
