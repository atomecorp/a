// The Web server's router: the application's files, `/ws/api` (ws_api), `/ws/sync`,
// `POST /api/media-token` (auth), the stores' notifications (billing), the uploads and the files' reads (media), the personal mail
// gateway (`POST /api/eve/mail/*`, mail), the server's own routes
// (status) and the websites' public side (site: a personal domain's pages, `/_site/` with the
// contact form `POST /_site/contact`, a site's address once no file answers it) are answered
// here, with the offline manifest (http/offline_manifest/), the preflights of the allowed origins and
// Fastify's 404 for anything else. Another host than the application's is answered as Fastify
// answered it: its active personal site first, then every route of the application. The router
// starts the server's clocks (ws_api `clocks`, the OTA retention): it is made once, once the
// central schema is in place.
use crate::auth::{Sessions, media_token};
use crate::billing;
use crate::http::cors::CorsPolicy;
use crate::http::fastify_reply;
use crate::http::request_id;
use crate::http::statics::{self, Located, StaticRoots};
use crate::mail::gateway;
use crate::media::served;
use crate::media::uploads::{self, Uploads};
use crate::page_preview::{self, PreviewOrigin};
use crate::status::{self, Status};
use crate::ws_api::{self, WsApi};
use crate::ws_sync::{self, SyncRuntime};
use axum::Router;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::middleware;
use axum::response::Response;
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;

pub struct Web {
    pub statics: StaticRoots,
    pub cors: Arc<CorsPolicy>,
    pub app_hosts: HashSet<String>,
    /// Where the isolated preview of a person's page is served (page_preview.rs).
    pub preview: PreviewOrigin,
    /// `/ws/api` (ws_api).
    pub ws_api: Arc<WsApi>,
    /// `/ws/sync`, answered here (ws_sync).
    pub ws_sync: Arc<SyncRuntime>,
    /// The device sessions a request names (auth).
    pub sessions: Arc<Sessions>,
    /// A media capability's lifetime, in seconds (media_token::ttl_seconds).
    pub media_token_ttl: u64,
    /// The server's own routes (status).
    pub status: Arc<Status>,
    /// The upload routes (media).
    pub uploads: Arc<Uploads>,
    /// `/offline-manifest.js`, the application's files a device keeps offline.
    pub offline_manifest: Arc<crate::http::offline_manifest::OfflineManifest>,
}

pub fn router(web: Arc<Web>) -> Router {
    web.ws_api.clocks();
    crate::ios_ota::start();
    Router::new()
        .merge(page_preview::origin_route(web.preview.clone()))
        .fallback(answer)
        .layer(middleware::from_fn(request_id::tag))
        .with_state(web)
}

// The host Fastify reads (`request.hostname`, `trustProxy: '127.0.0.1'`): the
// forwarded one from the loopback (nginx), else Host; without its port.
fn host(headers: &HeaderMap, peer: SocketAddr) -> String {
    let forwarded = peer
        .ip()
        .is_loopback()
        .then(|| headers.get("x-forwarded-host"))
        .flatten();
    let raw = forwarded
        .or_else(|| headers.get(header::HOST))
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");
    let raw = raw
        .split(',')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    match raw.rfind(':') {
        Some(colon) if !raw.ends_with(']') => raw[..colon].to_string(),
        _ => raw,
    }
}

