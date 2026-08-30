use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Transaction};
use serde_json::{json, Map as JsonMap, Value as JsonValue};

pub(super) fn ensure_schema(db: &Connection) -> Result<(), rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS remote_projection_access (
            local_user_id TEXT NOT NULL, remote_user_id TEXT NOT NULL,
            atome_id TEXT NOT NULL, particle_key TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (local_user_id, atome_id, particle_key)
         );
         CREATE INDEX IF NOT EXISTS idx_remote_projection_atome_key
           ON remote_projection_access(atome_id, particle_key);
         CREATE TABLE IF NOT EXISTS remote_sync_stream_cursors (
            local_user_id TEXT NOT NULL, remote_user_id TEXT NOT NULL,
            stream_id TEXT NOT NULL, last_sequence INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL, PRIMARY KEY (local_user_id, stream_id)
         );"
    )
}

pub(super) fn register_stream(
    db: &Connection, local_user_id: &str, remote_user_id: &str, stream_id: &str,
) -> Result<(), String> {
    if stream_id.trim().is_empty() { return Err("remote_sync_stream_required".to_string()); }
    db.execute(
        "INSERT INTO remote_sync_stream_cursors (
            local_user_id, remote_user_id, stream_id, last_sequence, updated_at
         ) VALUES (?1, ?2, ?3, 0, ?4)
         ON CONFLICT(local_user_id, stream_id) DO UPDATE SET
           remote_user_id = excluded.remote_user_id, updated_at = excluded.updated_at",
        rusqlite::params![local_user_id, remote_user_id, stream_id, Utc::now().to_rfc3339()],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

pub(super) fn stream_cursors(db: &Connection, local_user_id: &str) -> Result<Vec<(String, i64)>, String> {
    let mut statement = db.prepare(
        "SELECT stream_id, last_sequence FROM remote_sync_stream_cursors
         WHERE local_user_id = ?1 ORDER BY stream_id"
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([local_user_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|error| error.to_string())?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn ensure_principal(tx: &Transaction<'_>, principal_id: &str) -> Result<(), String> {
    tx.execute(
        "INSERT OR IGNORE INTO atomes (
            atome_id, atome_type, owner_id, creator_id, created_source, sync_status
         ) VALUES (?1, 'user', ?1, ?1, 'fastify', 'synced')", [principal_id],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn patch_of(event: &JsonValue) -> JsonMap<String, JsonValue> {
    event.get("patch").or_else(|| event.get("payload"))
        .and_then(JsonValue::as_object).cloned().unwrap_or_default()
}

fn delete_keys(patch: &JsonMap<String, JsonValue>) -> Vec<String> {
    patch.get("delete_keys").or_else(|| patch.get("deleteKeys"))
        .and_then(JsonValue::as_array)
        .map(|values| values.iter().filter_map(JsonValue::as_str).map(str::to_string).collect())
        .unwrap_or_default()
}

fn ensure_target(
    tx: &Transaction<'_>, atome_id: &str, remote_user_id: &str, patch: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    ensure_principal(tx, remote_user_id)?;
    let props = patch.get("props").and_then(JsonValue::as_object);
    let atome_type = props.and_then(|values| values.get("type").or_else(|| values.get("kind")))
        .and_then(JsonValue::as_str).unwrap_or("generic");
    tx.execute(
        "INSERT INTO atomes (
            atome_id, atome_type, owner_id, creator_id, created_source, sync_status
         ) VALUES (?1, ?2, ?3, ?3, 'fastify', 'synced')
         ON CONFLICT(atome_id) DO UPDATE SET sync_status = 'synced', updated_at = datetime('now')",
        rusqlite::params![atome_id, atome_type, remote_user_id],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn project_patch(
    tx: &Transaction<'_>, local_user_id: &str, remote_user_id: &str,
    event: &JsonValue, patch: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    let Some(atome_id) = event.get("atome_id").and_then(JsonValue::as_str) else { return Ok(()); };
    ensure_target(tx, atome_id, remote_user_id, patch)?;
    let current = tx.query_row(
        "SELECT properties FROM state_current WHERE atome_id = ?1", [atome_id],
        |row| row.get::<_, Option<String>>(0),
    ).optional().map_err(|error| error.to_string())?.flatten();
    let mut properties = current.and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok())
        .and_then(|value| value.as_object().cloned()).unwrap_or_default();
    let timestamp = event.get("timestamp").or_else(|| event.get("ts"))
        .and_then(JsonValue::as_str).unwrap_or("");
    let timestamp = if timestamp.is_empty() { Utc::now().to_rfc3339() } else { timestamp.to_string() };
    let sequence = event.get("sequence").and_then(JsonValue::as_i64).unwrap_or(0);
    for (key, value) in patch.get("props").and_then(JsonValue::as_object).into_iter().flatten() {
        properties.insert(key.clone(), value.clone());
        tx.execute(
            "INSERT INTO particles (
                atome_id, particle_key, particle_value, value_type, version, created_at, updated_at
             ) VALUES (?1, ?2, ?3, 'json', ?4, ?5, ?5)
             ON CONFLICT(atome_id, particle_key) DO UPDATE SET
               particle_value = excluded.particle_value,
               version = MAX(particles.version, excluded.version), updated_at = excluded.updated_at",
            rusqlite::params![atome_id, key, value.to_string(), sequence, timestamp],
        ).map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO remote_projection_access (
                local_user_id, remote_user_id, atome_id, particle_key, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(local_user_id, atome_id, particle_key) DO UPDATE SET
               remote_user_id = excluded.remote_user_id, updated_at = excluded.updated_at",
            rusqlite::params![local_user_id, remote_user_id, atome_id, key, timestamp],
        ).map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO permissions (
                atome_id, particle_key, principal_id, can_read, can_write, granted_at
             ) VALUES (?1, ?2, ?3, 1, 1, ?4)",
            rusqlite::params![atome_id, key, local_user_id, timestamp],
        ).map_err(|error| error.to_string())?;
    }
    for key in delete_keys(patch) {
        properties.remove(&key);
        tx.execute("DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
            rusqlite::params![atome_id, key]).map_err(|error| error.to_string())?;
    }
    tx.execute(
        "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(atome_id) DO UPDATE SET
           project_id = COALESCE(excluded.project_id, state_current.project_id),
           properties = excluded.properties, updated_at = excluded.updated_at,
           version = MAX(state_current.version, excluded.version)",
        rusqlite::params![atome_id, remote_user_id,
            event.get("project_id").and_then(JsonValue::as_str),
            JsonValue::Object(properties).to_string(), timestamp, sequence],
    ).map_err(|error| error.to_string())?;
    let kind = event.get("kind").and_then(JsonValue::as_str).unwrap_or("set");
    if kind.eq_ignore_ascii_case("delete") {
        tx.execute("UPDATE atomes SET deleted_at = ?1, updated_at = ?1 WHERE atome_id = ?2",
            rusqlite::params![timestamp, atome_id]).map_err(|error| error.to_string())?;
    } else if kind.eq_ignore_ascii_case("restore") {
        tx.execute("UPDATE atomes SET deleted_at = NULL, updated_at = ?1 WHERE atome_id = ?2",
            rusqlite::params![timestamp, atome_id]).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(super) fn persist_ws_event(
    db: &mut Connection, local_user_id: &str, remote_user_id: &str, event: &JsonValue,
) -> Result<bool, String> {
    let event_id = event.get("event_id").or_else(|| event.get("id"))
        .and_then(JsonValue::as_str).ok_or_else(|| "remote_event_id_required".to_string())?;
    let stream = event.get("stream").or_else(|| event.get("stream_id"))
        .and_then(JsonValue::as_str).ok_or_else(|| "remote_event_stream_required".to_string())?;
    let sequence = event.get("sequence").and_then(JsonValue::as_i64)
        .filter(|value| *value > 0).ok_or_else(|| "remote_event_sequence_invalid".to_string())?;
    let duplicate = db.query_row("SELECT 1 FROM events WHERE id = ?1", [event_id], |_| Ok(()))
        .optional().map_err(|error| error.to_string())?.is_some();
    let tx = db.transaction().map_err(|error| error.to_string())?;
    if !duplicate {
        let patch = patch_of(event);
        project_patch(&tx, local_user_id, remote_user_id, event, &patch)?;
        let timestamp = event.get("timestamp").or_else(|| event.get("ts"))
            .and_then(JsonValue::as_str).unwrap_or("");
        let timestamp = if timestamp.is_empty() { Utc::now().to_rfc3339() } else { timestamp.to_string() };
        tx.execute(
            "INSERT INTO events (
                id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id,
                stream_id, sequence, source, lww_decisions, projection
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![event_id, timestamp,
                event.get("atome_id").and_then(JsonValue::as_str),
                event.get("project_id").and_then(JsonValue::as_str),
                event.get("kind").and_then(JsonValue::as_str).unwrap_or("set"),
                JsonValue::Object(patch).to_string(),
                json!({"type":"user","id":remote_user_id}).to_string(),
                event.get("tx_id").and_then(JsonValue::as_str),
                event.get("gesture_id").and_then(JsonValue::as_str), stream, sequence,
                event.get("source").and_then(JsonValue::as_str),
                event.get("lww_decisions").map(JsonValue::to_string),
                event.get("projection").map(JsonValue::to_string)],
        ).map_err(|error| error.to_string())?;
    }
    tx.execute(
        "INSERT INTO remote_sync_stream_cursors (
            local_user_id, remote_user_id, stream_id, last_sequence, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(local_user_id, stream_id) DO UPDATE SET
           remote_user_id = excluded.remote_user_id,
           last_sequence = MAX(remote_sync_stream_cursors.last_sequence, excluded.last_sequence),
           updated_at = excluded.updated_at",
        rusqlite::params![local_user_id, remote_user_id, stream, sequence, Utc::now().to_rfc3339()],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(!duplicate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_event_is_persisted_before_cursor_advances() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql")).unwrap();
        ensure_schema(&db).unwrap();
        assert!(persist_ws_event(&mut db, "local", "remote", &json!({
            "type":"event", "event_id":"event-1", "stream":"stream-1", "sequence":1,
            "timestamp":"2026-08-29T00:00:00Z", "atome_id":"shape-1", "kind":"set",
            "patch":{"props":{"left":42}}
        })).unwrap());
        let left: String = db.query_row(
            "SELECT particle_value FROM particles WHERE atome_id='shape-1' AND particle_key='left'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(left, "42");
        assert_eq!(stream_cursors(&db, "local").unwrap(), vec![("stream-1".to_string(), 1)]);
        assert!(!persist_ws_event(&mut db, "local", "remote", &json!({
            "event_id":"event-1", "stream":"stream-1", "sequence":1
        })).unwrap());
    }
}
