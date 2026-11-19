// Stripe (R-193), the Web and desktop payment provider: the card never reaches atome — the person
// pays on Stripe's own Checkout page, Stripe keeps the card (and, for a seller, the bank account
// of their Connect account). The server only creates the Checkout session, verifies Stripe's
// signed webhook before the ledger changes, gives unused balance back as a refund on the card
// that paid it, and pays a seller's sales out through Connect.
//
// Keys: `STRIPE_SECRET_KEY` (`sk_test_…` costs nothing and charges no card; `sk_live_…` is real
// money) and `STRIPE_WEBHOOK_SECRET` (`whsec_…`), in the server's settings, never in the
// repository, never sent to a client, never logged. Without them every Stripe operation answers
// `money_stripe_unconfigured`. A production server refuses a test key.
use ring::hmac;
use serde_json::{Value as JsonValue, json};

const API: &str = "https://api.stripe.com/v1";
// Stripe's own tolerance for a webhook's timestamp.
const TOLERANCE_S: i64 = 300;

pub struct Stripe {
    secret: Option<String>,
    webhook: Option<String>,
    origin: String,
}

pub struct Checkout {
    pub payment_ref: String,
    pub amount_cents: i64,
    pub name: String,
}

impl Stripe {
    pub fn load(settings: &crate::settings::Settings) -> Result<Self, String> {
        let secret = settings.get("STRIPE_SECRET_KEY");
        if let Some(secret) = &secret
            && !(secret.starts_with("sk_test_")
                || secret.starts_with("sk_live_")
                || secret.starts_with("rk_"))
        {
            return Err("money_stripe_key_invalid".into());
        }
        if settings.get("NODE_ENV").as_deref() == Some("production")
            && secret
                .as_deref()
                .is_some_and(|secret| secret.starts_with("sk_test_"))
        {
            return Err("money_stripe_test_key_in_production".into());
        }
        Ok(Self {
            secret,
            webhook: settings.get("STRIPE_WEBHOOK_SECRET"),
            origin: settings
                .get("ATOME_SITE_ORIGIN")
                .unwrap_or_else(|| "https://atome.one".into()),
        })
    }

    fn secret(&self) -> Result<&str, String> {
        self.secret
            .as_deref()
            .ok_or_else(|| "money_stripe_unconfigured".into())
    }

    /// Whether the key moves real money (`sk_live_`), else Stripe's free test mode.
    pub fn live(&self) -> bool {
        self.secret
            .as_deref()
            .is_some_and(|secret| secret.starts_with("sk_live_"))
    }

    async fn call(&self, path: &str, form: &[(String, String)]) -> Result<JsonValue, String> {
        let response = crate::providers::http::client()
            .post(format!("{API}{path}"))
            .bearer_auth(self.secret()?)
            .header(
                "Idempotency-Key",
                form.iter()
                    .find(|(key, _)| key == "metadata[payment_ref]")
                    .map_or("", |(_, value)| value),
            )
            .form(form)
            .send()
            .await
            .map_err(|_| "money_stripe_unavailable".to_string())?;
        let status = response.status();
        let body: JsonValue = response
            .json()
            .await
            .map_err(|_| "money_stripe_unavailable".to_string())?;
        if !status.is_success() {
            // Stripe's code only: its message may quote what was sent.
            let code = body
                .pointer("/error/code")
                .and_then(JsonValue::as_str)
                .unwrap_or("request_failed");
            return Err(format!("money_stripe_refused:{code}"));
        }
        Ok(body)
    }

