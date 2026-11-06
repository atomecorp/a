// The device-seat families of `/ws/api` (server/wsSurfaceOperations.js, ported, with the dispatch
// of server/wsApiOperationChain.js to `surface`, `teleport` and `surface-grant`): announcing a
// seat, listing the account's seats and those shared with it, keeping one alive, retiring it.
// The seats are seats.rs's; the connection says who it is (identity.rs `connection_of`, the
// account its message's token names, and the program seat its key names); the account's other connections are told on the registry (social/live.rs).
use super::projection_ops::response;
use super::{Connection, seats, surface_grant_ops, teleport_ops};
use crate::social::live;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KINDS: [&str; 3] = ["surface", "teleport", "surface-grant"];
const ACTIONS: [&str; 4] = ["announce", "list", "ping", "retire"];

pub(super) fn failure(kind: &str, message: &JsonValue, error: &str) -> JsonValue {
    response(kind, message, false, json!({ "error": error }))
}

/// `String(message.action || message.op || '').trim().toLowerCase()`.
pub(super) fn action_of(message: &JsonValue) -> String {
    js::id(js::first(message, &["action", "op"])).to_lowercase()
}

/// Who a frame of these families comes from: its account, and the program seat its key names.
pub(super) struct Who {
    pub user: String,
    pub program: Result<Option<String>, String>,
}

/// Who a frame comes from, in the order Fastify meets it: the device session, then (for an
/// action the family knows, else `refusal`) the account its token names
/// (`resolveWsApiPrincipal(connection, message)`) and whether that account is provisioned.
/// `Err` is the reply that ends the frame.
pub(super) async fn identity(
    connection: &Connection,
    kind: &str,
    message: &JsonValue,
    refusal: Option<String>,
) -> Result<Who, JsonValue> {
    // What the identity reads of the message, not its payload (a preview frame is 2 MiB).
    let mut read = JsonMap::new();
    for key in ["type", "token", "requestId", "request_id"] {
        if let Some(value) = message.get(key) {
            read.insert(key.into(), value.clone());
        }
    }
    let known = refusal.is_none();
    let fields = json!({ "message": read, "signed": known, "seat": known && kind == "surface" });
    let front = connection
        .connection_of(fields)
        .await
        .map_err(|error| failure(kind, message, &error))?;
    if let Some(session_error) = front.get("session_error") {
        return Err(session_error.clone());
    }
    if let Some(refusal) = refusal {
        return Err(failure(kind, message, &refusal));
    }
    let Some(user) = front.get("principal").and_then(JsonValue::as_str) else {
        let error = match front.get("thrown") {
            Some(thrown) => js::text(Some(thrown)),
            None => "Unauthenticated ws/api connection".into(),
        };
        return Err(failure(kind, message, &error));
    };
    if front.get("provisioned") != Some(&json!(true)) {
        return Err(failure(kind, message, "remote_account_not_provisioned"));
    }
    let program = match front.get("program_error") {
        Some(error) => Err(js::text(Some(error))),
        None => Ok(front
            .get("program")
            .and_then(JsonValue::as_str)
            .map(str::to_string)),
    };
    Ok(Who {
        user: user.to_string(),
        program,
    })
}

async fn announce(
    connection: &Arc<Connection>,
    message: &JsonValue,
    who: Who,
) -> Result<JsonValue, String> {
    let surface_id = seats::normalized_id(seats::either(message, "surface_id", "surfaceId"));
    if surface_id.is_empty() {
        return Ok(failure("surface", message, "surface_id_invalid"));
    }
    // A program is told by its key (its token's seat), never by the platform it announces.
    let program = who.program?;
    if program.is_none() && js::id(message.get("platform")) == "mcp_program" {
        return Ok(failure("surface", message, "surface_program_key_required"));
    }
    let program_platform = json!("mcp_program");
    let announced = seats::Announced {
        label: message.get("label"),
        platform: match program {
            Some(_) => Some(&program_platform),
            None => message.get("platform"),
        },
        capabilities: message.get("capabilities"),
        program_id: program,
    };
    let user = who.user.as_str();
    let surface = seats::attach(connection, user, &surface_id, announced);
    let online = seats::presence("online", &surface);
    live::tell_except(user, &online, connection.live).await;
    // A returning seat reclaims the objects that went DISCONNECTED when it left.
    let social = &connection.ws_api.social;
    let restored = match teleport_ops::surface_back(social, user, &surface_id).await {
        Ok(restored) => restored,
        Err(error) => {
            eprintln!("[ws/api] teleport reconnect failed {error}");
            Vec::new()
        }
    };
    let fields = json!({ "surface": surface, "surfaces": seats::list(user, &surface_id),
        "restored_atome_ids": restored });
    Ok(response("surface", message, true, fields))
}

async fn list(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let flag = |a: &str, b: &str| {
        message.get(a) == Some(&json!(true)) || message.get(b) == Some(&json!(true))
    };
    let exclude = if flag("exclude_self", "excludeSelf") {
        seats::own(connection)
    } else {
        String::new()
    };
    let own = seats::list(user, &exclude);
    // Another account's seats are listed only once their owner granted something on them.
    let mut shared = Vec::new();
    if flag("include_shared", "includeShared") {
        let social = &connection.ws_api.social;
        let grants = social.surfaces.list(user, &json!("outgoing")).await?;
        for grant in grants["outgoing"].as_array().into_iter().flatten() {
            if grant["status"] != json!("granted") {
                continue;
            }
            let owner = js::string(&grant["owner_id"]);
            if let Some(surface) = seats::get(&owner, &js::string(&grant["surface_id"])) {
                shared.push(js::with(&surface, [("shared", json!(true))]));
            }
        }
    }
    let fields = json!({ "surfaces": own, "shared": shared });
    Ok(response("surface", message, true, fields))
}

async fn surface(connection: &Arc<Connection>, message: &JsonValue) -> JsonValue {
    let action = action_of(message);
    let refusal = (!ACTIONS.contains(&action.as_str())).then(|| {
        let named = if action.is_empty() {
            "missing"
        } else {
            &action
        };
        format!("Unknown surface action: {named}")
    });
    let who = match identity(connection, "surface", message, refusal).await {
        Ok(who) => who,
        Err(reply) => return reply,
    };
    let user = who.user.clone();
    let outcome = match action.as_str() {
        "announce" => announce(connection, message, who).await,
        "list" => list(connection, message, &user).await,
        "ping" => Ok(match seats::touch(connection) {
            Some(surface) => response("surface", message, true, json!({ "surface": surface })),
            None => failure("surface", message, "surface_not_announced"),
        }),
        _ => match seats::detach(connection) {
            Some(surface) => {
                let offline = seats::presence("offline", &surface);
                live::tell_except(&user, &offline, connection.live).await;
                Ok(response(
                    "surface",
                    message,
                    true,
                    json!({ "surface": surface }),
                ))
            }
            None => Ok(failure("surface", message, "surface_not_announced")),
        },
    };
    outcome.unwrap_or_else(|error| failure("surface", message, &error))
}

/// One frame of `surface`, `teleport` or `surface-grant`, its type read trimmed as the family
/// chain reads it.
pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let kind = js::trim(&js::text(message.get("type"))).to_string();
    let reply = match kind.as_str() {
        "surface" => surface(&connection, &message).await,
        "teleport" => teleport_ops::reply(&connection, &message).await,
        _ => surface_grant_ops::reply(&connection, &message).await,
    };
    connection.reply(reply).await;
}
