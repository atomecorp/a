// The administrators' money controls (R-193, screens M7–M9): the real-spending switch, the
// month's test budget and its ceilings per category, the allowed (tester) accounts and their
// own ceilings, the invitations' activation terms, and the administrators' list. Every frame
// checks the role again on the server; an administrator proposes a new one, the principal
// administrator (`owner`, given only by scripts/account_roles_admin.mjs) confirms it.
use super::{guard, wallet};
use crate::vault_router::central::row_json;
use crate::ws_api::sources::account_roles::{self, ADMIN, OWNER, TESTER};
use rusqlite::{Connection, params};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// What an invitation's activation costs: `free` (atome pays the entry), `pay`, or `discount`.
pub struct InviteTerms {
    mode: String,
    discount_pct: i64,
}

pub fn invite_terms(value: Option<&JsonValue>) -> Result<Option<InviteTerms>, String> {
    let Some(value) = value.filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let mode = value["mode"].as_str().unwrap_or_default().to_string();
    let discount_pct = value["discountPct"].as_i64().unwrap_or(0);
    let valid = match mode.as_str() {
        "free" | "pay" => discount_pct == 0,
        "discount" => (1..=99).contains(&discount_pct),
        _ => false,
    };
    if !valid {
        return Err("auth_request_invalid".into());
    }
    Ok(Some(InviteTerms { mode, discount_pct }))
}

