//! `state-current` messages: the projection read of one atome (`get`); `list` lives in
//! `local_atome_state_current_list.rs`.
use super::*;

pub async fn handle_state_current_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    match action {
        "get" => handle_state_current_get(message, user_id, state, request_id).await,
        "list" => handle_state_current_list(message, user_id, state, request_id).await,
        _ => WsResponse {
            msg_type: "state-current-response".into(),
            request_id,
            success: false,
            error: Some(format!("Unknown action: {}", action)),
            data: None,
            atomes: None,
            count: None,
        },
    }
}

async fn handle_state_current_get(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let atome_id = match message
        .get("atome_id")
        .or_else(|| message.get("id"))
        .and_then(|v| v.as_str())
    {
        Some(id) => id,
        None => return error_response(request_id, "Missing atome_id"),
    };

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    // Same row as the Fastify read (database/adole_event_state_reads.js): the atome type comes from `atomes`.
    let row: Option<(String, Option<String>, Option<String>, Option<String>, String, i64, Option<String>, Option<String>, Option<String>)> = db
        .query_row(
            "SELECT sc.atome_id, sc.owner_id, sc.project_id, sc.properties, sc.updated_at, sc.version, a.parent_id, a.atome_type, a.created_at FROM state_current sc LEFT JOIN atomes a ON a.atome_id = sc.atome_id WHERE sc.atome_id = ?1",
            rusqlite::params![atome_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?)),
        )
        .optional()
        .unwrap_or(None);

    let state_payload = row.and_then(
        |(
            id,
            owner_id,
            project_id,
            properties,
            updated_at,
            version,
            parent_id,
            atome_type,
            created_at,
        )| {
            let properties = parse_json_value(properties.as_ref());
            let projected =
                atome_store::security::project_properties_for_read(&db, &id, user_id, &properties);
            let keys = projected
                .as_object()
                .map(|value| value.keys().cloned().collect::<Vec<_>>())
                .unwrap_or_default();
            if keys.is_empty() {
                return None;
            }
            Some(json!({
                "atome_id": id,
                "owner_id": owner_id,
                "project_id": project_id,
                "parent_id": parent_id,
                "atome_type": atome_type,
                "properties": projected,
                "capabilities": atome_store::security::project_capabilities_for_read(
                    &db, &id, user_id, keys.into_iter()
                ),
                "created_at": created_at,
                "updated_at": updated_at,
                "version": version
            }))
        },
    );

    let payload = json!({ "state": state_payload });
    WsResponse {
        msg_type: "state-current-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: None,
    }
}