async fn answer(
    State(web): State<Arc<Web>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
) -> Response {
    let host = host(request.headers(), peer);
    let app_host = web.app_hosts.contains(&host);
    let (method, uri) = (request.method().clone(), request.uri().clone());
    if !app_host {
        let headers = request.headers().clone();
        if let Some(mut response) = web
            .ws_api
            .site
            .personal(&host, &method, &uri, &headers)
            .await
        {
            web.cors
                .decorate(uri.path(), &headers, response.headers_mut());
            return response;
        }
    }
    if method == Method::POST && uri.path() == "/_site/contact" {
        let headers = request.headers().clone();
        let site = &web.ws_api.site;
        let notifier = &web.ws_api.social.notifier;
        let mut response = site.contact(notifier, peer, request).await;
        web.cors
            .decorate(uri.path(), &headers, response.headers_mut());
        return response;
    }
    if uri.path().starts_with("/_site/") {
        let headers = request.headers().clone();
        if let Some(mut response) = web.ws_api.site.assets(&method, &uri, &headers).await {
            web.cors
                .decorate(uri.path(), &headers, response.headers_mut());
            return response;
        }
    }
    if ws_api::claims(&request) {
        return ws_api::accept(web.ws_api.clone(), peer, request).await;
    }
    if ws_sync::claims(&request) {
        return web.ws_sync.clone().accept(request).await;
    }
    if request.method() == Method::POST && request.uri().path() == "/api/media-token" {
        let headers = request.headers().clone();
        let mut response = media_token::answer(&web.sessions, web.media_token_ttl, request).await;
        web.cors
            .decorate("/api/media-token", &headers, response.headers_mut());
        return response;
    }
    if billing::routes::claims(&request) {
        let path = request.uri().path().to_string();
        let headers = request.headers().clone();
        let mut response = billing::routes::answer(&web.ws_api.billing, request).await;
        web.cors.decorate(&path, &headers, response.headers_mut());
        return response;
    }
    if uploads::claims(&request) {
        let path = request.uri().path().to_string();
        let headers = request.headers().clone();
        let mut response = web.uploads.answer(peer, request).await;
        web.cors.decorate(&path, &headers, response.headers_mut());
        return fastify_reply::compressed(&headers, response).await;
    }
    if served::claims(&request) {
        let path = request.uri().path().to_string();
        let headers = request.headers().clone();
        let mut response = served::answer(&web.ws_api.downloads(), &web.sessions, request).await;
        web.cors.decorate(&path, &headers, response.headers_mut());
        return response;
    }
    if gateway::claims(&request) {
        let path = request.uri().path().to_string();
        let headers = request.headers().clone();
        let mail = &web.ws_api.providers.mail;
        let mut response = gateway::answer(mail, &web.sessions, request).await;
        web.cors.decorate(&path, &headers, response.headers_mut());
        return fastify_reply::compressed(&headers, response).await;
    }
    if status::claims(&request) {
        return web.status.answer(&web.cors, request).await;
    }
    if crate::dev::claims(&request) {
        return crate::dev::answer(&web, request).await;
    }
    if crate::ios_ota::claims(&request) {
        return crate::ios_ota::answer(&web.cors, request).await;
    }
    if crate::http::offline_manifest::OfflineManifest::claims(&request) {
        return web
            .offline_manifest
            .clone()
            .answer(&web.cors, request)
            .await;
    }
    let readable = matches!(*request.method(), Method::GET | Method::HEAD);
    if readable && uri.path().starts_with("/api/social/") {
        let headers = request.headers().clone();
        if let Some(mut response) = web.ws_api.providers.route(uri.path(), uri.query()).await {
            web.cors
                .decorate(uri.path(), &headers, response.headers_mut());
            return response;
        }
    }
    if readable {
        let path = request.uri().path().to_string();
        let found = web.statics.locate(&path).await;
        if !matches!(found, Located::Absent) {
            let headers = request.headers().clone();
            let method = request.method().clone();
            let mut response = match found {
                Located::File(file) => statics::serve(file, request).await,
                _ => statics::not_found(&method, &path),
            };
            web.cors.decorate(&path, &headers, response.headers_mut());
            return response;
        }
        let headers = request.headers().clone();
        if let Some(mut response) = web.ws_api.site.page(&method, &uri, &headers).await {
            web.cors.decorate(&path, &headers, response.headers_mut());
            return response;
        }
    }
    let headers = request.headers().clone();
    let path = uri.path();
    // `@fastify/cors` answered a listed origin's preflight on any route, and Fastify's own OPTIONS
    // routes the native media routes' (server/http_server_hooks.js), from any origin.
    let media_preflight =
        method == Method::OPTIONS && crate::http::cors::is_native_media_route(path);
    let preflight = web
        .cors
        .preflight(&method, &headers)
        .or_else(|| media_preflight.then(HeaderMap::new));
    let mut response = match preflight {
        Some(preflight) => {
            let mut response = Response::new(axum::body::Body::empty());
            *response.status_mut() = StatusCode::NO_CONTENT;
            *response.headers_mut() = preflight;
            response
        }
        None => statics::not_found(&method, path),
    };
    web.cors.decorate(path, &headers, response.headers_mut());
    response
}
