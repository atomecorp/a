// Tauri's part of the local server (`atome_server::local`): the device key in the system's
// keychain, the macOS GPS and file picker families, the remote control and its audio routes,
// the mail gateway's Node runtime, the desktop updates and the clipboard import.
use atome_server::local::{
    self, AppState, Host, MAX_UPLOAD_BYTES, extract_bearer_token, finish_uploaded_file,
    guess_mime_from_ext, json_error, local_auth, resolve_user_upload_path, sanitize_file_name,
};
use atome_server::page_preview::{self, PreviewOrigin};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value as JsonValue, json};
use std::{
    fs as stdfs,
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Arc,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncWriteExt},
};
use uuid::Uuid;
use zip::ZipArchive;

mod clipboard;
mod file_selection;
mod gps_native;
mod mail;
mod remote_audio;
mod remote_control;
mod remote_control_ws;
mod updates;
mod updates_zip;
mod wav_analysis;

use remote_audio::*;
use remote_control::require_remote_control;
use wav_analysis::analyze_wav_file;

struct TauriHost;

impl Host for TauriHost {
    fn device_key(
        &self,
        action: String,
        scope: String,
        message: Option<String>,
        signature: Option<String>,
    ) -> Result<JsonValue, String> {
        crate::auth_device::auth_device_handle(action, scope, message, signature)
    }

    fn session_secret(&self, data_dir: &Path) -> Result<String, String> {
        local::local_auth::file_session_secret(data_dir)
    }

    fn journal_mode(&self) -> &'static str {
        "WAL"
    }

    fn answer(
        &self,
        kind: &str,
        data: &JsonValue,
        state: &AppState,
    ) -> Option<BoxFuture<'static, JsonValue>> {
        let data = data.clone();
        let state = state.clone();
        let request_id = data["requestId"]
            .as_str()
            .or_else(|| data["request_id"].as_str())
            .map(String::from);
        match kind {
            "gps-native" => Some(Box::pin(async move {
                // Local, data-free capability revocation must still work after logout.
                if data.get("action").and_then(JsonValue::as_str) == Some("release") {
                    return gps_native::release(&data).await;
                }
                match (
                    local::ws_api::ws_authenticated_user(&data, &state),
                    state.atome_state.as_ref(),
                ) {
                    (Ok(user), Some(atome)) => {
                        gps_native::handle(&data, &user, atome, state.auth_state.as_ref()).await
                    }
                    _ => local::ws_api::ws_reply_envelope(
                        json!({"type":"gps-native-response", "error":"AUTH_REQUIRED"}),
                        request_id.as_deref(),
                    ),
                }
            })),
            "file-selection" => Some(Box::pin(async move {
                let response = match local::ws_api::ws_authenticated_user(&data, &state) {
                    Ok(_) => file_selection::handle(&data).await,
                    Err(response) => response,
                };
                local::ws_api::ws_reply_envelope(response, request_id.as_deref())
            })),
            _ => None,
        }
    }

    fn routes(&self) -> Router<AppState> {
        Router::new()
            .route("/api/eve/mail/sync", post(mail::eve_mail_sync_handler))
            .route("/api/eve/mail/send", post(mail::eve_mail_send_handler))
            .route(
                "/api/eve/mail/mark-read",
                post(mail::eve_mail_mark_read_handler),
            )
            .route(
                "/api/eve/mail/archive",
                post(mail::eve_mail_archive_handler),
            )
            .route("/api/eve/mail/delete", post(mail::eve_mail_delete_handler))
            .route(
                "/api/clipboard/files",
                post(clipboard::clipboard_import_handler),
            )
            .route(
                "/api/admin/apply-update",
                post(updates::update_file_handler),
            )
            .route(
                "/api/admin/batch-update",
                post(updates::batch_update_handler),
            )
            .route(
                "/api/admin/sync-from-zip",
                post(updates_zip::sync_from_zip_handler),
            )
            .route("/ws/control", get(remote_control_ws::handler))
            // The isolated preview origin of a person's page (atome_server::page_preview, D18 item 11).
            .merge(page_preview::origin_route(PreviewOrigin {
                public: Some(format!("http://{PAGE_PREVIEW_ADDRESS}")),
                port: 3200,
            }))
    }
}

const PAGE_PREVIEW_ADDRESS: &str = "127.0.0.1:3200";

pub async fn start_server(
    static_dir: PathBuf,
    uploads_dir: PathBuf,
    data_dir: PathBuf,
    listener: std::io::Result<std::net::TcpListener>,
) {
    remote_control::announce();
    match tokio::net::TcpListener::bind(PAGE_PREVIEW_ADDRESS).await {
        Ok(preview) => {
            tokio::spawn(async move {
                if let Err(err) = page_preview::serve(preview).await {
                    local::record_recent_error(json!({
                        "timestamp": chrono::Utc::now().to_rfc3339(),
                        "source": "axum",
                        "component": "page_preview",
                        "error": err,
                    }));
                }
            });
        }
        Err(err) => local::record_recent_error(json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "source": "axum",
            "component": "page_preview",
            "error": format!("bind {PAGE_PREVIEW_ADDRESS} failed: {err}"),
        })),
    }
    local::start_server(
        static_dir,
        uploads_dir,
        data_dir,
        listener,
        Arc::new(TauriHost),
    )
    .await;
}
