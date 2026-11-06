// The one event commit of a host holding several people's atomes (Axum on desktop
// and Android, the iOS host), as Fastify's `commitAtomeEvents`
// (server/atomeRoutes.orm.js) runs it: every event is the principal's, the batch
// is authorized as a whole, then appended. The host calls it inside its own
// transaction, which it extends with its delivery work (the sync queue) before
// committing; any refusal fails the whole call.
use super::*;
use append::AppendOptions;
use security::AuthorizationDecision;

pub enum CommitOutcome {
    // Each event as recorded, `inserted` telling a new one from a retry.
    Committed(Vec<JsonValue>),
    Refused {
        event_id: Option<String>,
        decision: AuthorizationDecision,
    },
}

// `normalizeAtomeCommitActor`: the event's own actor when it is the principal, else the principal.
fn commit_actor(candidate: Option<&JsonValue>, principal_id: &str) -> JsonValue {
    let principal = json!({ "type": "user", "id": principal_id });
    let Some(JsonValue::Object(actor)) = candidate else {
        return principal;
    };
    let Some(actor_id) = reads::field(
        &JsonValue::Object(actor.clone()),
        &["id", "user_id", "userId"],
    )
    .cloned() else {
        return principal;
    };
    if canonical::js_string(&actor_id) != principal_id {
        return principal;
    }
    let mut actor = actor.clone();
    actor.insert("id".into(), actor_id);
    JsonValue::Object(actor)
}

pub fn commit_events(
    db: &Connection,
    events: &[JsonValue],
    principal_id: &str,
    options: &AppendOptions<'_>,
) -> Result<CommitOutcome, String> {
    let events: Vec<JsonValue> = events
        .iter()
        .map(|event| {
            let mut event = event.as_object().cloned().unwrap_or_default();
            let actor = commit_actor(event.get("actor"), principal_id);
            event.insert("actor".into(), actor);
            JsonValue::Object(event)
        })
        .collect();
    if let Some((event_id, decision)) = authorize::authorize_batch(db, &events, principal_id)? {
        return Ok(CommitOutcome::Refused { event_id, decision });
    }
    // A refused event leaves nothing of the batch behind, the caller's transaction going on.
    db.execute_batch("SAVEPOINT atome_commit")
        .map_err(|e| e.to_string())?;
    let appended = append::append_events(db, &events, options);
    let close = if appended.is_ok() {
        "RELEASE atome_commit"
    } else {
        "ROLLBACK TO atome_commit; RELEASE atome_commit"
    };
    db.execute_batch(close).map_err(|e| e.to_string())?;
    appended.map(CommitOutcome::Committed)
}
