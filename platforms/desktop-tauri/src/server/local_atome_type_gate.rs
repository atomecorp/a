// ADOLE type gate on the Axum commit path — the same rules and error codes as the Fastify
// owner `atome/src/shared/atome_type_gate.js` (called by `database/adole_event_log.js`): a
// declared type must be known (`atome_type_unknown`), and a property must be declared by the
// atome's type, the one the event declares or else the stored one (`atome_property_unknown`).
// The types come from `eVe/registry/generated/atome_types.json`, generated from the JS owner
// (`npm run registry:build`), never from a list kept here.

use rusqlite::{Connection, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use super::super::local_atome_security::event_patch;
use super::EventRecord;

const ATOME_TYPES_JSON: &str = include_str!("../../../../eVe/registry/generated/atome_types.json");

struct AtomeTypeCatalog {
    type_unknown: String,
    property_unknown: String,
    envelope: HashSet<String>,
    ungated_kinds: HashSet<String>,
    // A type's declared properties; `None` when the type accepts any property.
    types: HashMap<String, Option<HashSet<String>>>,
}

fn strings(value: Option<&JsonValue>) -> HashSet<String> {
    value.and_then(JsonValue::as_array).map(|items| items.iter().filter_map(JsonValue::as_str).map(String::from).collect()).unwrap_or_default()
}

fn parse_catalog(text: &str) -> Result<AtomeTypeCatalog, String> {
    let document: JsonValue = serde_json::from_str(text).map_err(|error| format!("atome_types_json_invalid:{error}"))?;
    let error_code = |name: &str| document.pointer(&format!("/errors/{name}")).and_then(JsonValue::as_str).map(String::from)
        .ok_or_else(|| format!("atome_types_json_invalid:errors.{name}"));
    let types = document.get("types").and_then(JsonValue::as_object).ok_or("atome_types_json_invalid:types")?
        .iter()
        .map(|(name, entry)| {
            let open = entry.get("allow_unknown_properties").and_then(JsonValue::as_bool) != Some(false);
            (name.clone(), if open { None } else { Some(strings(entry.get("properties"))) })
        })
        .collect();
    Ok(AtomeTypeCatalog {
        type_unknown: error_code("type_unknown")?,
        property_unknown: error_code("property_unknown")?,
        envelope: strings(document.get("envelope_keys")),
        ungated_kinds: strings(document.get("ungated_kinds")),
        types,
    })
}

fn catalog() -> Result<&'static AtomeTypeCatalog, String> {
    static CATALOG: OnceLock<Result<AtomeTypeCatalog, String>> = OnceLock::new();
    CATALOG.get_or_init(|| parse_catalog(ATOME_TYPES_JSON)).as_ref().map_err(Clone::clone)
}

fn stored_type(conn: &Connection, atome_id: &str) -> Result<Option<String>, String> {
    conn.query_row("SELECT atome_type FROM atomes WHERE atome_id = ?1", [atome_id], |row| row.get::<_, Option<String>>(0))
        .optional().map(Option::flatten).map_err(|error| error.to_string())
}

/// Refuses an event whose declared type, or one of whose properties, is undeclared, before it is
/// stored. `batch_types` carries the types declared by the earlier events of the same batch.
pub(super) fn check_event(conn: &Connection, event: &EventRecord, batch_types: &mut HashMap<String, String>) -> Result<(), String> {
    let Some(patch) = event_patch(event) else { return Ok(()) };
    check_patch(conn, event.atome_id.as_deref().unwrap_or_default(), &event.kind, patch, batch_types)
}

/// The same refusal for a direct write outside the event log (the `atome` create, update and
/// alter messages): `declared_type` is the type the write stores, `None` keeps the stored one.
pub(super) fn check_write(conn: &Connection, atome_id: &str, declared_type: Option<&str>, properties: &JsonMap<String, JsonValue>) -> Result<(), String> {
    let mut patch = properties.clone();
    if let Some(declared) = declared_type { patch.insert("type".into(), JsonValue::String(declared.into())); }
    check_patch(conn, atome_id, "set", &patch, &mut HashMap::new())
}

