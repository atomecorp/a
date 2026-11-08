//! The local server of one person's device (Tauri desktop and Android, the iOS app and its
//! AUv3): one vault on atome-store in this process, the local accounts, the relays to
//! atome.one and the remote sync. What only its platform can do comes from its `Host`.
use crate::http::statics::{self, StaticRoots};
use crate::http::{
    cors::{self, CorsPolicy},
    request_id,
};
use crate::media::playback;
use axum::{
    Json, Router,
    body::Body,
    body::Bytes,
    extract::{
        DefaultBodyLimit, Path as AxumPath, Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, HeaderValue, Request, StatusCode, header},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, get_service, post},
};
use base64::{Engine as _, engine::general_purpose};
use futures_util::{SinkExt, StreamExt};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::{
    borrow::Cow,
    fs as stdfs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex, OnceLock},
    time::UNIX_EPOCH,
};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    net::TcpStream,
    sync::broadcast,
    time::{Duration, timeout},
};
use tower_http::{limit::RequestBodyLimitLayer, services::ServeDir};
use tracing::{error, info, warn};
use uuid::Uuid;

macro_rules! println {
    ($($arg:tt)*) => {
        if crate::local::xcode_logs_enabled() {
            std::println!($($arg)*);
        }
    };
}

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if crate::local::xcode_logs_enabled() {
            std::eprintln!($($arg)*);
        }
    };
}

mod local_ai_proxy;
pub mod local_atome;
mod local_atome_extended;
#[cfg(test)]
mod local_atome_isolation_tests;
mod local_atome_media_removal;
#[cfg(test)]
mod local_atome_native_contract_tests;
mod local_atome_remote_projection;
mod local_atome_state;
mod local_atome_sync_bootstrap;
mod local_atome_sync_commands;
mod local_atome_sync_media;
mod local_atome_sync_progress;
mod local_atome_sync_worker;
mod local_atome_ws_subscriptions;
mod local_atome_ws_sync;
#[cfg(test)]
mod local_atome_ws_sync_health_tests;
pub mod local_auth;
mod local_byte_ranges;
mod local_file_transfer;
mod local_files;
mod local_paths;
mod local_recording_intake;
mod local_recordings;
mod local_request_auth;
mod local_server_info;
mod local_start;
mod local_uploads;
pub mod local_vault;
mod local_ws_file;
mod local_ws_sync_socket;
mod static_asset_cache;
use local_ai_proxy::*;
use local_byte_ranges::*;
use local_files::*;
pub use local_paths::*;
use local_recording_intake::*;
use local_recordings::*;
pub use local_request_auth::*;
use local_server_info::*;
pub use local_start::*;
use local_uploads::*;
use local_ws_file::*;
use local_ws_sync_socket::*;
pub mod ws_api;
pub use local_file_transfer::finish_uploaded_file;
use local_file_transfer::{local_file_read_handler, upload_handler};
mod provider_relay;
pub mod public_relay;

/// What only the process hosting the server can do: its device key, the `/ws/api` families
/// and the routes of its own platform. Tauri (desktop, Android) and the iOS app each give one.
pub trait Host: Send + Sync + 'static {
    /// The installation's protected device key: `public`, `sign` or `verify` for a scope.
    fn device_key(
        &self,
        action: String,
        scope: String,
        message: Option<String>,
        signature: Option<String>,
    ) -> Result<JsonValue, String>;
    /// The secret signing the local session tokens.
    fn session_secret(&self, data_dir: &Path) -> Result<String, String>;
    /// The journal of `adole.db`: WAL on a desktop; DELETE in the iOS app group, where an idle
    /// WAL handle keeps the locks iOS kills a suspended app for (0xDEAD10CC).
    fn journal_mode(&self) -> &'static str;
    /// A `/ws/api` family this host alone answers (Tauri: `gps-native`, `file-selection`);
    /// None when it does not offer it.
    fn answer(
        &self,
        kind: &str,
        data: &JsonValue,
        state: &AppState,
    ) -> Option<futures_util::future::BoxFuture<'static, JsonValue>>;
    /// The routes this host alone serves, merged before the application's files.
    fn routes(&self) -> Router<AppState>;
}

static HOST: OnceLock<Arc<dyn Host>> = OnceLock::new();

/// The host the server was started by.
pub fn host() -> &'static Arc<dyn Host> {
    HOST.get().expect("local_host_not_started")
}

/// The verbose logs of the local server, asked by `SQUIRREL_XCODE_LOGS`.
pub fn xcode_logs_enabled() -> bool {
    std::env::var("SQUIRREL_XCODE_LOGS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

#[derive(Clone)]
pub struct AppState {
    pub static_dir: Arc<PathBuf>,
    pub project_root: Arc<PathBuf>,
    pub version: Arc<String>,
    pub eve_version: Arc<String>,
    pub started_at: Arc<std::time::Instant>,
    pub atome_state: Option<local_atome::LocalAtomeState>,
    pub auth_state: Option<local_auth::LocalAuthState>,
}

const SERVER_TYPE: &str = "Tauri frontend process";
pub const MAX_UPLOAD_BYTES: usize = 1024 * 1024 * 1024; // 1 GiB

static RECENT_ERRORS: OnceLock<Mutex<Vec<serde_json::Value>>> = OnceLock::new();
static SYNC_EVENT_TX: OnceLock<broadcast::Sender<JsonValue>> = OnceLock::new();

fn sync_event_sender() -> broadcast::Sender<JsonValue> {
    SYNC_EVENT_TX
        .get_or_init(|| {
            let (tx, _rx) = broadcast::channel(512);
            tx
        })
        .clone()
}

pub fn broadcast_sync_event(payload: JsonValue) {
    let sender = sync_event_sender();
    let _ = sender.send(payload);
}

pub fn record_recent_error(entry: serde_json::Value) {
    let store = RECENT_ERRORS.get_or_init(|| Mutex::new(Vec::new()));
    let mut guard = store.lock().unwrap();
    guard.push(entry);
    let len = guard.len();
    if len > 100 {
        let drain_count = len - 100;
        guard.drain(0..drain_count);
    }
}

fn recent_errors_snapshot() -> Vec<serde_json::Value> {
    let store = RECENT_ERRORS.get_or_init(|| Mutex::new(Vec::new()));
    let guard = store.lock().unwrap();
    guard.iter().cloned().collect()
}
