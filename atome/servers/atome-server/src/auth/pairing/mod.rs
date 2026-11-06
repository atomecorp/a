// Device pairing (server/auth_pairing.js, ported): a new device asks an enrolled one to
// open the same space. The requester shows a 6-digit request code and a 2-digit match
// number; the approver picks that number among three and proves its user with its
// approve key. A shared device reopens an account it holds a key for the same way: its
// owner approves each opening. Each operation runs in a `committed` unit; Fastify's
// `withTransaction` blocks are `atomic`.
mod approval;
mod request;
mod requester;

pub use approval::{approve, approve_challenge, claim, pending, view};
pub use request::{shared_open_challenge, shared_open_start, start, start_challenge};
pub use requester::{cancel, complete, not_mine, requester_challenge, status};

use super::device_sessions::text;
use super::proof::Proof;
use crate::vault_router::central::row_json;
use crate::vault_router::js;
use rusqlite::{Connection, OptionalExtension};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub(super) const PAIR_TTL_MS: i64 = 10 * 60 * 1000;
pub(super) const CLAIM_FAILURES: i64 = 5;
pub(super) const WINDOW_MS: i64 = 600_000;
pub(super) const REQUESTER_PURPOSES: [&str; 3] = ["pair-complete", "pair-cancel", "pair-resume"];

pub(super) fn present(input: &JsonValue, name: &str) -> bool {
    js::truthy(input.get(name))
}

pub(super) fn parse(row: &JsonValue, column: &str) -> Result<JsonValue, String> {
    serde_json::from_str(text(row, column)).map_err(|e| e.to_string())
}

pub(super) fn sql(
    db: &Connection,
    statement: &str,
    values: &[&dyn rusqlite::ToSql],
) -> Result<(), String> {
    db.execute(statement, values)
        .map(drop)
        .map_err(|e| e.to_string())
}

pub(super) fn code_hash(proof: &Proof, code: &str) -> String {
    proof.keyed_index(&format!("pair-code:{code}"))
}

pub(super) fn network_bucket(proof: &Proof, prefix: &str, network: &str) -> String {
    format!("{prefix}:{}", proof.keyed_index(network))
}

// The match number among two others, shuffled.
pub(super) fn match_choices(proof: &Proof, number: i64) -> Vec<i64> {
    let mut values = vec![number];
    while values.len() < 3 {
        let candidate = 10 + i64::from(proof.random_int(90));
        if !values.contains(&candidate) {
            values.push(candidate);
        }
    }
    for index in (1..values.len()).rev() {
        let other = proof.random_int(index as u32 + 1) as usize;
        values.swap(index, other);
    }
    values
}

// A request code no live request holds.
pub(super) fn free_code(db: &Connection, proof: &Proof) -> Result<String, String> {
    for _ in 0..8 {
        let candidate = format!("{:06}", proof.random_int(1_000_000));
        let taken = db
            .prepare(
                "SELECT 1 FROM auth_pair_requests WHERE code_hash = ? AND state IN ('pending', 'approved')",
            )
            .and_then(|mut statement| statement.exists([code_hash(proof, &candidate)]))
            .map_err(|e| e.to_string())?;
        if !taken {
            return Ok(candidate);
        }
    }
    Err("auth_rate_limited".into())
}

/// The request `pair_id`, refused once expired while still open.
pub(super) fn read(
    db: &Connection,
    pair_id: Option<&JsonValue>,
    now: i64,
) -> Result<JsonValue, String> {
    let pair_id = super::proof::require_handle(pair_id.unwrap_or(&JsonValue::Null))?;
    let row = db
        .query_row(
            "SELECT * FROM auth_pair_requests WHERE request_id = ?",
            [pair_id],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("auth_pair_unknown")?;
    if js::number(row.get("expires_ms")) <= now as f64
        && ["pending", "approved"].contains(&text(&row, "state"))
    {
        return Err("auth_attempt_expired".into());
    }
    Ok(row)
}

// `deviceId`: the requester's device once enrolled (the approver records a program's grants under it).
pub(super) fn describe(row: &JsonValue) -> Result<JsonValue, String> {
    let mut request = JsonMap::new();
    request.insert("pairId".into(), row["request_id"].clone());
    request.insert("kind".into(), row["kind"].clone());
    request.insert("deviceId".into(), row["requester_device_id"].clone());
    if let JsonValue::Object(meta) = parse(row, "device_meta")? {
        request.extend(meta);
    }
    request.insert("deviceClass".into(), row["device_class"].clone());
    request.insert("createdAt".into(), row["created_ms"].clone());
    request.insert("expiresAt".into(), row["expires_ms"].clone());
    request.insert("choices".into(), parse(row, "choices")?);
    if js::truthy(row.get("requester_backup_key")) {
        request.insert("backupKey".into(), parse(row, "requester_backup_key")?);
    }
    Ok(JsonValue::Object(request))
}

pub(super) fn requester_key(row: &JsonValue) -> Result<JsonValue, String> {
    parse(row, "requester_session_key")
}

pub(super) fn started(pair_id: &str, code: &str, number: i64, expires: i64) -> JsonValue {
    json!({ "ok": true, "pairId": pair_id, "code": code, "matchNumber": number, "expiresAt": expires })
}
