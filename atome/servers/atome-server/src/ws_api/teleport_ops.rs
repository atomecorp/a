// The `teleport` family of `/ws/api` (server/wsTeleportOperations.js, ported), two-phase by
// construction since an object is never treated as gone before its destination confirmed it:
//   offer   -> TELEPORT_PREPARING committed, `teleport-offer` to the target seat
//   accept  -> REMOTE committed, `teleport_surface_id` finally moves
//   decline / timeout / target gone -> rollback, nothing was ever removed
// The transitions are social/surfaces/teleport_state.rs's; every object lives in its owner's vault
// (social/surfaces/). The offers awaiting an answer are this server's, as the seats they join.
use super::projection_ops::response;
use super::surface_ops::{action_of, failure, identity};
use super::{Connection, seats};
use crate::social::surfaces::{grants, teleport_state};
use crate::social::{Social, live};
use crate::vault_router::js;
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

const KIND: &str = "teleport";
const ACTIONS: [&str; 7] = [
    "offer", "accept", "decline", "cancel", "return", "persist", "state",
];

// Long enough for a sleeping phone to wake and paint, short enough that an object pushed at a
// dead screen comes back rather than spinning (`TELEPORT_OFFER_TIMEOUT_MS`).
fn offer_timeout() -> Duration {
    let configured = js::number(
        std::env::var("TELEPORT_OFFER_TIMEOUT_MS")
            .ok()
            .map(JsonValue::from)
            .as_ref(),
    );
    let ms = if configured.is_finite() && configured > 0.0 {
        configured
    } else {
        12_000.0
    };
    Duration::from_secs_f64(ms / 1000.0)
}

#[derive(Clone)]
struct Offer {
    atome_id: String,
    owner_id: String,
    target_user_id: String,
    target_surface_id: String,
    source_surface_id: String,
    timer: tokio::task::AbortHandle,
}

static OFFERS: LazyLock<Mutex<IndexMap<String, Offer>>> = LazyLock::new(Mutex::default);

fn pending(session_id: &str) -> Option<Offer> {
    OFFERS.lock().expect("offers").get(session_id).cloned()
}

fn forget(session_id: &str) -> Option<Offer> {
    OFFERS.lock().expect("offers").shift_remove(session_id)
}

fn session_of(message: &JsonValue) -> String {
    js::id(js::first(message, &["session_id", "sessionId"]))
}

fn atome_of(message: &JsonValue) -> String {
    js::id(js::first(message, &["atome_id", "atomeId"]))
}

/// The rollback shared by decline, timeout, cancel and a lost seat: the outer error a failure,
/// the inner one a refusal. Both ends learn the object stayed put.
async fn rollback(
    social: &Social,
    session_id: &str,
    reason: &str,
) -> Result<Result<(), String>, String> {
    let Some(offer) = forget(session_id) else {
        return Ok(Err("teleport_session_unknown".into()));
    };
    // The timeout's own task is the one rolling back: it is not aborted under itself.
    if reason != "timeout" {
        offer.timer.abort();
    }
    let surfaces = &social.surfaces;
    let Some(properties) = surfaces
        .properties(&offer.owner_id, &offer.atome_id)
        .await?
    else {
        return Ok(Err("teleport_atome_missing".into()));
    };
    let patch = match teleport_state::cancel(&properties, session_id) {
        Ok(patch) => patch,
        Err(refusal) => return Ok(Err(refusal)),
    };
    if let Err(error) = surfaces
        .commit(&offer.atome_id, patch, &offer.owner_id)
        .await
    {
        return Ok(Err(error));
    }
    let cancelled = || {
        json!({ "type": "teleport-cancelled", "atome_id": offer.atome_id, "session_id": session_id,
            "reason": reason, "timestamp": seats::now() })
    };
    live::tell(&offer.owner_id, &cancelled()).await;
    if offer.target_user_id != offer.owner_id {
        seats::send(&offer.target_user_id, &offer.target_surface_id, cancelled()).await;
    }
    Ok(Ok(()))
}

