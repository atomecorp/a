// Remote commands (server/remoteCommandRelay.js, ported): one-shot "run this canonical tool on that
// seat", carried by the `remote-control` family (actions `command` and `command-result`). The
// server runs nothing: it authorizes the pair of seats, forwards the request to the target and
// hands the target's own answer back; only the seat a command was sent to may answer it.
use super::{Connection, seats};
use crate::social::surfaces::grants;
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tokio::sync::oneshot;

// A command is an intention, not a payload transfer: anything larger is refused.
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_RESULT_BYTES: usize = 256 * 1024;
// A program's MCP request travels as `mcp` instead of `tool_id`; only these methods are relayed.
const RELAYABLE_MCP_METHODS: [&str; 12] = [
    "initialize",
    "ping",
    "tools/list",
    "tools/call",
    "resources/list",
    "resources/read",
    "resources/templates/list",
    "prompts/list",
    "prompts/get",
    "notifications/cancelled",
    "atome/confirmation/await",
    "atome/notifications/await",
];

fn timeout() -> Duration {
    let configured = js::number(
        std::env::var("REMOTE_COMMAND_TIMEOUT_MS")
            .ok()
            .map(JsonValue::from)
            .as_ref(),
    );
    let ms = if configured.is_finite() && configured > 0.0 {
        configured
    } else {
        30_000.0
    };
    Duration::from_secs_f64(ms / 1000.0)
}

// How a command ended: the target's result, else why not.
type Settled = Result<JsonValue, String>;

struct Pending {
    caller_user: String,
    caller_surface: String,
    target_user: String,
    target_surface: String,
    done: oneshot::Sender<Settled>,
}

static PENDING: LazyLock<Mutex<IndexMap<String, Pending>>> = LazyLock::new(Mutex::default);

fn settle(command_id: &str, outcome: Settled) -> bool {
    let Some(command) = PENDING.lock().expect("commands").shift_remove(command_id) else {
        return false;
    };
    let _received = command.done.send(outcome);
    true
}

/// The family envelope's error, else its fields.
pub(super) struct Outcome {
    pub error: Option<String>,
    pub fields: JsonValue,
}

fn refused(error: &str) -> Outcome {
    Outcome {
        error: Some(error.into()),
        fields: json!({}),
    }
}

fn bytes(value: &JsonValue) -> usize {
    value.to_string().len()
}

// `/^[A-Za-z0-9_.:-]{1,128}$/`: a canonical identifier (`tv.open_channel`, `pointer.click`).
fn identifier(text: &str) -> bool {
    (1..=128).contains(&text.len())
        && text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b':' | b'-'))
}

// `readMcpMessage`: none when absent, the refusal when it is not a relayable request.
fn mcp_of(message: &JsonValue) -> Result<Option<&JsonValue>, &'static str> {
    let Some(mcp) = message.get("mcp") else {
        return Ok(None);
    };
    let method = mcp.get("method").and_then(JsonValue::as_str);
    if !mcp.is_object()
        || mcp.get("jsonrpc") != Some(&json!("2.0"))
        || !method.is_some_and(|method| RELAYABLE_MCP_METHODS.contains(&method))
        || mcp.get("params").is_some_and(|params| !params.is_object())
    {
        return Err("remote_command_mcp_invalid");
    }
    if bytes(mcp) > MAX_INPUT_BYTES {
        return Err("remote_command_input_too_large");
    }
    Ok(Some(mcp))
}

