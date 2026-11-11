use super::local_atome::{EventRecord, LocalAtomeState};
use super::local_atome_sync_worker::enqueue_sync_event;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

// What this device edited is republished to the remote account at each configuration (each
// launch). Reading the whole account again took 19 s on an iPhone (a 5 GB vault) and held the
// vault's one connection all along, so every request of the launch waited for it (an Activité
// tile opened on empty plates). The pass runs aside and follows the events this device wrote,
// from where the last pass ended, by windows of 100 events of the log that each take the vault and let it go.
const WINDOW: i64 = 100;

fn running() -> &'static Mutex<HashSet<String>> {
    static RUNNING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Starts the pass on its own thread, once at a time per account; false when one is under way.
pub(crate) fn schedule_current_user_state_sync(state: &LocalAtomeState, local_user_id: &str, remote_user_id: &str) -> bool {
    let key = format!("{local_user_id}:{remote_user_id}");
    if !running().lock().map(|mut set| set.insert(key.clone())).unwrap_or(false) {
        return false;
    }
    let (state, local_user_id, remote_user_id) = (state.clone(), local_user_id.to_string(), remote_user_id.to_string());
    std::thread::spawn(move || {
        if let Err(error) = enqueue_current_user_state_sync(&state, &local_user_id, &remote_user_id) {
            eprintln!("remote state bootstrap failed: {error}");
        }
        if let Ok(mut set) = running().lock() {
            set.remove(&key);
        }
    });
    true
}

/// The account's profile, then the states this device edited since the last pass (per window,
/// projects first, then by update order). Each window done moves the account's cursor.
pub(crate) fn enqueue_current_user_state_sync(
    state: &LocalAtomeState,
    local_user_id: &str,
    remote_user_id: &str,
) -> Result<usize, String> {
    let unavailable = |_| "local_database_unavailable".to_string();
    let (mut cursor, end) = {
        let db = state.db.lock().map_err(unavailable)?;
        let cursor: i64 = db
            .query_row(
                "SELECT COALESCE((SELECT event_rowid FROM remote_bootstrap_event_cursor
                                  WHERE local_user_id = ?1 AND remote_user_id = ?2), 0)",
                [local_user_id, remote_user_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let end: i64 = db
            .query_row("SELECT COALESCE(MAX(rowid), 0) FROM events", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        (cursor, end)
    };
    let mut enqueued = enqueue_states(
        &*state.db.lock().map_err(unavailable)?,
        local_user_id,
        remote_user_id,
        "state_current sc",
        "sc.atome_id = ?1 AND json_type(sc.properties, '$.eve_profile') = 'object'",
        (0, 0),
    )?;
    while cursor < end {
        let to = (cursor + WINDOW).min(end);
        let db = state.db.lock().map_err(unavailable)?;
        enqueued += enqueue_states(
            &db,
            local_user_id,
            remote_user_id,
            // From the window's events to their states (CROSS JOIN keeps that order: starting from the
            // account's states read them all, 1.4 s a window on an iPhone).
            "(SELECT DISTINCT atome_id FROM events
               WHERE rowid > ?2 AND rowid <= ?3 AND source = 'tauri' AND json_extract(actor, '$.id') = ?1) w
             CROSS JOIN state_current sc ON sc.atome_id = w.atome_id",
            "sc.owner_id = ?1 OR sc.atome_id = ?1",
            (cursor, to),
        )?;
        db.execute(
            "INSERT INTO remote_bootstrap_event_cursor (local_user_id, remote_user_id, event_rowid) VALUES (?1, ?2, ?3)
             ON CONFLICT(local_user_id, remote_user_id) DO UPDATE SET event_rowid = excluded.event_rowid",
            rusqlite::params![local_user_id, remote_user_id, to],
        )
        .map_err(|error| error.to_string())?;
        cursor = to;
    }
    Ok(enqueued)
}

