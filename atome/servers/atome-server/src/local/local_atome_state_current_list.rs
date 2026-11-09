// The `state_current` list of the local host: the rows a person may read, one page at a
// time, under the canonical `properties` shape with their capability projection.
use super::*;

pub(super) async fn handle_state_current_list(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let project_id = message.get("project_id").and_then(|v| v.as_str());
    let atome_type = message
        .get("atome_type")
        .or_else(|| message.get("atomeType"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let limit = message
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(1000);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    let include_total = message
        .get("include_total")
        .or_else(|| message.get("includeTotal"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let exclude_system = message
        .get("exclude_system")
        .or_else(|| message.get("excludeSystem"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    // Same contract as the Fastify list (database/adole.js): a deleted Atome
    // (tombstone) is listed only on request.
    let include_deleted = message
        .get("include_deleted")
        .or_else(|| message.get("includeDeleted"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    // Metadata-only reads (a catalogue, a project list) leave their heavy particles
    // (a preview, a waveform) on the device: the rows travel without them.
    let excluded_particle_keys: HashSet<String> = message
        .get("exclude_particle_keys")
        .or_else(|| message.get("excludeParticleKeys"))
        .and_then(JsonValue::as_array)
        .map(|keys| {
            keys.iter()
                .filter_map(JsonValue::as_str)
                .map(str::trim)
                .filter(|key| !key.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // A project or a type already chooses a few rows by index: each is then checked against
    // its own permissions. Listing every readable id first (1.5 million permission rows on
    // an iPhone account) cost 16 s for 365 records, under the database lock.
    let narrowed = project_id.is_some() || atome_type.is_some();
    let readable = if narrowed {
        "(sc.owner_id = ? OR EXISTS (
            SELECT 1 FROM permissions p
            WHERE p.atome_id = sc.atome_id AND p.principal_id = ? AND p.can_read = 1
        ))"
    } else {
        "(sc.owner_id = ? OR sc.atome_id IN (
            SELECT p.atome_id FROM permissions p
            WHERE p.principal_id = ? AND p.can_read = 1
        ))"
    };
    let mut conditions = vec![readable.to_string()];
    let mut scope_params = vec![
        rusqlite::types::Value::from(user_id.to_string()),
        rusqlite::types::Value::from(user_id.to_string()),
    ];
    if let Some(pid) = project_id {
        conditions.insert(0, "sc.project_id = ?".to_string());
        scope_params.insert(0, rusqlite::types::Value::from(pid.to_string()));
    }
    if let Some(kind) = atome_type {
        conditions.push(
            // Each term reads one schema expression index; their union drives the query, so no
            // other row is decoded.
            "sc.atome_id IN (SELECT atome_id FROM atomes WHERE LOWER(COALESCE(atome_type, '')) = ? UNION SELECT atome_id FROM state_current WHERE LOWER(COALESCE(json_extract(properties, '$.type'), '')) = ? UNION SELECT atome_id FROM state_current WHERE LOWER(COALESCE(json_extract(properties, '$.kind'), '')) = ?)".to_string()
        );
        if kind == "tool" {
            // The activity-selection tools are derived from the activity list at run time;
            // older builds persisted thousands of them. Their history stays, but they are
            // never the durable tool catalogue.
            conditions.push("LOWER(sc.atome_id) NOT LIKE 'tool_ui.activity.select.%'".to_string());
        }
        scope_params.push(rusqlite::types::Value::from(kind.clone()));
        scope_params.push(rusqlite::types::Value::from(kind.clone()));
        scope_params.push(rusqlite::types::Value::from(kind));
    }
    if !include_deleted {
        conditions.push("a.deleted_at IS NULL".to_string());
        conditions.push("COALESCE(json_extract(sc.properties, '$.__deleted'), 0) <> 1".to_string());
    }
    if exclude_system {
        conditions.push("LOWER(COALESCE(a.atome_type, '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')".to_string());
        conditions.push("LOWER(COALESCE(json_extract(sc.properties, '$.type'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')".to_string());
        conditions.push("LOWER(COALESCE(json_extract(sc.properties, '$.kind'), '')) NOT IN ('project','user','blackhole','tool','tool_macro','toolbox','tool_block','panel','system')".to_string());
        conditions.push(
            "LOWER(sc.atome_id) NOT LIKE 'tool.ui.%' AND LOWER(sc.atome_id) NOT LIKE 'tool_ui.%'"
                .to_string(),
        );
    }
    let where_clause = format!(" WHERE {}", conditions.join(" AND "));
    // The page is chosen on ids only: sorting whole rows spilled OFFSET + LIMIT
    // `properties` blobs to a temporary file for every page.
    let query = format!(
        "SELECT sc.atome_id, sc.owner_id, sc.project_id, sc.properties, sc.updated_at, sc.version, a.parent_id, a.atome_type, a.created_at FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id WHERE sc.atome_id IN (SELECT sc.atome_id FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id{} ORDER BY sc.updated_at DESC, sc.atome_id LIMIT ? OFFSET ?) ORDER BY sc.updated_at DESC, sc.atome_id",
        where_clause
    );
    let mut params = scope_params;
    params.push(rusqlite::types::Value::from(limit));
    params.push(rusqlite::types::Value::from(offset));

    let mut stmt = match db.prepare(&query) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            let properties: Option<String> = row.get(3)?;
            Ok(json!({
                "atome_id": row.get::<_, String>(0)?,
                "owner_id": row.get::<_, Option<String>>(1)?,
                "project_id": row.get::<_, Option<String>>(2)?,
                "parent_id": row.get::<_, Option<String>>(6)?,
                "atome_type": row.get::<_, Option<String>>(7)?,
                "properties": parse_json_value(properties.as_ref()),
                "created_at": row.get::<_, Option<String>>(8)?,
                "updated_at": row.get::<_, String>(4)?,
                "version": row.get::<_, i64>(5)?
            }))
        })
        .map_err(|e| e.to_string());

    let states = match rows {
        Ok(iter) => iter
            .filter_map(|row| row.ok())
            .filter_map(|mut current| {
                let atome_id = current.get("atome_id")?.as_str()?.to_string();
                let projected = atome_store::security::project_properties_for_read(
                    &db,
                    &atome_id,
                    user_id,
                    current.get("properties").unwrap_or(&JsonValue::Null),
                );
                let mut projected = projected;
                let properties = projected.as_object_mut()?;
                if properties.is_empty() {
                    return None;
                }
                properties.retain(|key, _| !excluded_particle_keys.contains(key));
                let keys = properties.keys().cloned().collect::<Vec<_>>();
                current["properties"] = projected;
                current["capabilities"] = atome_store::security::project_capabilities_for_read(
                    &db,
                    &atome_id,
                    user_id,
                    keys.into_iter(),
                );
                Some(current)
            })
            .collect::<Vec<_>>(),
        Err(e) => return error_response(request_id, &e),
    };
    let total = states.len() as i64;

    let payload = if include_total {
        json!({ "states": states, "total": total })
    } else {
        json!({ "states": states })
    };
    WsResponse {
        msg_type: "state-current-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: include_total.then_some(total),
    }
}

#[cfg(test)]
#[path = "local_atome_state_current_list_tests.rs"]
mod tests;
