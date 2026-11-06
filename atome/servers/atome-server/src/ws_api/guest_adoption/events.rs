// The guest's workspace written into the account (`importWorkspaceEvents`): each adopted atome's
// events made the account's own and committed in one batch through the vault families of
// `/ws/api` (atome_ops.rs), as an ordinary command commits.
use super::Connection;
use super::payload::{Atome, Payload};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// `{ ...value }` of what a JSON value holds: an object's entries, an array's or a text's by
/// index, nothing of anything else.
fn spread(value: Option<&JsonValue>) -> JsonMap<String, JsonValue> {
    match value.filter(|value| js::truthy(Some(value))) {
        Some(JsonValue::Object(map)) => map.clone(),
        Some(JsonValue::Array(items)) => items
            .iter()
            .enumerate()
            .map(|(index, item)| (index.to_string(), item.clone()))
            .collect(),
        Some(JsonValue::String(text)) => text
            .chars()
            .enumerate()
            .map(|(index, c)| (index.to_string(), json!(c.to_string())))
            .collect(),
        _ => JsonMap::new(),
    }
}

/// The answer of an `/ws/api` vault family to `message`, asked as the account (atome_ops.rs).
pub(super) async fn ask(connection: &Connection, message: JsonValue) -> JsonValue {
    super::super::atome_ops::reply(connection, &message).await
}

pub(super) fn failed(reply: &JsonValue, otherwise: &str) -> String {
    match reply.get("error") {
        Some(error) if js::truthy(Some(error)) => js::text(Some(error)),
        _ => otherwise.into(),
    }
}

/// `importWorkspaceEvents`: the guest's events, or one `set` of an atome that has none, written
/// as the account's own (its actor, the operation's transaction), checkpoints, grants and outbox
/// rows only checked to name an adopted atome; an atome the account already holds must be this
/// adoption's.
pub(super) async fn workspace_events(
    connection: &Connection,
    operation: &JsonValue,
    payload: &Payload,
    atomes: &[Atome],
    target: &str,
) -> Result<(), String> {
    let digest = js::text(operation.get("operation_digest"));
    let guest = &operation["guest_principal_id"];
    let adopted = |id: &str| atomes.iter().any(|record| record.atome_id == id);
    for snapshot in &payload.snapshots {
        if !js::truthy(snapshot.get("atome_id")) || !adopted(&js::text(snapshot.get("atome_id"))) {
            return Err("guest_adoption_snapshot_invalid".into());
        }
    }
    for permission in &payload.permissions {
        if !adopted(&js::text(permission.get("atome_id"))) {
            return Err("guest_adoption_permission_invalid".into());
        }
        if permission.is_null() {
            return Err("Cannot read properties of null (reading 'principal_id')".into());
        }
        for principal in ["principal_id", "granted_by"].map(|key| permission.get(key)) {
            if js::truthy(principal)
                && principal != Some(guest)
                && principal != Some(&json!(target))
            {
                return Err("guest_adoption_acl_ambiguous".into());
            }
        }
    }
    for event in &payload.events {
        if !js::truthy(event.get("id")) || !adopted(&js::text(event.get("atome_id"))) {
            return Err("guest_adoption_event_invalid".into());
        }
        let actor = event
            .get("actor")
            .and_then(|actor| js::first(actor, &["id", "user_id"]));
        if actor.map(|actor| js::text(Some(actor))).unwrap_or_default() != js::text(Some(guest)) {
            return Err("guest_adoption_actor_invalid".into());
        }
    }
    for entry in &payload.sync_queue {
        let atome = entry
            .get("payload")
            .and_then(|payload| payload.get("atome_id"));
        if !adopted(&js::text(atome)) {
            return Err("guest_adoption_queue_invalid".into());
        }
    }
    // `===` of two ids: a number by its value, an object never.
    let same = |a: Option<&JsonValue>, b: Option<&JsonValue>| match (a, b) {
        (Some(JsonValue::Number(a)), Some(JsonValue::Number(b))) => a.as_f64() == b.as_f64(),
        (Some(JsonValue::Object(_) | JsonValue::Array(_)), _) => false,
        (a, b) => a == b,
    };
    let mut batch = Vec::new();
    for record in atomes {
        let source: Vec<&JsonValue> = payload
            .events
            .iter()
            .filter(|event| js::text(event.get("atome_id")) == record.atome_id)
            .collect();
        let made = json!({
            "id": format!("guest-import:{digest}:{}", record.atome_id),
            "kind": "set",
            "atome_id": record.atome_id,
            "payload": { "props": record.properties },
        });
        let inputs = if source.is_empty() {
            vec![&made]
        } else {
            source
        };
        let existing = ask(
            connection,
            json!({ "type": "state-current", "action": "get", "atome_id": record.atome_id }),
        )
        .await;
        if existing["success"] == true {
            let prior = ask(
                connection,
                json!({ "type": "events", "action": "list", "atome_id": record.atome_id, "limit": 10000 }),
            )
            .await;
            let ours = prior["events"].as_array().is_some_and(|events| {
                events.iter().any(|event| {
                    inputs
                        .iter()
                        .any(|input| same(input.get("id"), event.get("id")))
                })
            });
            if !ours {
                return Err("guest_adoption_atome_collision".into());
            }
        } else if existing["error"] != "State not found" {
            return Err(failed(&existing, "guest_adoption_state_read_failed"));
        }
        let last_set = inputs.iter().rposition(|input| input["kind"] == "set");
        for (index, input) in inputs.iter().enumerate() {
            let mut event = spread(Some(input));
            let kept = |key: &str, otherwise: JsonValue| {
                input
                    .get(key)
                    .filter(|value| js::truthy(Some(value)))
                    .cloned()
                    .unwrap_or(otherwise)
            };
            event.insert("type".into(), json!(record.atome_type));
            event.insert("ts".into(), kept("ts", operation["created_at"].clone()));
            event.insert("actor".into(), json!({ "type": "user", "id": target }));
            event.insert(
                "tx_id".into(),
                kept("tx_id", json!(format!("guest-import:{digest}"))),
            );
            event.insert("project_id".into(), json!(record.project_id));
            if let Some(parent) = &record.parent_id {
                event.insert("parent_id".into(), json!(parent));
            }
            let mut body = spread(input.get("payload"));
            if record.project_id.is_none() {
                body.insert("scope".into(), json!("global"));
            }
            if input["kind"] == "set" {
                let mut props = spread(
                    input
                        .get("payload")
                        .and_then(|payload| payload.get("props")),
                );
                if Some(index) == last_set {
                    props.extend(record.properties.clone());
                }
                props.insert("type".into(), json!(record.atome_type));
                body.insert("props".into(), JsonValue::Object(props));
            }
            event.insert("payload".into(), JsonValue::Object(body));
            batch.push(JsonValue::Object(event));
        }
    }
    if batch.is_empty() {
        return Ok(());
    }
    let committed = ask(
        connection,
        json!({ "type": "events", "action": "commit-batch", "events": batch, "source": "guest-adoption" }),
    )
    .await;
    if committed["success"] != true {
        return Err(failed(&committed, "guest_adoption_events_commit_failed"));
    }
    Ok(())
}
