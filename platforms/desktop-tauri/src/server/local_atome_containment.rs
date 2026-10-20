// ADOLE event containment — the project an event belongs to (same rule as the
// Fastify owner `database/adole_event_containment.js`). An event's project is a
// fact of the atome's containment, never of the project the writing client has
// open. The client stamps every commit with its current project; that stamp only
// places a NEW atome that has no known container. The resolved project drives the
// event's stream and `state_current.project_id`.

use rusqlite::{Connection, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashSet;

use super::EventRecord;

fn is_project_type(value: Option<&str>) -> bool {
    value.is_some_and(|value| value.eq_ignore_ascii_case("project"))
}

fn patch_str<'a>(patch: &'a JsonMap<String, JsonValue>, key: &str) -> Option<&'a str> {
    patch.get(key).and_then(JsonValue::as_str).filter(|value| !value.is_empty())
}

// `type`/`atome_type` win unless generic, then `kind` (Fastify `resolveEventType`).
fn declared_type(patch: &JsonMap<String, JsonValue>) -> Option<&str> {
    let declared = patch_str(patch, "type").or_else(|| patch_str(patch, "atome_type"));
    match declared {
        Some(value) if !value.eq_ignore_ascii_case("generic") => Some(value),
        _ => patch_str(patch, "kind").or(declared),
    }
}

fn atome_row(db: &Connection, atome_id: &str) -> Result<Option<(Option<String>, Option<String>)>, String> {
    db.query_row(
        "SELECT atome_type, parent_id FROM atomes WHERE atome_id = ?1",
        [atome_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|error| error.to_string())
}

// Nearest project in the atome's parent chain (the atome itself included); an atome
// with no project ancestor keeps the project it was created in. `None`: unknown atome.
fn project_of_atome(db: &Connection, atome_id: &str) -> Result<Option<Option<String>>, String> {
    let mut visited = HashSet::new();
    let mut id = Some(atome_id.to_string());
    while let Some(current) = id {
        if !visited.insert(current.clone()) {
            break;
        }
        let Some((atome_type, parent_id)) = atome_row(db, &current)? else {
            break;
        };
        if is_project_type(atome_type.as_deref()) {
            return Ok(Some(Some(current)));
        }
        id = parent_id;
    }
    db.query_row("SELECT project_id FROM state_current WHERE atome_id = ?1", [atome_id], |row| row.get(0))
        .optional()
        .map_err(|error| error.to_string())
}

pub(super) fn resolve_event_project_id(db: &Connection, event: &EventRecord) -> Result<Option<String>, String> {
    let Some(atome_id) = event.atome_id.as_deref() else {
        return Ok(event.project_id.clone());
    };
    let patch = super::extract_event_patch(&event.kind, &event.payload, &event.ts).unwrap_or_default();
    let stored_type = atome_row(db, atome_id)?.and_then(|(atome_type, _)| atome_type);
    if is_project_type(declared_type(&patch)) || is_project_type(stored_type.as_deref()) {
        return Ok(Some(atome_id.to_string()));
    }
    let global_scope = event.payload.as_ref().and_then(|payload| payload.get("scope")).and_then(JsonValue::as_str) == Some("global");
    if global_scope {
        return Ok(None);
    }
    // A declared parent places the atome (creation or reparent); otherwise it stays where it is.
    let parent_id = super::event_parent_id(event)
        .or_else(|| patch_str(&patch, "parent_id"))
        .or_else(|| patch_str(&patch, "parentId"));
    for anchor in [parent_id, Some(atome_id)].into_iter().flatten() {
        if let Some(project) = project_of_atome(db, anchor)? {
            return Ok(project);
        }
    }
    Ok(event.project_id.clone())
}

#[cfg(test)]
#[path = "../../../../tests/tauri/local_atome_containment.rs"]
mod tests;
