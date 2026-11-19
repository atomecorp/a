// The person's money (R-193, screens M1–M6): the balance that counts down with use, its history,
// a top-up for oneself or for someone else (any amount from the minimum), the withdrawal of
// unused balance back onto the card that paid it, and the account's activation. Payments come in
// only through a provider's verified proof (a Stripe webhook, a store receipt): a client never
// says it paid.
use super::{admin, guard, pricing, usage, wallet};
use crate::vault_router::central::row_json;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

/// M1: the balance, what counts it down, the environment and whether this client may pay.
pub fn status(db: &Connection, principal: &str, now: i64) -> Result<JsonValue, String> {
    guard::release_expired(db, principal, now)?;
    usage::accrue_storage(db, principal, now)?;
    let account = wallet::account(db, principal)?;
    let (period_cents, period_days) = pricing::storage_period();
    let ai_month: i64 = db
        .query_row(
            "SELECT COALESCE(-SUM(l.amount_cents), 0) FROM money_legs l JOIN money_transactions t ON t.txn_ref = l.txn_ref
             WHERE l.account = ? AND t.category = 'ai' AND t.kind = 'spend' AND t.recorded_ms >= ?",
            params![wallet::wallet(principal), guard::month_start(now)],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "environment": account.as_ref().map_or(json!(wallet::TEST), |account| account["environment"].clone()),
        "activated": account.is_some(),
        "balanceCents": wallet::balance(db, &wallet::wallet(principal))?,
        "heldCents": wallet::balance(db, &wallet::hold(principal))?,
        "storage": { "periodCents": period_cents, "periodDays": period_days, "dayCents": pricing::storage_due(1) },
        "aiMonthCents": ai_month,
        "testflight": guard::testflight(db, principal)?,
        "withdrawableCents": withdrawable(db, principal)?,
        "entryCents": pricing::entry_cents(),
        "topupMinCents": pricing::topup_min_cents(),
        "admin": admin::is_admin(db, principal)?,
    }))
}

