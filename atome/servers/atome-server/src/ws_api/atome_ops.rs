// The vault families of `/ws/api` (server/wsAtomeOperations.js, ported): `events`,
// `state-current` here, `snapshot`, `history`, `sync` push, `user-data` and an
// atome's history in vault_ops.rs, `sync`'s pending list and acknowledgement in
// atome_requests/sync.rs, the public `directory` in social/directory/, the
// `conditions` queries in conditions/. A mutation already answered on this connection
// is answered again as it was, the principal is the connection's check of the message
// (identity.rs `principal_of`), the work is the vault router's, the post-commit effects are
// `after_committed`, and every reply is the one `/ws/api` envelope.
use super::{Connection, vault_ops};
use crate::vault_router::js::{self, first, truthy};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

pub(super) const FAMILIES: [&str; 9] = [
    "events",
    "state-current",
    "snapshot",
    "history",
    "sync",
    "user-data",
    "atome",
    "directory",
    "conditions",
];

/// Whether a message of these families is answered here: of `atome` only its history is a
/// vault family (its reads are atome_requests/).
pub(super) fn answered_here(kind: &str, message: &JsonValue) -> bool {
    kind != "atome" || action_of(message) == "history"
}

// The mutations of these families a client may send twice (a reconnection repeats its
// unanswered requests), as Fastify's `MUTATING_ACTIONS` names them.
const MUTATING: [&str; 9] = [
    "events:commit",
    "events:commit-batch",
    "snapshot:create",
    "snapshot:restore",
    "user-data:delete-all",
    "sync:push",
    "sync:ack",
    "history:undo",
    "history:redo",
];
const REMEMBERED: usize = 200;
// `isDuplicateWsRequest` (server/server_dedup.js): an `atome` mutation's request id is a duplicate
// for 3 s, of the last 200 seen.
const DUPLICATE_MS: f64 = 3000.0;

#[derive(Default)]
pub(crate) struct Mutations {
    replies: HashMap<String, JsonValue>,
    order: VecDeque<String>,
    // When each `atome` mutation's request id was last taken, in the order first seen.
    requests: HashMap<String, f64>,
    requests_order: VecDeque<String>,
}

impl Mutations {
    /// `isDuplicateWsRequest(connection, requestId)`: whether `request_id` was taken less than 3 s
    /// ago, else it is taken now.
    pub(super) fn duplicate(&mut self, request_id: &JsonValue, now: f64) -> bool {
        let key = request_id.to_string();
        if self
            .requests
            .get(&key)
            .is_some_and(|last| *last != 0.0 && now - last < DUPLICATE_MS)
        {
            return true;
        }
        if self.requests.insert(key.clone(), now).is_none() {
            self.requests_order.push_back(key);
        }
        while self.requests_order.len() > REMEMBERED {
            if let Some(oldest) = self.requests_order.pop_front() {
                self.requests.remove(&oldest);
            }
        }
        false
    }

    fn remember(&mut self, key: String, reply: &JsonValue) {
        if self.replies.insert(key.clone(), reply.clone()).is_none() {
            self.order.push_back(key);
        }
        while self.order.len() > REMEMBERED {
            if let Some(oldest) = self.order.pop_front() {
                self.replies.remove(&oldest);
            }
        }
    }
}

pub(super) fn action_of(message: &JsonValue) -> String {
    js::id(first(message, &["action", "action_type", "op"]))
}

pub(super) fn or_null(value: Option<&JsonValue>) -> JsonValue {
    value.cloned().unwrap_or(JsonValue::Null)
}

fn is_true(message: &JsonValue, keys: &[&str]) -> bool {
    keys.iter()
        .any(|key| message.get(*key) == Some(&JsonValue::Bool(true)))
}

fn envelope(kind: &str, message: &JsonValue, success: bool, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!(format!("{kind}-response")));
    reply.insert(
        "requestId".into(),
        or_null(first(message, &["requestId", "request_id"])),
    );
    reply.insert("success".into(), json!(success));
    reply.insert("ok".into(), json!(success));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

pub(super) fn success(kind: &str, message: &JsonValue, fields: JsonValue) -> JsonValue {
    envelope(kind, message, true, fields)
}

pub(super) fn failure(kind: &str, message: &JsonValue, error: &str) -> JsonValue {
    envelope(kind, message, false, json!({ "error": error }))
}

// `${type}:${action}:${requestId}` of a mutation that has a request id.
fn mutation_key(message: &JsonValue) -> Option<String> {
    let request_id = first(message, &["requestId", "request_id"])?;
    let kind = first(message, &["type"])
        .map(js::string)
        .unwrap_or_default();
    let key = format!("{kind}:{}", action_of(message));
    MUTATING
        .contains(&key.as_str())
        .then(|| format!("{key}:{}", js::string(request_id)))
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let reply = reply(&connection, &message).await;
    connection.reply(reply).await;
}

