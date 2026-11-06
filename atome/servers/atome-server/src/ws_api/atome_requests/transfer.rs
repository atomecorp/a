// The `atome` `transfer-owner` of /ws/api (server/ws_api_atome_request.js, ported with
// database/adole_ownership.js `isGuestWorkspacePrincipal` and `transferOwner`): the requester takes
// over what they owned under another principal — themselves, or a guest workspace still active
// whose adoption they confirmed — one append-only `transfer-owner` event per atome moved, a guest
// workspace's grants passed on and the workspace marked adopted under its operation.
use super::reads::bound;
use crate::social::news::db::{all, get, run};
use crate::vault_router::central::atomic;
use crate::vault_router::js;
use atome_store::append::{AppendOptions, ConflictMode, append_events, iso_now};
use rusqlite::{Connection, ToSql};
use serde_json::{Value as JsonValue, json};

/// What the transfer answers: the reply's error, or its `data`.
pub(super) enum Transfer {
    Refused(&'static str),
    Done(JsonValue),
}

// `isGuestWorkspacePrincipal(userId)`.
fn guest_workspace(db: &Connection, principal: &JsonValue) -> Result<bool, String> {
    if !js::truthy(Some(principal)) {
        return Ok(false);
    }
    let row = get(
        db,
        "SELECT status FROM guest_workspace_principals WHERE guest_principal_id = ? LIMIT 1",
        &[&js::text(Some(principal))],
    )?;
    Ok(row.is_some_and(|row| row["status"] == "active"))
}

// `UPDATE guest_workspace_principals … status = 'adopted'` of an active workspace.
fn adopt(
    db: &Connection,
    to: &rusqlite::types::Value,
    digest: &Option<String>,
    from: &rusqlite::types::Value,
) -> Result<(), String> {
    run(
        db,
        "UPDATE guest_workspace_principals SET status = 'adopted', adopted_principal_id = ?,
            adoption_operation_digest = ?, adopted_at = ? WHERE guest_principal_id = ? AND status = 'active'",
        &[to, digest, &iso_now(), from],
    )
    .map(|_| ())
}

/// `transfer-owner` of `message` for `requester`.
pub(super) fn transfer(
    db: &Connection,
    message: &JsonValue,
    requester: &str,
) -> Result<Transfer, String> {
    let (Some(from), Some(to)) = (
        js::first(message, &["from_owner_id"]),
        js::first(message, &["to_owner_id"]),
    ) else {
        return Ok(Transfer::Refused("Missing from_owner_id or to_owner_id"));
    };
    if js::text(Some(to)) != requester {
        return Ok(Transfer::Refused(
            "Access denied - target owner must be current user",
        ));
    }
    let own = js::text(Some(from)) == requester;
    if !own && !guest_workspace(db, from)? {
        return Ok(Transfer::Refused(
            "Access denied - source owner must be an active guest workspace",
        ));
    }
    if !own && message.get("adoption_confirmed") != Some(&JsonValue::Bool(true)) {
        return Ok(Transfer::Refused("guest_adoption_confirmation_required"));
    }
    let include_creator = message.get("include_creator") != Some(&JsonValue::Bool(false));
    let operation = js::first(message, &["operation_id", "operationId"]);
    owners(db, from, to, include_creator, operation, requester).map(Transfer::Done)
}

// `transferOwner({ fromOwnerId, toOwnerId, includeCreator, operationId, actorId })`.
fn owners(
    db: &Connection,
    from: &JsonValue,
    to: &JsonValue,
    include_creator: bool,
    operation: Option<&JsonValue>,
    actor: &str,
) -> Result<JsonValue, String> {
    if js::text(Some(from)) == js::text(Some(to)) {
        return Ok(json!({ "updated": 0 }));
    }
    let guest = guest_workspace(db, from)?;
    let digest = operation.map(|operation| js::text(Some(operation)));
    if guest && digest.is_none() {
        return Err("guest_adoption_operation_required".into());
    }
    let pending = rusqlite::types::Value::Text(from.to_string());
    let (from_value, to_value) = (bound(Some(from))?, bound(Some(to))?);
    if guest {
        let existing = get(
            db,
            "SELECT status, adopted_principal_id FROM guest_workspace_principals
             WHERE guest_principal_id = ? AND adoption_operation_digest = ?",
            &[&from_value, &digest],
        )?;
        if let Some(existing) = existing.filter(|existing| existing["status"] == "adopted") {
            if js::text(Some(&existing["adopted_principal_id"])) != js::text(Some(to)) {
                return Err("guest_adoption_operation_conflict".into());
            }
            return Ok(json!({ "updated": 0, "replayed": true, "adopted": true }));
        }
    }
    let creator = if include_creator {
        " OR a.creator_id = ?"
    } else {
        ""
    };
    let mut values: Vec<&dyn ToSql> = vec![&from_value, &from_value];
    if include_creator {
        values.push(&from_value);
    }
    values.push(&pending);
    let ids: Vec<String> = all(
        db,
        &format!(
            "SELECT DISTINCT a.atome_id FROM atomes a
             LEFT JOIN particles p ON p.atome_id = a.atome_id AND p.particle_key = '_pending_owner_id'
             WHERE a.atome_id != ? AND a.atome_type NOT IN ('user', 'guest_workspace')
               AND (a.owner_id = ?{creator} OR (a.owner_id IS NULL AND p.particle_value = ?))"
        ),
        &values,
    )?
    .into_iter()
    .filter(|row| js::truthy(row.get("atome_id")))
    .map(|row| js::string(&row["atome_id"]))
    .collect();
    if ids.is_empty() {
        if guest {
            atomic(db, |db| adopt(db, &to_value, &digest, &from_value))?;
        }
        return Ok(json!({ "updated": 0, "adopted": guest }));
    }
    let now = iso_now();
    let events: Vec<JsonValue> = ids
        .iter()
        .map(|atome_id| {
            json!({ "atome_id": atome_id, "kind": "transfer-owner", "ts": now,
                "payload": { "from_owner_id": js::text(Some(from)), "to_owner_id": js::text(Some(to)),
                    "include_creator": include_creator },
                "actor": { "id": actor } })
        })
        .collect();
    let options = AppendOptions {
        source: Some("transfer-owner"),
        tx_id: None,
        conflict_mode: ConflictMode::Interactive,
        stored_truth: false,
    };
    atomic(db, |db| append_events(db, &events, &options).map(|_| ()))?;
    if guest {
        atomic(db, |db| {
            run(
                db,
                "UPDATE permissions SET principal_id = ? WHERE principal_id = ?",
                &[&to_value, &from_value],
            )?;
            run(
                db,
                "UPDATE permissions SET granted_by = ? WHERE granted_by = ?",
                &[&to_value, &from_value],
            )?;
            adopt(db, &to_value, &digest, &from_value)
        })?;
    }
    Ok(json!({ "updated": ids.len(), "adopted": guest }))
}