// The unused balance that can go back onto a card: the top-ups paid for this account, less what
// was already given back, never more than the balance (the entry price is not refundable).
fn refundable(db: &Connection, principal: &str) -> Result<Vec<JsonValue>, String> {
    let mut statement = db
        .prepare(
            "SELECT * FROM money_payments WHERE COALESCE(beneficiary_id, principal_id) = ? AND purpose = 'topup'
               AND state = 'paid' AND provider_id IS NOT NULL AND amount_cents > refunded_cents ORDER BY created_ms DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([principal], row_json)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

fn withdrawable(db: &Connection, principal: &str) -> Result<i64, String> {
    let paid: i64 = refundable(db, principal)?
        .iter()
        .map(|row| {
            row["amount_cents"].as_i64().unwrap_or(0) - row["refunded_cents"].as_i64().unwrap_or(0)
        })
        .sum();
    Ok(paid.min(wallet::balance(db, &wallet::wallet(principal))?.max(0)))
}

/// What atome adds to a paid entry for an invitation's discount (its share of the proposed entry);
/// an offered invitation needs no payment at all.
fn entry_gift(db: &Connection, owner: &str) -> Result<i64, String> {
    match admin::consumed_terms(db, owner)? {
        Some((mode, _)) if mode == "free" => Err("money_activation_offered".into()),
        Some((mode, pct)) if mode == "discount" => Ok(pricing::entry_cents() * pct / 100),
        _ => Ok(0),
    }
}

/// A payment about to be made on the provider's page: an activation (any amount from the minimum,
/// the entry price less an invitation's discount proposed) or a top-up of any amount from the
/// minimum, for oneself or a contact.
pub fn open_payment(
    db: &Connection,
    principal: &str,
    message: &JsonValue,
    provider: &str,
    environment: &str,
    now: i64,
) -> Result<(String, i64, String), String> {
    let purpose = message["purpose"].as_str().unwrap_or("topup");
    let beneficiary = message["beneficiary"]
        .as_str()
        .filter(|id| !id.is_empty() && *id != principal);
    let amount = match purpose {
        "activation" => {
            let owner = beneficiary.unwrap_or(principal);
            if wallet::account(db, owner)?
                .is_some_and(|account| account["environment"] == wallet::REAL)
            {
                return Err("money_already_active".into());
            }
            let gift = entry_gift(db, owner)?;
            message["amountCents"]
                .as_i64()
                .unwrap_or(pricing::entry_cents() - gift)
        }
        "topup" => message["amountCents"].as_i64().unwrap_or(0),
        _ => return Err("money_value_invalid:purpose".into()),
    };
    if amount < pricing::topup_min_cents() {
        return Err("money_amount_too_small".into());
    }
    if let Some(beneficiary) = beneficiary {
        let known: bool = db
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM auth_device_keys WHERE principal_id = ?)",
                [beneficiary],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !known {
            return Err("money_beneficiary_unknown".into());
        }
    }
    let reference = format!("pay_{}", uuid::Uuid::new_v4().simple());
    db.execute(
        "INSERT INTO money_payments (payment_ref, provider, principal_id, beneficiary_id, purpose, amount_cents, environment, state, created_ms, updated_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
        params![reference, provider, principal, beneficiary, purpose, amount, environment, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok((reference, amount, purpose.to_string()))
}

/// A provider confirmed a payment (Stripe's signed webhook): the money enters the ledger once.
/// An activation makes the account real and opens what was paid as credit, an invitation's
/// discount added by atome; a top-up credits the beneficiary.
pub fn payment_confirmed(
    db: &Connection,
    reference: &str,
    provider_id: &str,
    paid_cents: i64,
    now: i64,
) -> Result<bool, String> {
    let payment = db
        .query_row(
            "SELECT * FROM money_payments WHERE payment_ref = ?",
            [reference],
            row_json,
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or("money_payment_unknown")?;
    if payment["state"] == "paid" {
        return Ok(false);
    }
    let amount = payment["amount_cents"].as_i64().unwrap_or(0);
    if paid_cents != amount {
        return Err("money_payment_amount_mismatch".into());
    }
    db.execute(
        "UPDATE money_payments SET state = 'paid', provider_id = ?, updated_ms = ? WHERE payment_ref = ?",
        params![provider_id, now, reference],
    )
    .map_err(|e| e.to_string())?;
    let owner = payment["beneficiary_id"]
        .as_str()
        .or(payment["principal_id"].as_str())
        .unwrap_or_default()
        .to_string();
    let provider = payment["provider"].as_str().unwrap_or_default();
    let mut legs = vec![(format!("cash:{provider}"), -amount)];
    let credit = if payment["purpose"] == "activation" {
        wallet::activate(db, &owner, wallet::REAL, reference, now)?;
        wallet::make_real(db, &owner, now)?;
        let gift = entry_gift(db, &owner)?;
        if gift > 0 {
            legs.push(("absorbed:invitations".into(), -gift));
        }
        amount + gift
    } else {
        amount
    };
    legs.push((wallet::wallet(&owner), credit));
    wallet::post(
        db,
        &wallet::Posting {
            reference: format!("payment:{reference}"),
            kind: payment["purpose"].as_str().unwrap_or("topup"),
            principal: Some(&owner),
            environment: wallet::REAL,
            category: None,
            memo: Some(provider.to_string()),
            meta: json!({ "paidBy": payment["principal_id"], "paidCents": amount }),
            legs,
        },
        now,
    )
}

/// An account made: real with its whole entry as credit when an invitation offers it, else a
/// test account until a real payment (Web) or a production store receipt activates it.
pub fn activate_new(
    db: &Connection,
    principal: &str,
    store_environment: Option<&str>,
    now: i64,
) -> Result<JsonValue, String> {
    let offered =
        matches!(admin::consumed_terms(db, principal)?, Some((mode, _)) if mode == "free");
    let real = offered || store_environment == Some(wallet::REAL);
    let reference = format!("activation:{principal}");
    wallet::activate(
        db,
        principal,
        if real { wallet::REAL } else { wallet::TEST },
        &reference,
        now,
    )?;
    if real {
        let entry = pricing::entry_cents();
        let source = if offered {
            "absorbed:invitations"
        } else {
            "cash:store"
        };
        wallet::post(
            db,
            &wallet::Posting {
                reference,
                kind: "activation",
                principal: Some(principal),
                environment: wallet::REAL,
                category: None,
                memo: Some(if offered { "offered" } else { "store" }.into()),
                meta: json!({}),
                legs: vec![(source.into(), -entry), (wallet::wallet(principal), entry)],
            },
            now,
        )?;
    }
    Ok(
        json!({ "environment": if real { wallet::REAL } else { wallet::TEST }, "entryCents": pricing::entry_cents() }),
    )
}

/// The refunds to make for a withdrawal of `cents` of unused balance, newest payment first,
/// the balance taken off at once (the provider's answer then records each refund).
pub fn plan_withdrawal(
    db: &Connection,
    principal: &str,
    cents: i64,
    now: i64,
) -> Result<Vec<(String, String, i64)>, String> {
    if cents <= 0 || cents > withdrawable(db, principal)? {
        return Err("money_withdrawal_too_large".into());
    }
    let mut left = cents;
    let mut plan = Vec::new();
    for payment in refundable(db, principal)? {
        if left == 0 {
            break;
        }
        let room = payment["amount_cents"].as_i64().unwrap_or(0)
            - payment["refunded_cents"].as_i64().unwrap_or(0);
        let take = room.min(left);
        let reference = payment["payment_ref"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        db.execute(
            "UPDATE money_payments SET refunded_cents = refunded_cents + ?, updated_ms = ? WHERE payment_ref = ?",
            params![take, now, reference],
        )
        .map_err(|e| e.to_string())?;
        let provider = payment["provider"].as_str().unwrap_or_default().to_string();
        wallet::post(
            db,
            &wallet::Posting {
                reference: format!("withdraw:{reference}:{now}"),
                kind: "withdrawal",
                principal: Some(principal),
                environment: wallet::REAL,
                category: None,
                memo: Some(provider.clone()),
                meta: json!({ "payment": reference }),
                legs: vec![
                    (wallet::wallet(principal), -take),
                    (format!("refund:{provider}"), take),
                ],
            },
            now,
        )?;
        plan.push((
            payment["provider_id"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            reference,
            take,
        ));
        left -= take;
    }
    Ok(plan)
}

/// An `AppTransaction` verified by Apple for one of the account's devices: Production proves an
/// App Store install; anything else stays TestFlight. Recorded for each live key of that device.
pub fn record_client_proof(
    db: &Connection,
    principal: &str,
    device: &str,
    environment: &str,
    now: i64,
) -> Result<(), String> {
    let recorded = db
        .execute(
            "INSERT INTO money_client_proofs (key_id, principal_id, environment, verified_ms)
             SELECT key_id, principal_id, ?, ? FROM auth_device_keys WHERE device_id = ? AND principal_id = ? AND revoked_ms IS NULL
             ON CONFLICT(key_id) DO UPDATE SET environment = excluded.environment, verified_ms = excluded.verified_ms",
            params![environment, now, device, principal],
        )
        .map_err(|e| e.to_string())?;
    if recorded == 0 {
        return Err("money_client_device_unknown".into());
    }
    Ok(())
}
