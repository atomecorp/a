// What counts down a balance by use (R-193): storage, day by day, and the AI, call by call. No
// month anywhere: the person sees the balance go down, never a promised duration.
use super::guard::{self, Settlement};
use super::{pricing, wallet};
use rusqlite::{Connection, params};
use serde_json::json;

/// Brings a real account's storage up to today: one transaction per accrual, keyed by the last
/// whole day it covers (idempotent), cumulative from the account's storage start so no cent
/// drifts. What the balance cannot pay is atome's (`absorbed:storage`): at zero nothing is erased.
pub fn accrue_storage(db: &Connection, principal: &str, now: i64) -> Result<(), String> {
    let Some(account) = wallet::account(db, principal)? else {
        return Ok(());
    };
    if account["environment"] != wallet::REAL {
        return Ok(());
    }
    let from = account["storage_from_ms"].as_i64().unwrap_or(now);
    let days = (now - from).div_euclid(pricing::DAY_MS);
    if days <= 0 {
        return Ok(());
    }
    let due = pricing::storage_due(days);
    let taken: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(l.amount_cents), 0) FROM money_legs l JOIN money_transactions t ON t.txn_ref = l.txn_ref
             WHERE t.principal_id = ? AND t.kind = 'storage' AND l.account = 'revenue:storage'",
            [principal],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let charge = due - taken;
    if charge <= 0 {
        return Ok(());
    }
    let paid = charge.min(wallet::balance(db, &wallet::wallet(principal))?.max(0));
    let mut legs = vec![("revenue:storage".to_string(), charge)];
    if paid > 0 {
        legs.push((wallet::wallet(principal), -paid));
    }
    if charge > paid {
        legs.push(("absorbed:storage".to_string(), -(charge - paid)));
    }
    wallet::post(
        db,
        &wallet::Posting {
            reference: format!("storage:{principal}:{days}"),
            kind: "storage",
            principal: Some(principal),
            environment: wallet::REAL,
            category: Some("storage"),
            memo: Some(format!("{days}")),
            meta: json!({ "days": days, "paidCents": paid, "absorbedCents": charge - paid }),
            legs,
        },
        now,
    )
    .map(drop)
}

/// Settles one AI answer on its hold, owed to `provider:{provider}`: the provider's real cost (millionths of a cent, metered so
/// no fraction is lost) plus the 3 %. Whole cents are taken as they add up; what a wallet can no
/// longer pay is atome's (`absorbed:ai`), the next call then refused at zero.
pub fn settle_ai(
    db: &Connection,
    hold: &str,
    action: &str,
    provider: &str,
    cost_micro_cents: i64,
    now: i64,
) -> Result<(), String> {
    let supplier = format!("provider:{provider}");
    let held = guard::hold(db, hold)?.ok_or("money_hold_missing")?;
    if held["state"] != "held" {
        return Ok(());
    }
    let principal = held["principal_id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let payer = held["payer"].as_str().unwrap_or_default().to_string();
    let billed = cost_micro_cents + pricing::commission(cost_micro_cents);
    db.execute(
        "INSERT INTO money_meters (principal_id, payer, category, pending_micro_cents) VALUES (?, ?, 'ai', ?)
         ON CONFLICT(principal_id, payer, category) DO UPDATE SET pending_micro_cents = pending_micro_cents + excluded.pending_micro_cents",
        params![principal, payer, billed],
    )
    .map_err(|e| e.to_string())?;
    let pending: i64 = db
        .query_row(
            "SELECT pending_micro_cents FROM money_meters WHERE principal_id = ? AND payer = ? AND category = 'ai'",
            params![principal, payer],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let whole = pending.div_euclid(1_000_000);
    db.execute(
        "UPDATE money_meters SET pending_micro_cents = pending_micro_cents - ? WHERE principal_id = ? AND payer = ? AND category = 'ai'",
        params![whole * 1_000_000, principal, payer],
    )
    .map_err(|e| e.to_string())?;
    // The supplier's part and atome's part of the whole cents taken now.
    let gross = 10_000 + pricing::commission(10_000);
    let commission = whole - (whole * 10_000 + gross / 2).div_euclid(gross);
    let held_cents = held["amount_cents"].as_i64().unwrap_or(0);
    let room = if payer == "wallet" {
        wallet::balance(db, &wallet::wallet(&principal))? + held_cents
    } else {
        i64::MAX
    };
    let taken = whole.min(room.max(0));
    let absorbed = whole - taken;
    let commission = commission.min(taken);
    guard::settle(
        db,
        &Settlement {
            hold,
            supplier: &supplier,
            supplier_cents: taken - commission,
            commission_cents: commission,
            memo: action.to_string(),
            meta: json!({ "costMicroCents": cost_micro_cents, "absorbedCents": absorbed }),
        },
        now,
    )?;
    if absorbed > 0 {
        wallet::post(
            db,
            &wallet::Posting {
                reference: format!("absorbed:{hold}"),
                kind: "absorbed",
                principal: Some(&principal),
                environment: wallet::REAL,
                category: Some("ai"),
                memo: None,
                meta: json!({}),
                legs: vec![
                    ("absorbed:ai".into(), -absorbed),
                    (supplier.clone(), absorbed),
                ],
            },
            now,
        )?;
    }
    Ok(())
}
