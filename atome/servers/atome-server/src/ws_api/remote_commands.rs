// Remote commands (server/remoteCommandRelay.js, ported): one-shot "run this canonical tool on that
// seat", carried by the `remote-control` family (actions `command` and `command-result`). The
// server runs nothing: it authorizes the pair of seats, forwards the request to the target and
// hands the target's own answer back; only the seat a command was sent to may answer it.
use super::{Connection, seats, surface_grant_ops};
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

// R-248, the whole view of one account's device followed on another account's seat: asked by
// `display.follow`, its owner having granted `teleport_display` on that seat, the two seats then
// trade `display.relay` and `display.unfollow` until either ends it or the leading seat leaves.
const DISPLAY_FOLLOW: &str = "display.follow";
const DISPLAY_FOLLOWING: [&str; 2] = ["display.relay", "display.unfollow"];

// (account, seat) of the leader, then of the follower.
type Follow = ((String, String), (String, String));

static FOLLOWS: LazyLock<Mutex<Vec<Follow>>> = LazyLock::new(Mutex::default);

fn paired(follow: &Follow, a: &(String, String), b: &(String, String)) -> bool {
    (&follow.0 == a && &follow.1 == b) || (&follow.0 == b && &follow.1 == a)
}

/// The account of the seat `target` when it follows, or leads, the seat `caller` across accounts and `tool_id` is
/// one of the follow's own (`display.relay`, `display.unfollow`): neither page then names the other's account.
/// Otherwise the caller's own.
fn followed_account(
    user: &str,
    caller_surface: &str,
    target_surface: &str,
    tool_id: &str,
) -> String {
    let caller = (user.to_string(), caller_surface.to_string());
    let paired = DISPLAY_FOLLOWING
        .contains(&tool_id)
        .then(|| {
            FOLLOWS
                .lock()
                .expect("follows")
                .iter()
                .find_map(|(leader, follower)| {
                    if leader == &caller && follower.1 == target_surface {
                        Some(follower.0.clone())
                    } else if follower == &caller && leader.1 == target_surface {
                        Some(leader.0.clone())
                    } else {
                        None
                    }
                })
        })
        .flatten();
    paired.unwrap_or_else(|| user.to_string())
}

/// Whether the seat `caller` may run `tool_id` on `target`, another account's seat: open, or
/// refused (`surface_grant_pending` once its owner was asked).
async fn cross_gate(
    connection: &Connection,
    caller: (String, String),
    target: (String, String),
    tool_id: &str,
) -> Result<surface_grant_ops::Gate, String> {
    let gate = |capabilities: &'static [&'static str]| {
        surface_grant_ops::gate(connection, &target.0, &target.1, &caller.0, capabilities)
    };
    if tool_id == DISPLAY_FOLLOW {
        let opened = gate(&[grants::TELEPORT_DISPLAY]).await?;
        if matches!(opened, surface_grant_ops::Gate::Open) {
            let mut follows = FOLLOWS.lock().expect("follows");
            follows.retain(|follow| !paired(follow, &caller, &target));
            follows.push((caller, target));
        }
        return Ok(opened);
    }
    if DISPLAY_FOLLOWING.contains(&tool_id) {
        let mut follows = FOLLOWS.lock().expect("follows");
        let found = follows
            .iter()
            .any(|follow| paired(follow, &caller, &target));
        if tool_id == "display.unfollow" {
            follows.retain(|follow| !paired(follow, &caller, &target));
        }
        // Inside a follow only: no grant is asked for it.
        return Ok(if found {
            surface_grant_ops::Gate::Open
        } else {
            surface_grant_ops::Gate::Refused("remote_command_cross_user_not_authorized".into())
        });
    }
    gate(&[grants::REMOTE_COMMAND]).await
}

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
    // Only a program's own seat (its paired key, never an announced platform) speaks MCP, and a
    // program speaks nothing else: a bare `tool_id` would reach the page as an ordinary device's.
    let program_id = seats::get(user, &caller_surface)
        .and_then(|seat| seat["program_id"].as_str().map(str::to_string))
        .filter(|id| !id.is_empty());
    if mcp.is_some() != program_id.is_some() {
        return Ok(refused(match program_id {
            Some(_) => "remote_command_program_mcp_required",
            None => "remote_command_mcp_not_program",
        }));
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
    let target_user = match js::first(message, &["target_user_id", "targetUserId"]) {
        Some(named) => js::string(named),
        None => followed_account(user, &caller_surface, &target_surface, &tool_id),
    };
    // A program reaches its own account's devices alone.
    if mcp.is_some() && target_user != user {
        return Ok(refused("remote_command_mcp_not_program"));
    }
    let Some(target) = seats::get(&target_user, &target_surface) else {
        return Ok(refused("remote_command_target_offline"));
    };
    // Another account's device only with a grant its owner gave for exactly this capability:
    // `remote_command`, or `teleport_display` for the whole view (`display.*`).
    let caller = (user.to_string(), caller_surface.clone());
    let target_seat = (target_user.clone(), target_surface.clone());
    if target_user != user {
        let gate = cross_gate(connection, caller, target_seat, &tool_id).await?;
        if let Some((error, grant_id)) = gate.refusal() {
            return Ok(Outcome {
                error: Some(error.to_string()),
                fields: json!({ "grant_id": grant_id }),
            });
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
    // A person's yes is never a program's to give: it is asked on the page (mcp_relay_target.js).
    command["confirmed"] =
        json!(program_id.is_none() && message.get("confirmed") == Some(&json!(true)));
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
    let follow_asked = target_user != user && tool_id == DISPLAY_FOLLOW;
    let settled = match tokio::time::timeout(timeout(), &mut answered).await {
        Ok(settled) => settled,
        Err(_) => {
            settle(&command_id, Err("remote_command_timeout".into()));
            answered.await
        }
    }
    .map_err(|_| "remote_command_settle_lost".to_string())?;
    // A follow the other seat never took is no follow.
    if follow_asked && settled.is_err() {
        let (caller, target) = (
            (user.to_string(), caller_surface.clone()),
            (target_user.clone(), target_surface.clone()),
        );
        let mut follows = FOLLOWS.lock().expect("follows");
        follows.retain(|follow| !paired(follow, &caller, &target));
    }
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
    // The leading seat gone, its whole view ends; a follower reloads into following and keeps it.
    let lost = (user.to_string(), surface_id.to_string());
    FOLLOWS
        .lock()
        .expect("follows")
        .retain(|(leader, _)| leader != &lost);
}
