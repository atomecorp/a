// The developer and diagnostic routes of server/http_dev_routes.js, answered as Fastify answers
// them: the dev state (`GET /dev/state`), the browser's logs (`POST /dev/client-log`, its older
// name `POST /client-log`) and the UI state snapshots (`POST /dev/snapshot`), under the project's
// `logs/`. `server_config.json` is status.rs's. The dev state reports the live `/ws/api`
// connections and their accounts (social/live.rs) and the last errors a route answered
// (http/request_id.rs). The restricted shell of `/ws/api` is shell.rs.
mod client_log;
pub mod shell;
mod shell_policy;
mod shell_run;

use crate::http::fastify_reply;
use crate::web::Web;
use axum::extract::Request;
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Clone, Copy, PartialEq)]
enum Route {
    State,
    ClientLog,
    Snapshot,
}

fn route(method: &Method, path: &str) -> Option<Route> {
    match (method, path) {
        (&Method::GET | &Method::HEAD, "/dev/state") => Some(Route::State),
        (&Method::POST, "/dev/client-log" | "/client-log") => Some(Route::ClientLog),
        (&Method::POST, "/dev/snapshot") => Some(Route::Snapshot),
        _ => None,
    }
}

/// Whether `request` is one of these routes.
pub fn claims(request: &Request) -> bool {
    route(request.method(), request.uri().path()).is_some()
}

async fn state(web: &Web) -> Response {
    let (connections, users) = crate::social::live::counts();
    let (version, eve) = web.status.versions().await;
    let uptime = crate::status::two_decimals(web.status.started.elapsed().as_secs_f64());
    fastify_reply::json(
        StatusCode::OK,
        &json!({ "success": true, "source": crate::status::SERVER_TYPE, "version": version,
                 "atomeVersion": version, "eveVersion": eve, "uptime_sec": uptime,
                 "ws_api_connections": connections, "ws_api_users": users,
                 "recent_errors": crate::http::request_id::recent_errors(20) }),
    )
}

/// The answer to a request `claims` took.
pub async fn answer(web: &Web, request: Request) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let headers: HeaderMap = request.headers().clone();
    let Some(route) = route(&method, &path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let logs = web.status.project_root.join("logs");
    let response = match route {
        Route::State => state(web).await,
        Route::ClientLog | Route::Snapshot => match fastify_reply::read(request).await {
            Err(refusal) => refusal,
            Ok((_, body)) if route == Route::ClientLog => {
                client_log::ingest(&logs.join("browser.log"), body).await
            }
            Ok((_, body)) => client_log::snapshot(&logs.join("snapshots"), body).await,
        },
    };
    let mut response = if method == Method::HEAD {
        response
    } else {
        fastify_reply::compressed(&headers, response).await
    };
    web.cors.decorate(&path, &headers, response.headers_mut());
    response
}
