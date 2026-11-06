use crate::append::{
    ConflictMode, JsonEvent, event_payload_map, event_property_patch, event_touched_keys,
};
use chrono::{DateTime, NaiveDateTime};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub fn timestamp(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.timestamp_millis())
        .ok()
        .or_else(|| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|date| date.and_utc().timestamp_millis())
        })
}

// Same deterministic timestamp/event-id ordering as database/adole_conflicts.js.
pub fn accept_remote(
    db: &Connection,
    atome: &str,
    key: &str,
    id: &str,
    ts: &str,
) -> Result<bool, String> {
    let winner: Option<(String, String)> = db.query_row(
        "SELECT event_id, event_ts FROM event_property_winners WHERE atome_id=?1 AND particle_key=?2",
        rusqlite::params![atome,key], |r| Ok((r.get(0)?,r.get(1)?)))
        .optional().map_err(|e|e.to_string())?;
    let previous = match winner {
        Some(value) => Some(value),
        None => db
            .query_row(
                "SELECT '', updated_at FROM particles WHERE atome_id=?1 AND particle_key=?2",
                rusqlite::params![atome, key],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?,
    };
    if let Some((previous_id, previous_ts)) = previous {
        let incoming = timestamp(ts);
        let previous = timestamp(&previous_ts);
        if incoming < previous || (incoming == previous && id <= previous_id.as_str()) {
            return Ok(false);
        }
    }
    Ok(true)
}

pub fn record(
    db: &Connection,
    atome: &str,
    key: &str,
    id: &str,
    ts: &str,
    sequence: i64,
    decision: &str,
) -> Result<(), String> {
    db.execute("INSERT INTO event_property_winners (atome_id,particle_key,event_id,event_ts,timestamp_valid,sequence,decision,updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now')) ON CONFLICT(atome_id,particle_key) DO UPDATE SET
        event_id=excluded.event_id,event_ts=excluded.event_ts,timestamp_valid=excluded.timestamp_valid,sequence=excluded.sequence,decision=excluded.decision,updated_at=excluded.updated_at",
        rusqlite::params![atome,key,id,ts,timestamp(ts).is_some() as i64,sequence,decision]).map_err(|e|e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// The decisions of an append (`createAdoleConflictApi` of database/adole_conflicts.js)
// ---------------------------------------------------------------------------

pub const LIFECYCLE_KEY: &str = "__lifecycle__";

pub struct Evaluation {
    pub decisions: JsonMap<String, JsonValue>,
    // The event the projection applies: the winners only for an offline replay, none when nothing wins.
    pub projection_event: Option<JsonEvent>,
}

fn event_text<'a>(event: &'a JsonEvent, key: &str) -> &'a str {
    event.get(key).and_then(JsonValue::as_str).unwrap_or("")
}

fn lifecycle_kind(event: &JsonEvent) -> bool {
    matches!(
        event_text(event, "kind").to_lowercase().as_str(),
        "delete" | "restore"
    )
}

// `compareCandidate(event, current)`: a valid timestamp beats an invalid one, a newer
// beats an older, then the greater event id (UTF-16 order, as on every runtime).
fn compare(event: &JsonEvent, current: Option<&(String, Option<String>)>) -> (bool, &'static str) {
    let Some((current_id, current_ts)) = current else {
        return (true, "first_event");
    };
    let incoming = timestamp(event_text(event, "ts"));
    let previous = current_ts.as_deref().and_then(timestamp);
    match (incoming, previous) {
        (Some(_), None) => return (true, "valid_timestamp_over_invalid"),
        (None, Some(_)) => return (false, "invalid_timestamp_below_valid"),
        (Some(a), Some(b)) if a != b => {
            return if a > b {
                (true, "newer_timestamp")
            } else {
                (false, "older_timestamp")
            };
        }
        _ => {}
    }
    let wins = event_text(event, "id")
        .encode_utf16()
        .cmp(current_id.encode_utf16())
        == std::cmp::Ordering::Greater;
    (
        wins,
        if incoming.is_some() {
            "equal_timestamp_event_id"
        } else {
            "invalid_timestamp_event_id"
        },
    )
}

pub fn evaluate(
    db: &Connection,
    event: &JsonEvent,
    mode: ConflictMode,
) -> Result<Evaluation, String> {
    let mut keys = event_touched_keys(event);
    if lifecycle_kind(event) && !keys.iter().any(|key| key == LIFECYCLE_KEY) {
        keys.push(LIFECYCLE_KEY.into());
    }
    let atome_id = event_text(event, "atome_id");
    let mut decisions = JsonMap::new();
    for key in keys {
        let current: Option<(String, Option<String>)> = db
            .query_row(
                "SELECT event_id, event_ts FROM event_property_winners WHERE atome_id = ?1 AND particle_key = ?2",
                rusqlite::params![atome_id, key],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let (winner, reason) = match mode {
            ConflictMode::OfflineLww => compare(event, current.as_ref()),
            ConflictMode::Interactive => (true, "interactive_commit"),
        };
        decisions.insert(
            key,
            json!({ "winner": winner, "reason": reason, "compared_event_id": current.map(|(id, _)| id) }),
        );
    }
    let projection_event = projection_event(event, &decisions, mode);
    Ok(Evaluation {
        decisions,
        projection_event,
    })
}

fn wins(decisions: &JsonMap<String, JsonValue>, key: &str) -> bool {
    decisions
        .get(key)
        .and_then(|decision| decision.get("winner"))
        == Some(&JsonValue::Bool(true))
}

fn projection_event(
    event: &JsonEvent,
    decisions: &JsonMap<String, JsonValue>,
    mode: ConflictMode,
) -> Option<JsonEvent> {
    if mode == ConflictMode::Interactive {
        return Some(event.clone());
    }
    let lifecycle = lifecycle_kind(event);
    if lifecycle && !wins(decisions, LIFECYCLE_KEY) {
        return None;
    }
    let props: JsonMap<String, JsonValue> = event_property_patch(event)
        .unwrap_or_default()
        .into_iter()
        .filter(|(key, _)| wins(decisions, key))
        .collect();
    let mut payload = event_payload_map(event);
    let delete_keys: Vec<String> = crate::intent::event_deleted_property_keys(&payload)
        .into_iter()
        .filter(|key| wins(decisions, key))
        .collect();
    if props.is_empty() && delete_keys.is_empty() && !lifecycle {
        return None;
    }
    payload.insert("props".into(), JsonValue::Object(props));
    payload.insert("delete_keys".into(), json!(delete_keys));
    let mut projected = event.clone();
    projected.insert("payload".into(), JsonValue::Object(payload));
    Some(projected)
}

// Every winning decision becomes the property's current winner.
pub fn record_decisions(
    db: &Connection,
    event: &JsonEvent,
    decisions: &JsonMap<String, JsonValue>,
) -> Result<(), String> {
    let sequence = event
        .get("sequence")
        .and_then(JsonValue::as_i64)
        .unwrap_or(0);
    for (key, decision) in decisions {
        if decision.get("winner") != Some(&JsonValue::Bool(true)) {
            continue;
        }
        record(
            db,
            event_text(event, "atome_id"),
            key,
            event_text(event, "id"),
            event_text(event, "ts"),
            sequence,
            decision
                .get("reason")
                .and_then(JsonValue::as_str)
                .unwrap_or(""),
        )?;
    }
    Ok(())
}
