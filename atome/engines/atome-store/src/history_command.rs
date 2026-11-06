// Undo and redo of a recorded transaction, as Fastify's
// `executeAtomeHistoryCommand` (server/atomeHistoryCommands.js) runs them: the
// transaction's undo-visible events (a continuous gesture collapsed to one event
// per atome), inverted from their preimages or replayed, committed as new events
// through the one commit with the versions they expect.
use super::*;
use append::{
    AppendOptions, ConflictMode, event_payload_map, event_property_patch, event_touched_keys,
};
use reads::EventFilter;

fn normalized_kind(event: &JsonValue) -> String {
    event
        .get("kind")
        .or_else(|| event.get("event"))
        .map(canonical::js_string)
        .unwrap_or_default()
        .trim()
        .to_lowercase()
}

// `classifyHistoryEvent(event).undo_visible` and whether it is a continuous frame.
fn undo_visible(kind: &str) -> bool {
    let suffix = kind.rsplit('.').next().unwrap_or("");
    !(matches!(
        kind,
        "gesture_start" | "gesture.start" | "gesture_frame" | "gesture.frame"
    ) || matches!(suffix, "undo" | "redo")
        || kind.starts_with("history.")
        || matches!(
            kind,
            "hover" | "focus" | "blur" | "preview" | "presence" | "snapshot" | "checkpoint"
        ))
}

fn is_frame(kind: &str) -> bool {
    matches!(kind, "gesture_frame" | "gesture.frame")
}

fn object(event: &JsonValue) -> JsonMap<String, JsonValue> {
    event.as_object().cloned().unwrap_or_default()
}

// `collapseContinuousGestureEvents`.
fn collapse(events: Vec<JsonValue>) -> Vec<JsonValue> {
    if !events.iter().any(|event| is_frame(&normalized_kind(event))) {
        return events
            .into_iter()
            .filter(|event| undo_visible(&normalized_kind(event)))
            .collect();
    }
    let mut order: Vec<String> = Vec::new();
    let mut groups: HashMap<String, Vec<JsonValue>> = HashMap::new();
    for event in events {
        let atome_id = event
            .get("atome_id")
            .map(canonical::js_string)
            .unwrap_or_default();
        if atome_id.is_empty() || event.get("atome_id").is_none_or(JsonValue::is_null) {
            continue;
        }
        if !groups.contains_key(&atome_id) {
            order.push(atome_id.clone());
        }
        groups.entry(atome_id).or_default().push(event);
    }
    order
        .into_iter()
        .map(|atome_id| {
            let group = &groups[&atome_id];
            let marker = group
                .iter()
                .rev()
                .find(|event| undo_visible(&normalized_kind(event)))
                .or(group.last())
                .cloned()
                .unwrap_or(JsonValue::Null);
            let mut props = JsonMap::new();
            let mut before = JsonMap::new();
            let mut before_missing: Vec<String> = Vec::new();
            let mut first_touch = HashSet::new();
            let mut before_identity: Option<JsonValue> = None;
            for event in group {
                let payload = event
                    .get("payload")
                    .and_then(JsonValue::as_object)
                    .cloned()
                    .unwrap_or_default();
                let patch = event_property_patch(&object(event)).unwrap_or_default();
                for key in event_touched_keys(&object(event)) {
                    if first_touch.insert(key.clone()) {
                        if let Some(value) = payload.get("before").and_then(|b| b.get(&key)) {
                            before.insert(key.clone(), value.clone());
                        } else if payload
                            .get("before_missing")
                            .and_then(JsonValue::as_array)
                            .is_some_and(|missing| missing.iter().any(|m| m.as_str() == Some(&key)))
                            && !before_missing.contains(&key)
                        {
                            before_missing.push(key.clone());
                        }
                    }
                    if let Some(value) = patch.get(&key) {
                        props.insert(key.clone(), value.clone());
                    }
                }
                if before_identity.is_none()
                    && let Some(identity) = payload.get("before_identity")
                {
                    before_identity = Some(identity.clone());
                }
            }
            let mut marker = object(&marker);
            let mut payload = marker
                .get("payload")
                .and_then(JsonValue::as_object)
                .cloned()
                .unwrap_or_default();
            payload.insert("props".into(), JsonValue::Object(props));
            payload.insert("before".into(), JsonValue::Object(before));
            payload.insert("before_missing".into(), json!(before_missing));
            if let Some(identity) = before_identity {
                payload.insert("before_identity".into(), identity);
            }
            marker.insert("payload".into(), JsonValue::Object(payload));
            JsonValue::Object(marker)
        })
        .collect()
}

