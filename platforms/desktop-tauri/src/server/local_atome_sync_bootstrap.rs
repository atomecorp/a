use super::local_atome::{EventRecord, LocalAtomeState};
use super::local_atome_sync_worker::enqueue_sync_event;
use serde_json::{json, Value as JsonValue};
use sha2::{Digest, Sha256};

pub(crate) fn enqueue_current_user_state_sync(
    state: &LocalAtomeState,
    local_user_id: &str,
    remote_user_id: &str,
) -> Result<usize, String> {
    let db = state.db.lock().map_err(|_| "local_database_unavailable".to_string())?;
    let mut statement = db
        .prepare(
            "SELECT sc.atome_id, sc.project_id, sc.properties, sc.updated_at, sc.version, a.parent_id
             FROM state_current sc
             LEFT JOIN atomes a ON a.atome_id = sc.atome_id
             WHERE (sc.owner_id = ?1 OR sc.atome_id = ?1)
               AND (
                 (sc.atome_id = ?1 AND json_type(sc.properties, '$.eve_profile') = 'object')
                 OR EXISTS (
                   SELECT 1 FROM events e
                   WHERE e.atome_id = sc.atome_id
                     AND e.source = 'tauri'
                     AND json_extract(e.actor, '$.id') = ?1
                 )
               )
             ORDER BY CASE WHEN sc.atome_id = sc.project_id THEN 0 ELSE 1 END,
                      sc.updated_at ASC,
                      sc.atome_id ASC",
        )
        .map_err(|error| error.to_string())?;
    let states = statement
        .query_map([local_user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut enqueued = 0;
    for (atome_id, project_id, properties_json, updated_at, version, parent_id) in states {
        let normalized_id = atome_id.to_ascii_lowercase();
        if normalized_id.starts_with("tool.ui.") || normalized_id.starts_with("tool_ui.") {
            continue;
        }
        let properties: JsonValue =
            serde_json::from_str(&properties_json).map_err(|error| error.to_string())?;
        if !properties.is_object() {
            continue;
        }
        let digest = hex::encode(Sha256::digest(
            format!(
                "{}:{}:{}:{}:{}",
                remote_user_id,
                version,
                project_id.as_deref().unwrap_or(""),
                parent_id.as_deref().unwrap_or(""),
                properties_json
            )
            .as_bytes(),
        ));
        db.execute(
            "DELETE FROM sync_queue
             WHERE atome_id = ?1
               AND json_extract(payload, '$.id') LIKE 'remote-state-bootstrap%'",
            [&atome_id],
        )
        .map_err(|error| error.to_string())?;

        let deleted = properties
            .get("__deleted")
            .and_then(JsonValue::as_bool)
            .unwrap_or(false);
        let global_scope = atome_id == local_user_id && properties.get("eve_profile").is_some();
        let mut payload = json!({ "props": properties });
        if let Some(parent_id) = parent_id {
            payload["parent_id"] = JsonValue::String(parent_id);
        }
        if global_scope {
            payload["scope"] = JsonValue::String("global".to_string());
        }
        enqueue_sync_event(
            &db,
            &EventRecord {
                id: format!(
                    "remote-state-bootstrap-v2:{}:{}:{}",
                    remote_user_id, atome_id, digest
                ),
                ts: updated_at,
                atome_id: Some(atome_id),
                project_id: if global_scope { None } else { project_id },
                kind: if deleted { "delete" } else { "set" }.to_string(),
                payload: Some(payload),
                actor: Some(json!({ "type": "user", "id": local_user_id })),
                tx_id: None,
                gesture_id: None,
            },
            "fastify",
        )?;
        enqueued += 1;
    }
    Ok(enqueued)
}
