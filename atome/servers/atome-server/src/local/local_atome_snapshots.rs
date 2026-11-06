// Explicit `snapshot` messages on the one local base (`state.db`): create, list, get, restore, with the
// message contract of Fastify (`server/wsAtomeOperations.js#handleSnapshot`). Restore commits its `set`
// events, and create its `snapshot` event, through the event commit (`handle_events_message`).
use super::super::local_atome::{LocalAtomeState, WsResponse, handle_events_message};
use super::{can_access, request_id, response};
use chrono::Utc;
use rusqlite::OptionalExtension;
use serde_json::{Value as JsonValue, json};
use uuid::Uuid;

fn snapshot_state(message: &JsonValue, state: &LocalAtomeState) -> Result<JsonValue, String> {
    if let Some(explicit) = message.get("state").or_else(|| message.get("state_blob"))
        && !explicit.is_null()
    {
        return Ok(explicit.clone());
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
    if action == "create" {
        return match snapshot_state(&message, state) {
            Ok(snapshot) => create_snapshot(&message, user_id, state, target_id, snapshot).await,
            Err(error) => response("snapshot", &message, false, None, Some(error)),
        };
    }
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
        "list" => {
            let mut stmt = match db.prepare(
                "SELECT snapshot_id, atome_id, project_id, label, snapshot_type, created_at
                 FROM snapshots WHERE project_id = ?1 ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
            ) {
                Ok(stmt) => stmt,
                Err(error) => {
                    return response("snapshot", &message, false, None, Some(error.to_string()));
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

// Fastify `createStateSnapshotOnce`: a snapshot asked once (its event id names it; a resend gets the same
// snapshot), its record, then its `snapshot` event `{ snapshot_id, label }` on its object through the event
// commit. A refused event leaves no record.
async fn create_snapshot(
    message: &JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    target_id: &str,
    snapshot: JsonValue,
) -> WsResponse {
    let field = |key: &str| {
        message
            .get(key)
            .and_then(JsonValue::as_str)
            .map(String::from)
    };
    let event_id = field("event_id");
    let inserted = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(error) => {
                return response("snapshot", message, false, None, Some(error.to_string()));
            }
        };
        let known = match event_id.as_deref().map(|id| {
            db.query_row(
                "SELECT kind, actor, payload FROM events WHERE id = ?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()
        }) {
            Some(Ok(known)) => known,
            Some(Err(error)) => {
                return response("snapshot", message, false, None, Some(error.to_string()));
            }
            None => None,
        };
        if let Some((kind, actor, payload)) = known {
            let parse = |raw: Option<String>| {
                raw.and_then(|text| serde_json::from_str::<JsonValue>(&text).ok())
                    .unwrap_or(JsonValue::Null)
            };
            if kind != "snapshot" || parse(actor)["id"].as_str() != Some(user_id) {
                return response(
                    "snapshot",
                    message,
                    false,
                    None,
                    Some("event_id_conflict".into()),
                );
            }
            return response(
                "snapshot",
                message,
                true,
                Some(json!({ "snapshot_id": parse(payload)["snapshot_id"] })),
                None,
            );
        }
        db.execute(
            "INSERT INTO snapshots (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
             VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                field("atome_id").as_deref().unwrap_or(target_id), field("project_id"), snapshot.to_string(), field("label"),
                field("snapshot_type").as_deref().unwrap_or("manual"), json!({"type": "user", "id": user_id}).to_string(),
                user_id, Utc::now().to_rfc3339()
            ],
        ).map(|_| db.last_insert_rowid())
    };
    let snapshot_id = match inserted {
        Ok(id) => id,
        Err(error) => return response("snapshot", message, false, None, Some(error.to_string())),
    };
    let mut event = json!({
        "kind": "snapshot", "atome_id": field("atome_id").as_deref().unwrap_or(target_id), "project_id": field("project_id"),
        "payload": { "snapshot_id": snapshot_id, "label": field("label") }
    });
    if let Some(id) = event_id {
        event["id"] = json!(id);
    }
    if let Some(ts) = field("ts") {
        event["ts"] = json!(ts);
    }
    let committed = handle_events_message(
        json!({ "type": "events", "action": "commit", "requestId": request_id(message), "event": event }), user_id, state).await;
    if committed.success {
        return response(
            "snapshot",
            message,
            true,
            Some(json!({ "snapshot_id": snapshot_id })),
            None,
        );
    }
    let removed = state
        .db
        .lock()
        .map_err(|error| error.to_string())
        .and_then(|db| {
            db.execute(
                "DELETE FROM snapshots WHERE snapshot_id = ?1",
                [snapshot_id],
            )
            .map_err(|error| error.to_string())
        });
    response(
        "snapshot",
        message,
        false,
        None,
        Some(match removed {
            Ok(_) => committed.error.unwrap_or_default(),
            Err(error) => error,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::super::super::local_atome::{create_state, handle_atome_message};
    use super::*;

    const ALICE: &str = "alice-0000-4000-8000-000000000001";
    const BOB: &str = "bob-00000-4000-8000-000000000002";

    async fn snapshot(state: &LocalAtomeState, user: &str, message: JsonValue) -> WsResponse {
        handle_snapshot_message(message, user, state).await
    }
    async fn commit(state: &LocalAtomeState, user: &str, event: JsonValue) -> WsResponse {
        handle_events_message(json!({ "action": "commit", "event": event }), user, state).await
    }
    fn color(state: &LocalAtomeState, id: &str) -> Option<String> {
        let db = state.db.lock().expect("lock");
        db.query_row(
            "SELECT json_extract(properties, '$.color') FROM state_current WHERE atome_id = ?1",
            [id],
            |row| row.get(0),
        )
        .ok()
        .flatten()
    }
    fn count(state: &LocalAtomeState, sql: &str) -> i64 {
        state
            .db
            .lock()
            .expect("lock")
            .query_row(sql, [], |row| row.get(0))
            .expect("count")
    }

    #[tokio::test]
    async fn snapshot_create_list_get_restore_through_the_event_commit() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let state = create_state(
            workspace.path().join("state"),
            workspace.path().to_path_buf(),
            "WAL",
        )
        .unwrap();
        {
            let db = state.db.lock().expect("lock");
            for user in [ALICE, BOB] {
                db.execute("INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_at, updated_at) VALUES (?1, 'user', ?1, ?1, 't', 't')",
                    [user]).expect("user");
            }
        }
        assert!(commit(&state, ALICE, json!({ "kind": "set", "atome_id": "p1", "props": { "type": "project", "name": "P" } })).await.success);
        assert!(commit(&state, ALICE, json!({ "kind": "set", "atome_id": "s1", "project_id": "p1", "props": { "type": "shape", "parent_id": "p1", "color": "red" } })).await.success);

        let made = snapshot(&state, ALICE, json!({ "action": "create", "project_id": "p1", "label": "before", "event_id": "snap-event-1" })).await;
        assert!(made.success, "{:?}", made.error);
        let snapshot_id = made
            .data
            .as_ref()
            .and_then(|data| data["snapshot_id"].as_i64())
            .expect("snapshot id");
        let (kind, atome_id, payload): (String, String, String) = state
            .db
            .lock()
            .expect("lock")
            .query_row(
                "SELECT kind, atome_id, payload FROM events WHERE id = 'snap-event-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("snapshot event");
        assert_eq!((kind.as_str(), atome_id.as_str()), ("snapshot", "p1"));
        let mut payload = serde_json::from_str::<JsonValue>(&payload).expect("payload");
        let hash = payload
            .as_object_mut()
            .and_then(|payload| payload.remove("idempotency_intent_hash"));
        assert!(hash.is_some_and(|hash| hash.as_str().is_some_and(|h| h.len() == 64)));
        assert_eq!(
            payload,
            json!({ "snapshot_id": snapshot_id, "label": "before" })
        );
        let resent = snapshot(&state, ALICE, json!({ "action": "create", "project_id": "p1", "label": "before", "event_id": "snap-event-1" })).await;
        assert_eq!(
            resent
                .data
                .as_ref()
                .and_then(|data| data["snapshot_id"].as_i64()),
            Some(snapshot_id)
        );
        assert_eq!(count(&state, "SELECT COUNT(*) FROM snapshots"), 1);
        assert_eq!(
            snapshot(
                &state,
                BOB,
                json!({ "action": "create", "project_id": "p1" })
            )
            .await
            .error
            .as_deref(),
            Some("Access denied")
        );
        let second = snapshot(
            &state,
            ALICE,
            json!({ "action": "create", "project_id": "p1", "event_id": "snap-event-2" }),
        )
        .await;
        assert!(second.success);
        assert!(commit(&state, ALICE, json!({ "id": "taken", "kind": "set", "atome_id": "s1", "props": { "left": "1px" } })).await.success);
        assert_eq!(
            snapshot(
                &state,
                ALICE,
                json!({ "action": "create", "project_id": "p1", "event_id": "taken" })
            )
            .await
            .error
            .as_deref(),
            Some("event_id_conflict")
        );

        assert!(
            commit(
                &state,
                ALICE,
                json!({ "kind": "set", "atome_id": "s1", "props": { "color": "blue" } })
            )
            .await
            .success
        );
        let listed = snapshot(
            &state,
            ALICE,
            json!({ "action": "list", "project_id": "p1" }),
        )
        .await;
        assert_eq!(
            listed
                .data
                .as_ref()
                .and_then(|data| data["snapshots"].as_array())
                .map(Vec::len),
            Some(2)
        );
        assert!(
            snapshot(
                &state,
                ALICE,
                json!({ "action": "get", "snapshot_id": snapshot_id })
            )
            .await
            .success
        );
        let events_before = count(&state, "SELECT COUNT(*) FROM events");
        let restored = snapshot(
            &state,
            ALICE,
            json!({ "action": "restore", "snapshot_id": snapshot_id }),
        )
        .await;
        assert!(restored.success, "{:?}", restored.error);
        assert_eq!(color(&state, "s1").as_deref(), Some("red"));
        assert!(count(&state, "SELECT COUNT(*) FROM events") > events_before);

        let stale = snapshot(
            &state,
            ALICE,
            json!({ "action": "create", "project_id": "p1",
            "state": [{ "atome_id": "s1", "properties": { "type": "shape", "retired_key": 1 } }] }),
        )
        .await;
        let stale_id = stale
            .data
            .as_ref()
            .and_then(|data| data["snapshot_id"].as_i64())
            .expect("stale id");
        assert_eq!(
            snapshot(
                &state,
                ALICE,
                json!({ "action": "restore", "snapshot_id": stale_id })
            )
            .await
            .error
            .as_deref(),
            Some("atome_property_unknown")
        );
        let altered = handle_atome_message(
            json!({ "action": "alter", "atome_id": "s1", "particles": { "retired_key": 1 } }),
            ALICE,
            &state,
        )
        .await;
        // Direct writes are refused as on Fastify: an atome changes only by events.
        assert_eq!(
            altered.error.as_deref(),
            Some("canonical_event_commit_required")
        );
        let created = handle_atome_message(
            json!({ "action": "create", "atome_id": "l1", "atome_type": "invented" }),
            ALICE,
            &state,
        )
        .await;
        assert_eq!(
            created.error.as_deref(),
            Some("canonical_event_commit_required")
        );
    }
}
