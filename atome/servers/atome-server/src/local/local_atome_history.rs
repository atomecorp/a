use super::*;

// Undo / redo of one transaction, through the store's history command (Fastify's
// `handleAtomeHistoryCommand`): the inverted events committed, queued for sync,
// announced.
pub async fn handle_history_command(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let request_id = message
        .get("requestId")
        .and_then(JsonValue::as_str)
        .map(String::from);
    let text = |keys: &[&str]| {
        keys.iter()
            .find_map(|key| message.get(*key).filter(|v| js_truthy(v)))
    };
    let operation = text(&["action", "action_type", "op"])
        .map(canonical::js_string)
        .unwrap_or_default();
    let atome_ids = text(&["atome_ids", "atomeIds"])
        .and_then(JsonValue::as_array)
        .map(|ids| ids.iter().map(canonical::js_string).collect())
        .unwrap_or_default();
    let request = history_command::HistoryRequest {
        operation: &operation,
        source_tx_id: text(&["source_tx_id", "sourceTxId"]).map(canonical::js_string),
        atome_ids,
        request_id: request_id.clone(),
    };
    let result = state.db.lock().map_err(|e| e.to_string()).and_then(|db| {
        let result = with_transaction(&db, |conn| {
            let result = history_command::apply_history(conn, &request, user_id)?;
            if let Some(events) = result["events"]
                .as_array()
                .filter(|_| result["ok"] == json!(true))
            {
                queue_committed_events(conn, &message, events)?;
            }
            Ok(result)
        })?;
        if let Some(events) = result["events"].as_array() {
            announce_committed_events(&db, events);
        }
        Ok(result)
    });
    match result {
        Ok(result) if result["ok"] == json!(true) => {
            events_response(request_id, json!({ "events": result["events"] }))
        }
        Ok(result) => error_response(
            request_id,
            result["error"].as_str().unwrap_or("history_failed"),
        ),
        Err(error) => error_response(request_id, &error),
    }
}
