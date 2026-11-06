// An appended event projected into the atome row, its particles and
// `state_current`, as Fastify's `applyEventToStateCurrent`
// (database/adole_state_projection.js) and `upsertAtomeFromEvent`
// (database/adole_event_atome_upsert.js) do it: the structural envelope on the
// atome row (a missing owner or parent deferred to a pending particle), the
// properties as particles, the merged properties and the next version in
// `state_current`.
use super::*;
use append::{JsonEvent, iso_now};

fn first_text(map: &JsonMap<String, JsonValue>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| map.get(*key))
        .find(|value| js_truthy(value))
        .map(canonical::js_string)
}

fn actor_id(event: &JsonEvent) -> Option<String> {
    event
        .get("actor")
        .and_then(JsonValue::as_object)
        .and_then(|actor| first_text(actor, &["id", "user_id", "userId"]))
}

// `resolveEventType(patch)`: a declared type unless generic, then the kind.
fn event_type(patch: &JsonMap<String, JsonValue>) -> Option<String> {
    let declared = first_text(patch, &["type", "atome_type"]);
    let kind = first_text(patch, &["kind"]);
    match declared {
        Some(declared) if !declared.eq_ignore_ascii_case("generic") => Some(declared),
        declared => kind.or(declared),
    }
}

fn exists(db: &Connection, atome_id: &str) -> Result<bool, String> {
    db.query_row(
        "SELECT 1 FROM atomes WHERE atome_id = ?1",
        [atome_id],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|e| e.to_string())
}

// `setParticle` / `setParticles`: a changed particle touches the atome row.
fn set_particles(
    db: &Connection,
    atome_id: &str,
    properties: &JsonMap<String, JsonValue>,
    author: Option<&str>,
    ts: &str,
    event_id: &str,
) -> Result<(), String> {
    let mut changed = false;
    for (key, value) in canonical::sanitize_properties(&JsonValue::Object(properties.clone())) {
        changed |=
            particles::set_particle(db, atome_id, &key, Some(&value), author, ts, Some(event_id))?;
    }
    if changed {
        particles::touch(db, atome_id, ts)?;
    }
    Ok(())
}

struct Envelope<'a> {
    atome_id: &'a str,
    atome_type: Option<String>,
    parent_id: Option<String>,
    owner_id: Option<String>,
    ts: &'a str,
    deleted: bool,
    restored: bool,
    event_id: &'a str,
}

fn defer(db: &Connection, envelope: &Envelope<'_>, key: &str, target: &str) -> Result<(), String> {
    if particles::set_particle(
        db,
        envelope.atome_id,
        key,
        Some(&json!(target)),
        envelope.owner_id.as_deref(),
        envelope.ts,
        Some(envelope.event_id),
    )? {
        particles::touch(db, envelope.atome_id, envelope.ts)?;
    }
    Ok(())
}

