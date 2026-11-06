// =============================================================================
// LOCAL ATOME MODULE - ADOLE v3.0 storage for Tauri
// =============================================================================
// WebSocket-first operations with HTTP parity handlers.
// Schema: atomes + particles (unified with Fastify, source: database/schema.sql)
// =============================================================================
use super::local_atome_sync_worker::{
    enqueue_sync_event, is_syncable_event, resolve_sync_source, resolve_sync_target,
    should_enqueue_sync,
};
use crate::local::broadcast_sync_event;
pub(crate) use atome_store::*;
use chrono::Utc;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use uuid::Uuid;

macro_rules! println {
    ($($arg:tt)*) => {
        if crate::local::xcode_logs_enabled() {
            std::println!($($arg)*);
        }
    };
}

#[cfg(test)]
#[path = "../../../../../tests/tauri/local_atome_containment.rs"]
mod containment_tests;
#[path = "local_atome_history.rs"]
mod history;
pub use history::handle_history_command;
#[cfg(test)]
#[path = "../../../../../tests/tauri/local_atome_history.rs"]
mod history_tests;
#[path = "local_atome_state_current_list.rs"]
mod state_current_list;
use state_current_list::handle_state_current_list;
#[path = "local_atome_events.rs"]
mod events;
pub(crate) use events::events_response;
pub use events::handle_events_message;
#[path = "local_atome_reads.rs"]
mod reads;
use reads::{handle_get, handle_list};
#[path = "local_atome_state_current_get.rs"]
mod state_current_get;
pub use state_current_get::handle_state_current_message;
#[path = "local_atome_sync_events.rs"]
mod sync_events;
pub use sync_events::filter_sync_event_for_user;
pub(super) use sync_events::{
    SyncQueueItem, list_sync_queue_for_actor, list_sync_queue_for_atomes, mark_sync_queue_done,
    mark_sync_queue_error, mark_sync_queue_syncing,
};
pub(crate) use sync_events::{announce_committed_events, queue_committed_events};
#[path = "local_atome_transfer_owner.rs"]
mod transfer_owner;
use transfer_owner::handle_transfer_owner;
#[cfg(test)]
#[path = "../../../../../tests/tauri/local_atome_property_commit_security.rs"]
mod property_commit_security_tests;
#[cfg(test)]
#[path = "../../../../../tests/tauri/local_atome_state_current_owner.rs"]
mod state_current_owner_tests;

fn is_uuid_v4(value: &str) -> bool {
    Uuid::parse_str(value)
        .map(|uuid| uuid.get_version_num() == 4)
        .unwrap_or(false)
}

// =============================================================================
// STATE & TYPES
// =============================================================================

pub use super::local_atome_state::LocalAtomeState;
pub(crate) use super::local_atome_state::RemoteSyncCredential;

pub(crate) fn configure_remote_sync_credential(
    state: &LocalAtomeState,
    local_user_id: &str,
    remote_user_id: &str,
    token: &str,
    remote_url: &str,
    environment_fingerprint: &str,
) -> Result<(), String> {
    if local_user_id.trim().is_empty()
        || remote_user_id.trim().is_empty()
        || token.trim().is_empty()
        || remote_url.trim().is_empty()
    {
        return Err("invalid_remote_sync_credential".to_string());
    }
    let mut credentials = state
        .remote_sync_credentials
        .lock()
        .map_err(|_| "remote_sync_credentials_unavailable".to_string())?;
    credentials.insert(
        local_user_id.to_string(),
        RemoteSyncCredential {
            remote_user_id: remote_user_id.to_string(),
            token: token.to_string(),
            remote_url: remote_url.trim_end_matches('/').to_string(),
            environment_fingerprint: environment_fingerprint.to_string(),
        },
    );
    Ok(())
}

