use super::local_atome::{handle_events_message, LocalAtomeState, WsResponse};
use chrono::Utc;
use rusqlite::OptionalExtension;
use serde_json::{json, Value as JsonValue};
use uuid::Uuid;

fn request_id(message: &JsonValue) -> Option<String> {
    message
        .get("requestId")
        .or_else(|| message.get("request_id"))
        .and_then(|value| value.as_str())
        .map(String::from)
}

fn response(
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

fn can_access(state: &LocalAtomeState, atome_id: &str, user_id: &str, write: bool) -> bool {
    let Ok(db) = state.db.lock() else {
        return false;
    };
    let owner = db
        .query_row(
            "SELECT owner_id FROM atomes WHERE atome_id = ?1",
            [atome_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten();
    if owner.as_deref() == Some(user_id) {
        return true;
    }
    let column = if write { "can_write" } else { "can_read" };
    db.query_row(
        &format!(
            "SELECT 1 FROM permissions WHERE atome_id = ?1 AND principal_id = ?2
             AND {column} = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1"
        ),
        rusqlite::params![atome_id, user_id],
        |_| Ok(()),
    )
    .is_ok()
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
    if atome_id.is_empty() || !can_access(state, atome_id, user_id, false) {
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

fn snapshot_state(message: &JsonValue, state: &LocalAtomeState) -> Result<JsonValue, String> {
    if let Some(explicit) = message.get("state").or_else(|| message.get("state_blob")) {
        if !explicit.is_null() {
            return Ok(explicit.clone());
        }
    }
    let db = state.db.lock().map_err(|error| error.to_string())?;
    if let Some(atome_id) = message.get("atome_id").and_then(|value| value.as_str()) {
        let raw = db
            .query_row(
                "SELECT json_object('atome_id', atome_id, 'project_id', project_id, 'properties', json(properties))
                 FROM state_current WHERE atome_id = ?1",
                [atome_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        return raw
            .map(|value| serde_json::from_str(&value).unwrap_or(JsonValue::Null))
            .ok_or_else(|| "State not found".to_string());
    }
    let project_id = message
        .get("project_id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing project_id or atome_id".to_string())?;
    let mut stmt = db
        .prepare("SELECT atome_id, project_id, properties FROM state_current WHERE project_id = ?1")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([project_id], |row| {
            let properties = row.get::<_, String>(2)?;
            Ok(json!({
                "atome_id": row.get::<_, String>(0)?,
                "project_id": row.get::<_, Option<String>>(1)?,
                "properties": serde_json::from_str::<JsonValue>(&properties).unwrap_or_else(|_| json!({}))
            }))
        })
        .map_err(|error| error.to_string())?;
    Ok(JsonValue::Array(rows.filter_map(Result::ok).collect()))
}

pub async fn handle_snapshot_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    if action == "restore" {
        let snapshot_id = message
            .get("snapshot_id")
            .or_else(|| message.get("id"))
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let snapshot = {
            let Ok(db) = state.db.lock() else {
                return response(
                    "snapshot",
                    &message,
                    false,
                    None,
                    Some("Database unavailable".into()),
                );
            };
            db.query_row(
                "SELECT atome_id, project_id, COALESCE(state_blob, snapshot_data) FROM snapshots WHERE snapshot_id = ?1",
                [snapshot_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?)),
            )
            .optional()
        };
        let Ok(Some((target_id, project_id, raw_state))) = snapshot else {
            return response(
                "snapshot",
                &message,
                false,
                None,
                Some("Snapshot not found".into()),
            );
        };
        if !can_access(
            state,
            project_id.as_deref().unwrap_or(&target_id),
            user_id,
            true,
        ) {
            return response(
                "snapshot",
                &message,
                false,
                None,
                Some("Access denied".into()),
            );
        }
        let parsed = serde_json::from_str::<JsonValue>(&raw_state).unwrap_or(JsonValue::Null);
        let states = parsed.as_array().cloned().unwrap_or_else(|| vec![parsed]);
        let events = states
            .into_iter()
            .filter_map(|entry| {
                Some(json!({
                    "id": Uuid::new_v4().to_string(),
                    "kind": "set",
                    "atome_id": entry.get("atome_id")?.as_str()?,
                    "project_id": entry.get("project_id").cloned().unwrap_or(JsonValue::Null),
                    "payload": { "props": entry.get("properties").cloned().unwrap_or_else(|| json!({})) },
                    "actor": { "type": "user", "id": user_id }
                }))
            })
            .collect::<Vec<_>>();
        let committed = handle_events_message(
            json!({
                "type": "events",
                "action": "commit-batch",
                "requestId": request_id(&message),
                "tx_id": message.get("tx_id").cloned().unwrap_or_else(|| json!(format!("snapshot_restore_{snapshot_id}"))),
                "events": events
            }),
            user_id,
            state,
        )
        .await;
        return response(
            "snapshot",
            &message,
            committed.success,
            committed.data.map(|data| json!({ "snapshot_id": snapshot_id, "events": data.get("events").cloned().unwrap_or_else(|| json!([])) })),
            committed.error,
        );
    }

    if action == "get" {
        let snapshot_id = message
            .get("snapshot_id")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let snapshot_row = {
            let Ok(db) = state.db.lock() else {
                return response(
                    "snapshot",
                    &message,
                    false,
                    None,
                    Some("Database unavailable".into()),
                );
            };
            db.query_row(
                "SELECT snapshot_id, atome_id, project_id, COALESCE(state_blob, snapshot_data), label, snapshot_type, created_at
                 FROM snapshots WHERE snapshot_id = ?1",
                [snapshot_id],
                |row| Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    json!({
                        "snapshot_id": row.get::<_, i64>(0)?,
                        "atome_id": row.get::<_, String>(1)?,
                        "project_id": row.get::<_, Option<String>>(2)?,
                        "state": serde_json::from_str::<JsonValue>(&row.get::<_, String>(3)?).unwrap_or(JsonValue::Null),
                        "label": row.get::<_, Option<String>>(4)?,
                        "snapshot_type": row.get::<_, Option<String>>(5)?,
                        "created_at": row.get::<_, String>(6)?
                    })
                ))
            ).optional()
        };
        return match snapshot_row {
            Ok(Some((atome_id, project_id, snapshot)))
                if can_access(
                    state,
                    project_id.as_deref().unwrap_or(&atome_id),
                    user_id,
                    false,
                ) =>
            {
                response(
                    "snapshot",
                    &message,
                    true,
                    Some(json!({"snapshot": snapshot})),
                    None,
                )
            }
            Ok(Some(_)) => response(
                "snapshot",
                &message,
                false,
                None,
                Some("Access denied".into()),
            ),
            _ => response(
                "snapshot",
                &message,
                false,
                None,
                Some("Snapshot not found".into()),
            ),
        };
    }

    let target_id = message
        .get("project_id")
        .or_else(|| message.get("atome_id"))
        .and_then(|value| value.as_str())
        .unwrap_or("");
    let write = action == "create";
    if target_id.is_empty() || !can_access(state, target_id, user_id, write) {
        return response(
            "snapshot",
            &message,
            false,
            None,
            Some("Access denied".into()),
        );
    }
    let create_state = if action == "create" {
        match snapshot_state(&message, state) {
            Ok(value) => Some(value),
            Err(error) => return response("snapshot", &message, false, None, Some(error)),
        }
    } else {
        None
    };
    let Ok(db) = state.db.lock() else {
        return response(
            "snapshot",
            &message,
            false,
            None,
            Some("Database unavailable".into()),
        );
    };
    match action {
        "create" => {
            let state_value = create_state.unwrap_or(JsonValue::Null);
            let raw = state_value.to_string();
            let result = db.execute(
                "INSERT INTO snapshots (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
                 VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    message.get("atome_id").and_then(|value| value.as_str()).unwrap_or(target_id),
                    message.get("project_id").and_then(|value| value.as_str()),
                    raw,
                    message.get("label").and_then(|value| value.as_str()),
                    message.get("snapshot_type").and_then(|value| value.as_str()).unwrap_or("manual"),
                    json!({"type":"user","id":user_id}).to_string(),
                    user_id,
                    Utc::now().to_rfc3339()
                ],
            );
            match result {
                Ok(_) => response(
                    "snapshot",
                    &message,
                    true,
                    Some(json!({"snapshot_id": db.last_insert_rowid()})),
                    None,
                ),
                Err(error) => response("snapshot", &message, false, None, Some(error.to_string())),
            }
        }
        "list" => {
            let mut stmt = match db.prepare(
                "SELECT snapshot_id, atome_id, project_id, label, snapshot_type, created_at
                 FROM snapshots WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
            ) {
                Ok(stmt) => stmt,
                Err(error) => {
                    return response("snapshot", &message, false, None, Some(error.to_string()))
                }
            };
            let rows = stmt.query_map(
                rusqlite::params![
                    target_id,
                    message
                        .get("limit")
                        .and_then(|value| value.as_i64())
                        .unwrap_or(100),
                    message
                        .get("offset")
                        .and_then(|value| value.as_i64())
                        .unwrap_or(0)
                ],
                |row| {
                    Ok(json!({
                        "snapshot_id": row.get::<_, i64>(0)?,
                        "atome_id": row.get::<_, String>(1)?,
                        "project_id": row.get::<_, Option<String>>(2)?,
                        "label": row.get::<_, Option<String>>(3)?,
                        "snapshot_type": row.get::<_, Option<String>>(4)?,
                        "created_at": row.get::<_, String>(5)?
                    }))
                },
            );
            match rows {
                Ok(rows) => response(
                    "snapshot",
                    &message,
                    true,
                    Some(json!({"snapshots": rows.filter_map(Result::ok).collect::<Vec<_>>()})),
                    None,
                ),
                Err(error) => response("snapshot", &message, false, None, Some(error.to_string())),
            }
        }
        _ => response(
            "snapshot",
            &message,
            false,
            None,
            Some("Unknown snapshot action".into()),
        ),
    }
}

pub async fn handle_sync_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or("");
    match action {
        "push" => {
            let committed = handle_events_message(
                json!({
                    "type": "events",
                    "action": "commit-batch",
                    "requestId": request_id(&message),
                    "tx_id": message.get("tx_id").cloned().unwrap_or(JsonValue::Null),
                    "events": message.get("events").or_else(|| message.get("changes")).cloned().unwrap_or_else(|| json!([]))
                }),
                user_id,
                state,
            ).await;
            response("sync", &message, committed.success, committed.data.map(|data| json!({"changes": data.get("events").cloned().unwrap_or_else(|| json!([]))})), committed.error)
        }
        "pull" => {
            let listed = handle_events_message(
                json!({
                    "type": "events", "action": "list", "requestId": request_id(&message),
                    "since": message.get("since").cloned().unwrap_or(JsonValue::Null),
                    "until": message.get("until").cloned().unwrap_or(JsonValue::Null),
                    "limit": message.get("limit").cloned().unwrap_or(json!(1000)),
                    "offset": message.get("offset").cloned().unwrap_or(json!(0))
                }),
                user_id,
                state,
            )
            .await;
            response("sync", &message, listed.success, listed.data.map(|data| json!({"changes": data.get("events").cloned().unwrap_or_else(|| json!([]))})), listed.error)
        }
        "ack" => {
            let ids = message
                .get("atome_ids")
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default();
            if ids.iter().any(|id| {
                id.as_str()
                    .map(|value| !can_access(state, value, user_id, true))
                    .unwrap_or(true)
            }) {
                return response("sync", &message, false, None, Some("Access denied".into()));
            }
            let Ok(db) = state.db.lock() else {
                return response(
                    "sync",
                    &message,
                    false,
                    None,
                    Some("Database unavailable".into()),
                );
            };
            for id in &ids {
                let _ = db.execute(
                    "UPDATE atomes SET sync_status = 'synced', last_sync = ?1 WHERE atome_id = ?2",
                    rusqlite::params![Utc::now().to_rfc3339(), id.as_str()],
                );
            }
            response(
                "sync",
                &message,
                true,
                Some(json!({"acknowledged": ids})),
                None,
            )
        }
        "get-pending" => {
            let Ok(db) = state.db.lock() else {
                return response(
                    "sync",
                    &message,
                    false,
                    None,
                    Some("Database unavailable".into()),
                );
            };
            let mut stmt = match db.prepare(
                "SELECT atome_id, atome_type, parent_id, owner_id, updated_at FROM atomes
                 WHERE owner_id = ?1 AND sync_status = 'pending' AND deleted_at IS NULL ORDER BY updated_at ASC"
            ) {
                Ok(stmt) => stmt,
                Err(error) => return response("sync", &message, false, None, Some(error.to_string())),
            };
            let rows = stmt.query_map([user_id], |row| {
                Ok(json!({
                    "atome_id": row.get::<_, String>(0)?,
                    "atome_type": row.get::<_, String>(1)?,
                    "parent_id": row.get::<_, Option<String>>(2)?,
                    "owner_id": row.get::<_, Option<String>>(3)?,
                    "updated_at": row.get::<_, String>(4)?
                }))
            });
            match rows {
                Ok(rows) => response(
                    "sync",
                    &message,
                    true,
                    Some(json!({"changes": rows.filter_map(Result::ok).collect::<Vec<_>>()})),
                    None,
                ),
                Err(error) => response("sync", &message, false, None, Some(error.to_string())),
            }
        }
        _ => response(
            "sync",
            &message,
            false,
            None,
            Some("Unknown sync action".into()),
        ),
    }
}

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