fn clear_pending(db: &Connection, atome_id: &str, key: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
        rusqlite::params![atome_id, key],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// `upsertAtomeFromEvent` (its particles excepted, written by the caller).
fn upsert_atome(db: &Connection, envelope: &Envelope<'_>) -> Result<(), String> {
    let id = envelope.atome_id;
    let existing: Option<(Option<String>, Option<String>, Option<String>)> = db
        .query_row(
            "SELECT atome_type, parent_id, owner_id FROM atomes WHERE atome_id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((existing_type, existing_parent, existing_owner)) = existing else {
        let mut owner = envelope.owner_id.clone().filter(|owner| owner != id);
        let mut parent = envelope.parent_id.clone().filter(|parent| parent != id);
        let mut pending_owner = None;
        let mut pending_parent = None;
        if let Some(candidate) = owner.clone()
            && !exists(db, &candidate)?
        {
            pending_owner = owner.take();
        }
        if let Some(candidate) = parent.clone()
            && !exists(db, &candidate)?
        {
            pending_parent = parent.take();
        }
        db.execute(
            "INSERT OR REPLACE INTO atomes (atome_id, atome_type, parent_id, owner_id, creator_id, sync_status,
                created_source, created_at, updated_at, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'pending', 'fastify',
                COALESCE((SELECT created_at FROM atomes WHERE atome_id = ?1), ?6), ?6, ?7)",
            rusqlite::params![
                id,
                envelope.atome_type.as_deref().unwrap_or("generic"),
                parent,
                owner,
                envelope.owner_id,
                envelope.ts,
                envelope.deleted.then_some(envelope.ts),
            ],
        )
        .map_err(|e| e.to_string())?;
        if let Some(target) = pending_owner {
            defer(db, envelope, "_pending_owner_id", &target)?;
        }
        if let Some(target) = pending_parent {
            defer(db, envelope, "_pending_parent_id", &target)?;
        }
        return Ok(());
    };
    let existing_type = existing_type.unwrap_or_default();
    let mut updates: Vec<&str> = Vec::new();
    let mut values: Vec<Option<String>> = Vec::new();
    if let Some(declared) = &envelope.atome_type
        && (existing_type.is_empty()
            || existing_type == "generic"
            || (declared == "user" && existing_type != "user"))
    {
        updates.push("atome_type = ?");
        values.push(Some(declared.clone()));
    }
    let mut pending_parent = None;
    let mut assigned_parent = false;
    if let Some(parent) = envelope.parent_id.as_deref()
        && parent != id
        && Some(parent) != existing_parent.as_deref()
    {
        if exists(db, parent)? {
            updates.push("parent_id = ?");
            values.push(Some(parent.into()));
            assigned_parent = true;
        } else {
            pending_parent = Some(parent.to_string());
        }
    }
    let mut pending_owner = None;
    let mut assigned_owner = false;
    if existing_owner.is_none()
        && let Some(owner) = envelope.owner_id.as_deref()
    {
        if owner == id || exists(db, owner)? {
            updates.push("owner_id = ?");
            values.push(Some(owner.into()));
            assigned_owner = true;
        } else {
            pending_owner = Some(owner.to_string());
        }
    }
    if envelope.deleted {
        updates.push("deleted_at = ?");
        values.push(Some(envelope.ts.into()));
    } else if envelope.restored {
        updates.push("deleted_at = ?");
        values.push(None);
    }
    if !updates.is_empty() {
        updates.push("updated_at = ?");
        values.push(Some(envelope.ts.into()));
        values.push(Some(id.into()));
        let sql = format!(
            "UPDATE atomes SET {} WHERE atome_id = ?",
            updates.join(", ")
        );
        db.execute(&sql, rusqlite::params_from_iter(values))
            .map_err(|e| e.to_string())?;
    }
    match pending_owner {
        Some(target) => defer(db, envelope, "_pending_owner_id", &target)?,
        None if assigned_owner || existing_owner.is_some() => {
            clear_pending(db, id, "_pending_owner_id")?
        }
        None => {}
    }
    match pending_parent {
        Some(target) => defer(db, envelope, "_pending_parent_id", &target)?,
        None if assigned_parent || existing_parent.is_some() => {
            clear_pending(db, id, "_pending_parent_id")?
        }
        None => {}
    }
    Ok(())
}

// `applyOwnerTransferEvent`: the atome moves to its new owner, as a rebuild moves it again.
fn apply_owner_transfer(
    db: &Connection,
    event: &JsonEvent,
    atome_id: &str,
) -> Result<JsonValue, String> {
    let payload = append::event_payload_map(event);
    let Some(to_owner) = first_text(&payload, &["to_owner_id"]) else {
        return Err("transfer_owner_event_invalid".into());
    };
    let ts = first_text(event, &["ts"]).unwrap_or_else(iso_now);
    let include_creator = payload.get("include_creator") != Some(&JsonValue::Bool(false));
    db.execute(
        "UPDATE atomes SET owner_id = ?1, creator_id = CASE WHEN ?2 THEN ?1 ELSE creator_id END,
            updated_at = ?3, sync_status = 'pending' WHERE atome_id = ?4",
        rusqlite::params![to_owner, include_creator, ts, atome_id],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE state_current SET owner_id = ?1, updated_at = ?2 WHERE atome_id = ?3",
        rusqlite::params![to_owner, ts, atome_id],
    )
    .map_err(|e| e.to_string())?;
    clear_pending(db, atome_id, "_pending_owner_id")?;
    Ok(json!({
        "atome_id": atome_id,
        "owner_id": to_owner,
        "transferred_from": first_text(&payload, &["from_owner_id"]),
        "updated_at": ts,
    }))
}

