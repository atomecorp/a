// `snapshot`, `history`, `sync` push, `user-data` and an atome's history on
// `/ws/api` (server/wsAtomeOperations.js and server/atomeHistoryCommands.js,
// ported): each runs in the vault of what it touches through the vault router,
// its inserted events then meet Fastify's post-commit effects.
use super::Connection;
use super::atome_ops::{action_of, after_committed, failure, or_null, readable, success, unknown};
use crate::vault_router::js::{self, first};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const SNAPSHOT_ACTIONS: [&str; 4] = ["create", "list", "get", "restore"];

fn inserted(events: Option<&JsonValue>) -> Vec<JsonValue> {
    events
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter(|event| event.get("inserted") == Some(&JsonValue::Bool(true)))
        .cloned()
        .collect()
}

// Fastify's effects of the events a mutation inserted; none inserted, none to run.
async fn committed(
    connection: &Connection,
    principal: &str,
    events: Vec<JsonValue>,
) -> Result<(), String> {
    let events: Vec<JsonValue> = events
        .into_iter()
        .filter(|event| js::truthy(Some(event)))
        .collect();
    if events.is_empty() {
        return Ok(());
    }
    after_committed(connection, principal, events).await
}

pub(super) async fn snapshot(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let action = action_of(message);
    if !SNAPSHOT_ACTIONS.contains(&action.as_str()) {
        return Ok(unknown("snapshot", message, &action));
    }
    let project_id = or_null(first(message, &["project_id", "projectId"]));
    let atome_id = or_null(first(message, &["atome_id", "atomeId"]));
    let has_target = js::truthy(Some(&project_id)) || js::truthy(Some(&atome_id));
    if action == "create" && !has_target {
        return Ok(failure(
            "snapshot",
            message,
            "Missing project_id or atome_id",
        ));
    }
    if action == "list" && !js::truthy(Some(&project_id)) {
        return Ok(failure("snapshot", message, "Missing project_id"));
    }
    let mut request = JsonMap::new();
    for (name, keys) in [
        ("event_id", &["event_id"][..]),
        ("ts", &["ts"]),
        ("label", &["label"]),
        ("state", &["state", "state_blob"]),
        ("snapshot_id", &["snapshot_id", "snapshotId", "id"]),
        ("tx_id", &["tx_id", "txId"]),
    ] {
        request.insert(name.into(), or_null(first(message, keys)));
    }
    request.insert("project_id".into(), project_id);
    request.insert("atome_id".into(), atome_id);
    request.insert(
        "snapshot_type".into(),
        first(message, &["snapshot_type", "snapshotType"])
            .cloned()
            .unwrap_or_else(|| json!("manual")),
    );
    for name in ["limit", "offset"] {
        if let Some(value) = message.get(name) {
            request.insert(name.into(), value.clone());
        }
    }
    let result = connection
        .router()
        .service(
            "router:snapshot",
            &json!({ "principal_id": principal, "action": action, "request": request }),
        )
        .await?;
    if action == "restore" {
        let events = result
            .get("events")
            .filter(|events| events.is_array())
            .ok_or("snapshot_restore_events_missing")?;
        committed(connection, principal, inserted(Some(events))).await?;
    }
    Ok(success("snapshot", message, result))
}

pub(super) async fn history(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let options = json!({
        "operation": first(message, &["action", "action_type", "op"]).map(js::string).unwrap_or_default(),
        "sourceTxId": or_null(first(message, &["source_tx_id", "sourceTxId"])),
        "atomeIds": first(message, &["atome_ids", "atomeIds"]).cloned().unwrap_or_else(|| json!([])),
        "requestId": or_null(first(message, &["requestId", "request_id"])),
    });
    let result = connection
        .router()
        .service(
            "router:history-apply",
            &json!({ "principal_id": principal, "options": options }),
        )
        .await?;
    if !js::truthy(result.get("ok")) {
        let error = result.get("error").map_or("undefined".into(), js::string);
        return Ok(failure("history", message, &error));
    }
    let effects = first(&result, &["inserted_events", "events"])
        .and_then(JsonValue::as_array)
        .cloned()
        .unwrap_or_default();
    committed(connection, principal, effects).await?;
    let mut fields = JsonMap::new();
    if let Some(events) = result.get("events") {
        fields.insert("events".into(), events.clone());
    }
    Ok(success("history", message, JsonValue::Object(fields)))
}