async fn offer(
    connection: &Arc<Connection>,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let atome_id = atome_of(message);
    let target_surface_id = seats::normalized_id(seats::either(
        message,
        "target_surface_id",
        "targetSurfaceId",
    ));
    let source_surface_id = seats::own(connection);
    let refused = |error: &str| Ok(failure(KIND, message, error));
    if atome_id.is_empty() {
        return refused("teleport_atome_required");
    }
    if target_surface_id.is_empty() {
        return refused("teleport_target_required");
    }
    if source_surface_id.is_empty() {
        return refused("surface_not_announced");
    }
    // The destination account is the sender's unless another one is asked for explicitly.
    let target_user = js::first(message, &["target_user_id", "targetUserId"])
        .map_or_else(|| user.to_string(), js::string);
    let social = &connection.ws_api.social;
    let surfaces = &social.surfaces;
    if target_user != user {
        // Receiving and displaying are distinct capabilities, both needed on another's screen.
        let receive = grants::TELEPORT_RECEIVE;
        let display = grants::TELEPORT_DISPLAY;
        let allowed = surfaces
            .has_capability(&target_user, &target_surface_id, user, receive)
            .await?
            && surfaces
                .has_capability(&target_user, &target_surface_id, user, display)
                .await?;
        if !allowed {
            return refused("teleport_cross_user_not_authorized");
        }
    }
    if seats::get(&target_user, &target_surface_id).is_none() {
        return refused("teleport_target_offline");
    }
    let Some(properties) = surfaces.properties(user, &atome_id).await? else {
        return refused("teleport_atome_missing");
    };
    // One offer in flight per atome.
    if teleport_state::View::of(&properties).state == teleport_state::PREPARING {
        return refused("teleport_already_preparing");
    }
    let session_id = uuid::Uuid::new_v4().to_string();
    let patch = match teleport_state::prepare(
        &properties,
        &target_surface_id,
        &source_surface_id,
        &session_id,
    ) {
        Ok(patch) => patch,
        Err(refusal) => return refused(&refusal),
    };
    if let Err(error) = surfaces.commit(&atome_id, patch, user).await {
        return refused(&error);
    }
    let timer = {
        let (social, session_id) = (social.clone(), session_id.clone());
        tokio::spawn(async move {
            tokio::time::sleep(offer_timeout()).await;
            if let Err(error) = rollback(&social, &session_id, "timeout").await {
                eprintln!("[ws/api] teleport offer timeout failed: {error}");
            }
        })
        .abort_handle()
    };
    let held = Offer {
        atome_id: atome_id.clone(),
        owner_id: user.to_string(),
        target_user_id: target_user.clone(),
        target_surface_id: target_surface_id.clone(),
        source_surface_id: source_surface_id.clone(),
        timer,
    };
    OFFERS
        .lock()
        .expect("offers")
        .insert(session_id.clone(), held);
    let offered = json!({ "type": "teleport-offer", "atome_id": atome_id, "session_id": session_id,
        "from_surface_id": source_surface_id, "from_user_id": user, "timestamp": seats::now() });
    // The seat was listed a moment ago but its connection is gone: rolled back at once.
    if !seats::send(&target_user, &target_surface_id, offered).await {
        let _refusal = rollback(social, &session_id, "target_unreachable").await?;
        return refused("teleport_target_offline");
    }
    let fields = json!({ "session_id": session_id, "atome_id": atome_id,
        "target_surface_id": target_surface_id, "state": teleport_state::PREPARING });
    Ok(response(KIND, message, true, fields))
}

async fn accept(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let session_id = session_of(message);
    let refused = |error: &str| Ok(failure(KIND, message, error));
    let Some(offer) = pending(&session_id) else {
        return refused("teleport_session_unknown");
    };
    // Only the seat the offer was addressed to accepts it; knowing a session id is not authority.
    if user != offer.target_user_id {
        return refused("teleport_not_target");
    }
    if seats::own(connection) != offer.target_surface_id {
        return refused("teleport_not_target_surface");
    }
    let social = &connection.ws_api.social;
    let surfaces = &social.surfaces;
    let Some(properties) = surfaces
        .properties(&offer.owner_id, &offer.atome_id)
        .await?
    else {
        let _refusal = rollback(social, &session_id, "atome_missing").await?;
        return refused("teleport_atome_missing");
    };
    let patch = match teleport_state::commit(&properties, &offer.target_surface_id, &session_id) {
        Ok(patch) => patch,
        Err(refusal) => return refused(&refusal),
    };
    if let Err(error) = surfaces
        .commit(&offer.atome_id, patch, &offer.owner_id)
        .await
    {
        return refused(&error);
    }
    if let Some(forgotten) = forget(&session_id) {
        forgotten.timer.abort();
    }
    // The arrival the source needs to swap in its residual proxy.
    let arrived = json!({ "type": "teleport-arrived", "atome_id": offer.atome_id, "session_id": session_id,
        "surface_id": offer.target_surface_id, "origin_surface_id": offer.source_surface_id,
        "timestamp": seats::now() });
    live::tell(&offer.owner_id, &arrived).await;
    let fields = json!({ "atome_id": offer.atome_id, "surface_id": offer.target_surface_id,
        "state": teleport_state::REMOTE });
    Ok(response(KIND, message, true, fields))
}

