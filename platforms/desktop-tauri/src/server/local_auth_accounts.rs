use super::*;

pub(super) fn parse_json_map(raw: Option<&String>) -> JsonMap<String, JsonValue> {
    if let Some(value) = raw {
        if let Ok(parsed) = serde_json::from_str::<JsonValue>(value) {
            if let JsonValue::Object(map) = parsed {
                return map;
            }
        }
    }
    JsonMap::new()
}

pub(super) fn find_user_record_by_phone(
    db: &Connection,
    phone: &str,
) -> Result<Option<(String, String, Option<String>)>, String> {
    db.query_row(
        "SELECT a.atome_id, a.atome_type, a.deleted_at FROM principal_phone_credentials c
         JOIN atomes a ON c.principal_id = a.atome_id
         WHERE c.normalized_phone = ?1 AND c.revoked_at IS NULL
         LIMIT 1",
        rusqlite::params![phone],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()
    .map_err(|_| "local_database_unavailable".into())
}

pub(super) fn assign_verified_phone(db: &Connection, user_id: &str, phone: &str, ts: &str) -> Result<(), String> {
    let existing: Option<String> = db
        .query_row(
            "SELECT principal_id FROM principal_phone_credentials
             WHERE normalized_phone = ?1 AND revoked_at IS NULL LIMIT 1",
            rusqlite::params![phone],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(principal_id) = existing {
        if principal_id == user_id {
            return Ok(());
        }
        return Err("phone_credential_already_assigned".to_string());
    }
    db.execute("UPDATE principal_phone_credentials SET revoked_at=?1,updated_at=?1 WHERE principal_id=?2 AND normalized_phone!=?3 AND revoked_at IS NULL",
        rusqlite::params![ts,user_id,phone]).map_err(|_| "local_account_write_failed")?;
    db.execute(
        "INSERT INTO principal_phone_credentials
         (principal_id, normalized_phone, verified_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3, ?3)",
        rusqlite::params![user_id, phone, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub(super) fn read_verified_phone(db: &Connection, user_id: &str) -> Result<String, String> {
    db.query_row(
        "SELECT normalized_phone FROM principal_phone_credentials
         WHERE principal_id = ?1 AND revoked_at IS NULL
         ORDER BY credential_id DESC LIMIT 1",
        rusqlite::params![user_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "principal_phone_credential_missing".to_string())
}

pub(super) fn upsert_required_user_particles(
    db: &Connection,
    user_id: &str,
    username: &str,
    visibility: &str,
    ts: &str,
) -> Result<(), String> {
    let particles = [
        ("username", username),
        
        ("visibility", visibility),
    ];

    for (key, value) in particles {
        let value_json = serde_json::to_string(&value).unwrap_or_default();
        db.execute(
            "INSERT INTO particles (atome_id, particle_key, particle_value, value_type, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'string', 1, ?4, ?4)
             ON CONFLICT(atome_id, particle_key) DO UPDATE SET
                particle_value = excluded.particle_value,
                value_type = excluded.value_type,
                version = version + 1,
                updated_at = excluded.updated_at",
            rusqlite::params![user_id, key, value_json, ts],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub(super) fn upsert_user_state_current(
    db: &Connection,
    user_id: &str,
    username: &str,
    _phone: &str,
    visibility: &str,
    ts: &str,
    optional: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    let mut patch = JsonMap::new();
    patch.insert("type".to_string(), JsonValue::String("user".to_string()));
    patch.insert(
        "username".to_string(),
        JsonValue::String(username.to_string()),
    );
    patch.insert(
        "visibility".to_string(),
        JsonValue::String(visibility.to_string()),
    );

    let existing: Option<(Option<String>, i64, Option<String>)> = db
        .query_row(
            "SELECT properties, version, project_id FROM state_current WHERE atome_id = ?1",
            rusqlite::params![user_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let mut current_props = parse_json_map(existing.as_ref().and_then(|row| row.0.as_ref()));
    for (key, value) in patch.into_iter() {
        current_props.insert(key, value);
    }
    for (key, value) in optional.iter() {
        current_props.insert(key.clone(), value.clone());
    }

    let next_version = existing.as_ref().map(|row| row.1 + 1).unwrap_or(1);
    let project_id = existing.as_ref().and_then(|row| row.2.clone());
    let props_json = serde_json::to_string(&current_props).map_err(|e| e.to_string())?;

    if existing.is_some() {
        db.execute(
            "UPDATE state_current SET properties = ?1, updated_at = ?2, version = ?3, project_id = COALESCE(?4, project_id) WHERE atome_id = ?5",
            rusqlite::params![props_json, ts, next_version, project_id, user_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        db.execute(
            "INSERT INTO state_current (atome_id, project_id, properties, updated_at, version) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![user_id, project_id, props_json, ts, next_version],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

