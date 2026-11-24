// The one spending guard (R-193): every operation that costs atome money — the shared AI key, a
// domain, a service — asks it on the server, before the provider is called, so the app, the
// voice and MCP all meet the same rules. It decides who pays, reserves the money (a hold), then
// settles the real cost or releases it.
//   - The real-spending switch (`global.realSpending`, an administrator's) off: nothing is spent.
//   - A real account (paid with real money) on a proven client pays from its own wallet, never
//     below zero.
//   - A test account (sandbox, simulated or not yet paid) or a TestFlight client pays nothing
//     itself: an allowed tester (the white list) spends from atome's test budget within its
//     account's ceilings (per operation, day, month, AI prompts, categories) and the month's
//     budgets; while the access is open to everyone (`accessMode` `all`, R-342), anyone else
//     spends on the AI within the ceilings `everyone` sets.
//   - An account on the block list (role `blocked`, R-342) is refused, whatever the rest says.
use super::{pricing, wallet};
use crate::vault_router::central::row_json;
use crate::ws_api::sources::account_roles;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

pub const TESTFLIGHT_REFUSED: &str = "money_testflight_not_allowed";

/// A scope's settings (`global`, `account:<principal>`), or `{}`.
pub fn controls(db: &Connection, scope: &str) -> Result<JsonValue, String> {
    let row = db
        .query_row(
            "SELECT settings FROM money_controls WHERE scope = ?",
            [scope],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_else(|| json!({})))
}

