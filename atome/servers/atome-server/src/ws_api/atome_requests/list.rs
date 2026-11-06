// The `atome` `list` of /ws/api (server/ws_api_atome_list.js, ported): the atomes `requester` owns,
// is granted to read or awaits as their pending owner, newest first, each with its particles read
// from one concatenated column, kept when the requester may read the atome or one of its current
// properties, an atome of someone else shown with only the properties the requester may read, the
// excluded particle keys left out. The requester is always known here, so Fastify's listing of
// every atome of a type for no one is never reached.
use super::reads::{any_readable, bound, parsed, particles, readable_properties};
use crate::social::news::db::all;
use crate::vault_router::js;
use rusqlite::{Connection, ToSql};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

// The row fields an atome of the list starts with.
const FIELDS: [&str; 8] = [
    "atome_id",
    "atome_type",
    "parent_id",
    "owner_id",
    "creator_id",
    "created_at",
    "updated_at",
    "deleted_at",
];

// `exclude_particle_keys`: each `String(key || '').trim()`, the empty ones dropped, once each.
fn excluded_keys(message: &JsonValue) -> Vec<String> {
    let mut excluded: Vec<String> = Vec::new();
    for key in message
        .get("exclude_particle_keys")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
    {
        let key = if js::truthy(Some(key)) {
            js::trim(&js::text(Some(key))).to_string()
        } else {
            String::new()
        };
        if !key.is_empty() && !excluded.contains(&key) {
            excluded.push(key);
        }
    }
    excluded
}

// A listed row: its fields, then each `key:value` of `particles_raw` read back from JSON.
fn listed(row: &JsonValue) -> JsonMap<String, JsonValue> {
    let mut atome: JsonMap<String, JsonValue> = FIELDS
        .iter()
        .map(|field| (field.to_string(), row[*field].clone()))
        .collect();
    if let Some(raw) = row["particles_raw"].as_str() {
        for pair in raw.split("||") {
            if let Some(colon) = pair.find(':').filter(|colon| *colon > 0) {
                let value = JsonValue::String(pair[colon + 1..].to_string());
                atome.insert(pair[..colon].to_string(), parsed(&value));
            }
        }
    }
    atome
}

/// The atomes `requester` lists with `message`.
pub(super) fn list(
    db: &Connection,
    message: &JsonValue,
    requester: &str,
) -> Result<Vec<JsonValue>, String> {
    let excluded = excluded_keys(message);
    let exclusion = if excluded.is_empty() {
        String::new()
    } else {
        format!(
            "AND p.particle_key NOT IN ({})",
            vec!["?"; excluded.len()].join(", ")
        )
    };
    let deleted = if js::truthy(message.get("include_deleted")) {
        ""
    } else {
        "AND a.deleted_at IS NULL"
    };
    let atome_type = message
        .get("atome_type")
        .filter(|kind| js::truthy(Some(kind)));
    let sql = format!(
        "SELECT a.*, GROUP_CONCAT(p.particle_key || ':' || p.particle_value, '||') as particles_raw
         FROM atomes a
         LEFT JOIN particles p ON a.atome_id = p.atome_id {exclusion}
         LEFT JOIN permissions perm
           ON perm.atome_id = a.atome_id
          AND perm.principal_id = ?
          AND perm.can_read = 1
          AND (perm.expires_at IS NULL OR perm.expires_at > datetime('now'))
         WHERE (a.owner_id = ? OR perm.permission_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM particles p2
             WHERE p2.atome_id = a.atome_id
               AND p2.particle_key = '_pending_owner_id'
               AND p2.particle_value = ?
           ))
           {deleted}
           {}
         GROUP BY a.atome_id
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?",
        if atome_type.is_some() {
            "AND a.atome_type = ?"
        } else {
            ""
        }
    );
    let pending = JsonValue::from(requester).to_string();
    let mut values: Vec<rusqlite::types::Value> = excluded
        .iter()
        .map(|key| rusqlite::types::Value::Text(key.clone()))
        .collect();
    for owner in [requester, requester, &pending] {
        values.push(rusqlite::types::Value::Text(owner.to_string()));
    }
    if atome_type.is_some() {
        values.push(bound(atome_type)?);
    }
    let paging = |name: &str, default: JsonValue| {
        bound(Some(
            message
                .get(name)
                .filter(|value| js::truthy(Some(value)))
                .unwrap_or(&default),
        ))
    };
    values.push(paging("limit", json!(100))?);
    values.push(paging("offset", json!(0))?);
    let refs: Vec<&dyn ToSql> = values.iter().map(|value| value as &dyn ToSql).collect();
    let mut atomes = Vec::new();
    for row in all(db, &sql, &refs)? {
        let atome = listed(&row);
        let Some(id) = atome.get("atome_id").filter(|id| js::truthy(Some(id))) else {
            continue;
        };
        if any_readable(db, &js::string(id), requester)? {
            atomes.push(atome);
        }
    }
    let mut shown = Vec::new();
    for atome in atomes {
        let owner = atome
            .get("owner_id")
            .filter(|owner| js::truthy(Some(owner)));
        if owner.is_some_and(|owner| js::text(Some(owner)) == requester) {
            shown.push(atome);
            continue;
        }
        let id = bound(atome.get("atome_id"))?;
        let properties = readable_properties(db, &id, particles(db, &id)?, requester)?;
        if properties.is_empty() {
            continue;
        }
        let mut projected: JsonMap<String, JsonValue> = FIELDS
            .iter()
            .filter_map(|field| Some((field.to_string(), atome.get(*field)?.clone())))
            .collect();
        projected.extend(properties.clone());
        projected.insert("properties".into(), JsonValue::Object(properties));
        shown.push(projected);
    }
    Ok(shown
        .into_iter()
        .map(|mut atome| {
            for key in &excluded {
                atome.shift_remove(key);
                for nested in ["data", "properties", "particles"] {
                    if let Some(JsonValue::Object(inner)) = atome.get_mut(nested) {
                        inner.shift_remove(key);
                    }
                }
            }
            JsonValue::Object(atome)
        })
        .collect())
}