// Projects `event` (an appended one, its particles written).
pub fn apply_event(db: &Connection, event: &JsonEvent) -> Result<JsonValue, String> {
    let Some(atome_id) = first_text(event, &["atome_id"]) else {
        return Ok(JsonValue::Null);
    };
    let kind = event
        .get("kind")
        .map(canonical::js_string)
        .unwrap_or_default();
    if kind.to_lowercase() == "transfer-owner" {
        return apply_owner_transfer(db, event, &atome_id);
    }
    let ts = first_text(event, &["ts"]).unwrap_or_else(iso_now);
    let payload = match event.get("payload") {
        None | Some(JsonValue::Null) => None,
        Some(payload) => Some(payload.clone()),
    };
    let Some(mut patch) = extract_event_patch(&kind, &payload, &ts) else {
        return Ok(JsonValue::Null);
    };
    let event_id = first_text(event, &["id"]).unwrap_or_default();
    let actor = actor_id(event);
    let patch_owner = first_text(&patch, &["owner_id", "ownerId", "owner"]);
    let event_owner = first_text(event, &["owner_id", "ownerId", "owner"]);
    let deleted = patch.get("__deleted") == Some(&JsonValue::Bool(true));
    let restored =
        patch.get("__deleted") == Some(&JsonValue::Bool(false)) && kind.to_lowercase() == "restore";
    let particle_patch: JsonMap<String, JsonValue> = patch
        .iter()
        .filter(|(key, _)| !intent::EVENT_META_PROPERTY_KEYS.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    let deleted_keys = intent::event_deleted_property_keys(&append::event_payload_map(event));
    let envelope = Envelope {
        atome_id: &atome_id,
        atome_type: event_type(&patch),
        parent_id: first_text(
            &patch,
            &["parent_id", "parentId", "project_id", "projectId"],
        ),
        owner_id: event_owner
            .clone()
            .or_else(|| patch_owner.clone())
            .or_else(|| actor.clone()),
        ts: &ts,
        deleted,
        restored,
        event_id: &event_id,
    };
    upsert_atome(db, &envelope)?;
    set_particles(
        db,
        &atome_id,
        &particle_patch,
        envelope.owner_id.as_deref(),
        &ts,
        &event_id,
    )?;
    for key in &deleted_keys {
        particles::delete_particle(db, &atome_id, key, actor.as_deref(), &ts, Some(&event_id))?;
    }
    let unset = |key: &str| patch.get(key).is_none_or(JsonValue::is_null);
    if unset("type") && unset("atome_type") && unset("kind") {
        let row: Option<(Option<String>, Option<String>)> = db
            .query_row(
                "SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?1",
                [&atome_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some((atome_type, parent_id)) = row {
            let parent_unset = unset("parent_id") && unset("parentId");
            if let Some(atome_type) = atome_type.filter(|value| !value.is_empty()) {
                patch.insert("type".into(), json!(atome_type));
            }
            if let Some(parent_id) = parent_id.filter(|value| !value.is_empty())
                && parent_unset
            {
                patch.insert("parent_id".into(), json!(parent_id));
            }
        }
    }
    let existing: Option<(Option<String>, Option<i64>, Option<String>, Option<String>)> = db
        .query_row(
            "SELECT properties, version, project_id, owner_id FROM state_current WHERE atome_id = ?1",
            [&atome_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    // Writing an object (through a share) never makes the writer its owner: the owner it has stays.
    let stored_owner: Option<String> = db
        .query_row(
            "SELECT owner_id FROM atomes WHERE atome_id = ?1",
            [&atome_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|owner: &String| !owner.is_empty());
    let owner = stored_owner
        .or(event_owner)
        .or(patch_owner)
        .or_else(|| {
            existing
                .as_ref()
                .and_then(|row| row.3.clone())
                .filter(|owner| !owner.is_empty())
        })
        .or(actor);
    let mut properties = match existing.as_ref().and_then(|row| row.0.as_deref()) {
        Some(raw) if !raw.is_empty() => match serde_json::from_str(raw) {
            Ok(JsonValue::Object(map)) => map,
            _ => JsonMap::new(),
        },
        _ => JsonMap::new(),
    };
    for (key, value) in canonical::sanitize_properties(&JsonValue::Object(patch)) {
        properties.insert(key, value);
    }
    for key in &deleted_keys {
        properties.shift_remove(key);
    }
    let version = existing
        .as_ref()
        .and_then(|row| row.1)
        .filter(|version| *version != 0)
        .unwrap_or(0)
        + 1;
    let global = append::event_payload_map(event)
        .get("scope")
        .and_then(JsonValue::as_str)
        == Some("global");
    let project_id = if global {
        None
    } else {
        first_text(event, &["project_id"]).or_else(|| {
            existing
                .as_ref()
                .and_then(|row| row.2.clone())
                .filter(|project| !project.is_empty())
        })
    };
    let text = intent::js_stringify(&JsonValue::Object(properties.clone()));
    if existing.is_some() {
        db.execute(
            "UPDATE state_current SET properties = ?1, updated_at = ?2, version = ?3, project_id = ?4,
                owner_id = COALESCE(?5, owner_id) WHERE atome_id = ?6",
            rusqlite::params![text, ts, version, project_id, owner, atome_id],
        )
    } else {
        db.execute(
            "INSERT INTO state_current (atome_id, owner_id, project_id, properties, updated_at, version)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![atome_id, owner, project_id, text, ts, version],
        )
    }
    .map_err(|e| e.to_string())?;
    Ok(json!({
        "atome_id": atome_id,
        "owner_id": owner,
        "project_id": project_id,
        "properties": properties,
        "updated_at": ts,
        "version": version,
    }))
}
