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
         );
         UPDATE atomes
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
    repair_local_media_references(db)
}

const MEDIA_REFERENCE_KEYS: [&str; 8] = [
    "file_name", "fileName", "file_path", "filePath",
    "media_url", "mediaUrl", "media_user_id", "mediaUserId",
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

fn patch_of(event: &JsonValue) -> JsonMap<String, JsonValue> {
    event
        .get("patch")
        .or_else(|| event.get("payload"))
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default()
}

fn delete_keys(patch: &JsonMap<String, JsonValue>) -> Vec<String> {
    patch
        .get("delete_keys")
        .or_else(|| patch.get("deleteKeys"))
        .and_then(JsonValue::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(JsonValue::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn projection_owner_id<'a>(
    event: &'a JsonValue,
    local_user_id: &'a str,
    remote_user_id: &'a str,
) -> &'a str {
    let vault_owner = event
        .get("vault_principal_id")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(remote_user_id);
    if vault_owner == remote_user_id {
        local_user_id
    } else {
        vault_owner
    }
}

fn projection_atome_id<'a>(
    event: &'a JsonValue,
    local_user_id: &'a str,
    remote_user_id: &'a str,
) -> Option<&'a str> {
    event
        .get("atome_id")
        .and_then(JsonValue::as_str)
        .map(|atome_id| {
            if atome_id == remote_user_id {
                local_user_id
            } else {
                atome_id
            }
        })
}

fn localize_identity_properties(
    properties: &mut JsonMap<String, JsonValue>,
    local_user_id: &str,
    remote_user_id: &str,
) {
    for key in [
        "owner",
        "ownerId",
        "owner_id",
        "creator",
        "creatorId",
        "creator_id",
    ] {
        if properties.get(key).and_then(JsonValue::as_str) == Some(remote_user_id) {
            properties.insert(
                key.to_string(),
                JsonValue::String(local_user_id.to_string()),
            );
        }
    }
}

