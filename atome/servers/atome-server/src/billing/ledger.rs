// Purchases, entitlements and the credit ledger (server/billing/billing_ledger.js, ported).
// Every store proof (StoreKit, Google Play, Stripe, or the development simulation) ends in
// `apply_purchase`; the active plan and both credit balances are derived from rows, never
// stored as mutable totals. Included credits belong to one paid period and lapse with it;
// purchased credits never lapse. Each function runs on the caller's connection, inside its
// transaction when it holds one (an account's creation records its payment there).
use super::{Purchase, catalog};
use crate::vault_router::central::{atomic, row_json};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

fn active_plan(db: &Connection, principal: &str, now: i64) -> Result<Option<JsonValue>, String> {
    db.query_row(
        "SELECT * FROM billing_purchases WHERE principal_id = ? AND revoked_ms IS NULL AND period_end_ms > ?
         AND product_id LIKE 'one.atome.plan.%' ORDER BY period_end_ms DESC LIMIT 1",
        params![principal, now],
        row_json,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn sum(db: &Connection, sql: &str, values: &[&dyn rusqlite::ToSql]) -> Result<i64, String> {
    db.query_row(sql, values, |row| row.get::<_, Option<i64>>(0))
        .map(Option::unwrap_or_default)
        .map_err(|e| e.to_string())
}

// The active plan and the two balances.
fn balances(
    db: &Connection,
    principal: &str,
    now: i64,
) -> Result<(Option<JsonValue>, i64, i64), String> {
    let current = active_plan(db, principal, now)?;
    let included = match &current {
        Some(plan) => sum(
            db,
            "SELECT SUM(credits) FROM billing_credit_ledger WHERE principal_id = ? AND bucket = 'included' AND period_ref = ?",
            &[
                &principal,
                &plan["purchase_ref"].as_str().unwrap_or_default(),
            ],
        )?,
        None => 0,
    };
    let purchased = sum(
        db,
        "SELECT SUM(credits) FROM billing_credit_ledger WHERE principal_id = ? AND bucket = 'purchased'",
        &[&principal],
    )?;
    Ok((current, included, purchased))
}

// One ledger line: its reference, owner, bucket, credits, period and reason.
struct Entry<'a> {
    reference: String,
    principal: &'a str,
    bucket: &'static str,
    credits: i64,
    period: Option<&'a str>,
    reason: &'static str,
}

fn record(db: &Connection, entry: Entry<'_>, now: i64) -> Result<(), String> {
    db.execute(
        "INSERT INTO billing_credit_ledger (entry_ref, principal_id, bucket, credits, period_ref, reason, recorded_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entry_ref) DO NOTHING",
        params![entry.reference, entry.principal, entry.bucket, entry.credits, entry.period, entry.reason, now],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Idempotent per store transaction. A transaction already bound to another principal is
/// refused: a receipt cannot be replayed elsewhere.
pub fn apply_purchase(
    db: &Connection,
    principal: &str,
    purchase: &Purchase,
    now: i64,
) -> Result<JsonValue, String> {
    let product = catalog::product(&purchase.product_id)
        .filter(|_| !principal.is_empty())
        .ok_or("billing_product_unknown")?;
    if !catalog::listed("sources", &json!(purchase.source)) || purchase.transaction_id.is_empty() {
        return Err("billing_proof_invalid".into());
    }
    let plan = product["kind"] == "plan";
    let start = purchase.period_start_ms.unwrap_or(0);
    if plan && purchase.period_end_ms.is_none_or(|end| end <= start) {
        return Err("billing_period_invalid".into());
    }
    let reference = format!("{}:{}", purchase.source, purchase.transaction_id);
    let original = format!("{}:{}", purchase.source, purchase.original());
    // Each statement is idempotent and the grant follows the ownership check.
    let inserted = db
        .execute(
            "INSERT INTO billing_purchases (purchase_ref, principal_id, source, product_id, original_ref,
             period_start_ms, period_end_ms, recorded_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(purchase_ref) DO NOTHING",
            params![
                reference,
                principal,
                purchase.source,
                purchase.product_id,
                original,
                purchase.period_start_ms.filter(|_| plan),
                purchase.period_end_ms.filter(|_| plan),
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    let owner: Option<String> = db
        .query_row(
            "SELECT principal_id FROM billing_purchases WHERE purchase_ref = ?",
            [&reference],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if owner.as_deref() != Some(principal) {
        return Err("billing_purchase_owned_elsewhere".into());
    }
    let entry = if plan {
        Entry {
            reference: format!("included:{reference}"),
            principal,
            bucket: "included",
            credits: product["monthlyCredits"].as_i64().unwrap_or_default(),
            period: Some(&reference),
            reason: "plan_period",
        }
    } else {
        Entry {
            reference: format!("pack:{reference}"),
            principal,
            bucket: "purchased",
            credits: product["credits"].as_i64().unwrap_or_default(),
            period: None,
            reason: "credit_pack",
        }
    };
    record(db, entry, now)?;
    Ok(json!({ "purchaseRef": reference, "created": inserted == 1 }))
}

/// The account-creation payment is still simulated: it opens one real period of the base
/// plan, recorded with source `simulated`.
pub fn apply_simulated_plan(
    db: &Connection,
    principal: &str,
    now: i64,
) -> Result<JsonValue, String> {
    let product = &catalog::catalog()["plans"][0];
    let product_id = product["productId"].as_str().unwrap_or_default();
    let purchase = Purchase {
        source: "simulated".into(),
        transaction_id: format!("{principal}:{now}"),
        product_id: product_id.into(),
        period_start_ms: Some(now),
        period_end_ms: Some(now + catalog::period_ms()),
        ..Purchase::default()
    };
    apply_purchase(db, principal, &purchase, now)?;
    Ok(
        json!({ "mode": "simulated", "productId": product_id, "amountCents": product["priceCents"],
        "currency": product["currency"], "period": product["period"] }),
    )
}

/// The account that holds a store subscription (or one-time purchase): renewals and
/// restores of the same original transaction stay with it.
pub fn owner_of_original(
    db: &Connection,
    source: &str,
    original: &str,
) -> Result<Option<String>, String> {
    db.query_row(
        "SELECT principal_id FROM billing_purchases WHERE original_ref = ? LIMIT 1",
        [format!("{source}:{original}")],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

/// Refund or chargeback: the plan stops and an unspent pack is withdrawn.
pub fn revoke_purchase(
    db: &Connection,
    source: &str,
    transaction: &str,
    now: i64,
) -> Result<bool, String> {
    let reference = format!("{source}:{transaction}");
    atomic(db, |db| {
        let purchase = db
            .query_row(
                "SELECT * FROM billing_purchases WHERE purchase_ref = ?",
                [&reference],
                row_json,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(purchase) = purchase.filter(|purchase| purchase["revoked_ms"].is_null()) else {
            return Ok(false);
        };
        db.execute(
            "UPDATE billing_purchases SET revoked_ms = ? WHERE purchase_ref = ?",
            params![now, reference],
        )
        .map_err(|e| e.to_string())?;
        let principal = purchase["principal_id"].as_str().unwrap_or_default();
        let product = catalog::product(purchase["product_id"].as_str().unwrap_or_default());
        if let Some(product) = product.filter(|product| product["kind"] == "pack") {
            let entry = Entry {
                reference: format!("revoke:{reference}"),
                principal,
                bucket: "purchased",
                credits: -product["credits"].as_i64().unwrap_or_default(),
                period: None,
                reason: "pack_revoked",
            };
            record(db, entry, now)?;
        }
        Ok(true)
    })
}

/// The principal's plan and credits.
pub fn status(db: &Connection, principal: &str, now: i64) -> Result<JsonValue, String> {
    let (current, included, purchased) = balances(db, principal, now)?;
    let plan = current.as_ref().and_then(|current| {
        let product = catalog::product(current["product_id"].as_str().unwrap_or_default())?;
        Some(json!({ "productId": product["productId"], "tier": product["tier"], "source": current["source"],
            "periodEndMs": current["period_end_ms"], "storageBytes": product["storageBytes"] }))
    });
    let included = included.max(0);
    Ok(json!({ "plan": plan,
        "credits": { "included": included, "purchased": purchased, "total": included + purchased } }))
}