/// Inside the invitation's own transaction: only an administrator may offer or discount.
pub fn record_invite_terms(
    db: &Connection,
    invite: &str,
    terms: &InviteTerms,
    by: &str,
    now: i64,
) -> Result<(), String> {
    if terms.mode != "pay" && !is_admin(db, by)? {
        return Err("money_admin_required".into());
    }
    db.execute(
        "INSERT INTO money_invite_terms (invite_id, mode, discount_pct, set_by, set_ms) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(invite_id) DO UPDATE SET mode = excluded.mode, discount_pct = excluded.discount_pct, set_by = excluded.set_by, set_ms = excluded.set_ms",
        params![invite, terms.mode, terms.discount_pct, by, now],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// The terms of the invitation a new account consumed, if any.
pub fn consumed_terms(db: &Connection, principal: &str) -> Result<Option<(String, i64)>, String> {
    use rusqlite::OptionalExtension;
    db.query_row(
        "SELECT t.mode, t.discount_pct FROM money_invite_terms t JOIN auth_invites i ON i.invite_id = t.invite_id
         WHERE i.consumed_by = ?",
        [principal],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn is_admin(db: &Connection, principal: &str) -> Result<bool, String> {
    Ok(account_roles::holds(db, principal, ADMIN)? || account_roles::holds(db, principal, OWNER)?)
}

fn grant(db: &Connection, principal: &str, role: &str, by: &str, now: i64) -> Result<(), String> {
    db.execute(
        "INSERT INTO auth_account_roles (principal_id, role, granted_ms, granted_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(principal_id, role) DO NOTHING",
        params![principal, role, now, by],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

fn revoke(db: &Connection, principal: &str, role: &str) -> Result<(), String> {
    db.execute(
        "DELETE FROM auth_account_roles WHERE principal_id = ? AND role = ?",
        params![principal, role],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

fn rows(
    db: &Connection,
    sql: &str,
    values: &[&dyn rusqlite::ToSql],
) -> Result<Vec<JsonValue>, String> {
    let mut statement = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(values, row_json)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

fn whole(value: &JsonValue, name: &str) -> Result<Option<i64>, String> {
    match value.get(name) {
        None | Some(JsonValue::Null) => Ok(None),
        Some(number) => number
            .as_i64()
            .filter(|cents| *cents >= 0)
            .map(Some)
            .ok_or_else(|| format!("money_value_invalid:{name}")),
    }
}

// M8: the month, the budgets, the allowed accounts, the administrators.
fn overview(db: &Connection, now: i64) -> Result<JsonValue, String> {
    let month = guard::month_start(now);
    let spent = -wallet::moved_since(db, "test_budget", month)?;
    let held: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM money_holds WHERE payer = 'test_budget' AND state = 'held'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut accounts = rows(
        db,
        "SELECT r.principal_id FROM auth_account_roles r WHERE r.role = ? ORDER BY r.granted_ms",
        &[&TESTER],
    )?;
    for account in &mut accounts {
        let principal = account["principal_id"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        account["controls"] = guard::controls(db, &format!("account:{principal}"))?;
        account["monthSpentCents"] = json!(-moved_by(db, &principal, month)?);
    }
    let admins = rows(
        db,
        "SELECT principal_id, role, granted_ms FROM auth_account_roles WHERE role IN ('owner', 'admin') ORDER BY granted_ms",
        &[],
    )?;
    let proposals = rows(
        db,
        "SELECT * FROM money_admin_proposals ORDER BY proposed_ms",
        &[],
    )?;
    Ok(
        json!({ "global": guard::controls(db, "global")?, "monthSpentCents": spent, "heldCents": held,
        "accounts": accounts, "admins": admins, "proposals": proposals }),
    )
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

fn merge(mut current: JsonValue, patch: &JsonValue, keys: &[&str]) -> JsonValue {
    let object = current
        .as_object_mut()
        .map(std::mem::take)
        .unwrap_or_default();
    let mut merged: JsonMap<String, JsonValue> = object;
    for key in keys {
        if let Some(value) = patch.get(*key) {
            merged.insert((*key).to_string(), value.clone());
        }
    }
    JsonValue::Object(merged)
}

/// `billing` actions `admin.*`, for an administrator only.
pub fn frame(
    db: &Connection,
    action: &str,
    message: &JsonValue,
    by: &str,
    now: i64,
) -> Result<JsonValue, String> {
    if !is_admin(db, by)? {
        return Err("money_admin_required".into());
    }
    let target = message["principal"].as_str().unwrap_or_default();
    match action {
        "admin.money" => overview(db, now),
        "admin.money.set" => {
            let patch = &message["settings"];
            if let Some(switch) = patch
                .get("realSpending")
                .filter(|switch| !switch.is_boolean())
            {
                return Err(format!("money_value_invalid:realSpending:{switch}"));
            }
            whole(patch, "testBudgetMonthCents")?;
            if let Some(categories) = patch.get("categoryMonthCents") {
                for (category, _) in categories
                    .as_object()
                    .ok_or("money_value_invalid:categoryMonthCents")?
                {
                    whole(categories, category)?;
                }
            }
            let next = merge(
                guard::controls(db, "global")?,
                patch,
                &["realSpending", "testBudgetMonthCents", "categoryMonthCents"],
            );
            guard::set_controls(db, "global", &next, by, now)?;
            overview(db, now)
        }
        "admin.account.set" => {
            if target.is_empty() {
                return Err("money_value_invalid:principal".into());
            }
            let patch = &message["settings"];
            for name in [
                "perOpCents",
                "perDayCents",
                "perMonthCents",
                "aiPromptsPerDay",
            ] {
                whole(patch, name)?;
            }
            let scope = format!("account:{target}");
            let next = merge(
                guard::controls(db, &scope)?,
                patch,
                &[
                    "allowed",
                    "perOpCents",
                    "perDayCents",
                    "perMonthCents",
                    "aiPromptsPerDay",
                    "categories",
                ],
            );
            guard::set_controls(db, &scope, &next, by, now)?;
            match patch.get("listed").and_then(JsonValue::as_bool) {
                Some(true) => grant(db, target, TESTER, by, now)?,
                Some(false) => revoke(db, target, TESTER)?,
                None => {}
            }
            overview(db, now)
        }
        "admin.propose" => {
            db.execute(
                "INSERT INTO money_admin_proposals (principal_id, proposed_by, proposed_ms) VALUES (?, ?, ?) ON CONFLICT(principal_id) DO NOTHING",
                params![target, by, now],
            )
            .map_err(|e| e.to_string())?;
            overview(db, now)
        }
        "admin.confirm" | "admin.revoke" => {
            if !account_roles::holds(db, by, OWNER)? {
                return Err("money_owner_required".into());
            }
            if action == "admin.confirm" {
                let proposed = db
                    .execute(
                        "DELETE FROM money_admin_proposals WHERE principal_id = ?",
                        [target],
                    )
                    .map_err(|e| e.to_string())?;
                if proposed != 1 {
                    return Err("money_admin_not_proposed".into());
                }
                grant(db, target, ADMIN, by, now)?;
            } else {
                db.execute(
                    "DELETE FROM money_admin_proposals WHERE principal_id = ?",
                    [target],
                )
                .map_err(|e| e.to_string())?;
                revoke(db, target, ADMIN)?;
            }
            overview(db, now)
        }
        _ => Err("billing_operation_not_allowed".into()),
    }
}