// An offline device's changes, last writer winning (`offline-lww`); only `push` comes
// here (atome_ops.rs#answered_here).
pub(super) async fn sync_push(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let events = ["events", "changes"]
        .iter()
        .find_map(|key| message.get(*key).filter(|events| events.is_array()))
        .cloned()
        .unwrap_or_else(|| json!([]));
    let options = json!({
        "txId": or_null(first(message, &["tx_id", "txId"])),
        "source": first(message, &["source", "sync_source"]).cloned().unwrap_or_else(|| json!("ws-api")),
        "conflictMode": "offline-lww",
    });
    let entries = connection
        .router()
        .service(
            "router:commit-batch",
            &json!({ "principal_id": principal, "events": events, "options": options }),
        )
        .await?;
    let changes: Vec<JsonValue> = entries
        .as_array()
        .into_iter()
        .flatten()
        .map(|entry| entry["event"].clone())
        .collect();
    let changes = JsonValue::Array(changes);
    committed(connection, principal, inserted(Some(&changes))).await?;
    Ok(success("sync", message, json!({ "changes": changes })))
}

// The most a person's export or erasure reads, as Fastify read it.
const EVERYTHING: u64 = 10_000;

// `Number(limit) || 10000`.
fn limit_of(message: &JsonValue) -> JsonValue {
    js::number_json(js::number_or(message.get("limit"), EVERYTHING as f64))
}

async fn states(
    connection: &Connection,
    principal: &str,
    include_shared: bool,
    limit: JsonValue,
) -> Result<Vec<JsonValue>, String> {
    let options = json!({ "ownerId": principal, "includeShared": include_shared, "limit": limit });
    let states = connection
        .router()
        .service(
            "router:state-list",
            &json!({ "principal_id": principal, "options": options }),
        )
        .await?;
    Ok(states.as_array().cloned().unwrap_or_default())
}

// A person's own data: everything they can read for an export, and everything their
// vault holds for an erasure, deleted through the one commit pipeline.
pub(super) async fn user_data(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let action = action_of(message);
    match action.as_str() {
        "export" => {
            let atomes: Vec<JsonValue> = states(connection, principal, true, limit_of(message))
                .await?
                .iter()
                .filter_map(|state| readable(state, principal))
                .collect();
            let options = json!({ "limit": limit_of(message), "order": "asc" });
            let events = connection
                .router()
                .service(
                    "router:events-list",
                    &json!({ "principal_id": principal, "options": options }),
                )
                .await?;
            Ok(success(
                "user-data",
                message,
                json!({ "atomes": atomes, "events": events }),
            ))
        }
        "delete-all" => {
            let actor = json!({ "type": "user", "id": principal });
            let events: Vec<JsonValue> = states(connection, principal, false, json!(EVERYTHING))
                .await?
                .iter()
                .filter(|state| js::id(state.get("vault_principal_id")) == principal)
                .map(|state| js::id(first(state, &["atome_id", "id"])))
                .filter(|id| !id.is_empty() && id != principal)
                .map(|id| json!({ "kind": "delete", "atome_id": id, "actor": actor, "payload": null }))
                .collect();
            if events.is_empty() {
                return Ok(success(
                    "user-data",
                    message,
                    json!({ "deleted": 0, "events": [] }),
                ));
            }
            let tx_id = first(message, &["tx_id", "txId"])
                .cloned()
                .unwrap_or_else(|| {
                    let request = first(message, &["requestId", "request_id"]);
                    json!(format!(
                        "user_data_delete_{}",
                        js::string(&or_null(request))
                    ))
                });
            let entries = connection
                .router()
                .service(
                    "router:commit-batch",
                    &json!({ "principal_id": principal, "events": events, "options": { "txId": tx_id } }),
                )
                .await?;
            let deleted: Vec<JsonValue> = entries
                .as_array()
                .into_iter()
                .flatten()
                .map(|entry| entry["event"].clone())
                .collect();
            let deleted = JsonValue::Array(deleted);
            committed(connection, principal, inserted(Some(&deleted))).await?;
            let count = deleted.as_array().map_or(0, Vec::len);
            Ok(success(
                "user-data",
                message,
                json!({ "deleted": count, "events": deleted }),
            ))
        }
        _ => Ok(unknown("user-data", message, &action)),
    }
}

// The events of one atome of the asker's vault, newest first unless asked otherwise.
pub(super) async fn atome_history(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let Some(atome_id) = first(message, &["atome_id", "atomeId", "id"]) else {
        return Ok(failure("atome", message, "Missing atome_id"));
    };
    let mut options = JsonMap::new();
    options.insert("atomeId".into(), atome_id.clone());
    options.insert(
        "limit".into(),
        first(message, &["limit"])
            .cloned()
            .unwrap_or_else(|| json!(100)),
    );
    if let Some(offset) = message.get("offset") {
        options.insert("offset".into(), offset.clone());
    }
    options.insert(
        "order".into(),
        first(message, &["order"])
            .cloned()
            .unwrap_or_else(|| json!("desc")),
    );
    let events = connection
        .router()
        .service(
            "router:events-list",
            &json!({ "principal_id": principal, "options": options }),
        )
        .await?;
    if events.as_array().is_none_or(Vec::is_empty) {
        return Ok(failure("atome", message, "Access denied"));
    }
    Ok(success(
        "atome",
        message,
        json!({ "history": events, "versions": events, "events": events }),
    ))
}