    /// A Checkout page for one payment (an activation or a top-up): its URL, opened by the client.
    pub async fn checkout(&self, checkout: &Checkout) -> Result<JsonValue, String> {
        let pair = |key: &str, value: String| (key.to_string(), value);
        let back = format!("{}/#money={}", self.origin, checkout.payment_ref);
        let session = self
            .call(
                "/checkout/sessions",
                &[
                    pair("mode", "payment".into()),
                    pair("line_items[0][quantity]", "1".into()),
                    pair("line_items[0][price_data][currency]", "eur".into()),
                    pair(
                        "line_items[0][price_data][unit_amount]",
                        checkout.amount_cents.to_string(),
                    ),
                    pair(
                        "line_items[0][price_data][product_data][name]",
                        checkout.name.clone(),
                    ),
                    pair(
                        "payment_intent_data[setup_future_usage]",
                        "off_session".into(),
                    ),
                    pair(
                        "payment_intent_data[metadata][payment_ref]",
                        checkout.payment_ref.clone(),
                    ),
                    pair("metadata[payment_ref]", checkout.payment_ref.clone()),
                    pair("success_url", back.clone()),
                    pair("cancel_url", back),
                ],
            )
            .await?;
        Ok(json!({ "id": session["id"], "url": session["url"] }))
    }

    /// Gives `cents` back on the card of one payment.
    pub async fn refund(
        &self,
        payment_intent: &str,
        cents: i64,
        reference: &str,
    ) -> Result<JsonValue, String> {
        self.call(
            "/refunds",
            &[
                ("payment_intent".into(), payment_intent.into()),
                ("amount".into(), cents.to_string()),
                ("metadata[payment_ref]".into(), reference.into()),
            ],
        )
        .await
    }

    /// Verifies a webhook (`Stripe-Signature: t=…,v1=…`, HMAC-SHA256 of `t.payload`) and returns
    /// its event. Anything unsigned, altered or too old is refused.
    pub fn event(&self, signature: &str, payload: &[u8], now_s: i64) -> Result<JsonValue, String> {
        let secret = self.webhook.as_deref().ok_or("money_stripe_unconfigured")?;
        verify(secret, signature, payload, now_s)?;
        serde_json::from_slice(payload).map_err(|_| "money_stripe_event_invalid".into())
    }
}

/// Stripe's webhook signature check, apart so a probe can test it without a key.
pub fn verify(secret: &str, signature: &str, payload: &[u8], now_s: i64) -> Result<(), String> {
    let mut timestamp = None;
    let mut candidates = Vec::new();
    for part in signature.split(',') {
        match part.split_once('=') {
            Some(("t", value)) => timestamp = value.parse::<i64>().ok(),
            Some(("v1", value)) => candidates.push(value),
            _ => {}
        }
    }
    let timestamp = timestamp.ok_or("money_stripe_signature_invalid")?;
    if (now_s - timestamp).abs() > TOLERANCE_S {
        return Err("money_stripe_signature_invalid".into());
    }
    let key = hmac::Key::new(hmac::HMAC_SHA256, secret.as_bytes());
    let mut signed = timestamp.to_string().into_bytes();
    signed.push(b'.');
    signed.extend_from_slice(payload);
    let ok = candidates.iter().any(|candidate| {
        hex::decode(candidate).is_ok_and(|tag| hmac::verify(&key, &signed, &tag).is_ok())
    });
    if ok {
        Ok(())
    } else {
        Err("money_stripe_signature_invalid".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(secret: &str, t: i64, payload: &[u8]) -> String {
        let key = hmac::Key::new(hmac::HMAC_SHA256, secret.as_bytes());
        let mut signed = t.to_string().into_bytes();
        signed.push(b'.');
        signed.extend_from_slice(payload);
        format!(
            "t={t},v1={}",
            hex::encode(hmac::sign(&key, &signed).as_ref())
        )
    }

    #[test]
    fn webhook_signature_is_checked() {
        let body = br#"{"type":"checkout.session.completed"}"#;
        let header = sign("whsec_x", 1000, body);
        assert!(verify("whsec_x", &header, body, 1000).is_ok());
        assert!(verify("whsec_y", &header, body, 1000).is_err());
        assert!(verify("whsec_x", &header, b"{}", 1000).is_err());
        assert!(verify("whsec_x", &header, body, 2000).is_err());
        assert!(verify("whsec_x", "t=1000", body, 1000).is_err());
    }
}
