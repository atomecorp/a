use super::local_atome::{LocalAtomeState, RemoteSyncCredential};
use serde_json::{Value, json};

// Where a connection's replay stands: its batches still unanswered, the streams it subscribed,
// and those among them this device has never received yet (a restore, a new device).
#[derive(Clone, Copy, Default)]
pub(super) struct Replay {
    pub(super) pending: usize,
    pub(super) total: usize,
    pub(super) waiting: usize,
}

pub(super) fn publish(
    state: &LocalAtomeState,
    user: &str,
    credential: &RemoteSyncCredential,
    connection: &str,
    restore: &str,
    replay: Replay,
    error: Option<&str>,
) {
    let current = state
        .remote_sync_credentials
        .lock()
        .ok()
        .and_then(|map| map.get(user).cloned());
    if !current.is_some_and(|entry| {
        entry.token == credential.token
            && entry.environment_fingerprint == credential.environment_fingerprint
    }) {
        return;
    }
    let value = json!({"principal_id":user, "environment_fingerprint":credential.environment_fingerprint,
        "connection_state":connection, "restore_state":restore, "pending_replay_count":replay.pending, "restore_total":replay.total, "restore_waiting":replay.waiting,
        "last_error_code":error});
    if let Ok(mut map) = state.sync_progress.lock() {
        map.insert(user.to_string(), value.clone());
    }
    super::broadcast_sync_event(json!({"type":"sync:status", "local_user_id":user, "data":value}));
}

pub(super) fn read(state: &LocalAtomeState, user: &str) -> Value {
    let current = state
        .remote_sync_credentials
        .lock()
        .ok()
        .and_then(|map| map.get(user).cloned());
    let progress = state
        .sync_progress
        .lock()
        .ok()
        .and_then(|map| map.get(user).cloned());
    match (current, progress) {
        (Some(current), Some(value))
            if value["environment_fingerprint"] == current.environment_fingerprint =>
        {
            value
        }
        _ => {
            json!({"principal_id":user,"connection_state":"disconnected","restore_state":"unknown","pending_replay_count":0,"restore_total":0,"restore_waiting":0,"last_error_code":null})
        }
    }
}

pub(super) fn projection(user: &str, streams: Vec<String>) {
    if !streams.is_empty() {
        super::broadcast_sync_event(
            json!({"type":"sync:projection-ready", "local_user_id":user,"streams":streams,"replay":true}),
        );
    }
}
