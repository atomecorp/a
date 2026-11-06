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
            let asking = json!({ "type": "surface-grant-request", "grant": requested.grant, "from_user_id": user });
            notify(&owner, asking).await;
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
    // An owner may approve a subset of what was asked.
    let capabilities = message.get("capabilities").filter(|c| c.is_array());
    let surfaces = &connection.ws_api.social.surfaces;
    let grant = match surfaces
        .decide(&grant_id, user, accept, capabilities)
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
