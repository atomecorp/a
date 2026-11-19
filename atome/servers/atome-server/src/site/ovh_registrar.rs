// The real domain registrar (R-193 lot E2): OVHcloud's order API, called through the one signed
// OVH client (ovh.rs) with keys of its own, allowed to order — never the SMS keys.
// Settings: OVH_ORDER_APPLICATION_KEY, OVH_ORDER_APPLICATION_SECRET, OVH_ORDER_CONSUMER_KEY and
// OVH_ORDER_ENDPOINT (OVHcloud Europe by default). None of the three keys set: there is no
// registrar and the domains run on the simulated registry (domains.rs, every answer saying
// `simulated: true`); some set but not all: every domain action fails with
// `ovh_order_configuration_incomplete`.
//
// Shapes verified on 2026-11-16 against OVH's published API schemas
// https://eu.api.ovh.com/1.0/order.json and https://eu.api.ovh.com/1.0/me.json (the source the
// console https://eu.api.ovh.com/console/ reads), all `PRODUCTION`:
//   POST /order/cart            body order.cart.Creation {ovhSubsidiary, description?, expire?} → order.cart.Cart {cartId, …}
//   POST /order/cart/{id}/assign                                                              → void
//   GET  /order/cart/{id}/domain?domain=                                                      → order.cart.ProductInformation[]
//        {action: create|trade|transfer|update, orderable, prices: order.cart.Price[] {label: PRICE|DISCOUNT|FEE|RENEW|TOTAL,
//         price: order.Price {currencyCode, value (double, never null), priceInUcents (may be null), text}}, …}
//   POST /order/cart/{id}/domain body order.cart.GenericDomainCreation {domain, duration?, offerId?, …} → order.cart.Item
//   GET  /order/cart/{id}/checkout                                    → order.Order {prices: order.OrderPrices {withoutTax, withTax, tax}, …}
//   POST /order/cart/{id}/checkout body order.cart.Checkout {autoPayWithPreferredPaymentMethod, waiveRetractationPeriod}
//                                                                     → order.Order {orderId (long, may be null), …}
//   GET  /me/order/{orderId}/status → billing.order.OrderStatusEnum
//        cancelled | cancelling | checking | delivered | delivering | documentsRequested | notPaid | unknown
// Cart prices are without tax (HT, the FR subsidiary's offer): confirmed with the real key on 2026-11-18,
// a .fr's TOTAL 4.99 € against the checkout preview's withoutTax 4.99 €, tax 1.00 €, withTax 5.99 €.
use crate::ovh::{self, Credentials, Failure};
use crate::settings::Settings;
use serde_json::{Value as JsonValue, json};

const KEYS: [&str; 3] = [
    "OVH_ORDER_APPLICATION_KEY",
    "OVH_ORDER_APPLICATION_SECRET",
    "OVH_ORDER_CONSUMER_KEY",
];

#[derive(Clone)]
pub struct Registrar {
    endpoint: String,
    credentials: Credentials,
}

/// What OVH says of a name to create: free or not, its first year and its renewal, in cents
/// without tax.
#[derive(Debug, PartialEq, Eq)]
pub struct Offer {
    pub free: bool,
    pub price_cents: i64,
    pub renew_cents: i64,
}

/// Where an order stands (`/me/order/{id}/status`).
#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Delivered,
    Cancelled,
    Waiting,
}

pub fn step(status: &str) -> Step {
    match status {
        "delivered" => Step::Delivered,
        "cancelled" | "cancelling" => Step::Cancelled,
        _ => Step::Waiting,
    }
}

// An `order.Price` in euro cents (its `value`, half rounded up); another currency is refused.
fn cents(price: &JsonValue) -> Result<i64, String> {
    if price["currencyCode"] != json!("EUR") {
        return Err("ovh_price_currency".into());
    }
    let value = price["value"].as_f64().ok_or("ovh_price_missing")?;
    Ok((value * 100.0).round() as i64)
}

