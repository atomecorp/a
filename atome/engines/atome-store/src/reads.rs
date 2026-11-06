// Reads of the `events` log and the `state_current` projection, as Fastify's
// database/adole_event_state_reads.js answers them: the same filters, the same
// order, the same row shapes.
use super::*;
use row_json::{parse_stored_strict, query_object, query_objects};
use rusqlite::types::Value as SqlValue;

// `Number(value)` of JavaScript for a request field (NaN as None).
pub fn js_number_of(value: Option<&JsonValue>) -> Option<f64> {
    match value? {
        JsonValue::Null => Some(0.0),
        JsonValue::Bool(flag) => Some(f64::from(u8::from(*flag))),
        JsonValue::Number(number) => number.as_f64(),
        JsonValue::String(text) if text.trim().is_empty() => Some(0.0),
        JsonValue::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

// `Number(value) || fallback`.
pub fn number_or(value: Option<&JsonValue>, fallback: i64) -> i64 {
    match js_number_of(value) {
        Some(number) if number != 0.0 && number.is_finite() => number as i64,
        _ => fallback,
    }
}

// A request field read as JS reads `a || b`: the first truthy one, as text.
pub fn field<'a>(payload: &'a JsonValue, keys: &[&str]) -> Option<&'a JsonValue> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find(|value| js_truthy(value))
}

pub fn field_text(payload: &JsonValue, keys: &[&str]) -> Option<String> {
    field(payload, keys).map(canonical::js_string)
}

fn event_row(mut row: JsonMap<String, JsonValue>) -> JsonValue {
    for key in ["payload", "actor"] {
        let value = parse_stored_strict(row.get(key));
        row.insert(key.into(), value);
    }
    JsonValue::Object(row)
}

pub struct EventFilter {
    pub project_id: Option<String>,
    pub atome_id: Option<String>,
    pub tx_id: Option<String>,
    pub gesture_id: Option<String>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub limit: i64,
    pub offset: i64,
    pub descending: bool,
}

// `listEvents(options)`.
pub fn list_events(db: &Connection, filter: &EventFilter) -> Result<Vec<JsonValue>, String> {
    let mut conditions = Vec::new();
    let mut params: Vec<SqlValue> = Vec::new();
    for (column, value) in [
        ("project_id = ?", &filter.project_id),
        ("atome_id = ?", &filter.atome_id),
        ("tx_id = ?", &filter.tx_id),
        ("gesture_id = ?", &filter.gesture_id),
        ("ts >= ?", &filter.since),
        ("ts <= ?", &filter.until),
    ] {
        if let Some(value) = value {
            conditions.push(column);
            params.push(SqlValue::Text(value.clone()));
        }
    }
    let condition = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    let order = if filter.descending { "DESC" } else { "ASC" };
    params.push(SqlValue::Integer(filter.limit));
    params.push(SqlValue::Integer(filter.offset));
    let sql = format!("SELECT * FROM events {condition} ORDER BY ts {order} LIMIT ? OFFSET ?");
    let refs: Vec<&dyn rusqlite::ToSql> =
        params.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    Ok(query_objects(db, &sql, &refs)?
        .into_iter()
        .map(event_row)
        .collect())
}

// `getEvent(id)`.
pub fn get_event(db: &Connection, event_id: Option<&str>) -> Result<JsonValue, String> {
    let Some(id) = event_id.filter(|id| !id.is_empty()) else {
        return Ok(JsonValue::Null);
    };
    Ok(
        query_object(db, "SELECT * FROM events WHERE id = ?", &[&id])?
            .map_or(JsonValue::Null, event_row),
    )
}

fn projected(row: &JsonMap<String, JsonValue>) -> JsonValue {
    let text = |key: &str| row.get(key).and_then(JsonValue::as_str);
    canonical::project_stored_state(&canonical::StoredState {
        atome_id: text("atome_id").unwrap_or(""),
        atome_type: text("atome_type"),
        properties: text("properties"),
        owner_id: text("owner_id"),
        parent_id: text("parent_id"),
        project_id: text("project_id"),
        created_at: text("created_at"),
        updated_at: text("updated_at"),
        version: row.get("version").and_then(JsonValue::as_i64),
    })
}

