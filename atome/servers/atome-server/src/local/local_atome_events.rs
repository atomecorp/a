//! `events` messages: commit, commit batch and list, through the store's one commit.
use super::*;

pub async fn handle_events_message(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let action = message.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let request_id = message
        .get("requestId")
        .and_then(|v| v.as_str())
        .map(String::from);

    if matches!(action, "commit" | "commit-batch") && should_dedupe_request_id(state, &request_id) {
        sync_debug(&format!(
            "dedupe events action={} request_id={:?} user_id={}",
            action, request_id, user_id
        ));
        return WsResponse {
            msg_type: "events-response".into(),
            request_id,
            success: true,
            error: None,
            data: None,
            atomes: None,
            count: None,
        };
    }

    match action {
        "commit" => handle_event_commit(message, user_id, state, request_id).await,
        "commit-batch" => handle_event_commit_batch(message, user_id, state, request_id).await,
        "list" => handle_event_list(message, user_id, state, request_id).await,
        _ => WsResponse {
            msg_type: "events-response".into(),
            request_id,
            success: false,
            error: Some(format!("Unknown action: {}", action)),
            data: None,
            atomes: None,
            count: None,
        },
    }
}

pub(crate) fn events_response(request_id: Option<String>, data: JsonValue) -> WsResponse {
    WsResponse {
        msg_type: "events-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(data),
        atomes: None,
        count: None,
    }
}

// Commits `events` for `user_id` through the store's one commit, queues them for
// sync and tells the views. Returns each event as recorded.
fn commit_message_events(
    message: &JsonValue,
    events: &[JsonValue],
    tx_id: Option<&str>,
    user_id: &str,
    state: &LocalAtomeState,
) -> Result<Vec<JsonValue>, String> {
    let options = append::AppendOptions {
        source: Some("tauri"),
        tx_id,
        conflict_mode: append::ConflictMode::Interactive,
        stored_truth: false,
    };
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let committed = with_transaction(&db, |conn| {
        let committed = match commit_events(conn, events, user_id, &options)? {
            CommitOutcome::Committed(committed) => committed,
            CommitOutcome::Refused { decision, .. } => return Err(decision.reason.to_string()),
        };
        queue_committed_events(conn, message, &committed)?;
        Ok(committed)
    })?;
    announce_committed_events(&db, &committed);
    // A media deleted here: its local bytes go too (local_atome_media_removal.rs, D36).
    crate::local::local_atome_media_removal::remove_deleted_media(
        &db,
        state.storage_root(),
        committed
            .iter()
            .filter(|event| event.get("kind").and_then(JsonValue::as_str) == Some("delete"))
            .filter_map(|event| event.get("atome_id").and_then(JsonValue::as_str)),
    )?;
    Ok(committed)
}

async fn handle_event_commit(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let Some(event) = message.get("event").cloned() else {
        return error_response(request_id, "Missing event payload");
    };
    match commit_message_events(&message, &[event], None, user_id, state) {
        Ok(mut committed) => events_response(request_id, json!({ "event": committed.remove(0) })),
        Err(error) => error_response(request_id, &error),
    }
}

async fn handle_event_commit_batch(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let events = match message.get("events").or_else(|| message.get("event")) {
        Some(JsonValue::Array(list)) => list.clone(),
        _ => return error_response(request_id, "Missing events array"),
    };
    let tx_id = message
        .get("tx_id")
        .and_then(JsonValue::as_str)
        .map(String::from);
    match commit_message_events(&message, &events, tx_id.as_deref(), user_id, state) {
        Ok(committed) => events_response(request_id, json!({ "events": committed })),
        Err(error) => error_response(request_id, &error),
    }
}

async fn handle_event_list(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
    request_id: Option<String>,
) -> WsResponse {
    let project_id = message
        .get("project_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let atome_id = message
        .get("atome_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let tx_id = message
        .get("tx_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let gesture_id = message
        .get("gesture_id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let since = message
        .get("since")
        .and_then(|v| v.as_str())
        .map(String::from);
    let until = message
        .get("until")
        .and_then(|v| v.as_str())
        .map(String::from);
    let limit = message
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(1000);
    let offset = message.get("offset").and_then(|v| v.as_i64()).unwrap_or(0);
    let order = message
        .get("order")
        .and_then(|v| v.as_str())
        .unwrap_or("asc");

    let db = match state.db.lock() {
        Ok(d) => d,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let mut conditions: Vec<String> = Vec::new();
    let mut params: Vec<String> = Vec::new();

    if let Some(pid) = project_id {
        conditions.push("project_id = ?".to_string());
        params.push(pid);
    }
    if let Some(aid) = atome_id {
        conditions.push("atome_id = ?".to_string());
        params.push(aid);
    }
    if let Some(tid) = tx_id {
        conditions.push("tx_id = ?".to_string());
        params.push(tid);
    }
    if let Some(gid) = gesture_id {
        conditions.push("gesture_id = ?".to_string());
        params.push(gid);
    }
    if let Some(since_val) = since {
        conditions.push("ts >= ?".to_string());
        params.push(since_val);
    }
    if let Some(until_val) = until {
        conditions.push("ts <= ?".to_string());
        params.push(until_val);
    }

    let where_clause = if conditions.is_empty() {
        "".to_string()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };
    let order_clause = if order.eq_ignore_ascii_case("desc") {
        "DESC"
    } else {
        "ASC"
    };

    let query = format!(
        "SELECT id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id
         FROM events {} ORDER BY ts {} LIMIT ? OFFSET ?",
        where_clause, order_clause
    );

    let mut stmt = match db.prepare(&query) {
        Ok(s) => s,
        Err(e) => return error_response(request_id, &e.to_string()),
    };

    let mut query_params: Vec<rusqlite::types::Value> = params
        .into_iter()
        .map(rusqlite::types::Value::from)
        .collect();
    query_params.push(rusqlite::types::Value::from(limit));
    query_params.push(rusqlite::types::Value::from(offset));

    let rows = stmt
        .query_map(rusqlite::params_from_iter(query_params), |row| {
            let payload: Option<String> = row.get(5)?;
            let actor: Option<String> = row.get(6)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "ts": row.get::<_, String>(1)?,
                "atome_id": row.get::<_, Option<String>>(2)?,
                "project_id": row.get::<_, Option<String>>(3)?,
                "kind": row.get::<_, String>(4)?,
                "payload": parse_json_value(payload.as_ref()),
                "actor": parse_json_value(actor.as_ref()),
                "tx_id": row.get::<_, Option<String>>(7)?,
                "gesture_id": row.get::<_, Option<String>>(8)?
            }))
        })
        .map_err(|e| e.to_string());

    let events = match rows {
        Ok(iter) => iter
            .filter_map(|row| row.ok())
            .filter_map(|event| atome_store::security::project_event_for_read(&db, &event, user_id))
            .collect::<Vec<_>>(),
        Err(e) => return error_response(request_id, &e),
    };

    let payload = json!({ "events": events });
    WsResponse {
        msg_type: "events-response".into(),
        request_id,
        success: true,
        error: None,
        data: Some(payload),
        atomes: None,
        count: None,
    }
}
