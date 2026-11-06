// The server's own routes, answered as Fastify answers them: its versions and
// health (server/http_status_routes.js, server/http_server_hooks.js `/__whoami`,
// `/healthz`), its identity and the signed challenge (server/auth_routes_server.js,
// server_identity.rs), the iOS app association and the phone-link page, the central
// database's status, and `server_config.json` (server/http_dev_routes.js).
use crate::http::cors::{self, CorsPolicy};
use crate::http::fastify_reply;
use crate::http::request_id::Untagged;
use crate::server_identity::ServerIdentity;
use crate::vault_router::central::Central;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

pub const SERVER_TYPE: &str = "atome-server";
const AUTH_LINK_CSP: &str = "default-src 'none'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const SCHEMA_TABLES: &str = "atomes, particles, particles_versions, snapshots, events, state_current, permissions, sync_queue, sync_state";
const DATABASE: &str = "SQLite/LibSQL (ADOLE v3.0)";

pub struct Status {
    pub identity: ServerIdentity,
    pub project_root: PathBuf,
    pub central: Central,
    pub started: Instant,
    pub started_at: String,
    pub public_port: u16,
    /// `__CHECK_DEBUG__`, `npm_package_version`, `NODE_ENV`, `USE_HTTPS`, `HOST`.
    pub check_debug: Option<String>,
    pub package_version: Option<String>,
    pub node_env: Option<String>,
    pub use_https: Option<String>,
    pub host: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}

// `Number(seconds.toFixed(2))`.
pub(crate) fn two_decimals(seconds: f64) -> JsonValue {
    crate::vault_router::js::number_json((seconds * 100.0).round() / 100.0)
}

