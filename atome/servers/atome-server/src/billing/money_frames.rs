// The `billing` frames of the person's money and the administrators' controls (R-193, money.rs,
// admin.rs), and the Stripe webhook that alone brings money in: the provider calls made outside
// the ledger's transactions, the ledger written inside them.
use super::{Billing, admin, money, now_ms, stripe, usage, wallet};
use serde_json::{Value as JsonValue, json};

impl Billing {
    // The person's money and the administrators' controls (money.rs, admin.rs).
    pub(super) async fn money(
        &self,
        action: &str,
        message: &JsonValue,
        principal: String,
    ) -> Result<JsonValue, String> {
        let now = now_ms();
        let message = message.clone();
        match action {
            "wallet.status" => {
                self.central
                    .transaction(move |db| money::status(db, &principal, now))
                    .await
            }
            "wallet.history" => {
                self.central
                    .transaction(move |db| {
                        usage::accrue_storage(db, &principal, now)?;
                        Ok(json!({ "entries": wallet::history(db, &principal, 144)? }))
                    })
                    .await
            }
            "wallet.pay" => {
                let environment = if self.stripe.live() {
                    wallet::REAL
                } else {
                    wallet::TEST
                };
                let (reference, amount, purpose) = self
                    .central
                    .transaction(move |db| {
                        money::open_payment(db, &principal, &message, "stripe", environment, now)
                    })
                    .await?;
                let name = if purpose == "activation" {
                    "atome"
                } else {
                    "atome · recharge"
                };
                let page = self
                    .stripe
                    .checkout(&stripe::Checkout {
                        payment_ref: reference.clone(),
                        amount_cents: amount,
                        name: name.into(),
                    })
                    .await?;
                Ok(json!({ "paymentRef": reference, "amountCents": amount, "url": page["url"] }))
            }
            "wallet.withdraw" => {
                let cents = message["amountCents"].as_i64().unwrap_or(0);
                let plan = self
                    .central
                    .transaction(move |db| money::plan_withdrawal(db, &principal, cents, now))
                    .await?;
                for (intent, reference, take) in &plan {
                    self.stripe.refund(intent, *take, reference).await?;
                }
                Ok(json!({ "withdrawnCents": cents, "refunds": plan.len() }))
            }
            "wallet.client" => {
                let environment = self
                    .apple
                    .verify_app_transaction(&message["appTransaction"], now)?;
                let device = message["deviceId"].as_str().unwrap_or_default().to_string();
                self.central
                    .transaction(move |db| {
                        money::record_client_proof(db, &principal, &device, environment, now)
                    })
                    .await?;
                Ok(json!({ "environment": environment }))
            }
            _ => {
                let action = action.to_string();
                self.central
                    .transaction(move |db| admin::frame(db, &action, &message, &principal, now))
                    .await
            }
        }
    }

    /// A Stripe webhook, verified before anything changes: a paid Checkout session credits the
    /// ledger once (money.rs `payment_confirmed`); every other event is acknowledged unread.
    pub async fn stripe_event(&self, signature: &str, payload: &[u8]) -> Result<bool, String> {
        let event = self.stripe.event(signature, payload, now_ms() / 1000)?;
        if event["type"] != "checkout.session.completed" {
            return Ok(false);
        }
        let session = &event["data"]["object"];
        if session["payment_status"] != "paid" {
            return Ok(false);
        }
        let reference = session
            .pointer("/metadata/payment_ref")
            .and_then(JsonValue::as_str)
            .unwrap_or_default()
            .to_string();
        let intent = session["payment_intent"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let paid = session["amount_total"].as_i64().unwrap_or(0);
        self.central
            .transaction(move |db| {
                money::payment_confirmed(db, &reference, &intent, paid, now_ms())
            })
            .await
    }
}
