use super::*;

pub(super) fn deleted_keys(event: &EventRecord) -> Vec<String> {
    event
        .payload
        .as_ref()
        .and_then(|p| p.get("delete_keys"))
        .and_then(JsonValue::as_array)
        .map(|keys| {
            keys.iter()
                .filter_map(JsonValue::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

// Capture authoritative preimages inside the commit transaction, never from the client.
pub(super) fn capture_before(db: &Connection, event: &mut EventRecord) -> Result<(), String> {
    let stored: Option<String> = db
        .query_row(
            "SELECT payload FROM events WHERE id = ?1",
            [&event.id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(payload) = stored {
        event.payload = Some(serde_json::from_str(&payload).map_err(|e| e.to_string())?);
        return Ok(());
    }
    let Some(atome_id) = event.atome_id.as_deref() else {
        return Ok(());
    };
    let Some(patch) = extract_event_patch(&event.kind, &event.payload, &event.ts) else {
        return Ok(());
    };
    let raw: Option<String> = db
        .query_row(
            "SELECT properties FROM state_current WHERE atome_id = ?1",
            [atome_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let current = parse_json_map(raw.as_ref());
    let keys: HashSet<String> = patch.keys().cloned().chain(deleted_keys(event)).collect();
    let mut before = JsonMap::new();
    let mut missing = Vec::new();
    for key in keys {
        if let Some(value) = current.get(&key) {
            before.insert(key, value.clone());
        } else {
            missing.push(key);
        }
    }
    missing.sort();
    let mut payload = event
        .payload
        .take()
        .and_then(|payload| match payload {
            JsonValue::Object(properties) => Some(properties),
            JsonValue::String(raw) => serde_json::from_str(&raw).ok(),
            _ => None,
        })
        .unwrap_or_default();
    payload.insert("before".into(), json!(before));
    payload.insert("before_missing".into(), json!(missing));
    event.payload = Some(json!(payload));
    Ok(())
}

fn source_events(db: &Connection, tx_id: &str) -> Result<Vec<JsonValue>, String> {
    let mut stmt = db.prepare("SELECT id, atome_id, project_id, kind, payload FROM events WHERE tx_id = ?1 ORDER BY ts, rowid")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([tx_id], |r| {
            let payload: Option<String> = r.get(4)?;
            Ok(
                json!({"id": r.get::<_, String>(0)?, "atome_id": r.get::<_, Option<String>>(1)?,
            "project_id": r.get::<_, Option<String>>(2)?, "kind": r.get::<_, String>(3)?,
            "payload": payload.and_then(|p| serde_json::from_str::<JsonValue>(&p).ok())}),
            )
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub async fn handle_history_command(
    message: JsonValue,
    user_id: &str,
    state: &LocalAtomeState,
) -> WsResponse {
    let request_id = message
        .get("requestId")
        .and_then(JsonValue::as_str)
        .map(String::from);
    let operation = message
        .get("action")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let source_tx = message
        .get("source_tx_id")
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    if !matches!(operation, "undo" | "redo") {
        return error_response(request_id, "history_operation_invalid");
    }
    if source_tx.is_empty() {
        return error_response(request_id, "history_source_transaction_required");
    }
    let Some(request_key) = request_id.as_deref() else {
        return error_response(request_id, "history_request_id_required");
    };
    let sources = match state
        .db
        .lock()
        .map_err(|e| e.to_string())
        .and_then(|db| source_events(&db, source_tx))
    {
        Ok(events) if !events.is_empty() => events,
        Ok(_) => return error_response(request_id, "history_source_transaction_not_found"),
        Err(error) => return error_response(request_id, &error),
    };
    if sources
        .iter()
        .any(|event| event["kind"] != "delete" && !event["payload"]["before"].is_object())
    {
        return error_response(request_id, "history_source_transaction_not_invertible");
    }
    let mut sources = sources;
    if operation == "undo" {
        sources.reverse();
    }
    let mut events = Vec::new();
    for source in sources {
        let deletion = source["kind"] == "delete";
        let props = if deletion {
            json!({})
        } else if operation == "undo" {
            source["payload"]["before"].clone()
        } else {
            ["props", "properties", "patch", "delta"]
                .iter()
                .find_map(|key| {
                    source["payload"]
                        .get(key)
                        .filter(|v| v.is_object())
                        .cloned()
                })
                .unwrap_or(json!({}))
        };
        let delete_keys = if deletion {
            json!([])
        } else {
            source["payload"][if operation == "undo" {
                "before_missing"
            } else {
                "delete_keys"
            }]
            .as_array()
            .cloned()
            .map(JsonValue::Array)
            .unwrap_or(json!([]))
        };
        events.push(json!({
            "id": format!("history:{operation}:{request_key}:{}", source["id"].as_str().unwrap_or("")),
            "kind": if deletion { if operation == "undo" { "restore".into() } else { "delete".into() } } else { format!("history.{operation}") },
            "atome_id": source["atome_id"], "project_id": source["project_id"],
            "payload": {"props": props, "delete_keys": delete_keys, "source_tx_id": source_tx, "source_event_id": source["id"]}
        }));
    }
    handle_events_message(
        json!({
            "type": "events", "action": "commit-batch", "requestId": request_key,
            "tx_id": format!("history:{operation}:{source_tx}:{request_key}"), "events": events,
            "sync_target": message.get("sync_target"), "sync_source": message.get("sync_source")
        }),
        user_id,
        state,
    )
    .await
}

pub(super) fn record_winners(db: &Connection, event: &EventRecord) -> Result<(), String> {
    let Some(atome) = event.atome_id.as_deref() else {
        return Ok(());
    };
    let patch = extract_event_patch(&event.kind, &event.payload, &event.ts).unwrap_or_default();
    let mut keys: HashSet<String> = patch.keys().cloned().chain(deleted_keys(event)).collect();
    if matches!(event.kind.as_str(), "delete" | "restore") {
        keys.insert("__lifecycle__".into());
    }
    for key in keys {
        super::super::local_atome_conflicts::record(
            db,
            atome,
            &key,
            &event.id,
            &event.ts,
            0,
            "interactive_commit",
        )?;
    }
    Ok(())
}
