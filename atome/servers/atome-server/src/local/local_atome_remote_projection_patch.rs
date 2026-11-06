//! A remote event's patch projected into the local vault: identities localized, the
//! target ensured, each particle written unless a newer local one wins.
use super::*;

pub(super) fn patch_of(event: &JsonValue) -> JsonMap<String, JsonValue> {
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

pub(super) fn projection_atome_id<'a>(
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
            tx.query_row("SELECT 1 FROM atomes WHERE atome_id = ?1", [*value], |_| {
                Ok(())
            })
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

pub(super) fn project_patch(
    tx: &Transaction<'_>,
    local_user_id: &str,
    remote_user_id: &str,
    event: &JsonValue,
    patch: &JsonMap<String, JsonValue>,
) -> Result<Vec<String>, String> {
    let Some(atome_id) = projection_atome_id(event, local_user_id, remote_user_id) else {
        return Ok(Vec::new());
    };
    let owner_id = projection_owner_id(event, local_user_id, remote_user_id);
    let parent_id = projection_parent_id(event, patch, local_user_id, remote_user_id);

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
    let event_id = event
        .get("event_id")
        .or_else(|| event.get("id"))
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let accept =
        |key: &str| atome_store::conflicts::accept_remote(tx, atome_id, key, event_id, &timestamp);
    let kind = event
        .get("kind")
        .and_then(JsonValue::as_str)
        .unwrap_or("set");
    let lifecycle = matches!(kind, "delete" | "restore") && accept("__lifecycle__")?;
    if matches!(kind, "delete" | "restore") && !lifecycle {
        return Ok(Vec::new());
    }
    for key in projected_props.keys().cloned().collect::<Vec<_>>() {
        if !accept(&key)? {
            projected_props.remove(&key);
        }
    }
    let mut removed = Vec::new();
    for key in delete_keys(patch) {
        if accept(&key)? {
            removed.push(key);
        }
    }
    if projected_props.is_empty() && removed.is_empty() && !lifecycle {
        return Ok(Vec::new());
    }
    let mut winner_keys: Vec<String> = projected_props
        .keys()
        .cloned()
        .chain(removed.iter().cloned())
        .collect();
    if lifecycle {
        winner_keys.push("__lifecycle__".into());
    }
    ensure_principal(tx, local_user_id)?;
    let mut accepted_patch = patch.clone();
    accepted_patch.insert("props".into(), json!(projected_props));
    ensure_target(tx, atome_id, owner_id, parent_id, &accepted_patch)?;
    if owner_id == local_user_id {
        localize_identity_properties(&mut projected_props, local_user_id, remote_user_id);
        preserve_local_media_references(&properties, &mut projected_props, local_user_id);
    }
    for (key, value) in &projected_props {
        properties.insert(key.clone(), value.clone());
        // The local particle counts its own changes (store contract), whatever the
        // remote stream's sequence: a client's `expected_versions` reads it.
        atome_store::particles::set_particle(
            tx,
            atome_id,
            key,
            Some(value),
            Some(owner_id),
            &timestamp,
            Some(event_id),
        )?;
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
    for key in removed {
        properties.remove(&key);
        atome_store::particles::delete_particle(
            tx,
            atome_id,
            &key,
            Some(owner_id),
            &timestamp,
            Some(event_id),
        )?;
    }
    if lifecycle && kind.eq_ignore_ascii_case("delete") {
        properties.insert("__deleted".to_string(), JsonValue::Bool(true));
    } else if lifecycle && kind.eq_ignore_ascii_case("restore") {
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
    if lifecycle && kind.eq_ignore_ascii_case("delete") {
        tx.execute(
            "UPDATE atomes SET deleted_at = ?1, updated_at = ?1 WHERE atome_id = ?2",
            rusqlite::params![timestamp, atome_id],
        )
        .map_err(|error| error.to_string())?;
    } else if lifecycle && kind.eq_ignore_ascii_case("restore") {
        tx.execute(
            "UPDATE atomes SET deleted_at = NULL, updated_at = ?1 WHERE atome_id = ?2",
            rusqlite::params![timestamp, atome_id],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(winner_keys)
}
