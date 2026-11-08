// A replay page: the events after a cursor of each stream asked, stream after stream, bounded
// in count and in bytes (every event carries its object's projection, hundreds of KB for a
// large project). The sizes are read first, as stored byte lengths (SQLite reads them without
// loading the text); at least one event goes.
use super::*;

const PAGE_BYTES: i64 = 8 * 1024 * 1024;
const SIZES: &str = "SELECT COALESCE(OCTET_LENGTH(payload), 0) + COALESCE(OCTET_LENGTH(projection), 0) + COALESCE(OCTET_LENGTH(lww_decisions), 0)
     FROM events WHERE stream_id = ?1 AND sequence > ?2 ORDER BY sequence ASC, id ASC LIMIT ?3";
const EVENTS: &str = "SELECT * FROM events WHERE stream_id = ? AND sequence > ? ORDER BY sequence ASC, id ASC LIMIT ?";

// Every row value parsed as the vault's `parseRow` does.
fn parsed_event_row(mut row: JsonMap<String, JsonValue>) -> JsonValue {
    for key in ["payload", "actor", "projection", "lww_decisions"] {
        let value = row_json::parse_stored(row.get(key));
        row.insert(key.into(), value);
    }
    JsonValue::Object(row)
}

pub(crate) fn events_after(
    db: &Connection,
    streams: &[(String, f64)],
    limit: i64,
) -> Result<Vec<JsonValue>, String> {
    let mut sizes = db.prepare_cached(SIZES).map_err(|e| e.to_string())?;
    let (mut events, mut bytes) = (Vec::new(), 0_i64);
    for (stream, cursor) in streams {
        let room = limit - events.len() as i64;
        if room <= 0 {
            break;
        }
        let (mut count, mut full) = (0_i64, false);
        let rows = sizes
            .query_map(rusqlite::params![stream, cursor, room], |row| {
                row.get::<_, i64>(0)
            })
            .map_err(|e| e.to_string())?;
        for size in rows {
            let size = size.map_err(|e| e.to_string())?;
            if (!events.is_empty() || count > 0) && bytes + size > PAGE_BYTES {
                full = true;
                break;
            }
            bytes += size;
            count += 1;
        }
        if count > 0 {
            let rows = row_json::query_objects(db, EVENTS, &[stream, cursor, &count])?;
            events.extend(rows.into_iter().map(parsed_event_row));
        }
        if full {
            break;
        }
    }
    Ok(events)
}
