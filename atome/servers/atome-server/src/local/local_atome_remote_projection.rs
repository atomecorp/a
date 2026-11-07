use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Transaction};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

#[path = "local_atome_remote_projection_patch.rs"]
mod patch;
use patch::{patch_of, project_patch, projection_atome_id};
#[cfg(test)]
#[path = "../../../../../tests/tauri/local_atome_remote_projection.rs"]
mod tests;

pub(super) fn ensure_schema(db: &Connection) -> Result<(), rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS remote_projection_access (
            local_user_id TEXT NOT NULL, remote_user_id TEXT NOT NULL,
            atome_id TEXT NOT NULL, particle_key TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (local_user_id, atome_id, particle_key)
         );
         CREATE INDEX IF NOT EXISTS idx_remote_projection_atome_key
           ON remote_projection_access(atome_id, particle_key);
         CREATE TABLE IF NOT EXISTS remote_bootstrap_delivered (
            remote_user_id TEXT NOT NULL, atome_id TEXT NOT NULL,
            digest TEXT NOT NULL, delivered_at TEXT NOT NULL,
            PRIMARY KEY (remote_user_id, atome_id)
         );
         CREATE TABLE IF NOT EXISTS remote_sync_stream_cursors (
            local_user_id TEXT NOT NULL, remote_user_id TEXT NOT NULL,
            stream_id TEXT NOT NULL, last_sequence INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL, PRIMARY KEY (local_user_id, stream_id)
         );
         CREATE TABLE IF NOT EXISTS local_repairs (name TEXT PRIMARY KEY, done_at TEXT NOT NULL);",
    )?;
    // These sweeps mend rows written before the sync contract of Aug. 2026; every later write
    // projects type, parent, deletion and local media itself (`patch.rs`). A database is mended
    // once: swept at each open, a 4 GB vault held the server's first answer ~19 s, past the
    // iOS boot watchdog.
    let mended = db
        .query_row(
            "SELECT 1 FROM local_repairs WHERE name = ?1",
            [PRE_CONTRACT_REPAIRS],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if mended {
        return Ok(());
    }
    let tx = db.unchecked_transaction()?;
    tx.execute_batch(
        "UPDATE atomes
         SET atome_type = COALESCE(
           NULLIF(NULLIF(json_extract((SELECT properties FROM state_current WHERE state_current.atome_id = atomes.atome_id), '$.type'), ''), 'generic'),
           NULLIF(json_extract((SELECT properties FROM state_current WHERE state_current.atome_id = atomes.atome_id), '$.kind'), ''),
           atome_type
         )
         WHERE atome_type = 'generic';
         UPDATE atomes
         SET parent_id = COALESCE(
           json_extract((SELECT properties FROM state_current WHERE state_current.atome_id = atomes.atome_id), '$.parent_id'),
           json_extract((SELECT properties FROM state_current WHERE state_current.atome_id = atomes.atome_id), '$.parentId')
         )
         WHERE parent_id IS NULL
           AND COALESCE(
             json_extract((SELECT properties FROM state_current WHERE state_current.atome_id = atomes.atome_id), '$.parent_id'),
             json_extract((SELECT properties FROM state_current WHERE state_current.atome_id = atomes.atome_id), '$.parentId')
           ) IN (SELECT atome_id FROM atomes);
         UPDATE state_current
         SET properties = json_set(COALESCE(properties, '{}'), '$.__deleted', json('true'))
         WHERE atome_id IN (SELECT atome_id FROM atomes WHERE deleted_at IS NOT NULL);",
    )?;
    repair_local_media_references(&tx)?;
    tx.execute(
        "INSERT INTO local_repairs (name, done_at) VALUES (?1, ?2)",
        rusqlite::params![PRE_CONTRACT_REPAIRS, Utc::now().to_rfc3339()],
    )?;
    tx.commit()
}

const PRE_CONTRACT_REPAIRS: &str = "remote_projection_pre_contract";

