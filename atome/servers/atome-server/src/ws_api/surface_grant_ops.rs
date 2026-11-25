// The `surface-grant` family of `/ws/api` (server/wsSurfaceGrantOperations.js, ported): A asks,
// B is told, B accepts or refuses, A may act, either may revoke. A request is never an
// authorization; only the owner's `accept` turns it into one. The grants are the central
// database's (social/surfaces/grants.rs); the people are told on every live connection of theirs
// (social/live.rs), so an owner answers from whichever device they hold.
use super::projection_ops::response;
use super::surface_ops::{action_of, failure, identity};
use super::{Connection, seats};
use crate::social::live;
use crate::social::surfaces::grants;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

const KIND: &str = "surface-grant";
const ACTIONS: [&str; 5] = ["request", "accept", "deny", "revoke", "list"];

async fn notify(target: &str, mut payload: JsonValue) {
    payload["timestamp"] = json!(seats::now());
    live::tell(target, &payload).await;
}

async fn request(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let owner = js::id(js::first(message, &["owner_id", "ownerId"]));
    let surface_id = seats::normalized_id(seats::either(message, "surface_id", "surfaceId"));
    if owner.is_empty() {
        return Ok(failure(KIND, message, "surface_grant_owner_required"));
    }
    // Asked by account, the request fans across the owner's announced seats, the owner choosing
    // which to allow: another account's seat ids are not known before any authorization.
    let targets = if surface_id.is_empty() {
        seats::list(&owner, "")
            .iter()
            .map(|surface| js::string(&surface["surface_id"]))
            .collect()
    } else {
        vec![surface_id.clone()]
    };
    if targets.is_empty() {
        return Ok(failure(KIND, message, "surface_grant_owner_offline"));
    }
    if !surface_id.is_empty() && seats::get(&owner, &surface_id).is_none() {
        return Ok(failure(KIND, message, "surface_grant_surface_unknown"));
    }
    let asked = grants::normalized(message.get("capabilities"));
    let capabilities = if asked.is_empty() {
        grants::DEFAULT_REQUESTED
            .iter()
            .map(|c| c.to_string())
            .collect()
    } else {
        asked
    };
    let expires_at = js::first(message, &["expires_at", "expiresAt"])
        .cloned()
        .unwrap_or(JsonValue::Null);
    let surfaces = &connection.ws_api.social.surfaces;
    let mut granted = Vec::new();
    for target in targets {
        let requested = surfaces
            .request(&owner, &target, user, &capabilities, expires_at.clone())
            .await?;
        let requested = match requested {
            Ok(requested) => requested,
            Err(refusal) => return Ok(failure(KIND, message, &refusal)),
        };
        if !requested.reused {
            ask_owner(connection, &requested.grant, user).await?;
        }
        granted.push(requested.grant);
    }
    let fields = json!({ "grant": granted[0], "grants": granted });
    Ok(response(KIND, message, true, fields))
}

async fn decision(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
    accept: bool,
) -> Result<JsonValue, String> {
    let grant_id = js::id(js::first(message, &["grant_id", "grantId"]));
    // An owner may approve a subset of what was asked, for a while or for one use.
    let capabilities = message.get("capabilities").filter(|c| c.is_array());
    let expires_at = match js::first(message, &["expires_at", "expiresAt"]) {
        None => None,
        Some(JsonValue::String(at)) => Some(at.clone()),
        Some(_) => return Ok(failure(KIND, message, "surface_grant_expires_invalid")),
    };
    let limits = grants::Limits {
        expires_at,
        once: message.get("once") == Some(&json!(true)),
    };
    let surfaces = &connection.ws_api.social.surfaces;
    let grant = match surfaces
        .decide(&grant_id, user, accept, capabilities, limits)
        .await?
    {
        Ok(grant) => grant,
        Err(refusal) => return Ok(failure(KIND, message, &refusal)),
    };
    let told = if accept {
        "surface-grant-granted"
    } else {
        "surface-grant-denied"
    };
    let grantee = js::string(&grant["grantee_id"]);
    notify(&grantee, json!({ "type": told, "grant": grant })).await;
    Ok(response(KIND, message, true, json!({ "grant": grant })))
}

async fn revoke(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let grant_id = js::id(js::first(message, &["grant_id", "grantId"]));
    let surfaces = &connection.ws_api.social.surfaces;
    let before = surfaces.grant(&grant_id).await?;
    let (grant, revoked_by) = match surfaces.revoke(&grant_id, user).await? {
        Ok(revoked) => revoked,
        Err(refusal) => return Ok(failure(KIND, message, &refusal)),
    };
    // Both sides learn at once: a revoked grant must not keep looking live on the grantee's screen.
    for party in ["owner_id", "grantee_id"] {
        let Some(principal) = before
            .as_ref()
            .and_then(|before| before.get(party))
            .filter(|principal| js::truthy(Some(principal)))
        else {
            continue;
        };
        let revoked = json!({ "type": "surface-grant-revoked", "grant": grant });
        notify(&js::string(principal), revoked).await;
    }
    let mut fields = json!({ "grant": grant });
    if let Some(revoked_by) = revoked_by {
        fields["revoked_by"] = json!(revoked_by);
    }
    Ok(response(KIND, message, true, fields))
}