pub(super) async fn reply(connection: &Connection, message: &JsonValue) -> JsonValue {
    let kind = js::id(message.get("type"));
    let front = match connection.principal_of(message).await {
        Ok(front) => front,
        Err(error) => return failure(&kind, message, &error),
    };
    if let Some(refused) = front.get("session_error") {
        return refused.clone();
    }
    let key = mutation_key(message);
    if let Some(key) = &key
        && let Some(cached) = connection
            .mutations
            .lock()
            .expect("mutations")
            .replies
            .get(key)
    {
        return cached.clone();
    }
    if let Some(refused) = front.get("reply") {
        return refused.clone();
    }
    let principal = js::string(&front["principal"]);
    let handled = match kind.as_str() {
        "events" => events(connection, message, &principal).await,
        "state-current" => state_current(connection, message, &principal).await,
        "snapshot" => vault_ops::snapshot(connection, message, &principal).await,
        "history" => vault_ops::history(connection, message, &principal).await,
        "user-data" => vault_ops::user_data(connection, message, &principal).await,
        "atome" => vault_ops::atome_history(connection, message, &principal).await,
        "directory" => connection
            .ws_api
            .social
            .directory
            .answer(&action_of(message), message, &principal)
            .await
            .map(|fields| success("directory", message, fields)),
        "conditions" => crate::conditions::answer(
            connection.router(),
            &principal,
            &action_of(message),
            message,
            readable,
        )
        .await
        .map(|fields| success("conditions", message, fields)),
        _ => match action_of(message).as_str() {
            "push" => vault_ops::sync_push(connection, message, &principal).await,
            "get-pending" => super::atome_requests::pending(connection, message, &principal).await,
            "ack" => super::atome_requests::acknowledge(connection, message, &principal).await,
            action => Ok(unknown("sync", message, action)),
        },
    };
    match handled {
        Ok(result) => {
            if let Some(key) = key {
                connection
                    .mutations
                    .lock()
                    .expect("mutations")
                    .remember(key, &result);
            }
            result
        }
        // A thrown error is not remembered: the same request may be tried again.
        Err(error) => failure(&kind, message, &error),
    }
}

// What follows every commit (server/ws_api_commit_effects.js `afterCommitted`): the stream told
// to the devices following it (/ws/sync), the author's directory card when their own user Atome
// changed, then the bases projected here (public events, the objectives network, the shop, the
// coaches).
pub(super) async fn after_committed(
    connection: &Connection,
    principal: &str,
    events: Vec<JsonValue>,
) -> Result<(), String> {
    if events.is_empty() {
        return Ok(());
    }
    let social = &connection.ws_api.social;
    for event in &events {
        social.sync.publish(event).await?;
    }
    if events
        .iter()
        .any(|event| js::id(event.get("atome_id")) == principal)
    {
        social.directory.refresh(principal, false).await?;
    }
    social
        .events
        .after_commit(&social.directory, &events)
        .await?;
    social
        .objectives
        .after_commit(&social.directory, &events)
        .await?;
    social.shop.after_commit(&social.directory, &events).await?;
    social.coaches.after_commit(&events).await
}

// A `device:` atome belongs to the device that wrote it (atome/src/shared/device_scope_contract.js).
fn is_device_atome(event: &JsonValue) -> bool {
    matches!(first(event, &["atome_id", "atomeId", "id"]), Some(JsonValue::String(id)) if id.to_lowercase().starts_with("device:"))
}

pub(super) fn unknown(kind: &str, message: &JsonValue, action: &str) -> JsonValue {
    let action = if action.is_empty() { "missing" } else { action };
    failure(kind, message, &format!("Unknown {kind} action: {action}"))
}

async fn events(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let action = action_of(message);
    let router = connection.router();
    let batch = message.get("events").filter(|events| events.is_array());
    let sent: Vec<&JsonValue> = match action.as_str() {
        "commit" => vec![first(message, &["event", "body", "payload"]).unwrap_or(&JsonValue::Null)],
        "commit-batch" => batch
            .and_then(JsonValue::as_array)
            .map_or_else(Vec::new, |events| events.iter().collect()),
        _ => Vec::new(),
    };
    if sent.into_iter().any(is_device_atome) {
        return Ok(failure("events", message, "device_only_atome"));
    }
    match action.as_str() {
        "commit" => {
            let event = or_null(first(message, &["event", "body", "payload"]));
            let source =
                or_null(first(message, &["source"]).or_else(|| first(&event, &["source"])));
            let entry = router
                .service(
                    "router:commit",
                    &json!({ "principal_id": principal, "event": event, "options": { "source": source } }),
                )
                .await?;
            if truthy(entry.get("inserted")) {
                after_committed(connection, principal, vec![entry["event"].clone()]).await?;
            }
            Ok(success(
                "events",
                message,
                json!({ "event": entry["event"] }),
            ))
        }
        "commit-batch" => {
            let options = json!({
                "txId": or_null(first(message, &["tx_id", "txId"])),
                "source": or_null(first(message, &["source"])),
            });
            let entries = router
                .service(
                    "router:commit-batch",
                    &json!({ "principal_id": principal, "events": or_null(batch).as_array().cloned().unwrap_or_default(), "options": options }),
                )
                .await?;
            let entries = entries.as_array().cloned().unwrap_or_default();
            let inserted: Vec<JsonValue> = entries
                .iter()
                .filter(|entry| truthy(entry.get("inserted")))
                .map(|entry| entry["event"].clone())
                .collect();
            if !inserted.is_empty() {
                after_committed(connection, principal, inserted).await?;
            }
            let events: Vec<JsonValue> =
                entries.iter().map(|entry| entry["event"].clone()).collect();
            Ok(success("events", message, json!({ "events": events })))
        }
        "list" => {
            let mut options = JsonMap::new();
            for (name, keys) in [
                ("projectId", &["project_id", "projectId"][..]),
                ("atomeId", &["atome_id", "atomeId"]),
                ("txId", &["tx_id", "txId"]),
                ("gestureId", &["gesture_id", "gestureId"]),
                ("since", &["since"]),
                ("until", &["until"]),
            ] {
                options.insert(name.into(), or_null(first(message, keys)));
            }
            for name in ["limit", "offset"] {
                if let Some(value) = message.get(name) {
                    options.insert(name.into(), value.clone());
                }
            }
            options.insert(
                "order".into(),
                first(message, &["order"])
                    .cloned()
                    .unwrap_or_else(|| json!("asc")),
            );
            let events = router
                .service(
                    "router:events-list",
                    &json!({ "principal_id": principal, "options": options }),
                )
                .await?;
            Ok(success("events", message, json!({ "events": events })))
        }
        _ => Ok(unknown("events", message, &action)),
    }
}

