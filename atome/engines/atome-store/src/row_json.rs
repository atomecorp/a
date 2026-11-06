// A row as better-sqlite3 hands it to Fastify: an object of its columns in their
// order, a later column of the same name replacing an earlier one, integers and
// reals as numbers, text as strings, NULL as null. The vault's replies are built
// on it, so they carry what Fastify's `SELECT *` carries.
use super::*;
use rusqlite::types::ValueRef;

pub fn row_object(row: &rusqlite::Row<'_>) -> rusqlite::Result<JsonMap<String, JsonValue>> {
    let statement = row.as_ref();
    let mut object = JsonMap::new();
    for index in 0..statement.column_count() {
        let value = match row.get_ref(index)? {
            ValueRef::Null => JsonValue::Null,
            ValueRef::Integer(number) => JsonValue::from(number),
            ValueRef::Real(number) => JsonValue::from(number),
            ValueRef::Text(bytes) => JsonValue::String(String::from_utf8_lossy(bytes).into_owned()),
            ValueRef::Blob(bytes) => {
                JsonValue::Array(bytes.iter().map(|byte| JsonValue::from(*byte)).collect())
            }
        };
        let name = statement.column_name(index)?.to_string();
        // A repeated name keeps its first place and takes the later value, as a JS object does.
        object.insert(name, value);
    }
    Ok(object)
}

// Every row of `sql` with `params`, as objects.
pub fn query_objects(
    db: &Connection,
    sql: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    let mut statement = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(params, row_object)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn query_object(
    db: &Connection,
    sql: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<Option<JsonMap<String, JsonValue>>, String> {
    Ok(query_objects(db, sql, params)?.into_iter().next())
}

// `JSON.parse(text)` of a stored column; text that is not JSON stays the text
// (the vault's `parseJson`), a missing value is null.
pub fn parse_stored(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(JsonValue::String(raw)) => {
            serde_json::from_str(raw).unwrap_or_else(|_| JsonValue::String(raw.clone()))
        }
        Some(other) => other.clone(),
        None => JsonValue::Null,
    }
}

// `safeParseJson` of adole_db_core.js: text that is not JSON reads as null.
pub fn parse_stored_strict(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(JsonValue::String(raw)) => serde_json::from_str(raw).unwrap_or(JsonValue::Null),
        Some(other) => other.clone(),
        None => JsonValue::Null,
    }
}
