// The upload routes (server/http_upload_routes.js, ported, and the listing `GET
// /api/uploads` of server/http_media_serving_routes.js): one-shot `POST
// /api/uploads`, its chunks (`/chunk`) and their assembly (`/complete`), into the
// caller's `Downloads`, its `recordings` or a path it names in its home, then
// recorded as its file. Only a verified device session uploads. The chunks of an
// upload are kept under their uploader, so no one assembles another's.
use super::playback::{self, sanitize_file_name};
use super::storage::{self, Placed, Registration, Storage, sanitize_segment};
use crate::auth::Sessions;
use crate::http::fastify_reply;
use crate::vault_router::js;
use axum::extract::Request;
use axum::http::request::Parts;
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::Response;
use serde_json::{Value as JsonValue, json};
use std::os::unix::fs::DirBuilderExt;
use std::path::PathBuf;
use std::sync::Arc;

pub const ROUTES: [&str; 4] = [
    "/api/uploads",
    "/api/uploads/chunk",
    "/api/uploads/complete",
    "/api/uploads/remote-wallpaper",
];

pub struct Uploads {
    pub storage: Arc<Storage>,
    pub sessions: Arc<Sessions>,
    pub router: Arc<crate::vault_router::VaultRouter>,
    pub wallpaper: super::wallpaper::Wallpaper,
}

pub fn claims(request: &Request) -> bool {
    let path = request.uri().path();
    (request.method() == Method::POST && ROUTES.contains(&path))
        || (request.method() == Method::GET && path == "/api/uploads")
}

/// A request header as Node reads it: latin-1, repeated values joined by ", ".
pub(super) fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    let values: Vec<String> = headers
        .get_all(name)
        .iter()
        .map(|value| value.as_bytes().iter().map(|&b| b as char).collect())
        .collect();
    (!values.is_empty()).then(|| values.join(", "))
}

// `getHeaderValue`: trimmed, None when empty.
fn trimmed(headers: &HeaderMap, name: &str) -> Option<String> {
    header(headers, name)
        .map(|value| js::trim(&value).to_string())
        .filter(|value| !value.is_empty())
}

fn present(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|value| !value.is_empty())
}

/// `resolveUserId` of the verified session, else `anonymous`.
pub(super) fn user_id(claims: Option<&JsonValue>) -> String {
    let Some(claims) = claims else {
        return "anonymous".into();
    };
    for keys in [
        &["id", "userId", "user_id", "sub"][..],
        &["username", "name"],
    ] {
        let direct = js::first(claims, keys).or_else(|| claims.get(keys[keys.len() - 1]));
        if let Some(direct) = direct.filter(|value| !value.is_null()) {
            let text = js::string(direct);
            let text = js::trim(&text);
            if !text.is_empty() {
                return text.to_string();
            }
        }
    }
    "anonymous".into()
}

// `parseInt(text, 10)`.
fn parse_int(text: Option<&str>) -> Option<f64> {
    let text = js::trim(text?);
    let (sign, digits) = match text.strip_prefix('-') {
        Some(rest) => (-1.0, rest),
        None => (1.0, text.strip_prefix('+').unwrap_or(text)),
    };
    let end = digits
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(digits.len());
    digits[..end]
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .map(|value| sign * value)
}

