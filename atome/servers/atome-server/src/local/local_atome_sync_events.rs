//! Sync events: the per-person filter of a live event, the live `atome-sync` emission
//! and the sync queue (queue, list, mark).
use super::*;

pub fn filter_sync_event_for_user(
    state: &LocalAtomeState,
    user_id: &str,
    payload: &JsonValue,
) -> Option<JsonValue> {
    let event_type = payload.get("type").and_then(|value| value.as_str())?;
    if !event_type.starts_with("atome:") && event_type != "atome-sync" {
        return None;
    }
    let atome_id = payload
        .get("atome_id")
        .or_else(|| payload.pointer("/atome/atome_id"))
        .and_then(|value| value.as_str())?;
    let db = state.db.lock().ok()?;
    let mut atome = payload.get("atome").cloned().unwrap_or(JsonValue::Null);
    if let Some(object) = atome.as_object_mut() {
        let source = object
            .get("properties")
            .or_else(|| object.get("data"))
            .cloned()
            .unwrap_or_else(|| json!({}));
        let projected = source
            .as_object()
            .map(|properties| {
                properties
                    .iter()
                    .filter(|&(key, _value)| {
                        atome_store::security::can_observe(&db, atome_id, user_id, key)
                    })
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect::<JsonMap<_, _>>()
            })
            .unwrap_or_default();
        if projected.is_empty() {
            return None;
        }
        object.insert(
            "properties".to_string(),
            JsonValue::Object(projected.clone()),
        );
        if object.contains_key("data") {
            object.insert("data".to_string(), JsonValue::Object(projected));
        }
    } else if !atome_store::security::can_read(&db, atome_id, user_id, None) {
        return None;
    }
    Some(json!({
        "type": "event",
        "eventType": event_type,
        "payload": {
            "atome_id": atome_id,
            "atome": atome
        },
        "timestamp": Utc::now().to_rfc3339()
    }))
}

#[derive(Debug, Clone)]
pub(in crate::local) struct SyncQueueItem {
    pub(in crate::local) queue_id: i64,
    pub(in crate::local) payload: String,
    pub(in crate::local) attempts: i64,
}

fn sync_event_type(kind: &str) -> &'static str {
    if kind.eq_ignore_ascii_case("delete") {
        "atome:deleted"
    } else {
        "atome:updated"
    }
}

fn format_sync_atome(atome: &AtomeData) -> JsonValue {
    json!({
        "id": atome.atome_id,
        "atome_id": atome.atome_id,
        "type": atome.atome_type,
        "atome_type": atome.atome_type,
        "parent_id": atome.parent_id,
        "owner_id": atome.owner_id,
        "created_at": atome.created_at,
        "updated_at": atome.updated_at,
        "properties": atome.data,
        "data": atome.data
    })
}

fn emit_atome_sync_from_event(db: &Connection, event: &EventRecord) {
    if event.kind.eq_ignore_ascii_case("snapshot") {
        return;
    }
    let atome_id = match event.atome_id.as_ref() {
        Some(id) => id,
        None => return,
    };
    let include_deleted = event.kind.eq_ignore_ascii_case("delete");
    let atome = match load_atome_with_deleted(db, atome_id, None, include_deleted) {
        Ok(entry) => entry,
        Err(_) => {
            if include_deleted {
                broadcast_sync_event(json!({
                    "type": "atome:deleted",
                    "atome_id": atome_id
                }));
            }
            return;
        }
    };
    let payload = format_sync_atome(&atome);
    broadcast_sync_event(json!({
        "type": sync_event_type(&event.kind),
        "atome": payload,
        "atome_id": atome_id
    }));
}

// Queues each new syncable event for the server the message names (a retry is
// already queued), inside the commit's transaction.
pub(crate) fn queue_committed_events(
    conn: &Connection,
    message: &JsonValue,
    committed: &[JsonValue],
) -> Result<(), String> {
    let sync_target = resolve_sync_target(message);
    let sync_source = resolve_sync_source(message);
    let Some(target) = sync_target
        .as_ref()
        .filter(|_| should_enqueue_sync(&sync_target, &sync_source))
    else {
        return Ok(());
    };
    for event in committed
        .iter()
        .filter(|event| event["inserted"] != json!(false))
    {
        let record = append::record_of(event.as_object().expect("committed event"));
        if is_syncable_event(&record) {
            enqueue_sync_event(conn, &record, target)?;
        }
    }
    Ok(())
}

// Tells the views of every atome the committed events touched, once each.
pub(crate) fn announce_committed_events(db: &Connection, committed: &[JsonValue]) {
    let mut emitted = HashSet::new();
    for event in committed {
        let record = append::record_of(event.as_object().expect("committed event"));
        if let Some(atome_id) = record.atome_id.clone()
            && emitted.insert(atome_id)
        {
            emit_atome_sync_from_event(db, &record);
        }
    }
}

