use super::local_atome::{handle_events_message, LocalAtomeState, WsResponse};
use serde_json::{json, Value as JsonValue};
use uuid::Uuid;

pub(super) fn request_id(message: &JsonValue) -> Option<String> {
    message
        .get("requestId")
        .or_else(|| message.get("request_id"))
        .and_then(|value| value.as_str())
        .map(String::from)
}

pub(super) fn response(
    kind: &str,
    message: &JsonValue,
    success: bool,
    data: Option<JsonValue>,
    error: Option<String>,
) -> WsResponse {
    WsResponse {
        msg_type: format!("{kind}-response"),
        request_id: request_id(message),
        success,
        error,
        data,
        atomes: None,
        count: None,
    }
}

pub(super) fn can_access(state: &LocalAtomeState, atome_id: &str, user_id: &str, write: bool) -> bool {
    let Ok(db) = state.db.lock() else {
        return false;
    };
    if write {
        super::local_atome_security::can_write(&db, atome_id, user_id, None)
    } else {
        super::local_atome_security::can_read(&db, atome_id, user_id, None)
    }
}

pub async fn handle_history_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let atome_id = message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if atome_id.is_empty() {
        return response("atome", &message, false, None, Some("Access denied".into()));
    }
    let events = handle_events_message(
        json!({
            "type": "events",
            "action": "list",
            "requestId": request_id(&message),
            "atome_id": atome_id,
            "limit": message.get("limit").cloned().unwrap_or(json!(100)),
            "order": message.get("order").cloned().unwrap_or(json!("desc"))
        }),
        user_id,
        state,
    )
    .await;
    response(
        "atome",
        &message,
        events.success,
        events.data.map(|data| {
            let values = data.get("events").cloned().unwrap_or_else(|| json!([]));
            json!({ "history": values, "versions": values, "events": values })
        }),
        events.error,
    )
}

// Snapshot messages: their own module (`local_atome_snapshots.rs`).
#[path = "local_atome_snapshots.rs"]
mod snapshots;
pub use snapshots::handle_snapshot_message;

pub use super::local_atome_sync_commands::handle_sync_message;

pub async fn handle_user_data_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let ids = {
        let Ok(db) = state.db.lock() else {
            return response(
                "user-data",
                &message,
                false,
                None,
                Some("Database unavailable".into()),
            );
        };
        if action == "export" {
            let mut stmt = match db.prepare(
                "SELECT sc.atome_id, sc.project_id, sc.properties, sc.updated_at
                 FROM state_current sc
                 JOIN atomes a ON a.atome_id = sc.atome_id
                 WHERE a.owner_id = ?1 AND a.deleted_at IS NULL
                 ORDER BY sc.updated_at ASC",
            ) {
                Ok(stmt) => stmt,
                Err(error) => {
                    return response("user-data", &message, false, None, Some(error.to_string()))
                }
            };
            let rows = stmt.query_map([user_id], |row| {
                let properties = row.get::<_, String>(2)?;
                Ok(json!({
                    "atome_id": row.get::<_, String>(0)?,
                    "project_id": row.get::<_, Option<String>>(1)?,
                    "properties": serde_json::from_str::<JsonValue>(&properties).unwrap_or_else(|_| json!({})),
                    "updated_at": row.get::<_, String>(3)?
                }))
            });
            return match rows {
                Ok(rows) => response(
                    "user-data",
                    &message,
                    true,
                    Some(json!({"atomes": rows.filter_map(Result::ok).collect::<Vec<_>>()})),
                    None,
                ),
                Err(error) => response("user-data", &message, false, None, Some(error.to_string())),
            };
        }
        let mut stmt = match db.prepare("SELECT atome_id FROM atomes WHERE owner_id = ?1 AND atome_id != ?1 AND deleted_at IS NULL") {
            Ok(stmt) => stmt,
            Err(error) => return response("user-data", &message, false, None, Some(error.to_string())),
        };
        let result = match stmt.query_map([user_id], |row| row.get::<_, String>(0)) {
            Ok(rows) => rows.filter_map(Result::ok).collect::<Vec<_>>(),
            Err(error) => {
                return response("user-data", &message, false, None, Some(error.to_string()))
            }
        };
        result
    };
    if action == "delete-all" {
        let events = ids
            .into_iter()
            .map(|id| {
                json!({
                    "id": Uuid::new_v4().to_string(), "kind": "delete", "atome_id": id,
                    "actor": {"type":"user","id":user_id}
                })
            })
            .collect::<Vec<_>>();
        let committed = handle_events_message(
            json!({"type":"events","action":"commit-batch","requestId":request_id(&message),"events":events}),
            user_id,
            state,
        ).await;
        return response("user-data", &message, committed.success, committed.data.map(|data| json!({
            "deleted": data.get("events").and_then(|events| events.as_array()).map(Vec::len).unwrap_or(0),
            "events": data.get("events").cloned().unwrap_or_else(|| json!([]))
        })), committed.error);
    }
    response(
        "user-data",
        &message,
        false,
        None,
        Some("Unknown user-data action".into()),
    )
}