// `getStateCurrent(atomeId)`: the canonical atome, or null.
pub fn get_state_current(db: &Connection, atome_id: Option<&str>) -> Result<JsonValue, String> {
    let Some(id) = atome_id.filter(|id| !id.is_empty()) else {
        return Ok(JsonValue::Null);
    };
    let row = query_object(
        db,
        "SELECT sc.*, a.atome_type, a.parent_id, a.created_at AS created_at
         FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id
         WHERE sc.atome_id = ?",
        &[&id],
    )?;
    Ok(row.as_ref().map_or(JsonValue::Null, projected))
}

pub struct StateFilter {
    pub project_id: Option<String>,
    pub owner_id: Option<String>,
    pub atome_type: Option<String>,
    pub exclude_system: bool,
    pub include_deleted: bool,
    pub limit: i64,
    pub offset: i64,
    pub oldest: bool,
    // `{ updated_at, atome_id }` of the last state received (oldest-first walk).
    pub after: Option<(String, String)>,
}

// `listStateCurrent(projectId, options)` of one vault (its own states only).
pub fn list_state_current(db: &Connection, filter: &StateFilter) -> Result<Vec<JsonValue>, String> {
    let mut conditions: Vec<&str> = Vec::new();
    let mut params: Vec<SqlValue> = Vec::new();
    if !filter.include_deleted {
        conditions.push("a.deleted_at IS NULL");
        conditions.push("COALESCE(json_extract(sc.properties, '$.__deleted'), 0) <> 1");
    }
    if let Some(project) = &filter.project_id {
        conditions.push("sc.project_id = ?");
        params.push(SqlValue::Text(project.clone()));
    }
    if let Some(atome_type) = filter
        .atome_type
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
    {
        // Each term matches one schema expression index: no JSON decode of the whole table.
        conditions.push(
            "(sc.atome_id IN (SELECT atome_id FROM atomes WHERE LOWER(COALESCE(atome_type, '')) = ?)
             OR LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) = ?
             OR LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) = ?)",
        );
        let lowered = atome_type.to_lowercase();
        for _ in 0..3 {
            params.push(SqlValue::Text(lowered.clone()));
        }
    }
    if let Some(owner) = &filter.owner_id {
        conditions.push(
            "(COALESCE(sc.owner_id, a.owner_id) = ? OR COALESCE(sc.owner_id, a.owner_id) IS NULL)",
        );
        params.push(SqlValue::Text(owner.clone()));
    }
    if filter.exclude_system {
        conditions.push("LOWER(COALESCE(a.atome_type, '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')");
        conditions.push("LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')");
        conditions.push("LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')");
        conditions.push(
            "LOWER(sc.atome_id) NOT LIKE 'tool.ui.%' AND LOWER(sc.atome_id) NOT LIKE 'tool_ui.%'",
        );
    }
    let mut condition = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    // `order: 'oldest'` walks the states oldest change first, from after the cursor.
    let after = filter.after.as_ref().filter(|_| filter.oldest);
    if let Some((updated_at, atome_id)) = after {
        condition = format!(
            "{} (COALESCE(sc.updated_at, '') > ? OR (COALESCE(sc.updated_at, '') = ? AND sc.atome_id > ?))",
            if condition.is_empty() {
                "WHERE".to_string()
            } else {
                format!("{condition} AND")
            }
        );
        params.push(SqlValue::Text(updated_at.clone()));
        params.push(SqlValue::Text(updated_at.clone()));
        params.push(SqlValue::Text(atome_id.clone()));
    }
    let order = if filter.oldest {
        "COALESCE(sc.updated_at, '') ASC, sc.atome_id ASC"
    } else {
        "sc.updated_at DESC, sc.atome_id"
    };
    params.push(SqlValue::Integer(filter.limit));
    params.push(SqlValue::Integer(if filter.oldest {
        0
    } else {
        filter.offset
    }));
    // The page is chosen on ids only: whole rows would spill to a temporary file per page.
    let sql = format!(
        "SELECT sc.*, a.atome_type AS atome_type, a.parent_id AS parent_id, a.created_at AS created_at,
                COALESCE(sc.owner_id, a.owner_id) AS owner_id
         FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id
         WHERE sc.atome_id IN (
             SELECT sc.atome_id FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id {condition}
             GROUP BY sc.atome_id ORDER BY {order} LIMIT ? OFFSET ?)
         ORDER BY {order}"
    );
    let refs: Vec<&dyn rusqlite::ToSql> =
        params.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    Ok(query_objects(db, &sql, &refs)?
        .iter()
        .map(projected)
        .collect())
}
