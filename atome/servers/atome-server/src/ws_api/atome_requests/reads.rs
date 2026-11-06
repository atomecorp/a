// The central database's atome reads the `atome` requests answer with (database/adole_atome_reads.js
// `getAtome`, adole_particles.js `getParticle`/`getParticles`, server/atomePropertySecurity.js
// `projectAtomePropertiesForRead`/`canReadAnyAtomeProperty`), each value bound as better-sqlite3
// binds it.
use crate::social::news::db::{all, get};
use crate::social::permissions::can_read;
use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, ToSql};
use serde_json::{Map as JsonMap, Value as JsonValue};

/// A message value as better-sqlite3 binds it: a string as text, a number as a double, a missing
/// value or null as NULL; an object is read as named parameters, leaving the statement's own
/// unbound; anything else it refuses.
pub(super) fn bound(value: Option<&JsonValue>) -> Result<SqlValue, String> {
    match value {
        None | Some(JsonValue::Null) => Ok(SqlValue::Null),
        Some(JsonValue::String(text)) => Ok(SqlValue::Text(text.clone())),
        Some(JsonValue::Number(number)) => Ok(SqlValue::Real(number.as_f64().unwrap_or(f64::NAN))),
        Some(JsonValue::Object(_)) => Err("Too few parameter values were provided".into()),
        Some(_) => Err("SQLite3 can only bind numbers, strings, bigints, buffers, and null".into()),
    }
}

/// `db.canRead(atomeId, principal, key)` of a bound id: only a text id names an atome (a number,
/// bound as a double, never matches one).
pub(super) fn readable(
    db: &Connection,
    atome_id: &SqlValue,
    principal: &str,
    key: Option<&str>,
) -> Result<bool, String> {
    match atome_id {
        SqlValue::Text(id) => can_read(db, id, principal, key),
        _ => Ok(false),
    }
}

// `JSON.parse(stored)`, the stored text itself when it is not JSON.
pub(super) fn parsed(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::String(raw) => {
            serde_json::from_str(raw).unwrap_or_else(|_| JsonValue::String(raw.clone()))
        }
        other => other.clone(),
    }
}

/// `getAtome(id)`: the live atome with its particles, projected as stored truth; null when none.
pub(super) fn stored_atome(db: &Connection, id: &SqlValue) -> Result<JsonValue, String> {
    let Some(row) = get(
        db,
        "SELECT atome_id, atome_type, parent_id, owner_id, creator_id,
                sync_status, last_sync, created_source, created_at, updated_at, deleted_at
         FROM atomes WHERE atome_id = ? AND deleted_at IS NULL",
        &[id as &dyn ToSql],
    )?
    else {
        return Ok(JsonValue::Null);
    };
    let mut properties = JsonMap::new();
    let mut kind = None;
    for particle in all(
        db,
        "SELECT particle_key, particle_value, value_type FROM particles WHERE atome_id = ? AND value_type != 'deleted'",
        &[id as &dyn ToSql],
    )? {
        let value = parsed(&particle["particle_value"]);
        match &particle["particle_key"] {
            JsonValue::String(key) if key == "kind" => kind = Some(value),
            key => {
                properties.insert(crate::vault_router::js::string(key), value);
            }
        }
    }
    Ok(
        atome_store::canonical::project_stored_atome(&row, &properties, kind.as_ref())?
            .unwrap_or(JsonValue::Null),
    )
}

/// `getParticle(atomeId, key)`: its value, null when absent or deleted.
pub(super) fn particle(
    db: &Connection,
    atome_id: &SqlValue,
    key: &SqlValue,
) -> Result<JsonValue, String> {
    let row = get(
        db,
        "SELECT particle_value, value_type FROM particles WHERE atome_id = ? AND particle_key = ?",
        &[atome_id as &dyn ToSql, key],
    )?;
    Ok(match row {
        Some(row) if row["value_type"] != "deleted" => parsed(&row["particle_value"]),
        _ => JsonValue::Null,
    })
}

/// `getParticles(atomeId)`: every live particle by key.
pub(super) fn particles(
    db: &Connection,
    atome_id: &SqlValue,
) -> Result<JsonMap<String, JsonValue>, String> {
    Ok(all(
        db,
        "SELECT particle_key, particle_value FROM particles WHERE atome_id = ? AND value_type != 'deleted'",
        &[atome_id as &dyn ToSql],
    )?
    .into_iter()
    .map(|row| {
        (
            crate::vault_router::js::string(&row["particle_key"]),
            parsed(&row["particle_value"]),
        )
    })
    .collect())
}

/// `projectAtomePropertiesForRead(atomeId, properties, principal)`: the properties `principal`
/// may read (none of an atome a text id does not name).
pub(super) fn readable_properties(
    db: &Connection,
    atome_id: &SqlValue,
    properties: JsonMap<String, JsonValue>,
    principal: &str,
) -> Result<JsonMap<String, JsonValue>, String> {
    let SqlValue::Text(id) = atome_id else {
        return Ok(JsonMap::new());
    };
    let mut projected = JsonMap::new();
    if id.is_empty() {
        return Ok(projected);
    }
    for (key, value) in properties {
        if can_read(db, id, principal, Some(&key))? {
            projected.insert(key, value);
        }
    }
    Ok(projected)
}

/// `canReadAnyAtomeProperty(atomeId, principal)`: the atome, else one of its current properties.
pub(super) fn any_readable(
    db: &Connection,
    atome_id: &str,
    principal: &str,
) -> Result<bool, String> {
    if can_read(db, atome_id, principal, None)? {
        return Ok(true);
    }
    // `getStateCurrent(atomeId).properties`: the stored current properties, the reserved keys left out.
    let state = get(
        db,
        "SELECT properties FROM state_current WHERE atome_id = ?",
        &[&atome_id],
    )?;
    let stored = state
        .and_then(|state| state["properties"].as_str().map(String::from))
        .and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok())
        .unwrap_or(JsonValue::Null);
    for key in atome_store::canonical::sanitize_properties(&stored).keys() {
        if can_read(db, atome_id, principal, Some(key))? {
            return Ok(true);
        }
    }
    Ok(false)
}
