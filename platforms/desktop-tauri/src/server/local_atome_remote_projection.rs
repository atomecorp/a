use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, Transaction};
use serde_json::{json, Value as JsonValue};
use std::collections::HashSet;
use uuid::Uuid;

pub(super) fn ensure_schema(db: &Connection) -> Result<(), rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS remote_projection_access (
            local_user_id TEXT NOT NULL,
            remote_user_id TEXT NOT NULL,
            atome_id TEXT NOT NULL,
            particle_key TEXT NOT NULL,
            generation TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_user_id, atome_id, particle_key)
         );
         CREATE INDEX IF NOT EXISTS idx_remote_projection_atome_key
           ON remote_projection_access(atome_id, particle_key);
         CREATE TABLE IF NOT EXISTS remote_projection_scopes (
            local_user_id TEXT NOT NULL,
            remote_user_id TEXT NOT NULL,
            atome_id TEXT NOT NULL,
            generation TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (local_user_id, atome_id)
         );
         CREATE TABLE IF NOT EXISTS remote_sync_cursors (
            local_user_id TEXT PRIMARY KEY,
            remote_user_id TEXT NOT NULL,
            last_event_ts TEXT,
            updated_at TEXT NOT NULL
         );"
    )
}

fn state_id(state: &JsonValue) -> Option<&str> {
    state.get("atome_id").or_else(|| state.get("id")).and_then(JsonValue::as_str)
}

