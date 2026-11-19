// What a generation costs the person (R-120, on the R-193 ledger, billing/): its estimate reserved
// before the provider is called — the person's balance, or for an allowed tester atome's test
// budget, refused otherwise —, kept as long as the job once the provider accepted it, then settled
// at the real cost the provider reports plus atome's 3 %, owed to that provider, or given back
// whole when nothing was made. Amounts are millionths of a euro cent (billing/pricing.rs).
use super::generation::{JOB_TTL_MS, now_ms};
use super::http::Done;
use crate::billing::{guard, pricing, usage};
use crate::vault_router::central::Central;

/// The hold of `cost` and its 3 %, or the ledger's refusal (`money_*`).
pub async fn reserve(central: &Central, principal: &str, cost: i64) -> Done<String> {
    let hold = format!("ai:{}", uuid::Uuid::new_v4().simple());
    let (who, reference) = (principal.to_string(), hold.clone());
    central
        .transaction(move |db| {
            let amount = pricing::generation_hold_cents(cost);
            guard::reserve(db, &who, "ai", amount, &reference, now_ms()).map(drop)
        })
        .await?;
    Ok(hold)
}

/// The provider took the job: the hold lasts as long as the job does.
pub async fn keep(central: &Central, hold: &str) -> Done<()> {
    let reference = hold.to_string();
    Ok(central
        .transaction(move |db| guard::keep_until(db, &reference, now_ms() + JOB_TTL_MS))
        .await?)
}

/// What was made, paid at `cost` to `provider`.
pub async fn settle(
    central: &Central,
    hold: &str,
    action: &str,
    provider: &str,
    cost: i64,
) -> Done<()> {
    let (reference, what, supplier) = (hold.to_string(), action.to_string(), provider.to_string());
    Ok(central
        .transaction(move |db| usage::settle_ai(db, &reference, &what, &supplier, cost, now_ms()))
        .await?)
}

/// Nothing was made: the hold goes back whole.
pub async fn release(central: &Central, hold: &str) -> Done<()> {
    let reference = hold.to_string();
    Ok(central
        .transaction(move |db| guard::release(db, &reference, now_ms()))
        .await?)
}