fn projection_parent_id<'a>(
    event: &'a JsonValue,
    patch: &'a JsonMap<String, JsonValue>,
    local_user_id: &'a str,
    remote_user_id: &'a str,
) -> Option<&'a str> {
    let parent_id = patch
        .get("parent_id")
        .or_else(|| patch.get("parentId"))
        .or_else(|| {
            patch
                .get("props")
                .and_then(JsonValue::as_object)
                .and_then(|props| props.get("parent_id").or_else(|| props.get("parentId")))
        })
        .or_else(|| event.get("parent_id"))
        .or_else(|| event.get("parentId"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(if parent_id == remote_user_id {
        local_user_id
    } else {
        parent_id
    })
}

fn ensure_target(
    tx: &Transaction<'_>,
    atome_id: &str,
    remote_user_id: &str,
    parent_id: Option<&str>,
    patch: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    ensure_principal(tx, remote_user_id)?;
    let props = patch.get("props").and_then(JsonValue::as_object);
    let declared_type = props
        .and_then(|values| values.get("type"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let kind = props
        .and_then(|values| values.get("kind"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let atome_type = match declared_type {
        Some(value) if !value.eq_ignore_ascii_case("generic") => value,
        _ => kind.or(declared_type).unwrap_or("generic"),
    };
    let resolved_parent_id = parent_id
        .filter(|value| *value != atome_id)
        .filter(|value| {
            tx.query_row("SELECT 1 FROM atomes WHERE atome_id = ?1", [*value], |_| Ok(()))
                .optional()
                .ok()
                .flatten()
                .is_some()
        });
    tx.execute(
        "INSERT INTO atomes (
            atome_id, atome_type, parent_id, owner_id, creator_id, created_source, sync_status
         ) VALUES (?1, ?2, ?3, ?4, ?4, 'fastify', 'synced')
         ON CONFLICT(atome_id) DO UPDATE SET
           atome_type = CASE
             WHEN excluded.atome_type <> 'generic' THEN excluded.atome_type
             ELSE atomes.atome_type
           END,
           parent_id = COALESCE(excluded.parent_id, atomes.parent_id),
           sync_status = 'synced', updated_at = datetime('now')",
        rusqlite::params![atome_id, atome_type, resolved_parent_id, remote_user_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn project_patch(
    tx: &Transaction<'_>,
    local_user_id: &str,
    remote_user_id: &str,
    event: &JsonValue,
    patch: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    let Some(atome_id) = projection_atome_id(event, local_user_id, remote_user_id) else {
        return Ok(());
    };
    let owner_id = projection_owner_id(event, local_user_id, remote_user_id);
    let parent_id = projection_parent_id(event, patch, local_user_id, remote_user_id);
    ensure_principal(tx, local_user_id)?;
    ensure_target(tx, atome_id, owner_id, parent_id, patch)?;
    let current = tx
        .query_row(
            "SELECT properties FROM state_current WHERE atome_id = ?1",
            [atome_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .flatten();
    let mut properties = current
        .and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
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
    let sequence = event
        .get("sequence")
        .and_then(JsonValue::as_i64)
        .unwrap_or(0);
    let mut projected_props = patch
        .get("props")
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    if owner_id == local_user_id {
        localize_identity_properties(&mut projected_props, local_user_id, remote_user_id);
        preserve_local_media_references(&properties, &mut projected_props, local_user_id);
    }
    for (key, value) in &projected_props {
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
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO permissions (
                atome_id, particle_key, principal_id, can_read, can_write, granted_at
             ) VALUES (?1, ?2, ?3, 1, 1, ?4)",
            rusqlite::params![atome_id, key, local_user_id, timestamp],
        )
        .map_err(|error| error.to_string())?;
    }
    for key in delete_keys(patch) {
        properties.remove(&key);
        tx.execute(
            "DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
            rusqlite::params![atome_id, key],
        )
        .map_err(|error| error.to_string())?;
    }
    let kind = event
        .get("kind")
        .and_then(JsonValue::as_str)
        .unwrap_or("set");
    if kind.eq_ignore_ascii_case("delete") {
        properties.insert("__deleted".to_string(), JsonValue::Bool(true));
    } else if kind.eq_ignore_ascii_case("restore") {
        properties.insert("__deleted".to_string(), JsonValue::Bool(false));
    }
    tx.execute(
        "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(atome_id) DO UPDATE SET
           project_id = COALESCE(excluded.project_id, state_current.project_id),
           properties = excluded.properties, updated_at = excluded.updated_at,
           version = MAX(state_current.version, excluded.version)",
        rusqlite::params![atome_id, owner_id,
            event.get("project_id").and_then(JsonValue::as_str),
            JsonValue::Object(properties).to_string(), timestamp, sequence],
    ).map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE atomes
         SET parent_id = ?1, updated_at = ?2
         WHERE parent_id IS NULL AND atome_id <> ?1 AND atome_id IN (
           SELECT atome_id FROM state_current
           WHERE json_extract(properties, '$.parent_id') = ?1
              OR json_extract(properties, '$.parentId') = ?1
         )",
        rusqlite::params![atome_id, timestamp],
    )
    .map_err(|error| error.to_string())?;
    if kind.eq_ignore_ascii_case("delete") {
        tx.execute(
            "UPDATE atomes SET deleted_at = ?1, updated_at = ?1 WHERE atome_id = ?2",
            rusqlite::params![timestamp, atome_id],
        )
        .map_err(|error| error.to_string())?;
    } else if kind.eq_ignore_ascii_case("restore") {
        tx.execute(
            "UPDATE atomes SET deleted_at = NULL, updated_at = ?1 WHERE atome_id = ?2",
            rusqlite::params![timestamp, atome_id],
        )
        .map_err(|error| error.to_string())?;
    }
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
        project_patch(&tx, local_user_id, remote_user_id, event, &patch)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_event_is_persisted_before_cursor_advances() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        ensure_schema(&db).unwrap();
        assert!(persist_ws_event(
            &mut db,
            "local",
            "remote",
            &json!({
                "type":"event", "event_id":"event-1", "stream":"stream-1", "sequence":1,
                "timestamp":"2026-08-29T00:00:00Z", "atome_id":"shape-1", "kind":"set",
                "patch":{"props":{"left":42}}
            })
        )
        .unwrap());
        let left: String = db.query_row(
            "SELECT particle_value FROM particles WHERE atome_id='shape-1' AND particle_key='left'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(left, "42");
        assert_eq!(
            stream_cursors(&db, "local").unwrap(),
            vec![("stream-1".to_string(), 1)]
        );
        assert!(!persist_ws_event(
            &mut db,
            "local",
            "remote",
            &json!({
                "event_id":"event-1", "stream":"stream-1", "sequence":1
            })
        )
        .unwrap());
    }

    #[test]
    fn schema_repair_recovers_existing_type_and_parent_envelopes() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        db.execute_batch(
            "INSERT INTO atomes (atome_id, atome_type, created_source, sync_status)
             VALUES ('project-1', 'generic', 'tauri', 'synced');
             INSERT INTO state_current (atome_id, properties)
             VALUES ('project-1', '{\"type\":\"generic\",\"kind\":\"project\"}');
             INSERT INTO atomes (atome_id, atome_type, created_source, sync_status, deleted_at)
             VALUES ('shape-1', 'generic', 'tauri', 'synced', '2026-08-31T00:00:00Z');
             INSERT INTO state_current (atome_id, properties)
             VALUES ('shape-1', '{\"type\":\"shape\",\"parent_id\":\"project-1\"}');",
        )
        .unwrap();

        ensure_schema(&db).unwrap();

        let envelope: (String, Option<String>) = db
            .query_row(
                "SELECT atome_type, parent_id FROM atomes WHERE atome_id='shape-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(envelope, ("shape".to_string(), Some("project-1".to_string())));
        let project_type: String = db
            .query_row("SELECT atome_type FROM atomes WHERE atome_id='project-1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(project_type, "project");
        let properties: String = db
            .query_row("SELECT properties FROM state_current WHERE atome_id='shape-1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(
            serde_json::from_str::<JsonValue>(&properties).unwrap().get("__deleted"),
            Some(&json!(true))
        );
    }

    #[test]
    fn own_remote_projection_uses_the_local_principal_identity() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        ensure_schema(&db).unwrap();
        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"own-project", "stream":"own-stream", "sequence":1,
                "vault_principal_id":"remote-user", "atome_id":"project-1", "kind":"set",
                "patch":{"props":{"type":"project","owner_id":"remote-user","name":"Synced"}}
            }),
        )
        .unwrap();
        let (atome_owner, state_owner, properties): (String, String, String) = db.query_row(
            "SELECT a.owner_id, sc.owner_id, sc.properties FROM atomes a JOIN state_current sc USING(atome_id) WHERE a.atome_id='project-1'",
            [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(atome_owner, "local-user");
        assert_eq!(state_owner, "local-user");
        assert_eq!(
            serde_json::from_str::<JsonValue>(&properties)
                .unwrap()
                .get("owner_id"),
            Some(&json!("local-user"))
        );
    }

    #[test]
    fn local_media_reference_survives_remote_echo_and_is_repaired_on_startup() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_source, sync_status)
             VALUES ('local-user', 'user', NULL, NULL, 'tauri', 'synced')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_source, sync_status)
             VALUES ('image-1', 'image', 'local-user', 'local-user', 'tauri', 'synced')",
            [],
        )
        .unwrap();
        db.execute(
            "INSERT INTO state_current (atome_id, owner_id, project_id, properties, version)
             VALUES ('image-1', 'local-user', 'project-1', ?1, 2)",
            [json!({
                "kind":"image",
                "file_path":"Downloads/remote.png",
                "media_url":"https://atome.one/api/uploads/remote.png?media_user_id=remote-user",
                "media_user_id":"remote-user"
            }).to_string()],
        )
        .unwrap();
        db.execute(
            "INSERT INTO events (id, ts, atome_id, project_id, kind, payload, actor, stream_id, sequence, source)
             VALUES ('local-image', '2026-08-31T00:00:00Z', 'image-1', 'project-1', 'set', ?1, ?2, 'tauri:local-user:project-1', 1, 'tauri')",
            rusqlite::params![
                json!({"props":{
                    "kind":"image",
                    "file_path":"data/users/local-user/Downloads/local.png",
                    "media_url":"http://127.0.0.1:3000/api/uploads/local.png?media_user_id=local-user",
                    "media_user_id":"local-user"
                }}).to_string(),
                json!({"id":"local-user"}).to_string()
            ],
        )
        .unwrap();

        ensure_schema(&db).unwrap();
        let repaired: String = db.query_row(
            "SELECT properties FROM state_current WHERE atome_id='image-1'",
            [],
            |row| row.get(0),
        ).unwrap();
        let repaired: JsonValue = serde_json::from_str(&repaired).unwrap();
        assert_eq!(repaired.get("media_user_id"), Some(&json!("local-user")));
        assert_eq!(repaired.get("file_path"), Some(&json!("data/users/local-user/Downloads/local.png")));

        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"remote-echo", "stream":"remote-stream", "sequence":2,
                "vault_principal_id":"remote-user", "atome_id":"image-1", "project_id":"project-1", "kind":"set",
                "patch":{"props":{
                    "kind":"image", "left":42,
                    "file_path":"Downloads/remote.png",
                    "media_url":"https://atome.one/api/uploads/remote.png?media_user_id=remote-user",
                    "media_user_id":"remote-user"
                }}
            }),
        ).unwrap();
        let preserved: String = db.query_row(
            "SELECT properties FROM state_current WHERE atome_id='image-1'",
            [],
            |row| row.get(0),
        ).unwrap();
        let preserved: JsonValue = serde_json::from_str(&preserved).unwrap();
        assert_eq!(preserved.get("media_user_id"), Some(&json!("local-user")));
        assert_eq!(preserved.get("file_path"), Some(&json!("data/users/local-user/Downloads/local.png")));
        assert_eq!(preserved.get("left"), Some(&json!(42)));
    }

    #[test]
    fn remote_projection_repairs_a_preexisting_generic_project_envelope() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        ensure_schema(&db).unwrap();
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type, created_source, sync_status)
             VALUES ('project-legacy', 'generic', 'tauri', 'synced')",
            [],
        )
        .unwrap();

        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"repair-project", "stream":"repair-stream", "sequence":1,
                "vault_principal_id":"remote-user", "atome_id":"project-legacy", "kind":"set",
                "patch":{"props":{"type":"generic","kind":"project","name":"Synced project"}}
            }),
        )
        .unwrap();

        let atome_type: String = db
            .query_row(
                "SELECT atome_type FROM atomes WHERE atome_id='project-legacy'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(atome_type, "project");
    }

    #[test]
    fn remote_projection_resolves_a_child_received_before_its_parent() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        ensure_schema(&db).unwrap();

        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"child-first", "stream":"project-stream", "sequence":1,
                "vault_principal_id":"remote-user", "atome_id":"shape-1", "project_id":"project-1", "kind":"set",
                "patch":{"props":{"type":"shape","parent_id":"project-1","left":12}}
            }),
        )
        .unwrap();
        let parent_before: Option<String> = db
            .query_row("SELECT parent_id FROM atomes WHERE atome_id='shape-1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(parent_before, None);

        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"parent-second", "stream":"project-stream", "sequence":2,
                "vault_principal_id":"remote-user", "atome_id":"project-1", "kind":"set",
                "patch":{"props":{"type":"project","name":"Synced project"}}
            }),
        )
        .unwrap();
        let parent_after: Option<String> = db
            .query_row("SELECT parent_id FROM atomes WHERE atome_id='shape-1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(parent_after.as_deref(), Some("project-1"));
    }

    #[test]
    fn remote_delete_projects_the_canonical_deleted_marker() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        ensure_schema(&db).unwrap();
        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"project-create", "stream":"project-stream", "sequence":1,
                "vault_principal_id":"remote-user", "atome_id":"project-1", "kind":"set",
                "patch":{"props":{"kind":"project","name":"Disposable"}}
            }),
        )
        .unwrap();
        persist_ws_event(
            &mut db,
            "local-user",
            "remote-user",
            &json!({
                "event_id":"project-delete", "stream":"project-stream", "sequence":2,
                "vault_principal_id":"remote-user", "atome_id":"project-1", "kind":"delete",
                "patch":{}
            }),
        )
        .unwrap();

        let (deleted_at, properties): (Option<String>, String) = db
            .query_row(
                "SELECT a.deleted_at, sc.properties FROM atomes a JOIN state_current sc USING(atome_id) WHERE a.atome_id='project-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!(deleted_at.is_some());
        assert_eq!(
            serde_json::from_str::<JsonValue>(&properties).unwrap().get("__deleted"),
            Some(&json!(true))
        );
    }

    #[test]
    fn shared_remote_projection_preserves_the_vault_owner() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql"))
            .unwrap();
        ensure_schema(&db).unwrap();
        persist_ws_event(
            &mut db,
            "local-recipient",
            "remote-recipient",
            &json!({
                "event_id":"shared-shape", "stream":"shared-stream", "sequence":1,
                "vault_principal_id":"remote-owner", "atome_id":"shape-1", "kind":"set",
                "patch":{"props":{"type":"shape","owner_id":"remote-owner","left":12}}
            }),
        )
        .unwrap();
        let owner: String = db
            .query_row(
                "SELECT owner_id FROM state_current WHERE atome_id='shape-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(owner, "remote-owner");
        let permission: i64 = db.query_row(
            "SELECT can_read FROM permissions WHERE atome_id='shape-1' AND principal_id='local-recipient' LIMIT 1",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(permission, 1);
    }
}
