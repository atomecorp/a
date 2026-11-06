// The readings the News, communities and forums kept from Fastify (`text`, `parseJson`)
// and their statements on the central database, each a row as Fastify's driver hands it.
use crate::vault_router::central::row_json;
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension, ToSql};
use serde_json::Value as JsonValue;

/// `String(value == null ? '' : value).trim()`.
pub fn text(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::trim(&js::text(Some(value))).to_string(),
    }
}

/// `parseJson(value, fallback)`: a stored JSON text, the fallback when empty or unreadable.
pub fn parsed(value: Option<&JsonValue>, fallback: JsonValue) -> JsonValue {
    match value {
        Some(JsonValue::String(raw)) if !raw.is_empty() => {
            serde_json::from_str(raw).unwrap_or(fallback)
        }
        _ => fallback,
    }
}

pub fn get(db: &Connection, sql: &str, values: &[&dyn ToSql]) -> Result<Option<JsonValue>, String> {
    db.prepare_cached(sql)
        .and_then(|mut statement| statement.query_row(values, row_json).optional())
        .map_err(|e| e.to_string())
}

pub fn all(db: &Connection, sql: &str, values: &[&dyn ToSql]) -> Result<Vec<JsonValue>, String> {
    let mut statement = db.prepare_cached(sql).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(values, row_json)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

pub fn run(db: &Connection, sql: &str, values: &[&dyn ToSql]) -> Result<usize, String> {
    db.prepare_cached(sql)
        .and_then(|mut statement| statement.execute(values))
        .map_err(|e| e.to_string())
}

/// `{ ...publication, id }` of a stored payload.
pub fn with_id(publication: &JsonValue, id: &str) -> JsonValue {
    js::with(publication, [("id", JsonValue::from(id))])
}
