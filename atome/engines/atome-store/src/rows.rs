//! Atome rows: loading an atome and resolving the owner and parent references
//! that arrived before their target.
use super::*;

pub fn load_atome(
    db: &Connection,
    atome_id: &str,
    owner_filter: Option<&str>,
) -> Result<AtomeData, String> {
    load_atome_with_deleted(db, atome_id, owner_filter, false)
}

pub fn load_atome_with_deleted(
    db: &Connection,
    atome_id: &str,
    owner_filter: Option<&str>,
    include_deleted: bool,
) -> Result<AtomeData, String> {
    load_atome_with_deleted_excluding(db, atome_id, owner_filter, include_deleted, &HashSet::new())
}

pub fn load_atome_with_deleted_excluding(
    db: &Connection,
    atome_id: &str,
    owner_filter: Option<&str>,
    include_deleted: bool,
    excluded_particle_keys: &HashSet<String>,
) -> Result<AtomeData, String> {
    let deleted_clause = if include_deleted {
        ""
    } else {
        "AND deleted_at IS NULL"
    };

    let query = if owner_filter.is_some() {
        format!(
            "SELECT atome_id, atome_type, parent_id, owner_id, creator_id, sync_status, created_source, last_sync, created_at, updated_at, deleted_at
             FROM atomes WHERE atome_id = ?1 AND owner_id = ?2 {}",
            deleted_clause
        )
    } else {
        format!(
            "SELECT atome_id, atome_type, parent_id, owner_id, creator_id, sync_status, created_source, last_sync, created_at, updated_at, deleted_at
             FROM atomes WHERE atome_id = ?1 {}",
            deleted_clause
        )
    };

    let row: (
        String,         // atome_id
        String,         // atome_type
        Option<String>, // parent_id
        Option<String>, // owner_id
        Option<String>, // creator_id
        String,         // sync_status
        Option<String>, // created_source
        Option<String>, // last_sync
        String,         // created_at
        String,         // updated_at
        Option<String>, // deleted_at
    ) = if let Some(owner) = owner_filter {
        db.query_row(&query, rusqlite::params![atome_id, owner], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
            ))
        })
    } else {
        db.query_row(&query, rusqlite::params![atome_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
                row.get(10)?,
            ))
        })
    }
    .map_err(|e| e.to_string())?;

    // Load particles
    let mut data_map = serde_json::Map::new();
    let mut particle_query = String::from(
        "SELECT particle_key, particle_value FROM particles
         WHERE atome_id = ?1 AND value_type IS NOT 'deleted'",
    );
    let mut particle_params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(atome_id.to_string())];
    if !excluded_particle_keys.is_empty() {
        let placeholders = excluded_particle_keys
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        particle_query.push_str(&format!(" AND particle_key NOT IN ({})", placeholders));
        for key in excluded_particle_keys {
            particle_params.push(Box::new(key.clone()));
        }
    }
    let mut stmt = db.prepare(&particle_query).map_err(|e| e.to_string())?;
    let particle_param_refs: Vec<&dyn rusqlite::ToSql> =
        particle_params.iter().map(|param| param.as_ref()).collect();

    let particles = stmt
        .query_map(particle_param_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;

    for p in particles.filter_map(|r| r.ok()) {
        let (key, value_str) = p;
        if let Ok(value) = serde_json::from_str(&value_str) {
            data_map.insert(key, value);
        } else {
            data_map.insert(key, serde_json::Value::String(value_str));
        }
    }

    let mut owner_id = row.3;
    if owner_id.is_none() {
        owner_id = get_pending_owner_id(db, &row.0);
    }
    let mut parent_id = row.2;
    if parent_id.is_none() {
        parent_id = get_pending_parent_id(db, &row.0);
    }

    Ok(AtomeData {
        atome_id: row.0,
        atome_type: row.1,
        parent_id,
        owner_id,
        creator_id: row.4,
        data: serde_json::Value::Object(data_map),
        sync_status: row.5,
        created_source: row.6,
        last_sync: row.7,
        created_at: row.8,
        updated_at: row.9,
        deleted_at: row.10,
    })
}

pub fn get_pending_owner_id(db: &Connection, atome_id: &str) -> Option<String> {
    let raw: Result<String, _> = db.query_row(
        "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = '_pending_owner_id' LIMIT 1",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match raw {
        Ok(value) => serde_json::from_str(&value).ok().or(Some(value)),
        Err(_) => None,
    }
}

pub fn get_pending_parent_id(db: &Connection, atome_id: &str) -> Option<String> {
    let raw: Result<String, _> = db.query_row(
        "SELECT particle_value FROM particles WHERE atome_id = ?1 AND particle_key = '_pending_parent_id' LIMIT 1",
        rusqlite::params![atome_id],
        |row| row.get(0),
    );

    match raw {
        Ok(value) => serde_json::from_str(&value).ok().or(Some(value)),
        Err(_) => None,
    }
}