fn check_patch(conn: &Connection, atome_id: &str, kind: &str, patch: &JsonMap<String, JsonValue>, batch_types: &mut HashMap<String, String>) -> Result<(), String> {
    let catalog = catalog()?;
    let declared = ["type", "atome_type"].iter().find_map(|key| patch.get(*key).and_then(JsonValue::as_str)).map(String::from);
    if let Some(declared) = declared.as_ref() {
        if !catalog.types.contains_key(declared) { return Err(catalog.type_unknown.clone()); }
        batch_types.insert(atome_id.to_string(), declared.clone());
    }
    if catalog.ungated_kinds.contains(&kind.to_lowercase()) { return Ok(()); }
    let resolved = match declared {
        Some(declared) => Some(declared),
        None => match batch_types.get(atome_id) { Some(known) => Some(known.clone()), None => stored_type(conn, atome_id)? },
    };
    let Some(Some(properties)) = resolved.and_then(|name| catalog.types.get(&name)) else { return Ok(()) };
    if patch.keys().any(|key| !catalog.envelope.contains(key) && !properties.contains(key)) {
        return Err(catalog.property_unknown.clone());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(atome_id: &str, kind: &str, props: JsonValue) -> EventRecord {
        EventRecord { id: "e".into(), ts: "t".into(), atome_id: Some(atome_id.into()), project_id: None, kind: kind.into(),
            payload: Some(json!({ "props": props })), actor: None, tx_id: None, gesture_id: None }
    }

    #[test]
    fn gate_follows_the_generated_types() {
        let conn = Connection::open_in_memory().expect("db");
        conn.execute_batch("CREATE TABLE atomes (atome_id TEXT PRIMARY KEY, atome_type TEXT);
            INSERT INTO atomes VALUES ('stored-shape', 'shape');").expect("schema");
        let mut batch = HashMap::new();
        assert_eq!(check_event(&conn, &event("a", "set", json!({ "type": "invented" })), &mut batch), Err("atome_type_unknown".into()));
        assert_eq!(check_event(&conn, &event("b", "set", json!({ "type": "shape", "invented_key": 1 })), &mut batch), Err("atome_property_unknown".into()));
        assert_eq!(check_event(&conn, &event("c", "set", json!({ "type": "shape", "left": "0px", "parent_id": "p" })), &mut batch), Ok(()));
        assert_eq!(check_event(&conn, &event("c", "set", json!({ "invented_key": 1 })), &mut batch), Err("atome_property_unknown".into()));
        assert_eq!(check_event(&conn, &event("stored-shape", "set", json!({ "invented_key": 1 })), &mut batch), Err("atome_property_unknown".into()));
        assert_eq!(check_event(&conn, &event("stored-shape", "set", json!({ "color": "red" })), &mut batch), Ok(()));
        assert_eq!(check_event(&conn, &event("stored-shape", "restore", json!({ "legacy_key": 1 })), &mut batch), Ok(()));
        assert_eq!(check_event(&conn, &event("unknown-atome", "set", json!({ "anything": 1 })), &mut batch), Ok(()));
        let props = |value: JsonValue| value.as_object().cloned().expect("object");
        assert_eq!(check_write(&conn, "d", Some("invented"), &props(json!({}))), Err("atome_type_unknown".into()));
        assert_eq!(check_write(&conn, "d", Some("shape"), &props(json!({ "invented_key": 1 }))), Err("atome_property_unknown".into()));
        assert_eq!(check_write(&conn, "d", Some("shape"), &props(json!({ "left": "0px", "type": "invented" }))), Ok(()));
        assert_eq!(check_write(&conn, "stored-shape", None, &props(json!({ "invented_key": 1 }))), Err("atome_property_unknown".into()));
        assert_eq!(check_write(&conn, "stored-shape", None, &props(json!({ "color": "red" }))), Ok(()));
    }
}