fn labelled(prices: &JsonValue, label: &str) -> Result<i64, String> {
    let found = prices
        .as_array()
        .and_then(|list| list.iter().find(|entry| entry["label"] == json!(label)))
        .ok_or_else(|| format!("ovh_price_missing:{label}"))?;
    cents(&found["price"])
}

/// The creation offer of `GET /order/cart/{id}/domain`: its `TOTAL` (the first year, discounts
/// taken) and its `RENEW`. A name with no orderable creation offer is taken.
pub fn offer_of(infos: &JsonValue) -> Result<Offer, String> {
    let create = infos
        .as_array()
        .ok_or("ovh_offer_invalid")?
        .iter()
        .find(|info| info["action"] == json!("create"));
    let Some(create) = create.filter(|info| info["orderable"] == json!(true)) else {
        return Ok(Offer {
            free: false,
            price_cents: 0,
            renew_cents: 0,
        });
    };
    Ok(Offer {
        free: true,
        price_cents: labelled(&create["prices"], "TOTAL")?,
        renew_cents: labelled(&create["prices"], "RENEW")?,
    })
}

/// The order's id from `POST /order/cart/{id}/checkout`.
pub fn order_id_of(order: &JsonValue) -> Result<i64, String> {
    order["orderId"]
        .as_i64()
        .filter(|id| *id > 0)
        .ok_or_else(|| "ovh_order_uncertain".into())
}

fn failure(failure: Failure) -> String {
    match failure {
        Failure::Uncertain => "ovh_order_uncertain".into(),
        Failure::Unavailable => "ovh_order_unavailable".into(),
        Failure::Rejected(code) => format!("ovh_order_rejected:{code}"),
        Failure::CredentialsRejected => "ovh_order_credentials_rejected".into(),
    }
}

