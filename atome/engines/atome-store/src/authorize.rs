// May this principal commit these events? Fastify's `authorizeAtomeEventWrite`
// and `authorizeAtomeEventBatch` (server/atomePropertySecurity.js), on the events
// as the client sent them: a creation is the creator's own (under a parent it may
// create in, or one the same batch creates), a restore needs a deleted target, a
// delete the delete right, a parent change the parent's create right, every
// touched property its write right.
use super::*;
use append::{JsonEvent, event_property_patch, event_touched_keys};
use security::{AuthorizationDecision, can_create, can_delete, can_write};

fn text(map: &JsonMap<String, JsonValue>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| map.get(*key))
        .find(|value| js_truthy(value))
        .map(canonical::js_string)
}

// `getAtomeById`: a live atome (a deleted one does not exist for a write).
fn exists(db: &Connection, atome_id: &str) -> Result<bool, String> {
    db.query_row(
        "SELECT 1 FROM atomes WHERE atome_id = ?1 AND deleted_at IS NULL",
        [atome_id],
        |_| Ok(()),
    )
    .optional()
    .map(|row| row.is_some())
    .map_err(|e| e.to_string())
}

fn decision(
    allowed: bool,
    reason: &'static str,
    denied_keys: Vec<String>,
) -> AuthorizationDecision {
    AuthorizationDecision {
        allowed,
        reason,
        denied_keys,
    }
}

fn requested_owner(event: &JsonEvent, principal_id: &str) -> Option<(bool, String)> {
    let patch = event_property_patch(event)?;
    let owner =
        text(&patch, &["owner_id", "ownerId", "owner"]).unwrap_or_else(|| principal_id.into());
    Some((owner == principal_id, owner))
}

pub fn authorize_event(
    db: &Connection,
    event: &JsonEvent,
    principal_id: &str,
    batch_create_ids: &HashSet<String>,
) -> Result<AuthorizationDecision, String> {
    let Some(atome_id) = text(event, &["atome_id", "atomeId"]).filter(|_| !principal_id.is_empty())
    else {
        return Ok(decision(false, "invalid_write_target", vec![]));
    };
    let kind = event
        .get("kind")
        .map(canonical::js_string)
        .unwrap_or_default()
        .to_lowercase();
    if kind == "restore" {
        let deleted: Option<Option<String>> = db
            .query_row(
                "SELECT deleted_at FROM atomes WHERE atome_id = ?1",
                [&atome_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if deleted.flatten().filter(|at| !at.is_empty()).is_none() {
            return Ok(decision(false, "restore_target_not_deleted", vec![]));
        }
        let allowed = can_delete(db, &atome_id, principal_id, None);
        return Ok(if allowed {
            decision(true, "restore_allowed", vec![])
        } else {
            decision(false, "restore_denied", vec!["__deleted".into()])
        });
    }
    if !exists(db, &atome_id)? {
        let Some((own, _)) = requested_owner(event, principal_id).filter(|_| kind != "delete")
        else {
            return Ok(decision(false, "invalid_create_event", vec![]));
        };
        if !own {
            return Ok(decision(false, "create_owner_mismatch", vec![]));
        }
        let patch = event_property_patch(event).unwrap_or_default();
        let parent_id = text(
            &patch,
            &["parent_id", "parentId", "project_id", "projectId"],
        )
        .or_else(|| text(event, &["parent_id", "parentId", "project_id", "projectId"]));
        if let Some(parent) = parent_id
            && !batch_create_ids.contains(&parent)
            && !can_create(db, &parent, principal_id)
        {
            return Ok(decision(false, "parent_create_denied", vec![]));
        }
        return Ok(decision(true, "owner_create", vec![]));
    }
    if kind == "delete" {
        let allowed = can_delete(db, &atome_id, principal_id, None);
        return Ok(if allowed {
            decision(true, "delete_allowed", vec![])
        } else {
            decision(false, "delete_denied", vec!["__deleted".into()])
        });
    }
    if kind == "snapshot" {
        let allowed = can_write(db, &atome_id, principal_id, None);
        return Ok(decision(
            allowed,
            if allowed {
                "snapshot_write_allowed"
            } else {
                "snapshot_write_denied"
            },
            vec![],
        ));
    }
    let parent_id = text(event, &["parent_id", "parentId"]);
    if let Some(parent) = &parent_id {
        if *parent == atome_id {
            return Ok(decision(false, "parent_cycle_forbidden", vec![]));
        }
        if !batch_create_ids.contains(parent) && !can_create(db, parent, principal_id) {
            return Ok(decision(false, "parent_create_denied", vec![]));
        }
        if !can_write(db, &atome_id, principal_id, None) {
            return Ok(decision(
                false,
                "parent_write_denied",
                vec!["parent_id".into()],
            ));
        }
    }
    let keys = event_touched_keys(event);
    if keys.is_empty() {
        return Ok(if parent_id.is_some() {
            decision(true, "parent_write_allowed", vec![])
        } else {
            decision(false, "missing_property_patch", vec![])
        });
    }
    let denied: Vec<String> = keys
        .into_iter()
        .filter(|key| !can_write(db, &atome_id, principal_id, Some(key)))
        .collect();
    Ok(if denied.is_empty() {
        decision(true, "property_write_allowed", denied)
    } else {
        decision(false, "property_write_denied", denied)
    })
}

// The first refused event of the batch (its id and decision), if any.
pub fn authorize_batch(
    db: &Connection,
    events: &[JsonValue],
    principal_id: &str,
) -> Result<Option<(Option<String>, AuthorizationDecision)>, String> {
    let empty = JsonEvent::new();
    let as_event =
        |value: &'_ JsonValue| value.as_object().cloned().unwrap_or_else(|| empty.clone());
    let mut created = HashSet::new();
    for event in events.iter().map(as_event) {
        let Some(atome_id) = text(&event, &["atome_id", "atomeId"]) else {
            continue;
        };
        let kind = event
            .get("kind")
            .map(canonical::js_string)
            .unwrap_or_default()
            .to_lowercase();
        if !exists(db, &atome_id)?
            && kind != "delete"
            && requested_owner(&event, principal_id).is_some_and(|(own, _)| own)
        {
            created.insert(atome_id);
        }
    }
    for event in events.iter().map(as_event) {
        let verdict = authorize_event(db, &event, principal_id, &created)?;
        if !verdict.allowed {
            return Ok(Some((text(&event, &["id", "event_id"]), verdict)));
        }
    }
    Ok(None)
}