// `historyPayload(source, operation)`: a redo replays the patch, an undo writes the preimages back.
fn history_payload(source: &JsonValue, redo: bool) -> (JsonMap<String, JsonValue>, Vec<String>) {
    if redo {
        let source = object(source);
        return (
            event_property_patch(&source).unwrap_or_default(),
            intent::event_deleted_property_keys(&event_payload_map(&source)),
        );
    }
    let payload = source
        .get("payload")
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    let props = payload
        .get("before")
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    let deleted = payload
        .get("before_missing")
        .and_then(JsonValue::as_array)
        .map(|keys| keys.iter().map(canonical::js_string).collect())
        .unwrap_or_default();
    (props, deleted)
}

struct PropertyState {
    version: i64,
    deleted: bool,
    value: JsonValue,
}

fn property_state(db: &Connection, atome_id: &str, key: &str) -> Result<PropertyState, String> {
    let row: Option<(Option<String>, Option<String>, Option<i64>)> = db
        .query_row(
            "SELECT particle_value, value_type, version FROM particles WHERE atome_id = ?1 AND particle_key = ?2",
            rusqlite::params![atome_id, key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(match row {
        Some((value, value_type, version))
            if value_type.as_deref() != Some(particles::DELETED_VALUE_TYPE) =>
        {
            PropertyState {
                version: version.unwrap_or(0),
                deleted: false,
                value: mutation::stored_value(value.as_deref()),
            }
        }
        Some((_, _, version)) => PropertyState {
            version: version.unwrap_or(0),
            deleted: true,
            value: JsonValue::Null,
        },
        None => PropertyState {
            version: 0,
            deleted: true,
            value: JsonValue::Null,
        },
    })
}

fn failure(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

pub struct HistoryRequest<'a> {
    pub operation: &'a str,
    pub source_tx_id: Option<String>,
    pub atome_ids: Vec<String>,
    pub request_id: Option<String>,
}

// Builds and commits the inverse (undo) or the replay (redo) of a transaction for `principal_id`.
pub fn apply_history(
    db: &Connection,
    request: &HistoryRequest<'_>,
    principal_id: &str,
) -> Result<JsonValue, String> {
    let redo = match request.operation {
        "undo" => false,
        "redo" => true,
        _ => return Ok(failure("history_operation_invalid")),
    };
    let Some(source_tx) = request.source_tx_id.clone() else {
        return Ok(failure("history_source_transaction_required"));
    };
    let Some(request_id) = request.request_id.clone() else {
        return Ok(failure("history_request_id_required"));
    };
    let transaction = reads::list_events(
        db,
        &EventFilter {
            project_id: None,
            atome_id: None,
            tx_id: Some(source_tx.clone()),
            gesture_id: None,
            since: None,
            until: None,
            limit: 10000,
            offset: 0,
            descending: false,
        },
    )?;
    let sources: Vec<JsonValue> = collapse(transaction)
        .into_iter()
        .filter(|event| {
            request.atome_ids.is_empty()
                || request.atome_ids.contains(
                    &event
                        .get("atome_id")
                        .map(canonical::js_string)
                        .unwrap_or_default(),
                )
        })
        .collect();
    if sources.is_empty() {
        return Ok(failure("history_source_transaction_not_found"));
    }
    if sources.iter().any(|event| {
        normalized_kind(event) != "delete"
            && event.get("payload").and_then(|p| p.get("before")).is_none()
    }) {
        return Ok(failure("history_source_transaction_not_invertible"));
    }
    let operation = if redo { "redo" } else { "undo" };
    let ordered: Vec<&JsonValue> = if redo {
        sources.iter().collect()
    } else {
        sources.iter().rev().collect()
    };
    let mut states: HashMap<String, HashMap<String, PropertyState>> = HashMap::new();
    let mut events = Vec::new();
    for source in ordered {
        let atome_id = source
            .get("atome_id")
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .to_string();
        let source_id = source
            .get("id")
            .map(canonical::js_string)
            .unwrap_or_default();
        let id = format!("history:{operation}:{request_id}:{source_id}");
        let project_id = source
            .get("project_id")
            .filter(|p| js_truthy(p))
            .cloned()
            .unwrap_or(JsonValue::Null);
        let payload = source.get("payload").and_then(JsonValue::as_object);
        if payload
            .and_then(|p| p.get("before_identity"))
            .is_some_and(JsonValue::is_null)
        {
            let mut carried = JsonMap::new();
            if redo {
                let (props, deleted) = history_payload(source, true);
                carried.insert("props".into(), JsonValue::Object(props));
                carried.insert("delete_keys".into(), json!(deleted));
            }
            carried.insert("source_tx_id".into(), json!(source_tx));
            carried.insert("source_event_id".into(), json!(source_id));
            events.push(json!({ "id": id, "kind": if redo { "restore" } else { "delete" }, "atome_id": atome_id,
                "project_id": project_id, "payload": carried }));
            continue;
        }
        if normalized_kind(source) == "delete" {
            if atome_id.is_empty() {
                continue;
            }
            events.push(json!({ "id": id, "kind": if redo { "delete" } else { "restore" }, "atome_id": atome_id,
                "project_id": project_id, "payload": { "source_tx_id": source_tx, "source_event_id": source_id } }));
            continue;
        }
        let keys = event_touched_keys(&object(source));
        if atome_id.is_empty() || keys.is_empty() {
            continue;
        }
        let properties = states.entry(atome_id.clone()).or_default();
        for key in &keys {
            if !properties.contains_key(key) {
                properties.insert(key.clone(), property_state(db, &atome_id, key)?);
            }
        }
        let (props, deleted) = history_payload(source, redo);
        let expected: JsonMap<String, JsonValue> = keys
            .iter()
            .map(|key| (key.clone(), json!(properties[key].version)))
            .collect();
        for key in &keys {
            let property = properties.get_mut(key).expect("state read above");
            if deleted.contains(key) {
                if !property.deleted {
                    property.version += 1;
                }
                property.deleted = true;
                property.value = JsonValue::Null;
            } else if let Some(value) = props.get(key) {
                if property.deleted
                    || intent::js_stringify(&property.value) != intent::js_stringify(value)
                {
                    property.version += 1;
                }
                property.deleted = false;
                property.value = value.clone();
            }
        }
        events.push(json!({ "id": id, "kind": format!("history.{operation}"), "atome_id": atome_id, "project_id": project_id,
            "payload": { "props": props, "delete_keys": deleted, "expected_versions": expected,
                "source_tx_id": source_tx, "source_event_id": source_id } }));
    }
    if events.is_empty() {
        return Ok(failure("history_source_transaction_empty"));
    }
    commit_atome_events(
        db,
        events,
        principal_id,
        &format!("history:{operation}:{source_tx}:{request_id}"),
    )
}

// `commitAtomeEvents` for the vault's own principal: the batch authorized, then appended.
fn commit_atome_events(
    db: &Connection,
    events: Vec<JsonValue>,
    principal_id: &str,
    tx_id: &str,
) -> Result<JsonValue, String> {
    let options = AppendOptions {
        source: None,
        tx_id: Some(tx_id),
        conflict_mode: ConflictMode::Interactive,
        stored_truth: false,
    };
    let committed = match commit::commit_events(db, &events, principal_id, &options) {
        Ok(commit::CommitOutcome::Committed(committed)) => committed,
        Ok(commit::CommitOutcome::Refused { event_id, decision }) => {
            return Ok(
                json!({ "ok": false, "error": decision.reason, "denied_event": event_id, "denied_keys": decision.denied_keys }),
            );
        }
        Err(error)
            if matches!(
                error.as_str(),
                "property_version_conflict"
                    | "event_id_conflict"
                    | "atome_type_unknown"
                    | "atome_property_unknown"
            ) =>
        {
            return Ok(failure(&error));
        }
        Err(error) => return Err(error),
    };
    let inserted = committed
        .iter()
        .filter(|event| event.get("inserted") == Some(&JsonValue::Bool(true)))
        .count();
    // A new event carries no `inserted` mark in Fastify's answer (its WeakSet holds it); a retry says `false`.
    let events: Vec<JsonValue> = committed
        .into_iter()
        .map(|mut event| {
            if event.get("inserted") == Some(&JsonValue::Bool(true)) {
                event
                    .as_object_mut()
                    .expect("event")
                    .shift_remove("inserted");
            }
            event
        })
        .collect();
    Ok(json!({ "ok": true, "events": events, "inserted_count": inserted }))
}
