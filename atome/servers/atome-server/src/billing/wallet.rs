// The money ledger (R-193): double entry in whole euro cents, append-only, one transaction per
// reference (a replay finds it and changes nothing). Accounts are names:
//   `wallet:<principal>`   the person's balance (what atome owes them; never below zero),
//   `hold:<principal>`     money reserved before a provider answers,
//   `cash:<provider>`      money received at a payment provider (Stripe),
//   `refund:<provider>`    money given back through it,
//   `revenue:<category>`   what atome earns (its 3 %, storage),
//   `provider:<name>`      what atome owes a supplier (OVHcloud, OpenAI),
//   `absorbed:<category>`  a cost atome carries itself (storage at zero, card fees),
//   `test_budget`          atome's own money spent for allowed test accounts.
// A transaction's legs sum to zero; a balance is the sum of an account's legs.
use crate::vault_router::central::row_json;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

pub const REAL: &str = "real";
pub const TEST: &str = "test";

pub fn wallet(principal: &str) -> String {
    format!("wallet:{principal}")
}

pub fn hold(principal: &str) -> String {
    format!("hold:{principal}")
}

/// One transaction to post: its reference, kind, owner, environment, category, memo and legs.
pub struct Posting<'a> {
    pub reference: String,
    pub kind: &'a str,
    pub principal: Option<&'a str>,
    pub environment: &'a str,
    pub category: Option<&'a str>,
    pub memo: Option<String>,
    pub meta: JsonValue,
    pub legs: Vec<(String, i64)>,
}

/// Posts a balanced transaction once. Returns whether it was new. A leg that would take a
/// `wallet:` account below zero refuses the whole transaction (`money_insufficient_balance`).
pub fn post(db: &Connection, posting: &Posting<'_>, now: i64) -> Result<bool, String> {
    if posting.legs.iter().map(|(_, cents)| cents).sum::<i64>() != 0 || posting.legs.is_empty() {
        return Err("money_unbalanced".into());
    }
    let exists = db
        .query_row(
            "SELECT 1 FROM money_transactions WHERE txn_ref = ?",
            [&posting.reference],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .is_some();
    if exists {
        return Ok(false);
    }
    for (account, cents) in &posting.legs {
        if account.starts_with("wallet:") && *cents < 0 && balance(db, account)? + cents < 0 {
            return Err("money_insufficient_balance".into());
        }
    }
    db.execute(
        "INSERT INTO money_transactions (txn_ref, kind, principal_id, environment, category, memo, meta, recorded_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            posting.reference,
            posting.kind,
            posting.principal,
            posting.environment,
            posting.category,
            posting.memo,
            posting.meta.to_string(),
            now
        ],
    )
    .map_err(|e| e.to_string())?;
    for (account, cents) in &posting.legs {
        db.execute(
            "INSERT INTO money_legs (txn_ref, account, amount_cents) VALUES (?, ?, ?)",
            params![posting.reference, account, cents],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(true)
}

pub fn balance(db: &Connection, account: &str) -> Result<i64, String> {
    db.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM money_legs WHERE account = ?",
        [account],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// The sum of an account's legs since `from` (a day's or a month's spending).
pub fn moved_since(db: &Connection, account: &str, from: i64) -> Result<i64, String> {
    db.query_row(
        "SELECT COALESCE(SUM(l.amount_cents), 0) FROM money_legs l JOIN money_transactions t ON t.txn_ref = l.txn_ref
         WHERE l.account = ? AND t.recorded_ms >= ?",
        params![account, from],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

/// An account's money environment: `real` once a real payment activated it, `test` otherwise.
pub fn account(db: &Connection, principal: &str) -> Result<Option<JsonValue>, String> {
    db.query_row(
        "SELECT * FROM money_accounts WHERE principal_id = ?",
        [principal],
        row_json,
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Opens an account's money side at its activation. A real activation credits its entry price
/// to the wallet (the 12 € open 12 € of credit; nothing is kept for the entry).
pub fn activate(
    db: &Connection,
    principal: &str,
    environment: &str,
    reference: &str,
    now: i64,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO money_accounts (principal_id, environment, activation_ref, activated_ms, storage_from_ms)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(principal_id) DO NOTHING",
        params![principal, environment, reference, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// A real account upgraded by a real payment (a test account that pays on the Web).
pub fn make_real(db: &Connection, principal: &str, now: i64) -> Result<(), String> {
    db.execute(
        "UPDATE money_accounts SET environment = 'real', storage_from_ms = ? WHERE principal_id = ? AND environment = 'test'",
        params![now, principal],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// The person's operations, newest first: what they read in Histo. (M6).
pub fn history(db: &Connection, principal: &str, limit: i64) -> Result<Vec<JsonValue>, String> {
    let mut statement = db
        .prepare(
            "SELECT t.txn_ref, t.kind, t.category, t.memo, t.meta, t.environment, t.recorded_ms,
                    (SELECT COALESCE(SUM(amount_cents), 0) FROM money_legs l WHERE l.txn_ref = t.txn_ref AND l.account = ?) AS amount_cents
             FROM money_transactions t
             WHERE t.principal_id = ? OR t.txn_ref IN (SELECT txn_ref FROM money_legs WHERE account = ?)
             ORDER BY t.recorded_ms DESC, t.rowid DESC LIMIT ?",
        )
        .map_err(|e| e.to_string())?;
    let account = wallet(principal);
    let rows = statement
        .query_map(params![account, principal, account, limit], row_json)
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        row.map(|mut row| {
            let meta = row["meta"]
                .as_str()
                .and_then(|text| serde_json::from_str(text).ok())
                .unwrap_or(json!({}));
            row["meta"] = meta;
            row
        })
        .map_err(|e| e.to_string())
    })
    .collect()
}
