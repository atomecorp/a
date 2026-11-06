// `POST /api/uploads/remote-wallpaper` (server/http_wallpaper_routes.js, ported): a
// random image fetched from the provider, each attempt with its own deadline, then
// stored as the caller's file. Ownership is decided first; a caller that cannot own a
// file and asks for it inline gets the image back in the answer, at most every 2 s.
use super::storage::{self, Registration};
use super::uploads::{Uploads, header, reply};
use crate::vault_router::js;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use base64::Engine as _;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const URL: &str = "https://picsum.photos/1920/1080";
const MAX_BYTES: usize = 12 * 1024 * 1024;
const ATTEMPT_TIMEOUT: Duration = Duration::from_secs(12);
const ATTEMPTS: usize = 3;
const INLINE_COOLDOWN: Duration = Duration::from_secs(2);

pub struct Wallpaper {
    client: reqwest::Client,
    inline_seen: Mutex<HashMap<String, Instant>>,
}

struct Image {
    bytes: Vec<u8>,
    mime_type: String,
    extension: &'static str,
}

fn extension(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "image/jpeg" => Some(".jpg"),
        "image/png" => Some(".png"),
        "image/webp" => Some(".webp"),
        "image/gif" => Some(".gif"),
        _ => None,
    }
}

// A retry asks for another image: the seeded route has another cache key.
fn attempt_url(attempt: usize) -> String {
    if attempt == 0 {
        return URL.into();
    }
    let seed = uuid::Uuid::new_v4().simple().to_string();
    format!("https://picsum.photos/seed/{}/1920/1080", &seed[..12])
}

fn failure(status: StatusCode, error: &str) -> (StatusCode, String) {
    (status, error.to_string())
}

// `request.query.inline ?? request.query.allow_inline ?? x-wallpaper-inline`.
fn inline_asked(headers: &HeaderMap, query: &str) -> bool {
    let first = |key: &str| {
        url::form_urlencoded::parse(query.as_bytes())
            .find(|(name, _)| name == key)
            .map(|(_, value)| value.into_owned())
    };
    let value = first("inline")
        .or_else(|| first("allow_inline"))
        .or_else(|| header(headers, "x-wallpaper-inline"))
        .unwrap_or_default();
    matches!(
        js::trim(&value).to_lowercase().as_str(),
        "1" | "true" | "yes"
    )
}