pub(in crate::local) fn list_sync_queue_for_atomes(
    db: &Connection,
    target_server: &str,
    actor_id: &str,
    atome_ids: &[String],
) -> Result<Vec<SyncQueueItem>, String> {
    if atome_ids.is_empty() {
        return Ok(Vec::new());
    }
    let marks = vec!["?"; atome_ids.len()].join(",");
    let mut stmt = db
        .prepare(&format!(
            "SELECT queue_id, payload, attempts
             FROM sync_queue
             WHERE target_server = ?1
               AND json_extract(payload, '$.actor.id') = ?2
               AND status IN ('pending', 'error')
               AND atome_id IN ({marks})
             ORDER BY created_at ASC, queue_id ASC"
        ))
        .map_err(|e| e.to_string())?;
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&target_server, &actor_id];
    params.extend(atome_ids.iter().map(|id| id as &dyn rusqlite::ToSql));
    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok(SyncQueueItem {
                queue_id: row.get(0)?,
                payload: row.get(1)?,
                attempts: row.get::<_, i64>(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub(in crate::local) fn list_sync_queue_for_actor(
    db: &Connection,
    target_server: &str,
    actor_id: &str,
    limit: i64,
) -> Result<Vec<SyncQueueItem>, String> {
    let mut stmt = db
        .prepare(
            "SELECT queue_id, payload, attempts
             FROM sync_queue
             WHERE target_server = ?1
               AND json_extract(payload, '$.actor.id') = ?2
               AND status IN ('pending', 'error')
               AND (next_retry_at IS NULL OR julianday(next_retry_at) <= julianday('now'))
             ORDER BY created_at ASC, queue_id ASC
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![target_server, actor_id, limit], |row| {
            Ok(SyncQueueItem {
                queue_id: row.get(0)?,
                payload: row.get(1)?,
                attempts: row.get::<_, i64>(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub(in crate::local) fn mark_sync_queue_syncing(
    db: &Connection,
    queue_id: i64,
    attempts: i64,
) -> Result<(), String> {
    db.execute(
        "UPDATE sync_queue SET status = 'syncing', attempts = ?1, last_attempt_at = datetime('now') WHERE queue_id = ?2",
        rusqlite::params![attempts, queue_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(in crate::local) fn mark_sync_queue_error(
    db: &Connection,
    queue_id: i64,
    attempts: i64,
    error_message: &str,
    next_retry_at: Option<String>,
    final_fail: bool,
) -> Result<(), String> {
    let status = if final_fail { "failed" } else { "error" };
    db.execute(
        "UPDATE sync_queue SET status = ?1, attempts = ?2, error_message = ?3, next_retry_at = ?4 WHERE queue_id = ?5",
        rusqlite::params![status, attempts, error_message, next_retry_at, queue_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(in crate::local) fn mark_sync_queue_done(db: &Connection, queue_id: i64) -> Result<(), String> {
    db.execute(
        "DELETE FROM sync_queue WHERE queue_id = ?1",
        rusqlite::params![queue_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod sync_queue_retry_tests {
    use super::*;

    #[test]
    fn rfc3339_retry_dates_are_compared_as_dates_not_text() {
        let db = Connection::open_in_memory().expect("memory db");
        db.execute_batch(ADOLE_SCHEMA_SQL).expect("schema");
        db.execute_batch(
            "INSERT INTO atomes (atome_id, atome_type, created_source, sync_status)
             VALUES ('past', 'project', 'tauri', 'local');
             INSERT INTO atomes (atome_id, atome_type, created_source, sync_status)
             VALUES ('future', 'project', 'tauri', 'local');",
        )
        .expect("atome fixtures");
        let payload = json!({ "actor": { "id": "local-user" } }).to_string();
        db.execute(
            "INSERT INTO sync_queue (
                atome_id, operation, payload, target_server, status, attempts, max_attempts,
                next_retry_at, created_at
             ) VALUES ('past', 'events:commit', ?1, 'fastify', 'error', 1, 5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 second'), datetime('now'))",
            [&payload],
        )
        .expect("past retry");
        db.execute(
            "INSERT INTO sync_queue (
                atome_id, operation, payload, target_server, status, attempts, max_attempts,
                next_retry_at, created_at
             ) VALUES ('future', 'events:commit', ?1, 'fastify', 'error', 1, 5,
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 hour'), datetime('now'))",
            [&payload],
        )
        .expect("future retry");

        let ready =
            list_sync_queue_for_actor(&db, "fastify", "local-user", 10).expect("ready retries");
        assert_eq!(ready.len(), 1);
        let queued_id: String = db
            .query_row(
                "SELECT atome_id FROM sync_queue WHERE queue_id = ?1",
                [ready[0].queue_id],
                |row| row.get(0),
            )
            .expect("queued retry id");
        assert_eq!(queued_id, "past");
    }
}
