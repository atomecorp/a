// What Réglages › Admin shows (R-193 M8, R-342 mockups 1–4, temp/admin_panel_2026-11-24/mockups/):
// atome's AI this month (open or closed, the test budget, spent, held, left), what each provider
// was owed and the tokens and requests of the shared key, the access (white list or everyone, and
// everyone's ceilings), the allowed people and the blocked ones (their name, phone, requests
// today, month spent), the administrators. Every setting is answered whole, an unset one off, at
// zero or empty, as the guard reads it (guard.rs#payer), so a server with none answers them all.
use super::{guard, pricing, wallet};
use crate::auth::accounts;
use crate::ws_api::sources::account_roles::{BLOCKED, TESTER};
use rusqlite::{Connection, params};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

// A scope's settings with every field `defaults` names, nested objects completed the same way.
fn complete(settings: JsonValue, defaults: JsonValue) -> JsonValue {
    let JsonValue::Object(mut shown) = defaults else {
        return settings;
    };
    if let JsonValue::Object(set) = settings {
        for (key, value) in set {
            let value = match (shown.remove(&key), value) {
                (Some(default @ JsonValue::Object(_)), value @ JsonValue::Object(_)) => {
                    complete(value, default)
                }
                (_, value) => value,
            };
            shown.insert(key, value);
        }
    }
    JsonValue::Object(shown)
}

fn global_shown(db: &Connection) -> Result<JsonValue, String> {
    let categories: JsonMap<String, JsonValue> = pricing::categories()
        .map(|category| (category.to_string(), json!(0)))
        .collect();
    Ok(complete(
        guard::controls(db, "global")?,
        json!({ "realSpending": false, "testBudgetMonthCents": 0, "categoryMonthCents": categories,
            "accessMode": "list", "everyone": { "perDayCents": 0, "perMonthCents": 0, "aiPromptsPerDay": 0 } }),
    ))
}

fn account_shown(db: &Connection, principal: &str) -> Result<JsonValue, String> {
    Ok(complete(
        guard::controls(db, &format!("account:{principal}"))?,
        json!({ "allowed": false, "perOpCents": 0, "perDayCents": 0, "perMonthCents": 0,
            "aiPromptsPerDay": 0, "categories": [] }),
    ))
}

/// An account as an administrator reads it: its name (username) and verified phone, if any.
pub fn person(db: &Connection, principal: &str) -> Result<JsonValue, String> {
    let account = accounts::find_by_id(db, principal)?.unwrap_or_default();
    Ok(
        json!({ "principal_id": principal, "name": account["username"].as_str().unwrap_or_default(),
        "phone": account["phone"].as_str().unwrap_or_default() }),
    )
}

fn holders(db: &Connection, role: &str) -> Result<Vec<String>, String> {
    let mut statement = db
        .prepare("SELECT principal_id FROM auth_account_roles WHERE role = ? ORDER BY granted_ms")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([role], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

// What the test budget spent for one account since `from`.
fn moved_by(db: &Connection, principal: &str, from: i64) -> Result<i64, String> {
    db.query_row(
        "SELECT COALESCE(SUM(l.amount_cents), 0) FROM money_legs l JOIN money_transactions t ON t.txn_ref = l.txn_ref
         WHERE l.account = 'test_budget' AND t.principal_id = ? AND t.recorded_ms >= ?",
        params![principal, from],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// One person of a list: who they are, their requests today and what they cost this month.
fn listed(db: &Connection, principal: &str, now: i64) -> Result<JsonValue, String> {
    let mut shown = person(db, principal)?;
    shown["controls"] = account_shown(db, principal)?;
    shown["todayPrompts"] = json!(guard::ai_prompts_today(db, principal, now)?);
    shown["monthSpentCents"] = json!(-moved_by(db, principal, guard::month_start(now))?);
    Ok(shown)
}

// What each supplier was owed since `from` (its ledger account `provider:<name>`), most first.
fn providers(db: &Connection, from: i64) -> Result<Vec<JsonValue>, String> {
    let mut statement = db
        .prepare(
            "SELECT SUBSTR(l.account, 10) AS provider, SUM(l.amount_cents) AS cents FROM money_legs l
               JOIN money_transactions t ON t.txn_ref = l.txn_ref
             WHERE l.account LIKE 'provider:%' AND t.recorded_ms >= ? GROUP BY l.account ORDER BY cents DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([from], |row| {
            Ok(json!({ "provider": row.get::<_, String>(0)?, "cents": row.get::<_, i64>(1)?.abs() }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

// The shared key's tokens and requests since the month's first day (`provider_shared_usage`).
fn usage(db: &Connection, now: i64) -> Result<JsonValue, String> {
    let first = crate::vault_router::js::iso(guard::month_start(now))[..10].to_string();
    db.query_row(
        "SELECT COALESCE(SUM(tokens), 0), COALESCE(SUM(operations), 0) FROM provider_shared_usage WHERE day >= ?",
        [first],
        |row| Ok(json!({ "tokens": row.get::<_, i64>(0)?, "requests": row.get::<_, i64>(1)? })),
    )
    .map_err(|e| e.to_string())
}

/// The whole of Réglages › Admin, answered by every `admin.*` frame.
pub fn overview(db: &Connection, now: i64) -> Result<JsonValue, String> {
    let month = guard::month_start(now);
    let spent = -wallet::moved_since(db, "test_budget", month)?;
    let held: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM money_holds WHERE payer = 'test_budget' AND state = 'held'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let global = global_shown(db)?;
    let budget = global["testBudgetMonthCents"].as_i64().unwrap_or(0);
    let people = |role| -> Result<Vec<JsonValue>, String> {
        holders(db, role)?
            .iter()
            .map(|principal| listed(db, principal, now))
            .collect()
    };
    let mut admins = Vec::new();
    for role in ["owner", "admin"] {
        for principal in holders(db, role)? {
            let mut shown = person(db, &principal)?;
            shown["role"] = json!(role);
            admins.push(shown);
        }
    }
    let proposals = db
        .prepare("SELECT principal_id FROM money_admin_proposals ORDER BY proposed_ms")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())?
        .iter()
        .map(|principal| person(db, principal))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(
        json!({ "global": global, "monthSpentCents": spent, "heldCents": held,
        "leftCents": (budget - spent - held).max(0), "providers": providers(db, month)?, "usage": usage(db, now)?,
        "accounts": people(TESTER)?, "blocked": people(BLOCKED)?, "admins": admins, "proposals": proposals }),
    )
}