async fn decline_or_cancel(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
    reason: &str,
) -> Result<JsonValue, String> {
    let session_id = session_of(message);
    let Some(offer) = pending(&session_id) else {
        return Ok(failure(KIND, message, "teleport_session_unknown"));
    };
    let caller = seats::own(connection);
    let is_target = user == offer.target_user_id && caller == offer.target_surface_id;
    // Cancel is bound to the source seat, not merely to the account: a same-account teleport has
    // one account on both ends.
    let is_source = user == offer.owner_id && caller == offer.source_surface_id;
    if reason == "declined" && !is_target {
        return Ok(failure(KIND, message, "teleport_not_target"));
    }
    if reason == "cancelled" && !is_source {
        return Ok(failure(KIND, message, "teleport_not_owner"));
    }
    let social = &connection.ws_api.social;
    if let Err(refusal) = rollback(social, &session_id, reason).await? {
        return Ok(failure(KIND, message, &refusal));
    }
    let fields = json!({ "session_id": session_id, "reason": reason });
    Ok(response(KIND, message, true, fields))
}

async fn back_home(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let atome_id = atome_of(message);
    if atome_id.is_empty() {
        return Ok(failure(KIND, message, "teleport_atome_required"));
    }
    let surfaces = &connection.ws_api.social.surfaces;
    let Some(properties) = surfaces.properties(user, &atome_id).await? else {
        return Ok(failure(KIND, message, "teleport_atome_missing"));
    };
    // The seat the object leaves, read before the patch empties it.
    let left = teleport_state::View::of(&properties).surface_id;
    let to = js::id(seats::either(message, "to_surface_id", "toSurfaceId"));
    let (patch, destination) = match teleport_state::back_home(&properties, &to) {
        Ok(built) => built,
        Err(refusal) => return Ok(failure(KIND, message, &refusal)),
    };
    if let Err(error) = surfaces.commit(&atome_id, patch, user).await {
        return Ok(failure(KIND, message, &error));
    }
    // The same arrival as an accepted offer: the seat it left hands over what it was doing.
    let arrived = json!({ "type": "teleport-arrived", "atome_id": atome_id, "session_id": null,
        "surface_id": destination, "origin_surface_id": left, "returned": true, "timestamp": seats::now() });
    live::tell(user, &arrived).await;
    let fields =
        json!({ "atome_id": atome_id, "state": teleport_state::LOCAL, "destination": destination });
    Ok(response(KIND, message, true, fields))
}

async fn persist(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let atome_id = atome_of(message);
    if atome_id.is_empty() {
        return Ok(failure(KIND, message, "teleport_atome_required"));
    }
    let surfaces = &connection.ws_api.social.surfaces;
    let Some(properties) = surfaces.properties(user, &atome_id).await? else {
        return Ok(failure(KIND, message, "teleport_atome_missing"));
    };
    let patch = match teleport_state::persist(&properties) {
        Ok(patch) => patch,
        Err(refusal) => return Ok(failure(KIND, message, &refusal)),
    };
    if let Err(error) = surfaces.commit(&atome_id, patch, user).await {
        return Ok(failure(KIND, message, &error));
    }
    let fields = json!({ "atome_id": atome_id, "state": teleport_state::PERSISTED_REMOTE });
    Ok(response(KIND, message, true, fields))
}