fn ensure_remote_principal(tx: &Transaction<'_>, remote_user_id: &str) -> Result<(), String> {
    tx.execute(
        "INSERT OR IGNORE INTO atomes (atome_id, atome_type, owner_id, creator_id, created_source, sync_status)
         VALUES (?1, 'user', ?1, ?1, 'fastify', 'synced')",
        [remote_user_id],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn ensure_target(tx: &Transaction<'_>, state: &JsonValue, remote_user_id: &str) -> Result<(), String> {
    let atome_id = state_id(state).ok_or_else(|| "remote_state_missing_atome_id".to_string())?;
    let properties = state.get("properties").and_then(JsonValue::as_object);
    let atome_type = properties
        .and_then(|value| value.get("type").or_else(|| value.get("kind")))
        .and_then(JsonValue::as_str)
        .unwrap_or("generic");
    let remote_owner = state.get("owner_id").and_then(JsonValue::as_str).unwrap_or(remote_user_id);
    ensure_remote_principal(tx, remote_owner)?;
    tx.execute(
        "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id, created_source, sync_status)
         VALUES (?1, ?2, ?3, ?3, 'fastify', 'synced')
         ON CONFLICT(atome_id) DO UPDATE SET
           atome_type = excluded.atome_type,
           owner_id = CASE WHEN atomes.created_source = 'fastify' THEN excluded.owner_id ELSE atomes.owner_id END,
           deleted_at = CASE WHEN atomes.created_source = 'fastify' THEN NULL ELSE atomes.deleted_at END,
           sync_status = CASE WHEN atomes.created_source = 'fastify' THEN 'synced' ELSE atomes.sync_status END,
           updated_at = datetime('now')",
        rusqlite::params![atome_id, atome_type, remote_owner],
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn capability_flag(state: &JsonValue, property_key: &str, flag: &str) -> i64 {
    state.get("capabilities")
        .and_then(|value| value.get("properties"))
        .and_then(|value| value.get(property_key))
        .and_then(|value| value.get(flag))
        .and_then(JsonValue::as_bool)
        .unwrap_or(false) as i64
}

fn upsert_permission(
    tx: &Transaction<'_>,
    atome_id: &str,
    property_key: Option<&str>,
    local_user_id: &str,
    can_read: i64,
    can_write: i64,
    can_delete: i64,
    can_share: i64,
    can_create: i64,
) -> Result<(), String> {
    let existing = tx.query_row(
        "SELECT permission_id FROM permissions
         WHERE atome_id = ?1 AND principal_id = ?2
           AND (particle_key = ?3 OR (particle_key IS NULL AND ?3 IS NULL))
         LIMIT 1",
        rusqlite::params![atome_id, local_user_id, property_key],
        |row| row.get::<_, i64>(0),
    ).optional().map_err(|error| error.to_string())?;
    if let Some(permission_id) = existing {
        tx.execute(
            "UPDATE permissions SET can_read = ?1, can_write = ?2, can_delete = ?3,
                can_share = ?4, can_create = ?5, share_mode = 'real-time', conditions = NULL,
                expires_at = NULL
             WHERE permission_id = ?6",
            rusqlite::params![can_read, can_write, can_delete, can_share, can_create, permission_id],
        ).map_err(|error| error.to_string())?;
    } else {
        tx.execute(
            "INSERT INTO permissions (
                atome_id, particle_key, principal_id, can_read, can_write, can_delete,
                can_share, can_create, share_mode, granted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'real-time', ?9)",
            rusqlite::params![
                atome_id, property_key, local_user_id, can_read, can_write, can_delete,
                can_share, can_create, Utc::now().to_rfc3339()
            ],
        ).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn upsert_state(tx: &Transaction<'_>, state: &JsonValue) -> Result<HashSet<String>, String> {
    let atome_id = state_id(state).ok_or_else(|| "remote_state_missing_atome_id".to_string())?;
    let incoming = state.get("properties").and_then(JsonValue::as_object).cloned().unwrap_or_default();
    let existing = tx.query_row(
        "SELECT properties FROM state_current WHERE atome_id = ?1",
        [atome_id],
        |row| row.get::<_, Option<String>>(0),
    ).optional().map_err(|error| error.to_string())?.flatten();
    let mut merged = existing
        .and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    merged.extend(incoming.clone());
    let project_id = state.get("project_id").and_then(JsonValue::as_str);
    let owner_id = state.get("owner_id").and_then(JsonValue::as_str);
    let updated_at = state.get("updated_at").and_then(JsonValue::as_str).unwrap_or_else(|| "");
    let updated_at = if updated_at.is_empty() { Utc::now().to_rfc3339() } else { updated_at.to_string() };
    let version = state.get("version").and_then(JsonValue::as_i64).unwrap_or(0);
    tx.execute(
        "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(atome_id) DO UPDATE SET
           owner_id = COALESCE(state_current.owner_id, excluded.owner_id),
           project_id = COALESCE(excluded.project_id, state_current.project_id),
           properties = excluded.properties,
           updated_at = excluded.updated_at,
           version = MAX(state_current.version, excluded.version)",
        rusqlite::params![atome_id, owner_id, project_id, JsonValue::Object(merged).to_string(), updated_at, version],
    ).map_err(|error| error.to_string())?;
    let versions = state.get("property_versions").and_then(JsonValue::as_object);
    for (key, value) in &incoming {
        let version = versions.and_then(|values| values.get(key)).and_then(JsonValue::as_i64).unwrap_or(1);
        tx.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'json', ?4, ?5, ?5)
             ON CONFLICT(atome_id, particle_key) DO UPDATE SET
               particle_value = excluded.particle_value,
               version = MAX(particles.version, excluded.version),
               updated_at = excluded.updated_at",
            rusqlite::params![atome_id, key, value.to_string(), version, &updated_at],
        ).map_err(|error| error.to_string())?;
    }
    Ok(incoming.keys().cloned().collect())
}

fn remove_unreferenced_property(tx: &Transaction<'_>, atome_id: &str, key: &str) -> Result<(), String> {
    let referenced = tx.query_row(
        "SELECT 1 FROM remote_projection_access WHERE atome_id = ?1 AND particle_key = ?2 LIMIT 1",
        rusqlite::params![atome_id, key], |_| Ok(()),
    ).optional().map_err(|error| error.to_string())?.is_some();
    if referenced { return Ok(()); }
    let locally_owned = tx.query_row(
        "SELECT 1 FROM atomes WHERE atome_id = ?1 AND created_source != 'fastify' LIMIT 1",
        [atome_id], |_| Ok(()),
    ).optional().map_err(|error| error.to_string())?.is_some();
    if locally_owned { return Ok(()); }
    let raw = tx.query_row(
        "SELECT properties FROM state_current WHERE atome_id = ?1", [atome_id], |row| row.get::<_, Option<String>>(0)
    ).optional().map_err(|error| error.to_string())?.flatten();
    if let Some(mut properties) = raw.and_then(|value| serde_json::from_str::<JsonValue>(&value).ok()).and_then(|value| value.as_object().cloned()) {
        properties.remove(key);
        tx.execute("UPDATE state_current SET properties = ?1 WHERE atome_id = ?2", rusqlite::params![JsonValue::Object(properties).to_string(), atome_id]).map_err(|error| error.to_string())?;
    }
    tx.execute("DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2", rusqlite::params![atome_id, key]).map_err(|error| error.to_string())?;
    Ok(())
}

pub(super) fn reconcile_remote_states(
    db: &mut Connection,
    local_user_id: &str,
    remote_user_id: &str,
    states: &[JsonValue],
) -> Result<(), String> {
    let generation = Uuid::new_v4().to_string();
    let tx = db.transaction().map_err(|error| error.to_string())?;
    ensure_remote_principal(&tx, remote_user_id)?;
    for state in states {
        ensure_target(&tx, state, remote_user_id)?;
        let atome_id = state_id(state).ok_or_else(|| "remote_state_missing_atome_id".to_string())?;
        let keys = upsert_state(&tx, state)?;
        for key in keys {
            upsert_permission(
                &tx, atome_id, Some(&key), local_user_id, 1,
                capability_flag(state, &key, "write"),
                capability_flag(state, &key, "delete"),
                capability_flag(state, &key, "share"), 0,
            )?;
            tx.execute(
                "INSERT INTO remote_projection_access (local_user_id, remote_user_id, atome_id, particle_key, generation, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(local_user_id, atome_id, particle_key) DO UPDATE SET
                   remote_user_id = excluded.remote_user_id,
                   generation = excluded.generation,
                   updated_at = excluded.updated_at",
                rusqlite::params![local_user_id, remote_user_id, atome_id, key, generation, Utc::now().to_rfc3339()],
            ).map_err(|error| error.to_string())?;
        }
        let capabilities = state.get("capabilities").cloned().unwrap_or_else(|| json!({}));
        upsert_permission(
            &tx, atome_id, None, local_user_id, 0,
            0,
            capabilities.get("delete").and_then(JsonValue::as_bool).unwrap_or(false) as i64,
            capabilities.get("share").and_then(JsonValue::as_bool).unwrap_or(false) as i64,
            capabilities.get("create").and_then(JsonValue::as_bool).unwrap_or(false) as i64,
        )?;
        tx.execute(
            "INSERT INTO remote_projection_scopes (local_user_id, remote_user_id, atome_id, generation, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(local_user_id, atome_id) DO UPDATE SET
               remote_user_id = excluded.remote_user_id,
               generation = excluded.generation,
               updated_at = excluded.updated_at",
            rusqlite::params![local_user_id, remote_user_id, atome_id, generation, Utc::now().to_rfc3339()],
        ).map_err(|error| error.to_string())?;
    }
    let stale = {
        let mut stmt = tx.prepare(
            "SELECT atome_id, particle_key FROM remote_projection_access
             WHERE local_user_id = ?1 AND generation != ?2"
        ).map_err(|error| error.to_string())?;
        let rows = stmt.query_map(rusqlite::params![local_user_id, generation], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|error| error.to_string())?;
        rows.filter_map(Result::ok).collect::<Vec<_>>()
    };
    for (atome_id, key) in &stale {
        tx.execute(
            "DELETE FROM permissions WHERE atome_id = ?1 AND principal_id = ?2 AND particle_key = ?3",
            rusqlite::params![atome_id, local_user_id, key],
        ).map_err(|error| error.to_string())?;
    }
    tx.execute(
        "DELETE FROM remote_projection_access WHERE local_user_id = ?1 AND generation != ?2",
        rusqlite::params![local_user_id, generation],
    ).map_err(|error| error.to_string())?;
    for (atome_id, key) in stale {
        remove_unreferenced_property(&tx, &atome_id, &key)?;
    }
    let stale_scopes = {
        let mut stmt = tx.prepare(
            "SELECT atome_id FROM remote_projection_scopes
             WHERE local_user_id = ?1 AND generation != ?2"
        ).map_err(|error| error.to_string())?;
        let rows = stmt.query_map(rusqlite::params![local_user_id, generation], |row| {
            row.get::<_, String>(0)
        }).map_err(|error| error.to_string())?;
        rows.filter_map(Result::ok).collect::<Vec<_>>()
    };
    for atome_id in &stale_scopes {
        tx.execute(
            "DELETE FROM permissions
             WHERE atome_id = ?1 AND principal_id = ?2 AND particle_key IS NULL",
            rusqlite::params![atome_id, local_user_id],
        ).map_err(|error| error.to_string())?;
    }
    tx.execute(
        "DELETE FROM remote_projection_scopes WHERE local_user_id = ?1 AND generation != ?2",
        rusqlite::params![local_user_id, generation],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

pub(super) fn persist_remote_events(
    db: &mut Connection,
    local_user_id: &str,
    remote_user_id: &str,
    events: &[JsonValue],
) -> Result<(), String> {
    let tx = db.transaction().map_err(|error| error.to_string())?;
    let mut cursor: Option<String> = None;
    for event in events {
        let Some(id) = event.get("id").or_else(|| event.get("event_id")).and_then(JsonValue::as_str) else { continue };
        let ts = event.get("ts").or_else(|| event.get("timestamp")).and_then(JsonValue::as_str).unwrap_or_else(|| "");
        let ts = if ts.is_empty() { Utc::now().to_rfc3339() } else { ts.to_string() };
        cursor = Some(cursor.map(|current| current.max(ts.clone())).unwrap_or_else(|| ts.clone()));
        tx.execute(
            "INSERT OR IGNORE INTO events (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                id,
                ts,
                event.get("atome_id").and_then(JsonValue::as_str),
                event.get("project_id").and_then(JsonValue::as_str),
                event.get("kind").and_then(JsonValue::as_str).unwrap_or("set"),
                event.get("payload").map(JsonValue::to_string),
                event.get("actor").map(JsonValue::to_string),
                event.get("tx_id").and_then(JsonValue::as_str),
                event.get("gesture_id").and_then(JsonValue::as_str),
            ],
        ).map_err(|error| error.to_string())?;
        match event.get("kind").and_then(JsonValue::as_str).unwrap_or("set").to_ascii_lowercase().as_str() {
            "delete" => {
                if let Some(atome_id) = event.get("atome_id").and_then(JsonValue::as_str) {
                    tx.execute(
                        "UPDATE atomes SET deleted_at = ?1, updated_at = ?1, sync_status = 'synced'
                         WHERE atome_id = ?2",
                        rusqlite::params![ts, atome_id],
                    ).map_err(|error| error.to_string())?;
                }
            }
            "restore" => {
                if let Some(atome_id) = event.get("atome_id").and_then(JsonValue::as_str) {
                    tx.execute(
                        "UPDATE atomes SET deleted_at = NULL, updated_at = ?1, sync_status = 'synced'
                         WHERE atome_id = ?2",
                        rusqlite::params![ts, atome_id],
                    ).map_err(|error| error.to_string())?;
                }
            }
            _ => {}
        }
    }
    if let Some(cursor) = cursor {
        tx.execute(
            "INSERT INTO remote_sync_cursors (local_user_id, remote_user_id, last_event_ts, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(local_user_id) DO UPDATE SET
               remote_user_id = excluded.remote_user_id,
               last_event_ts = excluded.last_event_ts,
               updated_at = excluded.updated_at",
            rusqlite::params![local_user_id, remote_user_id, cursor, Utc::now().to_rfc3339()],
        ).map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())
}

pub(super) fn cursor_for(db: &Connection, local_user_id: &str) -> Option<String> {
    db.query_row(
        "SELECT last_event_ts FROM remote_sync_cursors WHERE local_user_id = ?1",
        [local_user_id], |row| row.get::<_, Option<String>>(0),
    ).optional().ok().flatten().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::local_atome_security::project_properties_for_read;
    use serde_json::Map as JsonMap;

    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(include_str!("../../../../database/schema.sql")).unwrap();
        ensure_schema(&db).unwrap();
        for id in ["local-a", "local-b"] {
            db.execute("INSERT INTO atomes (atome_id, atome_type, owner_id) VALUES (?1, 'user', ?1)", [id]).unwrap();
        }
        db
    }

    fn state(properties: JsonValue) -> JsonValue {
        let capabilities = properties.as_object().unwrap().keys().map(|key| {
            (key.clone(), json!({"write":true,"delete":false,"share":false}))
        }).collect::<JsonMap<_, _>>();
        json!({
            "atome_id":"remote-shape", "owner_id":"remote-owner", "version":2,
            "properties":properties, "property_versions":{"content":2,"secret":1},
            "capabilities":{"properties":capabilities,"create":false,"delete":false,"share":false}
        })
    }

    #[test]
    fn recipient_projections_remain_isolated_and_revocation_cleans_unreferenced_values() {
        let mut db = database();
        reconcile_remote_states(&mut db, "local-a", "remote-a", &[state(json!({"content":"shared","secret":"a-only"}))]).unwrap();
        reconcile_remote_states(&mut db, "local-b", "remote-b", &[state(json!({"content":"shared"}))]).unwrap();
        let raw: String = db.query_row("SELECT properties FROM state_current WHERE atome_id = 'remote-shape'", [], |row| row.get(0)).unwrap();
        let properties: JsonValue = serde_json::from_str(&raw).unwrap();
        assert_eq!(project_properties_for_read(&db, "remote-shape", "local-b", &properties), json!({"content":"shared"}));

        reconcile_remote_states(&mut db, "local-b", "remote-b", &[]).unwrap();
        assert_eq!(project_properties_for_read(&db, "remote-shape", "local-b", &properties), json!({}));
        let stale_global: i64 = db.query_row(
            "SELECT COUNT(*) FROM permissions
             WHERE atome_id = 'remote-shape' AND principal_id = 'local-b' AND particle_key IS NULL",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(stale_global, 0);
        reconcile_remote_states(&mut db, "local-a", "remote-a", &[state(json!({"content":"shared"}))]).unwrap();
        let raw: String = db.query_row("SELECT properties FROM state_current WHERE atome_id = 'remote-shape'", [], |row| row.get(0)).unwrap();
        assert_eq!(serde_json::from_str::<JsonValue>(&raw).unwrap(), json!({"content":"shared"}));
    }

    #[test]
    fn remote_delete_and_restore_events_update_local_lifecycle() {
        let mut db = database();
        reconcile_remote_states(&mut db, "local-a", "remote-a", &[state(json!({"content":"shared"}))]).unwrap();
        persist_remote_events(&mut db, "local-a", "remote-a", &[json!({
            "id":"delete-1", "ts":"2026-08-14T10:00:00Z", "atome_id":"remote-shape", "kind":"delete"
        })]).unwrap();
        let deleted: Option<String> = db.query_row(
            "SELECT deleted_at FROM atomes WHERE atome_id = 'remote-shape'", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(deleted.as_deref(), Some("2026-08-14T10:00:00Z"));

        persist_remote_events(&mut db, "local-a", "remote-a", &[json!({
            "id":"restore-1", "ts":"2026-08-14T10:01:00Z", "atome_id":"remote-shape", "kind":"restore"
        })]).unwrap();
        let restored: Option<String> = db.query_row(
            "SELECT deleted_at FROM atomes WHERE atome_id = 'remote-shape'", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(restored, None);
    }
}