fn valid_attempt(id: &str) -> bool {
    id.len() == 43
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

// What a route of this module needs from the path: its name, the phone-link
// attempt's id for `/auth/v/:attemptId`.
#[derive(Clone, Copy, PartialEq)]
enum Route {
    Health,
    Healthz,
    WhoAmI,
    ServerInfo,
    Identity,
    ServerStatus,
    Verify,
    VerifyPreflight,
    AppAssociation,
    AuthLink,
    DbStatus,
    DbStats,
    ServerConfig,
}

fn route(method: &Method, path: &str) -> Option<Route> {
    let read = matches!(*method, Method::GET | Method::HEAD);
    Some(match path {
        "/health" if read => Route::Health,
        "/healthz" if read => Route::Healthz,
        "/__whoami" if read => Route::WhoAmI,
        "/api/server-info" if read => Route::ServerInfo,
        "/api/server/identity" if read => Route::Identity,
        "/api/server/status" if read => Route::ServerStatus,
        "/api/server/verify" if method == Method::POST => Route::Verify,
        "/api/server/verify" if method == Method::OPTIONS => Route::VerifyPreflight,
        "/.well-known/apple-app-site-association" if read => Route::AppAssociation,
        "/api/db/status" if read => Route::DbStatus,
        "/api/db/stats" if read => Route::DbStats,
        "/server_config.json" if read => Route::ServerConfig,
        _ if read
            && path
                .strip_prefix("/auth/v/")
                .is_some_and(|id| !id.is_empty() && !id.contains('/')) =>
        {
            Route::AuthLink
        }
        _ => return None,
    })
}

/// Whether `request` is one of these routes.
pub fn claims(request: &Request) -> bool {
    route(request.method(), request.uri().path()).is_some()
}

impl Status {
    pub(crate) async fn versions(&self) -> (String, String) {
        let read = |path: PathBuf| async move {
            tokio::fs::read_to_string(path)
                .await
                .map(|text| text.trim().to_string())
                .ok()
                .filter(|text| !text.is_empty())
                .unwrap_or_else(|| "unknown".into())
        };
        tokio::join!(
            read(self.project_root.join("atome").join("version.txt")),
            read(self.project_root.join("eVe").join("version.txt")),
        )
    }

    fn fingerprint(&self) -> JsonValue {
        let platform = match std::env::consts::OS {
            "macos" => "darwin",
            other => other,
        };
        let arch = match std::env::consts::ARCH {
            "aarch64" => "arm64",
            "x86_64" => "x64",
            other => other,
        };
        json!({
            "pid": std::process::id(),
            "platform": platform,
            "arch": arch,
            "cwd": std::env::current_dir().ok(),
            "argv": std::env::args().collect::<Vec<_>>(),
            "entry": std::env::current_exe().ok(),
            "projectRoot": self.project_root,
            "port": self.public_port.to_string(),
            "env": {
                "NODE_ENV": self.node_env,
                "USE_HTTPS": self.use_https,
                "HOST": self.host,
                "PORT": self.public_port.to_string(),
            },
            "started_at": self.started_at,
        })
    }

    async fn db_status(&self) -> (StatusCode, JsonValue) {
        let tables = self
            .central
            .all(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                    .into(),
                Vec::new(),
            )
            .await;
        match tables {
            Ok(tables) => {
                let schema = tokio::fs::read(self.project_root.join("database").join("schema.sql"))
                    .await
                    .ok()
                    .map(|schema| {
                        Sha256::digest(schema)
                            .iter()
                            .map(|byte| format!("{byte:02x}"))
                            .collect::<String>()
                    });
                (
                    StatusCode::OK,
                    json!({
                        "success": true,
                        "status": "connected",
                        "database": DATABASE,
                        "tables": tables.iter().map(|row| row["name"].clone()).collect::<Vec<_>>(),
                        "schema": SCHEMA_TABLES,
                        "schema_hash": schema,
                        "schema_source": "database/schema.sql",
                        "timestamp": atome_store::append::iso_now(),
                    }),
                )
            }
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "success": false, "status": "disconnected", "error": error,
                        "timestamp": atome_store::append::iso_now() }),
            ),
        }
    }

    async fn db_stats(&self) -> (StatusCode, JsonValue) {
        let count = |sql: &'static str| async move {
            self.central
                .get(sql, Vec::new())
                .await
                .map(|row| row.and_then(|row| row["count"].as_i64()).unwrap_or(0))
        };
        let counted = tokio::try_join!(
            count("SELECT COUNT(*) as count FROM atomes"),
            count("SELECT COUNT(*) as count FROM particles"),
            count("SELECT COUNT(*) as count FROM atomes WHERE atome_type = 'user'"),
        );
        match counted {
            Ok((atomes, particles, users)) => (
                StatusCode::OK,
                json!({ "success": true, "data": { "atomes": atomes, "particles": particles, "users": users,
                        "database": DATABASE, "timestamp": atome_store::append::iso_now() } }),
            ),
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "success": false, "error": error }),
            ),
        }
    }

    async fn server_config(&self) -> Response {
        let Ok(raw) = tokio::fs::read_to_string(self.project_root.join("server_config.json")).await
        else {
            return fastify_reply::json(
                StatusCode::NOT_FOUND,
                &json!({ "success": false, "error": "server_config.json not found" }),
            );
        };
        let text = match serde_json::from_str::<JsonValue>(&raw) {
            Ok(mut config) => {
                let debug = self.check_debug.as_deref().map(str::trim).unwrap_or("");
                if !debug.is_empty() {
                    let mut logging = config
                        .get("logging")
                        .filter(|logging| logging.is_object())
                        .cloned()
                        .unwrap_or_else(|| json!({}));
                    logging["debugEnabled"] = json!(debug == "1" || debug == "true");
                    config["logging"] = logging;
                }
                config.to_string()
            }
            // Fastify sends the file as it is when it is not JSON.
            Err(_) => raw,
        };
        let mut response = (StatusCode::OK, text).into_response();
        let headers = response.headers_mut();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json; charset=utf-8"),
        );
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        response
    }

    async fn verify(&self, request: Request) -> Response {
        let (_, body) = match fastify_reply::read(request).await {
            Ok(read) => read,
            Err(refusal) => return refusal,
        };
        let challenge = body
            .as_ref()
            .and_then(|body| body.get("challenge"))
            .and_then(JsonValue::as_str)
            .filter(|challenge| !challenge.is_empty());
        let refuse = |error: &str, code: &str| {
            fastify_reply::json(
                StatusCode::BAD_REQUEST,
                &json!({ "success": false, "error": error, "errorCode": code }),
            )
        };
        let Some(challenge) = challenge else {
            return refuse("Challenge is required", "INVALID_CHALLENGE");
        };
        let length = challenge.encode_utf16().count();
        if length < 32 {
            return refuse(
                "Challenge must be at least 32 characters",
                "CHALLENGE_TOO_SHORT",
            );
        }
        if length > 256 {
            return refuse(
                "Challenge must be at most 256 characters",
                "CHALLENGE_TOO_LONG",
            );
        }
        match self.identity.sign(challenge, now_ms()) {
            Ok(signed) => fastify_reply::json(StatusCode::OK, &signed),
            Err(refusal) => fastify_reply::json(StatusCode::SERVICE_UNAVAILABLE, &refusal),
        }
    }

    async fn auth_link(&self, uri: &Uri) -> Response {
        let id = uri.path().strip_prefix("/auth/v/").unwrap_or("");
        let id = percent_encoding::percent_decode_str(id).decode_utf8_lossy();
        // `Object.keys(request.query).length`: any query name, even empty-valued.
        let queried = uri
            .query()
            .is_some_and(|query| query.split('&').any(|pair| !pair.is_empty()));
        let page = if valid_attempt(&id) && !queried {
            tokio::fs::read(
                self.project_root
                    .join("atome")
                    .join("src")
                    .join("auth-link.html"),
            )
            .await
            .ok()
        } else {
            None
        };
        let mut response = match page {
            Some(page) => {
                let mut response = (StatusCode::OK, page).into_response();
                response.headers_mut().insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("text/html; charset=utf-8"),
                );
                response
                    .headers_mut()
                    .insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
                response
            }
            None if valid_attempt(&id) && !queried => StatusCode::NOT_FOUND.into_response(),
            None => {
                let mut response = StatusCode::BAD_REQUEST.into_response();
                response
                    .headers_mut()
                    .insert(header::CONTENT_LENGTH, HeaderValue::from_static("0"));
                response
            }
        };
        let headers = response.headers_mut();
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        headers.insert(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        );
        headers.insert(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        );
        headers.insert(
            "x-robots-tag",
            HeaderValue::from_static("noindex, nofollow"),
        );
        headers.insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(AUTH_LINK_CSP),
        );
        response
    }

    /// The answer to a request `claims` took.
    pub async fn answer(&self, policy: &CorsPolicy, request: Request) -> Response {
        let method = request.method().clone();
        let path = request.uri().path().to_string();
        let headers: HeaderMap = request.headers().clone();
        let Some(route) = route(&method, &path) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        let response = match route {
            Route::VerifyPreflight => {
                let mut response = Response::new(Body::empty());
                *response.status_mut() = StatusCode::NO_CONTENT;
                *response.headers_mut() =
                    cors::open_preflight("POST", "content-type, accept", &headers);
                response.extensions_mut().insert(Untagged);
                return response;
            }
            Route::Health => {
                let (version, eve) = self.versions().await;
                fastify_reply::json(
                    StatusCode::OK,
                    &json!({ "status": "ok", "version": version, "atomeVersion": version, "eveVersion": eve,
                             "uptime": self.started.elapsed().as_secs_f64(),
                             "timestamp": atome_store::append::iso_now(), "database": "connected" }),
                )
            }
            Route::Healthz => {
                let (version, eve) = self.versions().await;
                fastify_reply::json(
                    StatusCode::OK,
                    &json!({ "success": true, "type": SERVER_TYPE, "appVersion": version, "eveVersion": eve,
                             "uptime_sec": two_decimals(self.started.elapsed().as_secs_f64()) }),
                )
            }
            Route::WhoAmI => {
                let (version, eve) = self.versions().await;
                fastify_reply::json(
                    StatusCode::OK,
                    &json!({ "success": true, "type": SERVER_TYPE, "appVersion": version, "eveVersion": eve,
                             "fingerprint": self.fingerprint() }),
                )
            }
            Route::ServerInfo => {
                let (version, eve) = self.versions().await;
                fastify_reply::json(
                    StatusCode::OK,
                    &json!({ "success": true, "version": version, "atomeVersion": version,
                             "eveVersion": eve, "type": SERVER_TYPE }),
                )
            }
            Route::Identity => fastify_reply::json(
                StatusCode::OK,
                &json!({ "success": true, "serverId": self.identity.server_id,
                         "serverName": self.identity.server_name,
                         "hasSigningCapability": self.identity.configured(),
                         "algorithm": crate::server_identity::ALGORITHM,
                         "fingerprint": self.identity.fingerprint(), "timestamp": now_ms() }),
            ),
            Route::ServerStatus => fastify_reply::json(
                StatusCode::OK,
                &json!({ "success": true, "status": "online",
                         "verificationEnabled": self.identity.configured(), "timestamp": now_ms(),
                         "version": self.package_version.as_deref().unwrap_or("1.0.0") }),
            ),
            Route::Verify => self.verify(request).await,
            Route::AppAssociation => {
                let mut response = fastify_reply::json(
                    StatusCode::OK,
                    &json!({ "applinks": { "apps": [], "details": [
                        { "appID": "2W25PVZ57F.one.atome.app", "paths": ["/auth/v/*"] }] } }),
                );
                response.headers_mut().insert(
                    header::CACHE_CONTROL,
                    HeaderValue::from_static("public, max-age=3600"),
                );
                response
            }
            Route::AuthLink => self.auth_link(request.uri()).await,
            Route::DbStatus => {
                let (status, body) = self.db_status().await;
                fastify_reply::json(status, &body)
            }
            Route::DbStats => {
                let (status, body) = self.db_stats().await;
                fastify_reply::json(status, &body)
            }
            Route::ServerConfig => self.server_config().await,
        };
        let mut response = if method == Method::HEAD {
            response
        } else if route == Route::AuthLink {
            // A file is sent as a stream: @fastify/compress encodes it whatever its size.
            fastify_reply::compressed_stream(&headers, response).await
        } else {
            fastify_reply::compressed(&headers, response).await
        };
        if matches!(route, Route::Health | Route::Verify) {
            cors::decorate_open(&headers, response.headers_mut());
        } else {
            policy.decorate(&path, &headers, response.headers_mut());
        }
        response
    }
}