/// Caller side: the command forwarded, and the target's answer awaited (`relayRemoteCommand`).
pub(super) async fn relay(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<Outcome, String> {
    let caller_surface = seats::own(connection);
    let target_surface = seats::normalized_id(seats::either(
        message,
        "target_surface_id",
        "targetSurfaceId",
    ));
    if caller_surface.is_empty() {
        return Ok(refused("surface_not_announced"));
    }
    if target_surface.is_empty() {
        return Ok(refused("remote_command_target_required"));
    }
    if target_surface == caller_surface {
        return Ok(refused("remote_command_target_is_caller"));
    }
    let mcp = match mcp_of(message) {
        Ok(mcp) => mcp,
        Err(error) => return Ok(refused(error)),
    };
    // Only a program's own seat (its paired key, never an announced platform) speaks MCP.
    let program_id = mcp
        .and_then(|_| seats::get(user, &caller_surface))
        .and_then(|seat| seat["program_id"].as_str().map(str::to_string))
        .filter(|id| !id.is_empty());
    if mcp.is_some() && program_id.is_none() {
        return Ok(refused("remote_command_mcp_not_program"));
    }
    let tool_id = js::id(message.get("tool_id"));
    let tool_action = js::id(message.get("tool_action"));
    if mcp.is_none() && !identifier(&tool_id) {
        return Ok(refused("remote_command_tool_invalid"));
    }
    if !tool_action.is_empty() && !identifier(&tool_action) {
        return Ok(refused("remote_command_action_invalid"));
    }
    let input = message.get("input").cloned().unwrap_or_else(|| json!({}));
    if !input.is_object() {
        return Ok(refused("remote_command_input_invalid"));
    }
    if bytes(&input) > MAX_INPUT_BYTES {
        return Ok(refused("remote_command_input_too_large"));
    }
    let target_user = js::first(message, &["target_user_id", "targetUserId"])
        .map_or_else(|| user.to_string(), js::string);
    // A program reaches its own account's devices alone.
    if mcp.is_some() && target_user != user {
        return Ok(refused("remote_command_mcp_not_program"));
    }
    let Some(target) = seats::get(&target_user, &target_surface) else {
        return Ok(refused("remote_command_target_offline"));
    };
    // Another account's device only with a grant its owner gave for exactly this capability.
    if target_user != user {
        let surfaces = &connection.ws_api.social.surfaces;
        let allowed = surfaces
            .has_capability(&target_user, &target_surface, user, grants::REMOTE_COMMAND)
            .await?;
        if !allowed {
            return Ok(refused("remote_command_cross_user_not_authorized"));
        }
    }
    let command_id = uuid::Uuid::new_v4().to_string();
    let (done, mut answered) = oneshot::channel();
    let pending = Pending {
        caller_user: user.to_string(),
        caller_surface: caller_surface.clone(),
        target_user: target_user.clone(),
        target_surface: target_surface.clone(),
        done,
    };
    PENDING
        .lock()
        .expect("commands")
        .insert(command_id.clone(), pending);
    let mut command = json!({ "type": "remote-control-command", "command_id": command_id });
    match mcp {
        Some(mcp) => command["mcp"] = mcp.clone(),
        None => command["tool_id"] = json!(tool_id),
    }
    command["tool_action"] = if tool_action.is_empty() {
        JsonValue::Null
    } else {
        json!(tool_action)
    };
    command["input"] = input;
    command["confirmed"] = json!(message.get("confirmed") == Some(&json!(true)));
    command["from_surface_id"] = json!(caller_surface);
    command["from_user_id"] = json!(user);
    if let Some(program_id) = &program_id {
        command["from_program_id"] = json!(program_id);
    }
    // So the target can say where the order came from.
    let label = seats::get(user, &caller_surface).map(|seat| seat["label"].clone());
    command["from_label"] = label
        .filter(|label| js::truthy(Some(label)))
        .unwrap_or(JsonValue::Null);
    command["timestamp"] = json!(seats::now());
    if !seats::send(&target_user, &target_surface, command).await {
        settle(&command_id, Err("remote_command_target_offline".into()));
    }
    let settled = match tokio::time::timeout(timeout(), &mut answered).await {
        Ok(settled) => settled,
        Err(_) => {
            settle(&command_id, Err("remote_command_timeout".into()));
            answered.await
        }
    }
    .map_err(|_| "remote_command_settle_lost".to_string())?;
    Ok(match settled {
        Err(error) => Outcome {
            error: Some(error),
            fields: json!({ "command_id": command_id, "target_surface_id": target_surface }),
        },
        Ok(result) => {
            let label = target["label"].clone();
            let label = if js::truthy(Some(&label)) {
                label
            } else {
                JsonValue::Null
            };
            Outcome {
                error: None,
                fields: json!({ "command_id": command_id, "target_surface_id": target_surface,
                    "target_label": label, "result": result }),
            }
        }
    })
}

/// Target side: the answer to a command this very seat received (`settleRemoteCommand`).
pub(super) fn settle_result(connection: &Connection, message: &JsonValue, user: &str) -> Outcome {
    let command_id = js::id(message.get("command_id"));
    let target = PENDING
        .lock()
        .expect("commands")
        .get(&command_id)
        .map(|command| (command.target_user.clone(), command.target_surface.clone()));
    let Some((target_user, target_surface)) = target else {
        return refused("remote_command_unknown");
    };
    if user != target_user || seats::own(connection) != target_surface {
        return refused("remote_command_not_target");
    }
    let result = message
        .get("result")
        .filter(|result| result.is_object())
        .cloned()
        .unwrap_or_else(|| json!({ "ok": false, "error": "remote_command_result_invalid" }));
    let result = if bytes(&result) > MAX_RESULT_BYTES {
        let error = js::first(&result, &["error"])
            .cloned()
            .unwrap_or(JsonValue::Null);
        json!({ "ok": result.get("ok") == Some(&json!(true)), "error": error, "truncated": true })
    } else {
        result
    };
    settle(&command_id, Ok(result));
    Outcome {
        error: None,
        fields: json!({ "command_id": command_id, "settled": true }),
    }
}

/// A seat disappeared: every command waiting on it, or sent from it, ends now.
pub(super) fn surface_lost(user: &str, surface_id: &str) {
    let ended: Vec<(String, &'static str)> = PENDING
        .lock()
        .expect("commands")
        .iter()
        .filter_map(|(command_id, command)| {
            let target = command.target_user == user && command.target_surface == surface_id;
            let caller = command.caller_user == user && command.caller_surface == surface_id;
            match (target, caller) {
                (true, _) => Some((command_id.clone(), "remote_command_target_offline")),
                (false, true) => Some((command_id.clone(), "remote_command_caller_lost")),
                _ => None,
            }
        })
        .collect();
    for (command_id, error) in ended {
        settle(&command_id, Err(error.into()));
    }
}
