use chrono::{DateTime, NaiveDateTime};
use rusqlite::{Connection, OptionalExtension};

fn timestamp(value: &str) -> Option<i64> {
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
pub(super) fn accept_remote(
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

pub(super) fn record(
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