pub fn set_controls(
    db: &Connection,
    scope: &str,
    settings: &JsonValue,
    by: &str,
    now: i64,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO money_controls (scope, settings, updated_ms, updated_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET settings = excluded.settings, updated_ms = excluded.updated_ms, updated_by = excluded.updated_by",
        params![scope, settings.to_string(), now, by],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

fn cents(settings: &JsonValue, path: &str) -> i64 {
    settings
        .pointer(path)
        .and_then(JsonValue::as_i64)
        .unwrap_or(0)
}

/// The first millisecond of `now`'s UTC day and month.
pub fn day_start(now: i64) -> i64 {
    now - now.rem_euclid(pricing::DAY_MS)
}

pub fn month_start(now: i64) -> i64 {
    use atome_js_values::dates;
    // chrono's `unwrap_or_default`: the epoch past its range.
    let epoch = dates::Instant {
        seconds: 0,
        nanos: 0,
    };
    let at = dates::Instant::from_millis(now).unwrap_or(epoch).fields();
    dates::date_days(at.year, at.month, 1).map_or(0, |days| days * pricing::DAY_MS)
}

/// A client counts as TestFlight unless proven otherwise: the account holds an iOS device key
/// whose latest App Store proof (`AppTransaction`, signed by Apple) is not Production.
pub fn testflight(db: &Connection, principal: &str) -> Result<bool, String> {
    db.query_row(
        "SELECT EXISTS (SELECT 1 FROM auth_device_keys k WHERE k.principal_id = ? AND k.revoked_ms IS NULL
            AND LOWER(COALESCE(k.platform, '')) = 'ios'
            AND NOT EXISTS (SELECT 1 FROM money_client_proofs p WHERE p.key_id = k.key_id AND p.environment = 'real'))",
        [principal],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// Money already spent by `account` since `from` (its legs going out, holds open included).
fn spent(
    db: &Connection,
    account: &str,
    principal: Option<&str>,
    category: Option<&str>,
    from: i64,
) -> Result<i64, String> {
    let out: i64 = db
        .query_row(
            "SELECT COALESCE(-SUM(l.amount_cents), 0) FROM money_legs l JOIN money_transactions t ON t.txn_ref = l.txn_ref
             WHERE l.account = ? AND l.amount_cents < 0 AND t.recorded_ms >= ?
               AND (?3 IS NULL OR t.principal_id = ?3) AND (?4 IS NULL OR t.category = ?4)",
            params![account, from, principal, category],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let held: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM money_holds WHERE state = 'held' AND created_ms >= ?4
               AND payer = ?1 AND (?2 IS NULL OR principal_id = ?2) AND (?3 IS NULL OR category = ?3)",
            params![if account == "test_budget" { "test_budget" } else { "wallet" }, principal, category, from],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(out + held)
}

pub fn ai_prompts_today(db: &Connection, principal: &str, now: i64) -> Result<i64, String> {
    db.query_row(
        "SELECT COUNT(*) FROM money_holds WHERE principal_id = ? AND payer = 'test_budget' AND category = 'ai'
           AND state != 'released' AND created_ms >= ?",
        params![principal, day_start(now)],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// Everyone's ceilings while the access is open to all: a day's ceiling bounds one operation too.
fn everyone(global: &JsonValue) -> JsonValue {
    let day = cents(global, "/everyone/perDayCents");
    json!({ "allowed": true, "categories": ["ai"], "perOpCents": day, "perDayCents": day,
        "perMonthCents": cents(global, "/everyone/perMonthCents"),
        "aiPromptsPerDay": cents(global, "/everyone/aiPromptsPerDay") })
}

/// Who pays for `cents` of `category` spent for `principal`: `wallet` or `test_budget`.
pub fn payer(
    db: &Connection,
    principal: &str,
    category: &str,
    amount: i64,
    now: i64,
) -> Result<&'static str, String> {
    if !pricing::category_known(category) {
        return Err(format!("money_category_unknown:{category}"));
    }
    let global = controls(db, "global")?;
    if global["realSpending"] != json!(true) {
        return Err("money_real_spending_off".into());
    }
    // The block list (R-342) refuses atome's spending to anyone on it, first.
    if account_roles::holds(db, principal, account_roles::BLOCKED)? {
        return Err(TESTFLIGHT_REFUSED.into());
    }
    let real = wallet::account(db, principal)?
        .is_some_and(|account| account["environment"] == wallet::REAL);
    if real && !testflight(db, principal)? {
        let available = wallet::balance(db, &wallet::wallet(principal))?;
        if available < amount {
            return Err("money_insufficient_balance".into());
        }
        return Ok("wallet");
    }
    // A test account or a TestFlight client, on atome's test budget: an allowed tester (the white
    // list) on its own ceilings; else, while atome's AI is open to everyone (`accessMode` `all`,
    // R-342), anyone on the ceilings `everyone` sets, for the AI alone.
    let own = if account_roles::holds(db, principal, account_roles::TESTER)? {
        controls(db, &format!("account:{principal}"))?
    } else if global["accessMode"] == json!("all") {
        everyone(&global)
    } else {
        return Err(TESTFLIGHT_REFUSED.into());
    };
    let allowed_category = own["categories"]
        .as_array()
        .is_some_and(|list| list.iter().any(|known| known == category));
    if own["allowed"] != json!(true) || !allowed_category {
        return Err(TESTFLIGHT_REFUSED.into());
    }
    let over = |limit: i64, used: i64| limit <= 0 || used + amount > limit;
    let budget = "test_budget";
    if amount > cents(&own, "/perOpCents")
        || over(
            cents(&own, "/perDayCents"),
            spent(db, budget, Some(principal), None, day_start(now))?,
        )
        || over(
            cents(&own, "/perMonthCents"),
            spent(db, budget, Some(principal), None, month_start(now))?,
        )
        || over(
            cents(&global, "/testBudgetMonthCents"),
            spent(db, budget, None, None, month_start(now))?,
        )
        || over(
            cents(&global, &format!("/categoryMonthCents/{category}")),
            spent(db, budget, None, Some(category), month_start(now))?,
        )
    {
        return Err("money_budget_exceeded".into());
    }
    if category == "ai" && ai_prompts_today(db, principal, now)? >= cents(&own, "/aiPromptsPerDay")
    {
        return Err("money_budget_exceeded".into());
    }
    Ok(budget)
}

/// Reserves `amount` before a provider is called. The hold names its payer; a wallet's money
/// moves to its hold account so a second purchase at the same time cannot spend it again.
pub fn reserve(
    db: &Connection,
    principal: &str,
    category: &str,
    amount: i64,
    reference: &str,
    now: i64,
) -> Result<JsonValue, String> {
    let payer = payer(db, principal, category, amount, now)?;
    let inserted = db
        .execute(
            "INSERT INTO money_holds (hold_ref, principal_id, payer, category, amount_cents, state, expires_ms, created_ms)
             VALUES (?, ?, ?, ?, ?, 'held', ?, ?) ON CONFLICT(hold_ref) DO NOTHING",
            params![reference, principal, payer, category, amount, now + pricing::hold_ttl_ms(), now],
        )
        .map_err(|e| e.to_string())?;
    if inserted == 1 && payer == "wallet" && amount > 0 {
        wallet::post(
            db,
            &wallet::Posting {
                reference: format!("hold:{reference}"),
                kind: "hold",
                principal: None,
                environment: wallet::REAL,
                category: Some(category),
                memo: None,
                meta: json!({}),
                legs: vec![
                    (wallet::wallet(principal), -amount),
                    (wallet::hold(principal), amount),
                ],
            },
            now,
        )?;
    }
    hold(db, reference)?.ok_or_else(|| "money_hold_missing".into())
}

pub fn hold(db: &Connection, reference: &str) -> Result<Option<JsonValue>, String> {
    db.query_row(
        "SELECT * FROM money_holds WHERE hold_ref = ?",
        [reference],
        row_json,
    )
    .optional()
    .map_err(|e| e.to_string())
}

// Gives a wallet hold's money back to the wallet and closes the hold.
fn close(db: &Connection, held: &JsonValue, state: &str, now: i64) -> Result<(), String> {
    let reference = held["hold_ref"].as_str().unwrap_or_default();
    let principal = held["principal_id"].as_str().unwrap_or_default();
    let amount = held["amount_cents"].as_i64().unwrap_or(0);
    if held["payer"] == "wallet" && amount > 0 {
        wallet::post(
            db,
            &wallet::Posting {
                reference: format!("unhold:{reference}"),
                kind: "unhold",
                principal: None,
                environment: wallet::REAL,
                category: held["category"].as_str(),
                memo: None,
                meta: json!({}),
                legs: vec![
                    (wallet::hold(principal), -amount),
                    (wallet::wallet(principal), amount),
                ],
            },
            now,
        )?;
    }
    db.execute(
        "UPDATE money_holds SET state = ?, closed_ms = ? WHERE hold_ref = ? AND state = 'held'",
        params![state, now, reference],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Nothing was bought: the reservation goes back.
pub fn release(db: &Connection, reference: &str, now: i64) -> Result<(), String> {
    match hold(db, reference)? {
        Some(held) if held["state"] == "held" => close(db, &held, "released", now),
        _ => Ok(()),
    }
}

/// A hold whose provider has accepted the order (a domain ordered at OVH): kept until the
/// provider says it delivered or cancelled, however long that takes, never released by age.
pub fn keep(db: &Connection, hold: &str) -> Result<(), String> {
    keep_until(db, hold, i64::MAX)
}

/// A hold whose provider has accepted a job kept for a time (a generation, R-120): kept as long
/// as the job, then given back if nobody fetched what it made.
pub fn keep_until(db: &Connection, hold: &str, expires_ms: i64) -> Result<(), String> {
    db.execute(
        "UPDATE money_holds SET expires_ms = ? WHERE hold_ref = ? AND state = 'held'",
        params![expires_ms, hold],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Holds past their time (a provider that never answered) go back.
pub fn release_expired(db: &Connection, principal: &str, now: i64) -> Result<(), String> {
    let mut statement = db
        .prepare("SELECT * FROM money_holds WHERE principal_id = ? AND state = 'held' AND expires_ms <= ?")
        .map_err(|e| e.to_string())?;
    let expired: Vec<JsonValue> = statement
        .query_map(params![principal, now], row_json)
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    expired
        .iter()
        .try_for_each(|held| close(db, held, "released", now))
}

/// What was bought: the hold is released and the real price posted in one balanced
/// transaction — the supplier's or seller's part, atome's 3 % — from the payer.
pub struct Settlement<'a> {
    pub hold: &'a str,
    pub supplier: &'a str,
    pub supplier_cents: i64,
    pub commission_cents: i64,
    pub memo: String,
    pub meta: JsonValue,
}

pub fn settle(db: &Connection, settlement: &Settlement<'_>, now: i64) -> Result<(), String> {
    let held = hold(db, settlement.hold)?.ok_or("money_hold_missing")?;
    if held["state"] == "settled" {
        return Ok(());
    }
    if held["state"] != "held" {
        return Err("money_hold_closed".into());
    }
    close(db, &held, "settled", now)?;
    let principal = held["principal_id"].as_str().unwrap_or_default();
    let category = held["category"].as_str().unwrap_or_default();
    let test = held["payer"] == "test_budget";
    let total = settlement.supplier_cents + settlement.commission_cents;
    if total == 0 {
        return Ok(());
    }
    let from = if test {
        "test_budget".to_string()
    } else {
        wallet::wallet(principal)
    };
    let mut legs = vec![
        (from, -total),
        (settlement.supplier.to_string(), settlement.supplier_cents),
    ];
    if settlement.commission_cents != 0 {
        legs.push((format!("revenue:{category}"), settlement.commission_cents));
    }
    wallet::post(
        db,
        &wallet::Posting {
            reference: format!("spend:{}", settlement.hold),
            kind: "spend",
            principal: Some(principal),
            environment: if test { wallet::TEST } else { wallet::REAL },
            category: Some(category),
            memo: Some(settlement.memo.clone()),
            meta: settlement.meta.clone(),
            legs,
        },
        now,
    )
    .map(drop)
}