pub(crate) fn clear_remote_sync_credential(
    state: &LocalAtomeState,
    local_user_id: &str,
) -> Result<(), String> {
    let mut credentials = state
        .remote_sync_credentials
        .lock()
        .map_err(|_| "remote_sync_credentials_unavailable".to_string())?;
    credentials.remove(local_user_id);
    if let Ok(mut progress) = state.sync_progress.lock() {
        progress.remove(local_user_id);
    }
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct WsResponse {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(rename = "requestId")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atomes: Option<Vec<AtomeData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
}

pub(crate) struct DedupeCache {
    order: VecDeque<String>,
    set: HashSet<String>,
    limit: usize,
}

impl DedupeCache {
    fn new(limit: usize) -> Self {
        Self {
            order: VecDeque::new(),
            set: HashSet::new(),
            limit,
        }
    }

    fn is_duplicate(&mut self, key: &str) -> bool {
        if key.is_empty() {
            return false;
        }
        if self.set.contains(key) {
            return true;
        }
        self.set.insert(key.to_string());
        self.order.push_back(key.to_string());
        while self.order.len() > self.limit {
            if let Some(oldest) = self.order.pop_front() {
                self.set.remove(&oldest);
            }
        }
        false
    }
}

fn sync_debug_enabled() -> bool {
    std::env::var("SYNC_DEBUG")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn sync_debug(message: &str) {
    if sync_debug_enabled() {
        println!("[SyncDebug] {}", message);
    }
}

#[cfg(test)]
fn is_guest_workspace_principal(db: &Connection, user_id: &str) -> bool {
    db.query_row(
        "SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id = ?1 AND status = 'active' LIMIT 1",
        rusqlite::params![user_id],
        |_| Ok(()),
    )
    .is_ok()
}

fn is_guest_workspace_or_adopted_principal(db: &Connection, user_id: &str) -> bool {
    db.query_row(
        "SELECT 1 FROM guest_workspace_principals WHERE guest_principal_id = ?1 AND status IN ('active', 'adopted') LIMIT 1",
        rusqlite::params![user_id],
        |_| Ok(()),
    )
    .optional()
    .ok()
    .flatten()
    .is_some()
}

fn should_dedupe_request_id(state: &LocalAtomeState, request_id: &Option<String>) -> bool {
    let Some(id) = request_id.as_deref() else {
        return false;
    };
    let mut cache = match state.recent_request_ids.lock() {
        Ok(cache) => cache,
        Err(_) => return false,
    };
    cache.is_duplicate(id)
}

// =============================================================================
// DATABASE INITIALIZATION - ADOLE v3.0 Schema
// UNIFIED with Fastify (database/schema.sql) - Same 9 tables + views
// =============================================================================

pub fn init_database(data_dir: &Path, journal_mode: &str) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("adole.db");

    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;
    let mode: String = conn.query_row(
        &format!("PRAGMA journal_mode = {journal_mode}"),
        [],
        |row| row.get(0),
    )?;
    if !mode.eq_ignore_ascii_case(journal_mode) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "journal_mode_refused:{mode}"
        )));
    }
    atome_store::prepare_schema(&conn)?;
    super::local_atome_remote_projection::ensure_schema(&conn)?;

    println!(
        "ADOLE v3.0 database initialized (schema hash={}): {:?}",
        schema_hash(),
        db_path
    );

    Ok(conn)
}

// =============================================================================
// WEBSOCKET MESSAGE HANDLER
// =============================================================================

pub async fn handle_atome_message(
    message: serde_json::Value,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    match action {
        // Same refusal as Fastify (`server/ws_api_atome_request.js`): an atome changes
        // only through the event commit, never through a direct row write.
        "create" | "update" | "alter" | "delete" | "soft-delete" | "set-particle"
        | "delete-particle" | "realtime" => {
            error_response(request_id, "canonical_event_commit_required")
        }
        "get" => handle_get(message, user_id, state, request_id).await,
        "list" => handle_list(message, user_id, state, request_id).await,
        "transfer-owner" => handle_transfer_owner(message, user_id, state, request_id).await,
        _ => WsResponse {
            msg_type: "atome-response".into(),
            request_id,
            success: false,
            error: Some(format!("Unknown action: {}", action)),
            data: None,
            atomes: None,
            count: None,
        },
    }
}

fn error_response(request_id: Option<String>, error: &str) -> WsResponse {
    WsResponse {
        msg_type: "atome-response".into(),
        request_id,
        success: false,
        error: Some(error.into()),
        data: None,
        atomes: None,
        count: None,
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

pub fn create_state(
    data_dir: PathBuf,
    storage_root: PathBuf,
    journal_mode: &str,
) -> Result<LocalAtomeState, rusqlite::Error> {
    let conn = init_database(&data_dir, journal_mode)?;
    Ok(LocalAtomeState {
        db: Arc::new(crate::local::local_vault::LocalVault::new(conn)),
        storage_root,
        recent_request_ids: Arc::new(Mutex::new(DedupeCache::new(2000))),
        remote_sync_credentials: Arc::new(Mutex::new(HashMap::new())),
        sync_progress: Arc::new(Mutex::new(HashMap::new())),
    })
}
