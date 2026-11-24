// The administrators' money controls (R-193, screens M7–M9): the real-spending switch, the
// month's test budget and its ceilings per category, the allowed (tester) accounts and their
// own ceilings, the invitations' activation terms, and the administrators' list. Every frame
// checks the role again on the server; an administrator proposes a new one, the principal
// administrator (`owner`, given only by `atome_admin roles`) confirms it. R-342 (Réglages ›
// Admin): the access open to the white list or to everyone (`accessMode`, `everyone`'s ceilings),
// the block list (`blocked`), an account found by its phone; what the screen shows is
// admin_overview.rs.
use super::{admin_overview, guard};
use crate::auth::accounts;
use crate::ws_api::sources::account_roles::{self, ADMIN, BLOCKED, OWNER, TESTER};
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
        "admin.money" => admin_overview::overview(db, now),
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
            if let Some(mode) = patch
                .get("accessMode")
                .filter(|mode| *mode != "list" && *mode != "all")
            {
                return Err(format!("money_value_invalid:accessMode:{mode}"));
            }
            let current = guard::controls(db, "global")?;
            let mut patch = patch.clone();
            if let Some(everyone) = patch.get("everyone") {
                for name in ["perDayCents", "perMonthCents", "aiPromptsPerDay"] {
                    whole(everyone, name)?;
                }
                // Everyone's ceilings change one by one: the others keep their value.
                patch["everyone"] = merge(
                    current["everyone"].clone(),
                    everyone,
                    &["perDayCents", "perMonthCents", "aiPromptsPerDay"],
                );
            }
            let next = merge(
                current,
                &patch,
                &[
                    "realSpending",
                    "testBudgetMonthCents",
                    "categoryMonthCents",
                    "accessMode",
                    "everyone",
                ],
            );
            guard::set_controls(db, "global", &next, by, now)?;
            admin_overview::overview(db, now)
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
            // Blocked (R-342) is one notion: on the block list, and not allowed while on it.
            let mut patch = patch.clone();
            if let Some(blocked) = patch.get("blocked").and_then(JsonValue::as_bool) {
                patch["allowed"] = json!(!blocked);
                if blocked {
                    grant(db, target, BLOCKED, by, now)?;
                } else {
                    revoke(db, target, BLOCKED)?;
                }
            }
            let next = merge(
                guard::controls(db, &scope)?,
                &patch,
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
            admin_overview::overview(db, now)
        }
        // An account found by its verified phone (Réglages › Admin › Ajout, R-342).
        "admin.account.find" => {
            let phone = accounts::normalize_phone(message["phone"].as_str().unwrap_or_default());
            let found = if phone.is_empty() {
                None
            } else {
                accounts::find_by_phone(db, &phone)?
            };
            let principal = found
                .as_ref()
                .and_then(|account| account["user_id"].as_str())
                .ok_or("money_account_not_found")?;
            let mut shown = admin_overview::person(db, principal)?;
            shown["listed"] = json!(account_roles::holds(db, principal, TESTER)?);
            shown["blocked"] = json!(account_roles::holds(db, principal, BLOCKED)?);
            Ok(json!({ "account": shown }))
        }
        "admin.propose" => {
            db.execute(
                "INSERT INTO money_admin_proposals (principal_id, proposed_by, proposed_ms) VALUES (?, ?, ?) ON CONFLICT(principal_id) DO NOTHING",
                params![target, by, now],
            )
            .map_err(|e| e.to_string())?;
            admin_overview::overview(db, now)
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
            admin_overview::overview(db, now)
        }
        _ => Err("billing_operation_not_allowed".into()),
    }
}
