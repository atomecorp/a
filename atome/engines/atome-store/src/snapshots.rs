// Explicit snapshots of the projection and their restore through the event
// commit, as Fastify's database/adole_state_snapshots.js and
// state_snapshot_restore.js do them: a snapshot is never automatic, a restore is
// stored truth written back as `set` events, never a direct state write.
use super::*;
use append::{AppendOptions, ConflictMode};
use reads::{StateFilter, field_text, number_or};

fn actor_id(actor: &JsonValue) -> Option<String> {
    match actor {
        JsonValue::Object(map) => ["id", "user_id", "userId"]
            .iter()
            .filter_map(|key| map.get(*key))
            .find(|value| js_truthy(value))
            .map(canonical::js_string),
        JsonValue::String(text) => Some(text.clone()),
        _ => None,
    }
}

// `createStateSnapshot`: the project's states (or the given state) recorded; returns its id.
fn create_snapshot(db: &Connection, request: &JsonValue, actor: &JsonValue) -> Result<i64, String> {
    let project_id = field_text(request, &["project_id"]);
    let atome_id = field_text(request, &["atome_id"]).or_else(|| project_id.clone());
    let Some(atome_id) = atome_id else {
        return Err("Snapshot requires projectId or atomeId".into());
    };
    let state = match request.get("state").filter(|state| js_truthy(state)) {
        Some(state) => state.clone(),
        None => match &project_id {
            Some(project) => JsonValue::Array(reads::list_state_current(
                db,
                &StateFilter {
                    project_id: Some(project.clone()),
                    owner_id: None,
                    atome_type: None,
                    exclude_system: false,
                    include_deleted: false,
                    limit: 1000,
                    offset: 0,
                    oldest: false,
                    after: None,
                },
            )?),
            None => JsonValue::Null,
        },
    };
    let blob = if state.is_null() {
        "{}".to_string()
    } else {
        intent::js_stringify(&state)
    };
    let actor_text = match actor {
        JsonValue::Null => None,
        JsonValue::String(text) => Some(text.clone()),
        other => Some(intent::js_stringify(other)),
    };
    db.execute(
        "INSERT INTO snapshots (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
         VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            atome_id,
            project_id,
            blob,
            request.get("label").and_then(JsonValue::as_str),
            field_text(request, &["snapshot_type"]).unwrap_or_else(|| "manual".into()),
            actor_text,
            actor_id(actor),
            append::iso_now(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

// `createStateSnapshotOnce`: a resend of the same `event_id` gets the same snapshot.
pub fn create_snapshot_once(
    db: &Connection,
    request: &JsonValue,
    actor: &JsonValue,
) -> Result<JsonValue, String> {
    let event_id = field_text(request, &["event_id"]);
    if let Some(known) = reads::get_event(db, event_id.as_deref())?.as_object() {
        let id_of = |actor: Option<&JsonValue>| {
            actor
                .and_then(|actor| actor.get("id"))
                .map(canonical::js_string)
        };
        let same_actor = id_of(known.get("actor")) == id_of(Some(actor));
        if known.get("kind").and_then(JsonValue::as_str) != Some("snapshot") || !same_actor {
            return Err("event_id_conflict".into());
        }
        return Ok(
            json!({ "snapshot_id": known.get("payload").and_then(|p| p.get("snapshot_id")).cloned().unwrap_or(JsonValue::Null) }),
        );
    }
    let snapshot_id = create_snapshot(db, request, actor)?;
    let mut event = JsonMap::new();
    if let Some(id) = event_id {
        event.insert("id".into(), json!(id));
    }
    if let Some(ts) = field_text(request, &["ts"]) {
        event.insert("ts".into(), json!(ts));
    }
    event.insert("kind".into(), json!("snapshot"));
    event.insert(
        "atome_id".into(),
        json!(field_text(request, &["atome_id", "project_id"])),
    );
    event.insert(
        "project_id".into(),
        request
            .get("project_id")
            .cloned()
            .unwrap_or(JsonValue::Null),
    );
    event.insert("actor".into(), actor.clone());
    event.insert(
        "payload".into(),
        json!({ "snapshot_id": snapshot_id, "label": request.get("label").cloned().unwrap_or(JsonValue::Null) }),
    );
    let options = AppendOptions {
        source: Some("snapshot"),
        tx_id: None,
        conflict_mode: ConflictMode::Interactive,
        stored_truth: false,
    };
    append::append_events(db, &[JsonValue::Object(event)], &options)?;
    Ok(json!({ "snapshot_id": snapshot_id }))
}

fn snapshot_row(mut row: JsonMap<String, JsonValue>) -> JsonValue {
    let blob = row
        .get("state_blob")
        .filter(|value| js_truthy(value))
        .or_else(|| row.get("snapshot_data"))
        .cloned();
    row.insert(
        "state_blob".into(),
        row_json::parse_stored_strict(blob.as_ref()),
    );
    let actor = row_json::parse_stored_strict(row.get("actor"));
    row.insert("actor".into(), actor);
    JsonValue::Object(row)
}

// `listStateSnapshots(projectId, { limit, offset })`.
pub fn list_snapshots(db: &Connection, request: &JsonValue) -> Result<Vec<JsonValue>, String> {
    let Some(project_id) = field_text(request, &["project_id"]) else {
        return Ok(Vec::new());
    };
    let limit = number_or(request.get("limit"), 20);
    let offset = number_or(request.get("offset"), 0);
    Ok(row_json::query_objects(
        db,
        "SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        &[&project_id, &limit, &offset],
    )?
    .into_iter()
    .map(snapshot_row)
    .collect())
}

// `getStateSnapshot(snapshotId)`.
pub fn get_snapshot(db: &Connection, snapshot_id: Option<&JsonValue>) -> Result<JsonValue, String> {
    let Some(id) = snapshot_id.filter(|id| js_truthy(id)) else {
        return Ok(JsonValue::Null);
    };
    let id = canonical::js_string(id);
    Ok(
        row_json::query_object(db, "SELECT * FROM snapshots WHERE snapshot_id = ?", &[&id])?
            .map_or(JsonValue::Null, snapshot_row),
    )
}

fn snapshot_records(blob: &JsonValue) -> Vec<JsonValue> {
    if let Some(records) = blob.as_array() {
        return records.clone();
    }
    ["records", "states", "state_current"]
        .iter()
        .find_map(|key| blob.get(*key).and_then(JsonValue::as_array).cloned())
        .unwrap_or_default()
}

/// The atome ids `restore_snapshot` writes back: a router checks each is the vault's own first.
pub fn restored_atome_ids(snapshot: &JsonValue) -> Vec<String> {
    snapshot_records(snapshot.get("state_blob").unwrap_or(&JsonValue::Null))
        .iter()
        .filter_map(|record| field_text(record, &["atome_id", "atomeId", "id"]))
        .collect()
}

// `restoreStateSnapshot`: the snapshot's states written back as `set` events.
pub fn restore_snapshot(
    db: &Connection,
    snapshot: &JsonValue,
    actor: &JsonValue,
    tx_id: Option<String>,
) -> Result<Vec<JsonValue>, String> {
    let snapshot_id = snapshot
        .get("snapshot_id")
        .map(canonical::js_string)
        .unwrap_or_default();
    let tx_id = tx_id.unwrap_or_else(|| format!("snapshot_restore_{snapshot_id}"));
    let actor = if actor.is_null() {
        snapshot.get("actor").cloned().unwrap_or(JsonValue::Null)
    } else {
        actor.clone()
    };
    let events: Vec<JsonValue> = snapshot_records(snapshot.get("state_blob").unwrap_or(&JsonValue::Null))
        .iter()
        .filter_map(|record| {
            let atome_id = field_text(record, &["atome_id", "atomeId", "id"])?;
            Some(json!({
                "kind": "set",
                "atome_id": atome_id,
                "project_id": field_text(record, &["project_id", "projectId"]).or_else(|| field_text(snapshot, &["project_id"])),
                "actor": actor,
                "payload": { "props": canonical::sanitize_properties(record.get("properties").unwrap_or(&JsonValue::Null)) },
            }))
        })
        .collect();
    if events.is_empty() {
        return Ok(Vec::new());
    }
    let options = AppendOptions {
        source: None,
        tx_id: Some(&tx_id),
        conflict_mode: ConflictMode::Interactive,
        stored_truth: true,
    };
    append::append_events(db, &events, &options)
}
