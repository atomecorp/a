// ADOLE type gate of the event commit (`append.rs`) — the same rules and error codes as the Fastify
// owner `atome/src/shared/atome_type_gate.js` (called by `database/adole_event_log.js`): a
// declared type must be known (`atome_type_unknown`), and a property must be declared by the
// atome's type, the one the event declares or else the stored one (`atome_property_unknown`); and a
// project `set` aimed at an atome held nowhere must say what it creates, its type or kind
// (`atome_set_target_missing`), so a partial write never creates a typeless ghost atome.
// The types come from `eVe/registry/generated/atome_types.json`, generated from the JS owner
// (`npm run registry:build`), never from a list kept here.

use rusqlite::{Connection, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

pub const ATOME_TYPES_JSON: &str =
    include_str!("../../../../eVe/registry/generated/atome_types.json");

pub struct AtomeTypeCatalog {
    type_unknown: String,
    property_unknown: String,
    set_target_missing: String,
    envelope: HashSet<String>,
    ungated_kinds: HashSet<String>,
    // A type's declared properties; `None` when the type accepts any property.
    types: HashMap<String, Option<HashSet<String>>>,
}

pub fn strings(value: Option<&JsonValue>) -> HashSet<String> {
    value
        .and_then(JsonValue::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(JsonValue::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_catalog(text: &str) -> Result<AtomeTypeCatalog, String> {
    let document: JsonValue =
        serde_json::from_str(text).map_err(|error| format!("atome_types_json_invalid:{error}"))?;
    let error_code = |name: &str| {
        document
            .pointer(&format!("/errors/{name}"))
            .and_then(JsonValue::as_str)
            .map(String::from)
            .ok_or_else(|| format!("atome_types_json_invalid:errors.{name}"))
    };
    let types = document
        .get("types")
        .and_then(JsonValue::as_object)
        .ok_or("atome_types_json_invalid:types")?
        .iter()
        .map(|(name, entry)| {
            let open = entry
                .get("allow_unknown_properties")
                .and_then(JsonValue::as_bool)
                != Some(false);
            (
                name.clone(),
                if open {
                    None
                } else {
                    Some(strings(entry.get("properties")))
                },
            )
        })
        .collect();
    Ok(AtomeTypeCatalog {
        type_unknown: error_code("type_unknown")?,
        property_unknown: error_code("property_unknown")?,
        set_target_missing: error_code("set_target_missing")?,
        envelope: strings(document.get("envelope_keys")),
        ungated_kinds: strings(document.get("ungated_kinds")),
        types,
    })
}

pub fn catalog() -> Result<&'static AtomeTypeCatalog, String> {
    static CATALOG: OnceLock<Result<AtomeTypeCatalog, String>> = OnceLock::new();
    CATALOG
        .get_or_init(|| parse_catalog(ATOME_TYPES_JSON))
        .as_ref()
        .map_err(Clone::clone)
}

pub fn stored_type(conn: &Connection, atome_id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT atome_type FROM atomes WHERE atome_id = ?1",
        [atome_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(Option::flatten)
    .map_err(|error| error.to_string())
}

/// `assertKnownAtomeType`: a declared type must be one of the generated types.
pub fn assert_known_type(name: &str) -> Result<(), String> {
    let catalog = catalog()?;
    if catalog.types.contains_key(name) {
        Ok(())
    } else {
        Err(catalog.type_unknown.clone())
    }
}

/// `assertKnownAtomeProperties`: every key of `patch` is an envelope field or a property the type declares.
pub fn assert_known_properties(
    name: &str,
    patch: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    let catalog = catalog()?;
    let Some(Some(properties)) = catalog.types.get(name) else {
        return Ok(());
    };
    if patch
        .keys()
        .any(|key| !catalog.envelope.contains(key) && !properties.contains(key))
    {
        return Err(catalog.property_unknown.clone());
    }
    Ok(())
}

/// Whether the store holds `atome_id` at all, in its envelope or its projection.
pub fn atome_exists(conn: &Connection, atome_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM atomes WHERE atome_id = ?1)
            OR EXISTS (SELECT 1 FROM state_current WHERE atome_id = ?1)",
        [atome_id],
        |row| row.get::<_, bool>(0),
    )
    .map_err(|error| error.to_string())
}

/// `assertSetTargetDeclared`: a `set` into a project, on an atome held nowhere, names its type or kind.
/// `target_exists` is asked last, only for a typeless project `set`: the store is read for that case
/// alone, not for every event of a replay.
pub fn assert_set_target_declared(
    kind: &str,
    patch: &JsonMap<String, JsonValue>,
    declared: bool,
    in_project: bool,
    target_exists: impl FnOnce() -> Result<bool, String>,
) -> Result<(), String> {
    if !in_project || !kind.eq_ignore_ascii_case("set") || declared {
        return Ok(());
    }
    let names = |key: &str| match patch.get(key) {
        None | Some(JsonValue::Null) => false,
        Some(JsonValue::String(text)) => !text.trim().is_empty(),
        Some(_) => true,
    };
    if ["type", "atome_type", "kind"].iter().any(|key| names(key)) || target_exists()? {
        return Ok(());
    }
    Err(catalog()?.set_target_missing.clone())
}

/// The kinds that write no new property (`ATOME_UNGATED_EVENT_KINDS`).
pub fn is_ungated_kind(kind: &str) -> Result<bool, String> {
    Ok(catalog()?.ungated_kinds.contains(kind))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::append::{AppendOptions, ConflictMode, append_events};
    use serde_json::json;

    // The gate as the commit runs it: a declared type, else the stored one.
    #[test]
    fn gate_follows_the_generated_types() {
        let db = Connection::open_in_memory().expect("db");
        crate::prepare_schema(&db).expect("schema");
        db.execute_batch(
            "INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES ('owner', 'user', 'owner', 'owner');
             INSERT INTO atomes (atome_id, atome_type, owner_id, creator_id) VALUES ('stored-shape', 'shape', 'owner', 'owner');",
        )
        .expect("stored shape");
        let options = AppendOptions {
            source: None,
            tx_id: None,
            conflict_mode: ConflictMode::Interactive,
            stored_truth: false,
        };
        let mut sequence = 0;
        let mut commit = |atome_id: &str, kind: &str, props: JsonValue| {
            sequence += 1;
            let event = json!({ "id": format!("e{sequence}"), "atome_id": atome_id, "kind": kind,
                "project_id": "p", "actor": { "type": "user", "id": "owner" }, "payload": { "props": props } });
            append_events(&db, &[event], &options).map(|_| ())
        };
        assert_eq!(
            commit("a", "set", json!({ "type": "invented" })),
            Err("atome_type_unknown".into())
        );
        assert_eq!(
            commit("b", "set", json!({ "type": "shape", "invented_key": 1 })),
            Err("atome_property_unknown".into())
        );
        assert_eq!(
            commit(
                "c",
                "set",
                json!({ "type": "shape", "left": "0px", "parent_id": "p" })
            ),
            Ok(())
        );
        assert_eq!(
            commit("c", "set", json!({ "invented_key": 1 })),
            Err("atome_property_unknown".into())
        );
        assert_eq!(
            commit("stored-shape", "set", json!({ "invented_key": 1 })),
            Err("atome_property_unknown".into())
        );
        assert_eq!(
            commit("stored-shape", "set", json!({ "color": "red" })),
            Ok(())
        );
        assert_eq!(
            commit("stored-shape", "delete", json!({ "legacy_key": 1 })),
            Ok(())
        );
        // A partial write on an atome held nowhere would create a typeless ghost: refused.
        assert_eq!(
            commit("unknown-atome", "set", json!({ "left": 116, "top": 52 })),
            Err("atome_set_target_missing".into())
        );
        assert_eq!(
            commit("unknown-atome", "set", json!({ "kind": "video_recording" })),
            Ok(())
        );
        assert_eq!(
            commit("unknown-atome", "set", json!({ "left": 116 })),
            Ok(())
        );
        // Account-global and project-less records keep their own rules.
        let global = json!({ "id": "e-global", "atome_id": "pref", "kind": "set", "scope": "global",
            "project_id": "p", "actor": { "type": "user", "id": "owner" }, "payload": { "props": { "anything": 1 } } });
        assert!(append_events(&db, &[global], &options).is_ok());
        let loose = json!({ "id": "e-loose", "atome_id": "loose", "kind": "set",
            "actor": { "type": "user", "id": "owner" }, "payload": { "props": { "label": "x" } } });
        assert!(append_events(&db, &[loose], &options).is_ok());
    }
}