const MEDIA_REFERENCE_KEYS: [&str; 8] = [
    "file_name",
    "fileName",
    "file_path",
    "filePath",
    "media_url",
    "mediaUrl",
    "media_user_id",
    "mediaUserId",
];

fn has_local_media_reference(properties: &JsonMap<String, JsonValue>, local_user_id: &str) -> bool {
    properties
        .get("media_user_id")
        .or_else(|| properties.get("mediaUserId"))
        .and_then(JsonValue::as_str)
        == Some(local_user_id)
        || properties
            .get("media_url")
            .or_else(|| properties.get("mediaUrl"))
            .and_then(JsonValue::as_str)
            .is_some_and(|value| value.contains("127.0.0.1:3000"))
        || properties
            .get("file_path")
            .or_else(|| properties.get("filePath"))
            .and_then(JsonValue::as_str)
            .is_some_and(|value| value.contains(&format!("data/users/{local_user_id}/")))
}

fn preserve_local_media_references(
    current: &JsonMap<String, JsonValue>,
    incoming: &mut JsonMap<String, JsonValue>,
    local_user_id: &str,
) {
    if !has_local_media_reference(current, local_user_id) {
        return;
    }
    for key in MEDIA_REFERENCE_KEYS {
        if let Some(value) = current.get(key) {
            incoming.insert(key.to_string(), value.clone());
        }
    }
}

fn repair_local_media_references(db: &Connection) -> Result<(), rusqlite::Error> {
    let mut statement = db.prepare(
        "SELECT sc.atome_id, sc.owner_id, sc.properties, e.payload
         FROM state_current sc
         JOIN events e ON e.id = (
           SELECT e2.id FROM events e2
           WHERE e2.atome_id = sc.atome_id
             AND e2.source = 'tauri'
             AND json_extract(e2.actor, '$.id') = sc.owner_id
             AND json_extract(e2.payload, '$.props.file_path') IS NOT NULL
           ORDER BY julianday(e2.ts) DESC, e2.rowid DESC LIMIT 1
         )",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    for (atome_id, owner_id, current_json, event_json) in rows {
        let Some(mut current) = serde_json::from_str::<JsonValue>(&current_json)
            .ok()
            .and_then(|value| value.as_object().cloned())
        else {
            continue;
        };
        if has_local_media_reference(&current, &owner_id) {
            continue;
        }
        let Some(local_props) = serde_json::from_str::<JsonValue>(&event_json)
            .ok()
            .and_then(|value| value.get("props").and_then(JsonValue::as_object).cloned())
            .filter(|props| has_local_media_reference(props, &owner_id))
        else {
            continue;
        };
        for key in MEDIA_REFERENCE_KEYS {
            if let Some(value) = local_props.get(key) {
                current.insert(key.to_string(), value.clone());
            }
        }
        db.execute(
            "UPDATE state_current SET properties = ?1 WHERE atome_id = ?2",
            rusqlite::params![JsonValue::Object(current).to_string(), atome_id],
        )?;
    }
    Ok(())
}