impl Wallpaper {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            client: crate::tls::http_client()?
                .build()
                .map_err(|e| e.to_string())?,
            inline_seen: Mutex::new(HashMap::new()),
        })
    }

    fn throttled(&self, network: &str) -> bool {
        let now = Instant::now();
        let mut seen = self.inline_seen.lock().expect("wallpaper cooldown");
        seen.retain(|_, at| now.duration_since(*at) <= INLINE_COOLDOWN * 30);
        if seen
            .get(network)
            .is_some_and(|at| now.duration_since(*at) < INLINE_COOLDOWN)
        {
            return true;
        }
        seen.insert(network.to_string(), now);
        false
    }

    async fn fetch(&self) -> Result<Image, (StatusCode, String)> {
        let mut last = failure(StatusCode::GATEWAY_TIMEOUT, "wallpaper_source_unreachable");
        for attempt in 0..ATTEMPTS {
            let sent = self
                .client
                .get(attempt_url(attempt))
                .timeout(ATTEMPT_TIMEOUT)
                .header(
                    reqwest::header::ACCEPT,
                    "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
                )
                .send()
                .await;
            let lost = |error: reqwest::Error| {
                let reason = if error.is_timeout() {
                    "wallpaper_source_timeout"
                } else {
                    "wallpaper_source_unreachable"
                };
                failure(StatusCode::GATEWAY_TIMEOUT, reason)
            };
            let upstream = match sent {
                Ok(upstream) => upstream,
                Err(error) => {
                    last = lost(error);
                    continue;
                }
            };
            if !upstream.status().is_success() {
                last = (
                    StatusCode::BAD_GATEWAY,
                    format!("wallpaper_source_http_{}", upstream.status().as_u16()),
                );
                continue;
            }
            let text = |name: reqwest::header::HeaderName| {
                upstream
                    .headers()
                    .get(name)
                    .and_then(|value| value.to_str().ok())
                    .unwrap_or("")
                    .to_string()
            };
            let mime_type = text(reqwest::header::CONTENT_TYPE)
                .split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let Some(extension) = extension(&mime_type) else {
                // A provider's error page: another attempt may still give an image.
                last = failure(
                    StatusCode::UNSUPPORTED_MEDIA_TYPE,
                    "wallpaper_source_not_image",
                );
                continue;
            };
            let length = js::number(Some(&json!(text(reqwest::header::CONTENT_LENGTH))));
            if length.is_finite() && length > MAX_BYTES as f64 {
                return Err(failure(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "wallpaper_source_too_large",
                ));
            }
            let bytes = match upstream.bytes().await {
                Ok(bytes) => bytes.to_vec(),
                Err(error) => {
                    last = lost(error);
                    continue;
                }
            };
            if bytes.is_empty() {
                last = failure(StatusCode::BAD_GATEWAY, "wallpaper_source_empty");
                continue;
            }
            if bytes.len() > MAX_BYTES {
                return Err(failure(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "wallpaper_source_too_large",
                ));
            }
            return Ok(Image {
                bytes,
                mime_type,
                extension,
            });
        }
        Err(last)
    }

    pub async fn answer(
        &self,
        uploads: &Uploads,
        headers: &HeaderMap,
        query: &str,
        network: &str,
        user: &str,
    ) -> Response {
        let central = uploads.sessions.central();
        let ownership = storage::owner(central, user).await;
        if let Err(error) = &ownership {
            if !inline_asked(headers, query) {
                // Told before any outbound traffic, and why.
                return reply(
                    StatusCode::UNAUTHORIZED,
                    json!({ "success": false, "error": error, "inline_supported": true }),
                );
            }
            if self.throttled(network) {
                return reply(
                    StatusCode::TOO_MANY_REQUESTS,
                    json!({ "success": false, "error": "wallpaper_rate_limited" }),
                );
            }
        }
        let image = match self.fetch().await {
            Ok(image) => image,
            Err((status, error)) => {
                return reply(status, json!({ "success": false, "error": error }));
            }
        };
        let size = image.bytes.len();
        if ownership.is_err() {
            // No account owns it: nothing is written, the image travels back inline.
            let data = base64::engine::general_purpose::STANDARD.encode(&image.bytes);
            return reply(
                StatusCode::OK,
                json!({ "success": true, "stored": false, "owner_id": null,
                        "data_url": format!("data:{};base64,{data}", image.mime_type),
                        "mime_type": image.mime_type, "size_bytes": size, "source": "remote_wallpaper_inline" }),
            );
        }
        match self.store(uploads, user, image).await {
            Ok(answer) => reply(StatusCode::OK, answer),
            Err((status, answer)) => reply(status, answer),
        }
    }

    async fn store(
        &self,
        uploads: &Uploads,
        user: &str,
        image: Image,
    ) -> Result<JsonValue, (StatusCode, JsonValue)> {
        let internal = |error: String| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "success": false, "error": error }),
            )
        };
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| internal(e.to_string()))?
            .as_millis();
        let placed = uploads
            .storage
            .upload_path(user, &format!("wallpaper_{stamp}{}", image.extension))
            .map_err(|e| internal(e.to_string()))?;
        tokio::fs::write(&placed.file_path, &image.bytes)
            .await
            .map_err(|e| internal(e.to_string()))?;
        let registration = Registration {
            atome_id: None,
            atome_type: Some("image"),
            original_name: placed.file_name.clone(),
            mime_type: Some(image.mime_type.clone()),
            size: image.bytes.len() as u64,
            file_path: Some(placed.relative_path.clone()),
        };
        let central = uploads.sessions.central();
        if let Err(error) = storage::register(central, &placed.file_name, user, registration).await
        {
            let _ = tokio::fs::remove_file(&placed.file_path).await;
            // A missing or unprovisioned identity is the caller's situation, not a fault.
            let identity =
                error == "upload_identity_required" || error == "remote_account_not_provisioned";
            let mut answer = json!({ "success": false, "error": error });
            if identity {
                answer["inline_supported"] = json!(true);
            }
            let status = if identity {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            return Err((status, answer));
        }
        Ok(
            json!({ "success": true, "stored": true, "file_name": placed.file_name, "owner_id": user,
                   "file_path": placed.relative_path, "mime_type": image.mime_type,
                   "size_bytes": image.bytes.len(), "source": "remote_wallpaper" }),
        )
    }
}