/// Queues the states read from `source` and kept by `which` (`?1` the account, `?2`..`?3` an event window)
/// not yet delivered.
fn enqueue_states(
    db: &Connection,
    local_user_id: &str,
    remote_user_id: &str,
    source: &str,
    which: &str,
    (from, to): (i64, i64),
) -> Result<usize, String> {
    let mut statement = db
        .prepare(&format!(
            "SELECT sc.atome_id, sc.project_id, sc.properties, sc.updated_at, sc.version, a.parent_id
             FROM {source}
             LEFT JOIN atomes a ON a.atome_id = sc.atome_id
             WHERE {which}
             ORDER BY CASE WHEN sc.atome_id = sc.project_id THEN 0 ELSE 1 END,
                      sc.updated_at ASC,
                      sc.atome_id ASC"
        ))
        .map_err(|error| error.to_string())?;
    let values = [local_user_id.to_string().into(), from.into(), to.into()];
    let values: Vec<rusqlite::types::Value> = values.into_iter().take(statement.parameter_count()).collect();
    let states = statement
        .query_map(rusqlite::params_from_iter(values), |row| {
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
    drop(statement);

    let mut enqueued = 0;
    for (atome_id, project_id, properties_json, updated_at, version, parent_id) in states {
        if super::local_atome_sync_worker::is_device_local_atome_id(&atome_id) {
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
        // This exact state version already reached this remote account, or is already
        // queued: re-enqueueing it would push the whole workspace to the end of the queue
        // on every configuration (each share, each session resume) and it would never drain.
        let event_id = format!(
            "remote-state-bootstrap-v2:{}:{}:{}",
            remote_user_id, atome_id, digest
        );
        let known: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM remote_bootstrap_delivered
                                WHERE remote_user_id = ?1 AND atome_id = ?2 AND digest = ?3)
                     OR EXISTS(SELECT 1 FROM sync_queue WHERE atome_id = ?2 AND json_extract(payload, '$.id') = ?4)",
                rusqlite::params![remote_user_id, atome_id, digest, event_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if known {
            continue;
        }
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
            db,
            &EventRecord {
                id: event_id,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn what_this_device_edited_is_republished_once_by_windows_projects_first() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../temp")
            .join(format!("native-state-bootstrap-{}", uuid::Uuid::new_v4()));
        let state = super::super::local_atome::create_state(root.clone(), root.clone(), "WAL").unwrap();
        {
            let db = state.db.lock().unwrap();
            let put = |id: &str, project: Option<&str>, at: String, props: &str, edited: bool| {
                db.execute("INSERT INTO atomes (atome_id,atome_type,owner_id) VALUES (?1,'note','acc')", [id]).unwrap();
                db.execute("INSERT INTO state_current (atome_id,owner_id,project_id,properties,updated_at,version) VALUES (?1,'acc',?2,?3,?4,1)",
                    rusqlite::params![id, project, props, at]).unwrap();
                if edited {
                    db.execute("INSERT INTO events (id,atome_id,kind,actor,stream_id,sequence,source) VALUES (?1,?2,'set','{\"id\":\"acc\"}','s',(SELECT COUNT(*) FROM events),'tauri')",
                        rusqlite::params![format!("e-{id}"), id]).unwrap();
                }
            };
            put("acc", None, "2026-01-01T00:00:00Z".into(), r#"{"eve_profile":{}}"#, false);
            // A project is created before what it holds (its event comes first), whatever its update time.
            put("proj-a", Some("proj-a"), "2026-01-03T00:00:00Z".into(), "{}", true);
            for index in 0..250 {
                put(&format!("note-{index:03}"), Some("proj-a"), format!("2026-01-02T00:{:02}:{:02}Z", index / 60, index % 60), "{}", true);
            }
            put("foreign", None, "2026-01-01T00:00:00Z".into(), "{}", false);
        }
        assert_eq!(enqueue_current_user_state_sync(&state, "acc", "remote").unwrap(), 252);
        let queued: Vec<String> = {
            let db = state.db.lock().unwrap();
            let mut statement = db.prepare("SELECT atome_id FROM sync_queue ORDER BY queue_id").unwrap();
            statement.query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
        };
        assert_eq!(&queued[..3], ["acc", "proj-a", "note-000"]);
        assert_eq!(queued.last().unwrap(), "note-249");
        assert_eq!(queued.iter().collect::<HashSet<_>>().len(), 252);
        assert_eq!(enqueue_current_user_state_sync(&state, "acc", "remote").unwrap(), 0);
        // The next pass reads only what this device edited since this one.
        {
            let db = state.db.lock().unwrap();
            db.execute("UPDATE state_current SET properties = '{\"title\":\"b\"}', version = 2, updated_at = '2026-02-01T00:00:00Z' WHERE atome_id = 'note-007'", []).unwrap();
            db.execute("INSERT INTO events (id,atome_id,kind,actor,stream_id,sequence,source) VALUES ('e-again','note-007','set','{\"id\":\"acc\"}','s',999,'tauri')", []).unwrap();
        }
        assert_eq!(enqueue_current_user_state_sync(&state, "acc", "remote").unwrap(), 1);
        let _ = std::fs::remove_dir_all(root);
    }
}
