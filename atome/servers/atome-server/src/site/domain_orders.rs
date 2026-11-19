// A domain bought at the real registrar (R-193 lot E2; ovh_registrar.rs), in three steps:
//   1. one central transaction reserves the quoted total from the buyer (billing/guard.rs,
//      category `domains`, hold `domain:<owner>:<domain>:<quote id>`), records the domain
//      `pending` and its order `ordering`;
//   2. OVH is asked to order it: its order id makes the order `pending`; a refusal or a failure
//      releases the hold and frees the name (`failed`, or `uncertain` when the checkout may have
//      gone through — kept for an administrator to reconcile with OVH's order list);
//   3. a confirmation (`domain_confirm`, or the domain's records read while it is pending) asks
//      OVH where the order stands: `delivered` settles the hold (`provider:ovh` gets the price
//      with tax, atome its 3 %) and makes the domain `active`; `cancelled` releases the hold
//      and frees the name; anything else keeps it pending.
use super::ovh_registrar::{Registrar, Step, step};
use super::{Site, fail, now_ms};
use crate::billing::guard;
use crate::vault_router::central::row_json;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};

/// A registrar's failure, named for the person, its provider detail kept.
pub(super) fn provider_failed(error: &str, detail: &str) -> JsonValue {
    json!({ "ok": false, "error": error, "detail": detail })
}

/// The order to begin: who, which name, the quote's prices and what to do once delivered.
pub(super) struct Order {
    pub owner: String,
    pub domain: String,
    pub hold: String,
    pub site_id: String,
    pub auto_renew: bool,
    pub quote: JsonValue,
    pub expires_at: String,
    pub records: String,
}

fn cents(value: &JsonValue) -> i64 {
    value.as_i64().unwrap_or(0)
}

