// Event input: normalisation, the append-only insert, transactions.
use super::*;

pub fn event_parent_id(event: &EventRecord) -> Option<&str> {
    event.payload.as_ref()?.get("parent_id")?.as_str()
}

// Queued deliveries of precise atomes, oldest first, whatever their retry delay:
// a share needs them on the server now, not after the rest of the queue.

// A project and its content share one stream `project:<id>` (the event's project
// comes from containment), an atome outside any project has `atome:<id>`, the rest
// `global` — the streams of Fastify's `assignEventSequence` (database/adole_event_log.js).
pub fn event_stream(db: &Connection, event: &EventRecord) -> Result<(String, i64), String> {
    let (scope_key, project_id, atome_id) = match (&event.project_id, &event.atome_id) {
        (Some(project), _) => (format!("project:{project}"), Some(project.as_str()), None),
        (None, Some(atome)) => (format!("atome:{atome}"), None, Some(atome.as_str())),
        (None, None) => ("global".to_string(), None, None),
    };
    let owner_id = resolve_event_actor_user_id(event);
    let stream_id = ensure_scope_stream(db, &scope_key, project_id, atome_id, owner_id.as_deref())?;
    let sequence: i64 = db
        .query_row(
            "INSERT INTO sync_stream_sequences (stream_id, last_sequence) VALUES (?1, 1)
             ON CONFLICT(stream_id) DO UPDATE SET last_sequence = last_sequence + 1
             RETURNING last_sequence",
            [&stream_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((stream_id, sequence))
}

// The stream of one scope, created on its first use (Fastify's `ensureScopeStream`).
pub fn ensure_scope_stream(
    db: &Connection,
    scope_key: &str,
    project_id: Option<&str>,
    atome_id: Option<&str>,
    owner_id: Option<&str>,
) -> Result<String, String> {
    db.execute(
        "INSERT OR IGNORE INTO sync_streams (stream_id, scope_key, project_id, atome_id, owner_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            Uuid::new_v4().to_string(),
            scope_key,
            project_id,
            atome_id,
            owner_id
        ],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT stream_id FROM sync_streams WHERE scope_key = ?1",
        [scope_key],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn event_with_actor(event: EventRecord) -> JsonValue {
    json!({
        "id": event.id,
        "ts": event.ts,
        "atome_id": event.atome_id,
        "project_id": event.project_id,
        "kind": event.kind,
        "payload": event.payload,
        "actor": event.actor,
        "tx_id": event.tx_id,
        "gesture_id": event.gesture_id
    })
}

pub fn parse_json_map(raw: Option<&String>) -> JsonMap<String, JsonValue> {
    if let Some(value) = raw
        && let Ok(parsed) = serde_json::from_str::<JsonValue>(value)
        && let JsonValue::Object(map) = parsed
    {
        return map;
    }
    JsonMap::new()
}

pub fn parse_json_value(raw: Option<&String>) -> JsonValue {
    if let Some(value) = raw
        && let Ok(parsed) = serde_json::from_str::<JsonValue>(value)
    {
        return parsed;
    }
    JsonValue::Null
}

pub fn with_transaction<T, F>(db: &Connection, work: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    db.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;
    match work(db) {
        Ok(result) => {
            db.execute("COMMIT", []).map_err(|e| e.to_string())?;
            Ok(result)
        }
        Err(e) => {
            let _ = db.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// =============================================================================
// HELPERS
// =============================================================================