// `sanitizeUploadId`.
fn upload_id(headers: &HeaderMap) -> Option<String> {
    let value = header(headers, "x-upload-id").unwrap_or_default();
    let value = js::trim(&value);
    (!value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
    .then(|| value.to_string())
}

fn recording(name: &str, atome_type: Option<&str>) -> bool {
    if let Some(kind) = atome_type {
        let kind = js::trim(kind).to_lowercase();
        return kind == "audio_recording" || kind == "video_recording";
    }
    let name = js::trim(name).to_lowercase();
    ["audio_", "video_", "recording_"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

pub(super) fn reply(status: StatusCode, body: JsonValue) -> Response {
    fastify_reply::json(status, &body)
}

fn failed(status: StatusCode, error: &str) -> Response {
    reply(status, json!({ "success": false, "error": error }))
}

struct Destination {
    file_name: String,
    file_path: PathBuf,
    relative_path: String,
}

// Where an upload goes: the path it names, its `recordings`, else `Downloads`.
fn destination(
    storage: &Storage,
    user: &str,
    decoded: &str,
    path: Option<&str>,
    atome_type: Option<&str>,
    unnamed: &str,
) -> Result<Destination, String> {
    let placed: Placed = if let Some(path) = path {
        let named = storage.asset_path(user, &storage::normalize_user_relative_path(path, user))?;
        return Ok(Destination {
            file_name: if decoded.is_empty() {
                named.file_name
            } else {
                decoded.to_string()
            },
            file_path: named.file_path,
            relative_path: named.relative_path,
        });
    } else if recording(decoded, atome_type) {
        let safe = sanitize_file_name(if decoded.is_empty() {
            "recording.bin"
        } else {
            decoded
        });
        // `path.join('recordings', safe)`.
        let relative = if safe == ".." {
            ".".into()
        } else {
            format!("recordings/{safe}")
        };
        let named = storage.asset_path(user, &relative)?;
        Placed {
            file_name: safe,
            ..named
        }
    } else {
        let name = if decoded.is_empty() { unnamed } else { decoded };
        storage.upload_path(user, name).map_err(|e| e.to_string())?
    };
    Ok(Destination {
        file_name: placed.file_name,
        file_path: placed.file_path,
        relative_path: placed.relative_path,
    })
}

fn done(destination: &Destination, user: &str) -> Response {
    reply(
        StatusCode::OK,
        json!({ "success": true, "file_name": destination.file_name, "owner_id": user,
                "file_path": destination.relative_path }),
    )
}

impl Uploads {
    pub async fn answer(&self, peer: std::net::SocketAddr, request: Request) -> Response {
        if request.method() == Method::GET {
            // A GET carries no body Fastify would read.
            let claims = self.sessions.validate_request(request.headers()).await;
            let user = user_id(claims.as_ref());
            return match self.storage.downloads(&self.router, &user).await {
                Ok(files) => reply(StatusCode::OK, json!({ "success": true, "files": files })),
                Err(error) => failed(StatusCode::INTERNAL_SERVER_ERROR, &error),
            };
        }
        let path = request.uri().path().to_string();
        let query = request.uri().query().unwrap_or("").to_string();
        let (parts, _, bytes) = match fastify_reply::read_bytes(request).await {
            Ok(read) => read,
            Err(refusal) => return refusal,
        };
        let buffer = parts
            .headers
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .is_some_and(|media| {
                media
                    .trim()
                    .eq_ignore_ascii_case("application/octet-stream")
            });
        let body = if buffer { Some(bytes) } else { None };
        let claims = self.sessions.validate_request(&parts.headers).await;
        let user = user_id(claims.as_ref());
        let answered = match path.as_str() {
            "/api/uploads" => self.upload(&parts, &user, body).await,
            "/api/uploads/chunk" => self.chunk(&parts, &user, body).await,
            "/api/uploads/complete" => self.complete(&parts, &user).await,
            _ => {
                let network = crate::http::peer::client_network(peer, &parts.headers);
                return self
                    .wallpaper
                    .answer(self, &parts.headers, &query, &network, &user)
                    .await;
            }
        };
        answered.unwrap_or_else(|error| failed(StatusCode::INTERNAL_SERVER_ERROR, &error))
    }

    async fn upload(
        &self,
        parts: &Parts,
        user: &str,
        body: Option<axum::body::Bytes>,
    ) -> Result<Response, String> {
        let headers = &parts.headers;
        if user == "anonymous" {
            return Ok(failed(StatusCode::UNAUTHORIZED, "upload_identity_required"));
        }
        let name = header(headers, "x-filename");
        let path = header(headers, "x-file-path");
        let atome_type = trimmed(headers, "x-atome-type");
        let mime = trimmed(headers, "x-mime-type")
            .or_else(|| header(headers, "content-type").filter(|t| !t.is_empty()));
        if present(&name).is_none() && present(&path).is_none() {
            return Ok(failed(StatusCode::BAD_REQUEST, "Missing X-Filename header"));
        }
        let decoded = match present(&name) {
            Some(name) => crate::http::uri::decode_uri_component(name)?,
            None => String::new(),
        };
        let Some(body) = body.filter(|body| !body.is_empty()) else {
            return Ok(failed(StatusCode::BAD_REQUEST, "Empty upload body"));
        };
        let destination = destination(
            &self.storage,
            user,
            &decoded,
            present(&path),
            atome_type.as_deref(),
            "upload.bin",
        )?;
        tokio::fs::write(&destination.file_path, &body)
            .await
            .map_err(|e| e.to_string())?;
        let original = present(&header(headers, "x-original-name"))
            .map(str::to_string)
            .or_else(|| (!decoded.is_empty()).then(|| decoded.clone()))
            .unwrap_or_else(|| destination.file_name.clone());
        let registration = Registration {
            atome_id: present(&header(headers, "x-atome-id")).map(str::to_string),
            atome_type: atome_type.as_deref(),
            original_name: original,
            mime_type: mime,
            size: body.len() as u64,
            file_path: Some(destination.relative_path.clone()),
        };
        self.registered(&destination, user, registration).await
    }

    async fn registered(
        &self,
        destination: &Destination,
        user: &str,
        registration: Registration<'_>,
    ) -> Result<Response, String> {
        let central = self.sessions.central();
        if let Err(error) =
            storage::register(central, &destination.file_name, user, registration).await
        {
            let _ = tokio::fs::remove_file(&destination.file_path).await;
            return Ok(failed(StatusCode::INTERNAL_SERVER_ERROR, &error));
        }
        Ok(done(destination, user))
    }

    fn chunks(&self, user: &str, upload: &str) -> PathBuf {
        self.storage
            .uploads_tmp
            .join(sanitize_segment(user))
            .join(upload)
    }

    async fn chunk(
        &self,
        parts: &Parts,
        user: &str,
        body: Option<axum::body::Bytes>,
    ) -> Result<Response, String> {
        let headers = &parts.headers;
        if user == "anonymous" {
            return Ok(failed(StatusCode::UNAUTHORIZED, "upload_identity_required"));
        }
        let Some(name) = header(headers, "x-filename").filter(|name| !name.is_empty()) else {
            return Ok(failed(StatusCode::BAD_REQUEST, "Missing X-Filename header"));
        };
        let Some(upload) = upload_id(headers) else {
            return Ok(failed(
                StatusCode::BAD_REQUEST,
                "Missing or invalid X-Upload-Id header",
            ));
        };
        let index = parse_int(header(headers, "x-chunk-index").as_deref());
        let count = parse_int(header(headers, "x-chunk-count").as_deref());
        let (Some(index), Some(count)) = (index.filter(|i| *i >= 0.0), count.filter(|c| *c >= 1.0))
        else {
            return Ok(failed(StatusCode::BAD_REQUEST, "Invalid chunk index/count"));
        };
        let decoded = crate::http::uri::decode_uri_component(&name)?;
        let Some(body) = body.filter(|body| !body.is_empty()) else {
            return Ok(failed(StatusCode::BAD_REQUEST, "Empty upload body"));
        };
        let directory = self.chunks(user, &upload);
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&directory)
            .map_err(|e| e.to_string())?;
        let index = js::number_json(index);
        tokio::fs::write(
            directory.join(format!("{}.part", js::string(&index))),
            &body,
        )
        .await
        .map_err(|e| e.to_string())?;
        Ok(reply(
            StatusCode::OK,
            json!({ "success": true, "uploadId": upload, "chunkIndex": index, "chunkCount": js::number_json(count),
                    "owner": user, "file": sanitize_file_name(&decoded) }),
        ))
    }

    async fn complete(&self, parts: &Parts, user: &str) -> Result<Response, String> {
        let headers = &parts.headers;
        if user == "anonymous" {
            return Ok(failed(StatusCode::UNAUTHORIZED, "upload_identity_required"));
        }
        let path = header(headers, "x-file-path");
        let atome_type = trimmed(headers, "x-atome-type");
        let mime = trimmed(headers, "x-mime-type")
            .or_else(|| header(headers, "content-type").filter(|t| !t.is_empty()));
        let Some(name) = header(headers, "x-filename").filter(|name| !name.is_empty()) else {
            return Ok(failed(StatusCode::BAD_REQUEST, "Missing X-Filename header"));
        };
        let Some(upload) = upload_id(headers) else {
            return Ok(failed(
                StatusCode::BAD_REQUEST,
                "Missing or invalid X-Upload-Id header",
            ));
        };
        let Some(count) =
            parse_int(header(headers, "x-chunk-count").as_deref()).filter(|c| *c >= 1.0)
        else {
            return Ok(failed(StatusCode::BAD_REQUEST, "Invalid chunk count"));
        };
        let decoded = crate::http::uri::decode_uri_component(&name)?;
        let directory = self.chunks(user, &upload);
        let destination = destination(
            &self.storage,
            user,
            &decoded,
            present(&path),
            atome_type.as_deref(),
            "",
        )?;
        storage::assemble(&directory, count as u64, &destination.file_path).await?;
        let _ = tokio::fs::remove_dir_all(&directory).await;
        playback::ensure_cache(
            &destination.file_path,
            &destination.file_name,
            mime.as_deref().unwrap_or(""),
        )
        .await?;
        let size = tokio::fs::metadata(&destination.file_path)
            .await
            .map_err(|e| e.to_string())?
            .len();
        let registration = Registration {
            atome_id: trimmed(headers, "x-atome-id"),
            atome_type: atome_type.as_deref(),
            original_name: decoded.clone(),
            mime_type: mime,
            size,
            file_path: Some(destination.relative_path.clone()),
        };
        self.registered(&destination, user, registration).await
    }
}