/// The owner told of a new request (`surface-grant-request`), by who asks and the device asked for, never by raw ids
/// alone: `grant.grantee_name` (the asker's display name, empty when none) and `grant.surface_label`.
async fn ask_owner(connection: &Connection, grant: &JsonValue, user: &str) -> Result<(), String> {
    let owner = js::string(&grant["owner_id"]);
    let grantee_name = connection
        .ws_api
        .social
        .directory
        .source_profile(user)
        .await?
        .map(|profile| profile.display_name)
        .unwrap_or_default();
    let surface_label = seats::get(&owner, &js::string(&grant["surface_id"]))
        .map(|surface| surface["label"].clone())
        .unwrap_or_else(|| json!(""));
    let named = js::with(
        grant,
        [
            ("grantee_name", json!(grantee_name)),
            ("surface_label", surface_label),
        ],
    );
    // The request lies in the owner's notification stack, where their inbox answers it on any of their devices, even
    // one that was closed when it came (rule 21); the push below tells a device open now at once.
    let card = json!({
        "id": format!("surface_grant_{}", js::string(&grant["grant_id"])),
        "kind": "surface-grant-request",
        "subject": named["surface_label"],
        "extra": { "grant_id": grant["grant_id"], "capabilities": grant["capabilities"], "surface_id": grant["surface_id"] },
    });
    connection
        .ws_api
        .social
        .notifier
        .notify(&owner, Some(user), &card)
        .await?;
    let asking = json!({ "type": "surface-grant-request", "grant": named, "from_user_id": user });
    notify(&owner, asking).await;
    Ok(())
}

/// What the gate of a cross-account action decided.
pub(super) enum Gate {
    Open,
    /// Not granted: the owner was asked (`surface-grant-request`) and the action is refused with
    /// `surface_grant_pending` and this grant's id; the owner's accept tells the asker
    /// `surface-grant-granted`, and the asker's page runs the action again.
    Pending(String),
    /// Not granted and not to be asked (the request itself was refused).
    Refused(String),
}

impl Gate {
    /// The refusal's code and the grant it waits on, none when open.
    pub(super) fn refusal(&self) -> Option<(&str, JsonValue)> {
        match self {
            Gate::Open => None,
            Gate::Pending(grant_id) => Some(("surface_grant_pending", json!(grant_id))),
            Gate::Refused(code) => Some((code.as_str(), JsonValue::Null)),
        }
    }
}

/// The gate of every cross-account action: `capabilities` held on `owner`'s `surface` by
/// `grantee`. A grant given for one use is spent here, and both parties learn it ended. Without
/// one, the owner is asked for exactly these capabilities (a pending request asked again is the same).
pub(super) async fn gate(
    connection: &Connection,
    owner: &str,
    surface: &str,
    grantee: &str,
    capabilities: &[&str],
) -> Result<Gate, String> {
    let surfaces = &connection.ws_api.social.surfaces;
    let Some(spent) = surfaces
        .use_capabilities(owner, surface, grantee, capabilities)
        .await?
    else {
        let asked: Vec<String> = capabilities.iter().map(|c| c.to_string()).collect();
        let requested = surfaces
            .request(owner, surface, grantee, &asked, JsonValue::Null)
            .await?;
        return Ok(match requested {
            Err(refusal) => Gate::Refused(refusal),
            Ok(requested) => {
                if !requested.reused {
                    ask_owner(connection, &requested.grant, grantee).await?;
                }
                Gate::Pending(js::string(&requested.grant["grant_id"]))
            }
        });
    };
    for grant in spent {
        let revoked =
            json!({ "type": "surface-grant-revoked", "grant": grant, "revoked_by": "used" });
        for party in [owner, grantee] {
            notify(party, revoked.clone()).await;
        }
    }
    Ok(Gate::Open)
}

/// One `surface-grant` frame's reply.
pub(super) async fn reply(connection: &Connection, message: &JsonValue) -> JsonValue {
    let action = action_of(message);
    let refusal = (!ACTIONS.contains(&action.as_str())).then(|| {
        let named = if action.is_empty() {
            "missing"
        } else {
            &action
        };
        format!("Unknown surface-grant action: {named}")
    });
    let user = match identity(connection, KIND, message, refusal).await {
        Ok(who) => who.user,
        Err(reply) => return reply,
    };
    let outcome = match action.as_str() {
        "request" => request(connection, message, &user).await,
        "accept" => decision(connection, message, &user, true).await,
        "deny" => decision(connection, message, &user, false).await,
        "revoke" => revoke(connection, message, &user).await,
        _ => {
            let role = js::first(message, &["role"])
                .cloned()
                .unwrap_or_else(|| json!("all"));
            let surfaces = &connection.ws_api.social.surfaces;
            surfaces
                .list(&user, &role)
                .await
                .map(|grants| response(KIND, message, true, json!({ "grants": grants })))
        }
    };
    outcome.unwrap_or_else(|error| failure(KIND, message, &error))
}