async fn state(
    connection: &Connection,
    message: &JsonValue,
    user: &str,
) -> Result<JsonValue, String> {
    let atome_id = atome_of(message);
    if atome_id.is_empty() {
        return Ok(failure(KIND, message, "teleport_atome_required"));
    }
    // Missing and unreadable answer alike: existence is not disclosed.
    let surfaces = &connection.ws_api.social.surfaces;
    let Some(properties) = surfaces.properties(user, &atome_id).await? else {
        return Ok(failure(KIND, message, "teleport_read_denied"));
    };
    let fields = json!({ "atome_id": atome_id, "teleport": teleport_state::View::of(&properties).json(),
        "surfaces": seats::list(user, "") });
    Ok(response(KIND, message, true, fields))
}

/// One `teleport` frame's reply.
pub(super) async fn reply(connection: &Arc<Connection>, message: &JsonValue) -> JsonValue {
    let action = action_of(message);
    let refusal = (!ACTIONS.contains(&action.as_str())).then(|| {
        let named = if action.is_empty() {
            "missing"
        } else {
            &action
        };
        format!("Unknown teleport action: {named}")
    });
    let user = match identity(connection, KIND, message, refusal).await {
        Ok(who) => who.user,
        Err(reply) => return reply,
    };
    let outcome = match action.as_str() {
        "offer" => offer(connection, message, &user).await,
        "accept" => accept(connection, message, &user).await,
        "decline" => decline_or_cancel(connection, message, &user, "declined").await,
        "cancel" => decline_or_cancel(connection, message, &user, "cancelled").await,
        "return" => back_home(connection, message, &user).await,
        "persist" => persist(connection, message, &user).await,
        _ => state(connection, message, &user).await,
    };
    outcome.unwrap_or_else(|error| failure(KIND, message, &error))
}

// The accounts whose vaults may have objects on `user`'s seats: theirs, and those granted access
// to one of their seats.
async fn hosting_owners(social: &Social, user: &str) -> Result<Vec<String>, String> {
    let incoming = social.surfaces.list(user, &json!("incoming")).await?;
    let mut owners = vec![user.to_string()];
    for grant in incoming["incoming"].as_array().into_iter().flatten() {
        let grantee = js::string(&grant["grantee_id"]);
        if grant["status"] == json!("granted") && !owners.contains(&grantee) {
            owners.push(grantee);
        }
    }
    Ok(owners)
}

// `build` applied to every object the seat hosts, committed by its owner; one it does not apply
// to commits nothing, so a reconnection adds no meaningless event to an object's history.
async fn patch_hosted(
    social: &Social,
    user: &str,
    surface_id: &str,
    build: fn(&JsonValue, &str) -> teleport_state::Built,
) -> Result<Vec<String>, String> {
    let surfaces = &social.surfaces;
    let mut patched = Vec::new();
    for owner in hosting_owners(social, user).await? {
        for atome_id in surfaces.hosted(&owner, surface_id).await? {
            let Some(properties) = surfaces.properties(&owner, &atome_id).await? else {
                continue;
            };
            let Ok(patch) = build(&properties, surface_id) else {
                continue;
            };
            if surfaces.commit(&atome_id, patch, &owner).await.is_ok() {
                patched.push(atome_id);
            }
        }
    }
    Ok(patched)
}

/// A seat disappeared (`handleTeleportSurfaceLoss`): the offers awaiting it, or sent from it,
/// roll back, since nothing arrived; the objects living on it go DISCONNECTED, not home.
pub(super) async fn surface_lost(
    social: &Social,
    user: &str,
    surface_id: &str,
) -> Result<(), String> {
    let involved: Vec<String> = OFFERS
        .lock()
        .expect("offers")
        .iter()
        .filter(|(_, offer)| {
            (offer.target_user_id == user && offer.target_surface_id == surface_id)
                || (offer.owner_id == user && offer.source_surface_id == surface_id)
        })
        .map(|(session_id, _)| session_id.clone())
        .collect();
    for session_id in involved {
        let _refusal = rollback(social, &session_id, "surface_lost").await?;
    }
    patch_hosted(social, user, surface_id, teleport_state::disconnect).await?;
    Ok(())
}

/// A seat came back under the same id (`handleTeleportSurfaceReconnect`): its DISCONNECTED objects
/// are reachable again, REMOTE, or PERSISTED_REMOTE when they were left there on purpose.
pub(super) async fn surface_back(
    social: &Social,
    user: &str,
    surface_id: &str,
) -> Result<Vec<String>, String> {
    if surface_id.is_empty() || user.is_empty() {
        return Ok(Vec::new());
    }
    patch_hosted(social, user, surface_id, teleport_state::reconnect).await
}