pub(super) fn register_stream(
    db: &Connection,
    local_user_id: &str,
    remote_user_id: &str,
    stream_id: &str,
) -> Result<(), String> {
    if stream_id.trim().is_empty() {
        return Err("remote_sync_stream_required".to_string());
    }
    db.execute(
        "INSERT INTO remote_sync_stream_cursors (
            local_user_id, remote_user_id, stream_id, last_sequence, updated_at
         ) VALUES (?1, ?2, ?3, 0, ?4)
         ON CONFLICT(local_user_id, stream_id) DO UPDATE SET
           remote_user_id = excluded.remote_user_id, updated_at = excluded.updated_at",
        rusqlite::params![
            local_user_id,
            remote_user_id,
            stream_id,
            Utc::now().to_rfc3339()
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub(super) fn stream_cursors(
    db: &Connection,
    local_user_id: &str,
) -> Result<Vec<(String, i64)>, String> {
    let mut statement = db
        .prepare(
            "SELECT stream_id, last_sequence FROM remote_sync_stream_cursors
         WHERE local_user_id = ?1 ORDER BY stream_id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([local_user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|error| error.to_string())?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn ensure_principal(tx: &Transaction<'_>, principal_id: &str) -> Result<(), String> {
    tx.execute(
        "INSERT OR IGNORE INTO atomes (
            atome_id, atome_type, owner_id, creator_id, created_source, sync_status
         ) VALUES (?1, 'user', ?1, ?1, 'fastify', 'synced')",
        [principal_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

pub(super) fn persist_ws_event(
    db: &mut Connection,
    local_user_id: &str,
    remote_user_id: &str,
    event: &JsonValue,
) -> Result<bool, String> {
    let event_id = event
        .get("event_id")
        .or_else(|| event.get("id"))
        .and_then(JsonValue::as_str)
        .ok_or_else(|| "remote_event_id_required".to_string())?;
    let stream = event
        .get("stream")
        .or_else(|| event.get("stream_id"))
        .and_then(JsonValue::as_str)
        .ok_or_else(|| "remote_event_stream_required".to_string())?;
    let sequence = event
        .get("sequence")
        .and_then(JsonValue::as_i64)
        .filter(|value| *value > 0)
        .ok_or_else(|| "remote_event_sequence_invalid".to_string())?;
    let duplicate = db
        .query_row("SELECT 1 FROM events WHERE id = ?1", [event_id], |_| Ok(()))
        .optional()
        .map_err(|error| error.to_string())?
        .is_some();
    let tx = db.transaction().map_err(|error| error.to_string())?;
    if !duplicate {
        let patch = patch_of(event);
        let winner_keys = project_patch(&tx, local_user_id, remote_user_id, event, &patch)?;
        let projected_atome_id = projection_atome_id(event, local_user_id, remote_user_id);
        let timestamp = event
            .get("timestamp")
            .or_else(|| event.get("ts"))
            .and_then(JsonValue::as_str)
            .unwrap_or("");
        let timestamp = if timestamp.is_empty() {
            Utc::now().to_rfc3339()
        } else {
            timestamp.to_string()
        };
        tx.execute(
            "INSERT INTO events (
                id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id,
                stream_id, sequence, source, lww_decisions, projection
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                event_id,
                timestamp,
                projected_atome_id,
                event.get("project_id").and_then(JsonValue::as_str),
                event
                    .get("kind")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("set"),
                JsonValue::Object(patch).to_string(),
                json!({"type":"user","id":remote_user_id}).to_string(),
                event.get("tx_id").and_then(JsonValue::as_str),
                event.get("gesture_id").and_then(JsonValue::as_str),
                stream,
                sequence,
                event.get("source").and_then(JsonValue::as_str),
                event.get("lww_decisions").map(JsonValue::to_string),
                event.get("projection").map(JsonValue::to_string)
            ],
        )
        .map_err(|error| error.to_string())?;
        if let Some(atome_id) = projected_atome_id {
            for key in winner_keys {
                atome_store::conflicts::record(
                    &tx,
                    atome_id,
                    &key,
                    event_id,
                    &timestamp,
                    sequence,
                    "offline-lww",
                )?;
            }
        }
    }
    tx.execute(
        "INSERT INTO remote_sync_stream_cursors (
            local_user_id, remote_user_id, stream_id, last_sequence, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(local_user_id, stream_id) DO UPDATE SET
           remote_user_id = excluded.remote_user_id,
           last_sequence = MAX(remote_sync_stream_cursors.last_sequence, excluded.last_sequence),
           updated_at = excluded.updated_at",
        rusqlite::params![
            local_user_id,
            remote_user_id,
            stream,
            sequence,
            Utc::now().to_rfc3339()
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(!duplicate)
}
