// The contact request guard (server/communication_request_guard.js, ported): the
// one message a stranger can send is bounded on the server — one request every 15 s,
// 10 an hour and 20 a day (3 a day for an account younger than 72 h), 20 left
// unanswered for 30 days at most, and 3 blocks received within 30 days suspend
// requests for 30 days. A number without account counts like any other, and every
// answer leaves after the same floor, so neither tells whether a number has an account.
use crate::auth::accounts;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

const DAY_MS: i64 = 24 * 3600 * 1000;
const INTERVAL_MS: i64 = 15 * 1000;
const PER_HOUR: i64 = 10;
const PER_DAY: i64 = 20;
const NEW_ACCOUNT_MS: i64 = 3 * DAY_MS;
const NEW_ACCOUNT_PER_DAY: i64 = 3;
const PENDING: i64 = 20;
const PENDING_MS: i64 = 30 * DAY_MS;
const BLOCKS: usize = 3;
const BLOCK_WINDOW_MS: i64 = 30 * DAY_MS;
const SUSPENSION_MS: i64 = 30 * DAY_MS;
/// Every request answers after this floor.
pub const FLOOR_MS: i64 = 400;

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// `timeOf`: SQLite's `datetime('now')` (UTC without a zone) or an ISO date.
fn time_of(text: &str) -> Option<i64> {
    let text = crate::vault_router::js::trim(text);
    if let Ok(time) = chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S") {
        return Some(time.and_utc().timestamp_millis());
    }
    chrono::DateTime::parse_from_rfc3339(text)
        .map(|time| time.timestamp_millis())
        .ok()
}

fn sql_error(error: rusqlite::Error) -> String {
    error.to_string()
}

// Whether a run of BLOCKS blocks received within BLOCK_WINDOW_MS ended less than SUSPENSION_MS ago.
fn suspended(db: &Connection, sender: &str, at: i64) -> Result<bool, String> {
    let since = chrono::DateTime::from_timestamp_millis(at - BLOCK_WINDOW_MS - SUSPENSION_MS)
        .ok_or("guard_time_out_of_range")?
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();
    let mut statement = db
        .prepare_cached(
            "SELECT updated_at FROM sync_share_policies
             WHERE peer_id = ? AND policy = 'block' AND revoked_at IS NULL AND updated_at >= ?",
        )
        .map_err(sql_error)?;
    let mut times: Vec<i64> = statement
        .query_map(params![sender, since], |row| {
            row.get::<_, Option<String>>(0)
        })
        .map_err(sql_error)?
        .filter_map(|row| row.ok().flatten())
        .filter_map(|text| time_of(&text))
        .collect();
    times.sort_unstable();
    Ok((BLOCKS - 1..times.len()).any(|index| {
        times[index] - times[index + 1 - BLOCKS] <= BLOCK_WINDOW_MS
            && at - times[index] < SUSPENSION_MS
    }))
}

/// `admit`: the first limit the sender has reached, as its error.
pub fn admit(db: &Connection, sender: &str, at: i64) -> Result<(), String> {
    let count = |since: i64, open: bool| -> Result<i64, String> {
        let sql = if open {
            "SELECT COUNT(*) FROM communication_contact_requests WHERE sender_id = ? AND created_ms > ? AND resolved_ms IS NULL"
        } else {
            "SELECT COUNT(*) FROM communication_contact_requests WHERE sender_id = ? AND created_ms > ?"
        };
        db.query_row(sql, params![sender, at - since], |row| row.get(0))
            .map_err(sql_error)
    };
    let last: Option<i64> = db
        .query_row(
            "SELECT MAX(created_ms) FROM communication_contact_requests WHERE sender_id = ?",
            params![sender],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    if last.is_some_and(|last| last > at - INTERVAL_MS) {
        return Err("contact_request_too_soon".into());
    }
    if suspended(db, sender, at)? {
        return Err("contact_request_suspended".into());
    }
    let account = accounts::find_by_id(db, sender)?;
    let created = account
        .as_ref()
        .and_then(|account| account["created_at"].as_str())
        .and_then(time_of)
        .ok_or("contact_request_sender_unknown")?;
    let young = at - created < NEW_ACCOUNT_MS;
    if count(DAY_MS, false)? >= if young { NEW_ACCOUNT_PER_DAY } else { PER_DAY } {
        return Err("contact_request_quota".into());
    }
    if count(3600 * 1000, false)? >= PER_HOUR {
        return Err("contact_request_quota".into());
    }
    if count(PENDING_MS, true)? >= PENDING {
        return Err("contact_request_pending_limit".into());
    }
    Ok(())
}

/// `record`: `target` is None for a number without account, `note` kept only when it reached them.
pub fn record(
    db: &Connection,
    sender: &str,
    target: Option<&str>,
    note: Option<&str>,
    at: i64,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO communication_contact_requests (request_id, sender_id, target_id, note, created_ms, resolved_ms)
         VALUES (?, ?, ?, ?, ?, NULL)",
        params![uuid::Uuid::new_v4().to_string(), sender, target, note, at],
    )
    .map(|_| ())
    .map_err(sql_error)
}

/// `resolve`: the sender's requests to `target` answered; the note it read, `{ note, at }`.
pub fn resolve(
    db: &Connection,
    sender: &str,
    target: &str,
    at: i64,
) -> Result<Option<JsonValue>, String> {
    let delivered: Option<(Option<String>, i64)> = db
        .query_row(
            "SELECT note, created_ms FROM communication_contact_requests
             WHERE sender_id = ? AND target_id = ? AND resolved_ms IS NULL AND note IS NOT NULL ORDER BY created_ms DESC LIMIT 1",
            params![sender, target],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(sql_error)?;
    db.execute(
        "UPDATE communication_contact_requests SET resolved_ms = ?
         WHERE sender_id = ? AND target_id = ? AND resolved_ms IS NULL",
        params![at, sender, target],
    )
    .map_err(sql_error)?;
    Ok(delivered.and_then(|(note, created)| {
        let note = note.unwrap_or_default();
        (!crate::vault_router::js::trim(&note).is_empty())
            .then(|| json!({ "note": note, "at": created }))
    }))
}

/// `settle`: the answer leaves no sooner than FLOOR_MS after `started`.
pub async fn settle(started: i64) {
    let wait = started + FLOOR_MS - now_ms();
    if wait > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(wait as u64)).await;
    }
}