/// Step 1: the money reserved, the domain `pending`, the order `ordering`, all or nothing.
pub(super) fn begin(db: &Connection, order: &Order, now: i64) -> Result<(), String> {
    let known = db
        .query_row(
            "SELECT 1 FROM site_domains WHERE domain = ?",
            [&order.domain],
            |_| Ok(()),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if known.is_some() {
        return Err("DOMAIN_TAKEN".into());
    }
    let quote = &order.quote;
    guard::reserve(
        db,
        &order.owner,
        "domains",
        cents(&quote["total_cents"]),
        &order.hold,
        now,
    )?;
    db.execute(
        "INSERT INTO site_domains (domain, owner_id, state, expires_at, auto_renew, records_json) VALUES (?, ?, 'pending', ?, ?, ?)",
        params![order.domain, order.owner, order.expires_at, i64::from(order.auto_renew), order.records],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO site_domain_orders (hold_ref, domain, owner_id, state, site_id, auto_renew, provider_cents, renew_provider_cents,
             price_cents, commission_cents, total_cents, created_ms) VALUES (?, ?, ?, 'ordering', ?, ?, ?, ?, ?, ?, ?, ?)",
        params![order.hold, order.domain, order.owner, order.site_id, i64::from(order.auto_renew),
            cents(&quote["provider_cents"]), cents(&quote["renew"]["provider_cents"]), cents(&quote["price_cents"]),
            cents(&quote["commission_cents"]), cents(&quote["total_cents"]), now],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Step 2 done: OVH's order id; the hold is kept until OVH delivers or cancels.
pub(super) fn ordered(db: &Connection, hold: &str, order_id: i64) -> Result<(), String> {
    guard::keep(db, hold)?;
    db.execute(
        "UPDATE site_domain_orders SET state = 'pending', order_id = ? WHERE hold_ref = ? AND state = 'ordering'",
        params![order_id, hold],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

fn order(db: &Connection, hold: &str) -> Result<JsonValue, String> {
    db.query_row(
        "SELECT * FROM site_domain_orders WHERE hold_ref = ?",
        [hold],
        row_json,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "domain_order_missing".into())
}

/// Nothing bought: the hold released, the name freed, the order closed as `state`.
pub(super) fn abandon(db: &Connection, hold: &str, state: &str, now: i64) -> Result<(), String> {
    let row = order(db, hold)?;
    guard::release(db, hold, now)?;
    db.execute(
        "DELETE FROM site_domains WHERE domain = ? AND owner_id = ? AND state = 'pending'",
        params![row["domain"].as_str(), row["owner_id"].as_str()],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE site_domain_orders SET state = ?, closed_ms = ? WHERE hold_ref = ?",
        params![state, now, hold],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Delivered: the hold settled at the quoted price, the domain `active`; the order row.
pub(super) fn deliver(db: &Connection, hold: &str, now: i64) -> Result<JsonValue, String> {
    let row = order(db, hold)?;
    guard::settle(
        db,
        &guard::Settlement {
            hold,
            supplier: "provider:ovh",
            supplier_cents: cents(&row["price_cents"]),
            commission_cents: cents(&row["commission_cents"]),
            memo: format!("domain {}", row["domain"].as_str().unwrap_or_default()),
            meta: json!({ "orderId": row["order_id"], "providerCents": row["provider_cents"] }),
        },
        now,
    )?;
    db.execute(
        "UPDATE site_domains SET state = 'active' WHERE domain = ? AND owner_id = ? AND state = 'pending'",
        params![row["domain"].as_str(), row["owner_id"].as_str()],
    )
    .map_err(|e| e.to_string())?;
    db.execute(
        "UPDATE site_domain_orders SET state = 'delivered', closed_ms = ? WHERE hold_ref = ?",
        params![now, hold],
    )
    .map_err(|e| e.to_string())?;
    Ok(row)
}

impl Site {
    /// The real registrar, none for the simulated registry, or the configuration's failure.
    pub(super) fn registrar(&self) -> Result<Option<&Registrar>, JsonValue> {
        self.registrar
            .as_ref()
            .map(Option::as_ref)
            .map_err(|error| fail(error))
    }

    /// `domain_buy` at the registrar, from the quote `held` (the owner's own).
    pub(super) async fn order_at(
        &self,
        registrar: &Registrar,
        order: Order,
    ) -> Result<JsonValue, String> {
        let (hold, domain) = (order.hold.clone(), order.domain.clone());
        let provider = cents(&order.quote["provider_cents"]);
        let total = order.quote["total_cents"].clone();
        if let Err(refused) = self
            .store
            .central
            .transaction(move |db| begin(db, &order, now_ms()))
            .await
        {
            return Ok(fail(&refused));
        }
        let outcome = registrar.order(&domain, provider).await;
        let reference = hold.clone();
        match outcome {
            Ok(order_id) => {
                self.store
                    .central
                    .transaction(move |db| ordered(db, &reference, order_id))
                    .await?;
                Ok(
                    json!({ "ok": true, "simulated": false, "domain": domain, "state": "pending", "total_cents": total }),
                )
            }
            Err(error) => {
                let state = if error == "ovh_order_uncertain" {
                    "uncertain"
                } else {
                    "failed"
                };
                self.store
                    .central
                    .transaction(move |db| abandon(db, &reference, state, now_ms()))
                    .await?;
                Ok(provider_failed("DOMAIN_ORDER_FAILED", &error))
            }
        }
    }

    /// `domain_confirm`: OVH asked where the owner's pending order of the domain stands.
    pub(super) async fn confirm(
        &self,
        registrar: &Registrar,
        owner: &str,
        domain: &str,
    ) -> Result<JsonValue, String> {
        let Some(row) = self
            .store
            .central
            .get(
                "SELECT * FROM site_domain_orders WHERE domain = ? AND owner_id = ? AND state = 'pending'",
                vec![json!(domain), json!(owner)],
            )
            .await?
        else {
            return Ok(fail("NOT_FOUND"));
        };
        let hold = row["hold_ref"].as_str().unwrap_or_default().to_string();
        let status = match registrar.status(cents(&row["order_id"])).await {
            Ok(status) => status,
            Err(error) => return Ok(provider_failed("DOMAIN_STATUS_UNAVAILABLE", &error)),
        };
        match step(&status) {
            Step::Waiting => Ok(
                json!({ "ok": true, "simulated": false, "domain": domain, "state": "pending", "provider_status": status }),
            ),
            Step::Cancelled => {
                self.store
                    .central
                    .transaction(move |db| abandon(db, &hold, "cancelled", now_ms()))
                    .await?;
                Ok(fail("DOMAIN_ORDER_CANCELLED"))
            }
            Step::Delivered => {
                let delivered = self
                    .store
                    .central
                    .transaction(move |db| deliver(db, &hold, now_ms()))
                    .await;
                let row = match delivered {
                    Ok(row) => row,
                    Err(error) => return Ok(fail(&error)),
                };
                let mut out =
                    json!({ "ok": true, "simulated": false, "domain": domain, "state": "active" });
                let site_id = row["site_id"].as_str().unwrap_or_default();
                if !site_id.is_empty() {
                    let attached = self.attach(owner, site_id, domain, "active").await?;
                    if attached["ok"] == json!(true) {
                        out["site"] = attached["site"].clone();
                    }
                }
                Ok(out)
            }
        }
    }

    /// The renewal price of a domain bought at the registrar (its quoted renewal), if it was.
    pub(super) async fn ordered_renewal(&self, domain: &str) -> Result<Option<i64>, String> {
        Ok(self
            .store
            .central
            .get(
                "SELECT renew_provider_cents FROM site_domain_orders WHERE domain = ? AND state IN ('pending', 'delivered')
                 ORDER BY created_ms DESC LIMIT 1",
                vec![json!(domain)],
            )
            .await?
            .map(|row| cents(&row["renew_provider_cents"])))
    }
}

#[cfg(test)]
#[path = "domain_orders_tests.rs"]
mod tests;