// What a state shows its reader: one's own with every right, another vault's only as
// its share projected it (its readable properties, its rights). A state of the vault
// router always names its vault, so the central `permissions` reading Fastify kept
// for the others never applies.
pub(super) fn readable(state: &JsonValue, principal: &str) -> Option<JsonValue> {
    first(state, &["atome_id", "id"])?;
    let vault = first(state, &["vault_principal_id"])?;
    if js::string(vault) == principal {
        let all =
            json!({ "read": true, "write": true, "create": true, "delete": true, "share": true });
        return Some(js::with(state, [("capabilities", all)]));
    }
    if !truthy(state.get("sync_share_id")) {
        return None;
    }
    let shown = match state.get("properties") {
        Some(JsonValue::Object(properties)) => !properties.is_empty(),
        Some(JsonValue::Array(items)) => !items.is_empty(),
        Some(JsonValue::String(text)) => !text.is_empty(),
        _ => false,
    };
    (shown || truthy(state.get("type"))).then(|| state.clone())
}

async fn state_current(
    connection: &Connection,
    message: &JsonValue,
    principal: &str,
) -> Result<JsonValue, String> {
    let action = action_of(message);
    let router = connection.router();
    match action.as_str() {
        "get" => {
            let Some(atome_id) = first(message, &["atome_id", "atomeId"]) else {
                return Ok(failure("state-current", message, "Missing atome_id"));
            };
            let state = router
                .service(
                    "router:state-get",
                    &json!({ "principal_id": principal, "atome_id": atome_id }),
                )
                .await?;
            Ok(match readable(&state, principal) {
                Some(state) => success("state-current", message, json!({ "state": state })),
                None => failure("state-current", message, "State not found"),
            })
        }
        "list" => {
            let mut options = JsonMap::new();
            for name in ["limit", "offset"] {
                if let Some(value) = message.get(name) {
                    options.insert(name.into(), value.clone());
                }
            }
            let oldest = message.get("order") == Some(&json!("oldest"));
            options.insert(
                "order".into(),
                if oldest {
                    json!("oldest")
                } else {
                    JsonValue::Null
                },
            );
            let after = message
                .get("after")
                .filter(|after| after.is_object() || after.is_array());
            options.insert("after".into(), or_null(after));
            options.insert(
                "atomeType".into(),
                or_null(first(message, &["atome_type", "atomeType"])),
            );
            options.insert("ownerId".into(), json!(principal));
            for (name, keys) in [
                ("includeShared", ["include_shared", "includeShared"]),
                ("excludeSystem", ["exclude_system", "excludeSystem"]),
                // A device mirroring its workspace must learn a deletion made elsewhere (browser_workspace.js).
                ("includeDeleted", ["include_deleted", "includeDeleted"]),
            ] {
                options.insert(name.into(), json!(is_true(message, &keys)));
            }
            options.insert(
                "project_id".into(),
                or_null(first(message, &["project_id", "projectId"])),
            );
            let states = router
                .service(
                    "router:state-list",
                    &json!({ "principal_id": principal, "options": options }),
                )
                .await?;
            let states: Vec<JsonValue> = states
                .as_array()
                .map(|states| {
                    states
                        .iter()
                        .filter_map(|state| readable(state, principal))
                        .collect()
                })
                .unwrap_or_default();
            let total = states.len();
            let mut fields = json!({ "states": states });
            if is_true(message, &["include_total", "includeTotal"]) {
                fields["total"] = json!(total);
            }
            Ok(success("state-current", message, fields))
        }
        _ => Ok(unknown("state-current", message, &action)),
    }
}