impl Registrar {
    pub fn load(settings: &Settings) -> Result<Option<Self>, String> {
        let values: Vec<Option<String>> = KEYS.iter().map(|key| settings.get(key)).collect();
        if values.iter().all(Option::is_none) {
            return Ok(None);
        }
        let [Some(key), Some(secret), Some(consumer)] = [&values[0], &values[1], &values[2]] else {
            return Err("ovh_order_configuration_incomplete".into());
        };
        let endpoint = settings
            .get("OVH_ORDER_ENDPOINT")
            .unwrap_or_else(|| ovh::EU_ENDPOINT.into());
        if !endpoint.starts_with("https://") {
            return Err("ovh_order_endpoint_invalid".into());
        }
        Ok(Some(Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
            credentials: Credentials {
                application_key: key.trim().into(),
                application_secret: secret.trim().into(),
                consumer_key: consumer.trim().into(),
            },
        }))
    }

    async fn call(
        &self,
        method: &str,
        resource: &str,
        payload: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        ovh::request(&self.endpoint, &self.credentials, method, resource, payload)
            .await
            .map_err(failure)
    }

    // A new cart of OVH's French subsidiary, given to atome's account.
    async fn cart(&self) -> Result<String, String> {
        let cart = self
            .call(
                "POST",
                "/order/cart",
                Some(&json!({ "ovhSubsidiary": "FR", "description": "atome domains" })),
            )
            .await?;
        let id = cart["cartId"]
            .as_str()
            .ok_or("ovh_cart_invalid")?
            .to_string();
        self.call("POST", &format!("/order/cart/{id}/assign"), None)
            .await?;
        Ok(id)
    }

    /// The offers of `domains` (each already shaped by domains.rs), in one cart, asked together.
    pub async fn offers(&self, domains: &[String]) -> Result<Vec<Offer>, String> {
        let cart = self.cart().await?;
        let asked = domains.iter().map(|domain| {
            let resource = format!("/order/cart/{cart}/domain?domain={domain}");
            async move { offer_of(&self.call("GET", &resource, None).await?) }
        });
        futures_util::future::try_join_all(asked).await
    }

    /// Orders `domain` for a year, paid by atome's preferred OVH payment method, when the cart's
    /// whole price without tax is at most `quoted_cents`; its order id.
    pub async fn order(&self, domain: &str, quoted_cents: i64) -> Result<i64, String> {
        let cart = self.cart().await?;
        self.call(
            "POST",
            &format!("/order/cart/{cart}/domain"),
            Some(&json!({ "domain": domain, "duration": "P1Y" })),
        )
        .await?;
        let summary = self
            .call("GET", &format!("/order/cart/{cart}/checkout"), None)
            .await?;
        if cents(&summary["prices"]["withoutTax"])? > quoted_cents {
            return Err("DOMAIN_PRICE_CHANGED".into());
        }
        let order = self
            .call(
                "POST",
                &format!("/order/cart/{cart}/checkout"),
                Some(&json!({ "autoPayWithPreferredPaymentMethod": true, "waiveRetractationPeriod": true })),
            )
            .await?;
        order_id_of(&order)
    }

    /// The order's status word.
    pub async fn status(&self, order_id: i64) -> Result<String, String> {
        self.call("GET", &format!("/me/order/{order_id}/status"), None)
            .await?
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| "ovh_order_status_invalid".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A `GET /order/cart/{id}/domain` answer written from the order.cart.ProductInformation schema.
    fn sample(orderable: bool) -> JsonValue {
        let price = |value: f64, text: &str| json!({ "currencyCode": "EUR", "value": value, "text": text, "priceInUcents": null });
        json!([
            { "action": "transfer", "orderable": true, "offerId": "t", "prices": [] },
            { "action": "create", "orderable": orderable, "offer": "gold", "offerId": "c", "productId": "domain",
              "duration": ["P1Y"], "phase": "ga", "pricingMode": "create-default", "quantityMax": 1, "deliveryTime": "",
              "configurations": [],
              "prices": [{ "label": "PRICE", "price": price(8.99, "8.99 €") },
                         { "label": "DISCOUNT", "price": price(-2.0, "-2.00 €") },
                         { "label": "TOTAL", "price": price(6.99, "6.99 €") },
                         { "label": "RENEW", "price": price(8.99, "8.99 €") }] }
        ])
    }

    #[test]
    fn ovh_offer_reads_the_creation_total_and_renewal() {
        assert_eq!(
            offer_of(&sample(true)),
            Ok(Offer {
                free: true,
                price_cents: 699,
                renew_cents: 899
            })
        );
        assert!(!offer_of(&sample(false)).expect("taken").free);
        assert!(!offer_of(&json!([])).expect("no offer").free);
    }

    #[test]
    fn ovh_offer_refuses_a_missing_price_or_another_currency() {
        let mut infos = sample(true);
        infos[1]["prices"]
            .as_array_mut()
            .expect("prices")
            .retain(|p| p["label"] != "RENEW");
        assert_eq!(offer_of(&infos), Err("ovh_price_missing:RENEW".into()));
        let mut usd = sample(true);
        usd[1]["prices"][2]["price"]["currencyCode"] = json!("USD");
        assert_eq!(offer_of(&usd), Err("ovh_price_currency".into()));
        assert_eq!(offer_of(&json!({})), Err("ovh_offer_invalid".into()));
    }

    #[test]
    fn ovh_order_id_and_status_steps() {
        assert_eq!(
            order_id_of(&json!({ "orderId": 123_456, "url": "u" })),
            Ok(123_456)
        );
        assert_eq!(
            order_id_of(&json!({ "orderId": null })),
            Err("ovh_order_uncertain".into())
        );
        assert_eq!(step("delivered"), Step::Delivered);
        assert_eq!(step("cancelling"), Step::Cancelled);
        assert_eq!(step("checking"), Step::Waiting);
        assert_eq!(step("notPaid"), Step::Waiting);
    }
}
