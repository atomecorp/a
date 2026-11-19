// The delivery receipt of a `set` that changed nothing (database/adole_event_receipts.js on
// Fastify, retired): no event is recorded for it, so its receipt alone lets a resend of the
// same event id — its acknowledgement lost — be recognised and ignored, never applied again
// over a later change. A receipt lies outside the history: never replayed, synced nor projected.
use super::*;
use append::{JsonEvent, record_of};

fn intent_hash_of(event: &JsonEvent) -> String {
    intent::intent_hash(&record_of(event))
}

// The answer to a delivery that changed nothing, first or resent: acknowledged, not inserted.
fn unchanged_answer(db: &Connection, event: &JsonEvent) -> Result<JsonValue, String> {
    let mut answer = event.clone();
    let mut payload = append::event_payload_map(event);
    payload.insert(
        "idempotency_intent_hash".into(),
        json!(intent_hash_of(event)),
    );
    answer.insert("payload".into(), JsonValue::Object(payload));
    let projection =
        reads::get_state_current(db, event.get("atome_id").and_then(JsonValue::as_str))?;
    answer.insert("projection".into(), projection);
    answer.insert("inserted".into(), json!(false));
    answer.insert("unchanged".into(), json!(true));
    Ok(JsonValue::Object(answer))
}

// A resend of an event id already received as unchanged: the same answer, or
// `event_id_conflict` when the resend carries another intent.
pub fn resent(db: &Connection, event: &JsonEvent) -> Result<Option<JsonValue>, String> {
    let id = event
        .get("id")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    let stored: Option<String> = db
        .query_row(
            "SELECT intent_hash FROM event_receipts WHERE event_id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match stored {
        None => Ok(None),
        Some(hash) if hash == intent_hash_of(event) => unchanged_answer(db, event).map(Some),
        Some(_) => Err("event_id_conflict".into()),
    }
}

// Keeps the receipt of `event` (normalized, before `prepare` compacts it) and answers it.
pub fn receive_unchanged(db: &Connection, event: &JsonEvent) -> Result<JsonValue, String> {
    db.execute(
        "INSERT INTO event_receipts (event_id, atome_id, intent_hash, received_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            event.get("id").and_then(JsonValue::as_str),
            event.get("atome_id").and_then(JsonValue::as_str),
            intent_hash_of(event),
            append::iso_now(),
        ],
    )
    .map_err(|e| e.to_string())?;
    unchanged_answer(db, event)
}
