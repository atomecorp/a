// The live particles of an atome and their append-only `particles_versions`
// history, as Fastify's `setParticle` / `applyDeletes` keep them
// (database/adole_particles.js, adole_event_mutation.js): every change raises the
// particle's version by one, a deleted particle stays as a tombstone
// (`value_type = 'deleted'`) so its version keeps counting. `expected_versions`
// guards rest on that count (a list's value N lives at version N + 1).
use super::*;

pub const DELETED_VALUE_TYPE: &str = "deleted";

// A changed particle touches its atome row (`setParticle`).
pub fn touch(db: &Connection, atome_id: &str, ts: &str) -> Result<(), String> {
    db.execute(
        "UPDATE atomes SET updated_at = ?1, sync_status = 'pending' WHERE atome_id = ?2",
        rusqlite::params![ts, atome_id],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn value_type(value: &JsonValue) -> &'static str {
    match value {
        JsonValue::String(_) => "string",
        JsonValue::Number(_) => "number",
        JsonValue::Bool(_) => "boolean",
        _ => "json",
    }
}

fn current(
    db: &Connection,
    atome_id: &str,
    key: &str,
) -> Result<Option<(i64, Option<String>, i64, Option<String>)>, String> {
    db.query_row(
        "SELECT particle_id, particle_value, version, value_type FROM particles
         WHERE atome_id = ?1 AND particle_key = ?2",
        rusqlite::params![atome_id, key],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn record_version(
    db: &Connection,
    particle_id: i64,
    atome_id: &str,
    key: &str,
    version: i64,
    old_value: Option<&str>,
    new_value: Option<&str>,
    author: Option<&str>,
    ts: &str,
    event_id: Option<&str>,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO particles_versions
         (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at, event_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![particle_id, atome_id, key, version, old_value, new_value, author, ts, event_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Writes `value` (its `JSON.stringify` text; none is JavaScript's `undefined`, stored
// as NULL, every write of it a change); a value equal to the live one is no change and
// no history. Returns whether the particle changed. `event_id`: the event it projects,
// none for a write outside the event log (an account's own particles).
pub fn set_particle(
    db: &Connection,
    atome_id: &str,
    key: &str,
    value: Option<&JsonValue>,
    author: Option<&str>,
    ts: &str,
    event_id: Option<&str>,
) -> Result<bool, String> {
    let text = value.map(intent::js_stringify);
    let kind = value.map_or("undefined", value_type);
    let (particle_id, version, old) = match current(db, atome_id, key)? {
        Some((_, Some(old), _, ref live))
            if text.as_deref() == Some(old.as_str())
                && live.as_deref() != Some(DELETED_VALUE_TYPE) =>
        {
            return Ok(false);
        }
        Some((particle_id, old, version, _)) => {
            db.execute(
                "UPDATE particles SET particle_value = ?1, value_type = ?2, version = ?3, updated_at = ?4
                 WHERE particle_id = ?5",
                rusqlite::params![text, kind, version + 1, ts, particle_id],
            )
            .map_err(|e| e.to_string())?;
            (particle_id, version + 1, old)
        }
        None => {
            db.execute(
                "INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
                rusqlite::params![atome_id, key, text, kind, ts],
            )
            .map_err(|e| e.to_string())?;
            (db.last_insert_rowid(), 1, None)
        }
    };
    record_version(
        db,
        particle_id,
        atome_id,
        key,
        version,
        old.as_deref(),
        text.as_deref(),
        author,
        ts,
        event_id,
    )?;
    Ok(true)
}

// Turns a live particle into a tombstone; an absent or already deleted one is no change.
pub fn delete_particle(
    db: &Connection,
    atome_id: &str,
    key: &str,
    author: Option<&str>,
    ts: &str,
    event_id: Option<&str>,
) -> Result<(), String> {
    let Some((particle_id, old, version, live)) = current(db, atome_id, key)? else {
        return Ok(());
    };
    if live.as_deref() == Some(DELETED_VALUE_TYPE) {
        return Ok(());
    }
    db.execute(
        "UPDATE particles SET particle_value = NULL, value_type = ?1, version = ?2, updated_at = ?3
         WHERE particle_id = ?4",
        rusqlite::params![DELETED_VALUE_TYPE, version + 1, ts, particle_id],
    )
    .map_err(|e| e.to_string())?;
    record_version(
        db,
        particle_id,
        atome_id,
        key,
        version + 1,
        old.as_deref(),
        None,
        author,
        ts,
        event_id,
    )
}
