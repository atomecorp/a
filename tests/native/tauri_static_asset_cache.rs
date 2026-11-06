use super::*;
use axum::{Router, routing::get};
use reqwest::StatusCode;
use std::time::{Duration, UNIX_EPOCH};

struct TestServer {
    url: String,
    task: tokio::task::JoinHandle<()>,
    root: tempfile::TempDir,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl TestServer {
    async fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("runtime.js"), "old_source").unwrap();
        std::fs::File::options()
            .write(true)
            .open(root.path().join("runtime.js"))
            .unwrap()
            .set_modified(UNIX_EPOCH + Duration::from_secs(2000))
            .unwrap();
        let app = Router::new()
            .nest_service("/eVe", tower_http::services::ServeDir::new(root.path()))
            .route(
                "/api/private.js",
                get(|headers: HeaderMap| async move {
                    (
                        [(header::CACHE_CONTROL, "no-store")],
                        headers
                            .get(header::IF_MODIFIED_SINCE)
                            .and_then(|h| h.to_str().ok())
                            .unwrap_or("")
                            .to_string(),
                    )
                }),
            )
            .layer(middleware::from_fn(revalidate_static_asset_middleware));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { url, task, root }
    }

    fn client(&self) -> reqwest::Client {
        reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }
}

#[tokio::test]
async fn replacing_bundle_with_older_timestamp_must_send_current_bytes() {
    let server = TestServer::new().await;
    let client = server.client();
    let url = format!("{}/eVe/runtime.js", server.url);
    let first = client.get(&url).send().await.unwrap();
    let old_date = first.headers()["last-modified"].clone();
    assert_eq!(first.text().await.unwrap(), "old_source");
    let file = server.root.path().join("runtime.js");
    std::fs::write(&file, "new_source").unwrap();
    std::fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_modified(UNIX_EPOCH + Duration::from_secs(1000))
        .unwrap();
    let replaced = client
        .get(&url)
        .header("if-modified-since", old_date.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(
        replaced.status(),
        StatusCode::OK,
        "a cached newer date cannot validate different bundled bytes"
    );
    assert_ne!(replaced.headers()["last-modified"], old_date);
    assert_eq!(replaced.text().await.unwrap(), "new_source");
}

#[tokio::test]
async fn identical_validator_keeps_304_and_private_requests_keep_their_headers() {
    let server = TestServer::new().await;
    let client = server.client();
    let url = format!("{}/eVe/runtime.js", server.url);
    let first = client.get(&url).send().await.unwrap();
    let date = first.headers()["last-modified"].clone();
    for method in [reqwest::Method::GET, reqwest::Method::HEAD] {
        let unchanged = client
            .request(method, &url)
            .header("if-modified-since", date.clone())
            .send()
            .await
            .unwrap();
        assert_eq!(unchanged.status(), StatusCode::NOT_MODIFIED);
        assert_eq!(
            unchanged.headers()["cache-control"],
            STATIC_REVALIDATION_POLICY
        );
        assert!(unchanged.bytes().await.unwrap().is_empty());
    }
    let private = client
        .get(format!("{}/api/private.js", server.url))
        .header("if-modified-since", date.clone())
        .send()
        .await
        .unwrap();
    assert_eq!(private.status(), StatusCode::OK);
    assert_eq!(private.headers()["cache-control"], "no-store");
    assert_eq!(private.text().await.unwrap(), date.to_str().unwrap());
}

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
                .get("cache-control")
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
        headers.insert("cache-control", HeaderValue::from_static("no-store"));
        apply_static_revalidation_headers(path, &mut headers);
        assert_eq!(
            headers
                .get("cache-control")
                .and_then(|value| value.to_str().ok()),
            Some("no-store"),
            "dynamic route cache policy changed for {path}"
        );
    }
}
