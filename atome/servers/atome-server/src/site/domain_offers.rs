// A domain's search and quote (R-193): each name's offer from the real registrar, OVHcloud
// (ovh_registrar.rs), when its order keys are set, else from the simulated registry of
// domains.rs; a quote held a quarter of an hour for the account that asked it, never another.
use super::domain_orders::provider_failed;
use super::domains::{
    QUOTE_HOLD_MS, TLDS, domain_price, domain_shaped, label_shaped, normalized, provider_cents,
    renew_cents, shown, shown_into, taken_in_simulation, tld_of,
};
use super::{Site, fail, now_ms};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

/// The account's quote of a domain, while it is held.
pub(super) fn held_quote(
    quotes: &std::collections::HashMap<(String, String), JsonValue>,
    key: &(String, String),
    now: i64,
) -> Option<JsonValue> {
    quotes
        .get(key)
        .filter(|held| js::date(held.get("held_until")).is_some_and(|until| until >= now))
        .cloned()
}

impl Site {
    // Each name: free or not, its first year and its renewal before tax, from the registrar,
    // else from the simulated registry; `Err` holds the answer of a registrar that failed.
    async fn offers(
        &self,
        domains: &[String],
    ) -> Result<Result<Vec<(bool, i64, i64)>, JsonValue>, String> {
        let registrar = match self.registrar() {
            Ok(registrar) => registrar,
            Err(failure) => return Ok(Err(failure)),
        };
        let offers: Vec<(bool, i64, i64)> = match registrar {
            Some(registrar) => match registrar.offers(domains).await {
                Ok(offers) => offers
                    .into_iter()
                    .map(|offer| (offer.free, offer.price_cents, offer.renew_cents))
                    .collect(),
                Err(error) => return Ok(Err(provider_failed("DOMAIN_PROVIDER_FAILED", &error))),
            },
            None => domains
                .iter()
                .map(|domain| {
                    let provider = provider_cents(tld_of(domain)).unwrap_or_default();
                    (
                        !taken_in_simulation(domain),
                        provider,
                        renew_cents(tld_of(domain)).unwrap_or(provider),
                    )
                })
                .collect(),
        };
        let mut known = Vec::new();
        for (domain, (free, provider, renew)) in domains.iter().zip(offers) {
            known.push((free && self.known(domain).await?.is_none(), provider, renew));
        }
        Ok(Ok(known))
    }

    pub(super) fn simulated(&self) -> bool {
        matches!(self.registrar(), Ok(None))
    }

    pub(super) async fn search(&self, data: &JsonValue) -> Result<JsonValue, String> {
        let name = normalized(data.get("name"));
        let label = name.split('.').next().unwrap_or("");
        if !label_shaped(label) {
            return Ok(fail("DOMAIN_INVALID"));
        }
        let domains: Vec<String> = TLDS.iter().map(|tld| format!("{label}.{tld}")).collect();
        let offers = match self.offers(&domains).await? {
            Ok(offers) => offers,
            Err(failure) => return Ok(failure),
        };
        let mut results = Vec::new();
        for (domain, (free, provider, renew)) in domains.into_iter().zip(offers) {
            let mut result = serde_json::Map::new();
            result.insert("domain".into(), json!(domain));
            result.insert("free".into(), json!(free));
            shown_into(&mut result, &domain_price(provider));
            result.insert("first_year".into(), json!(renew != provider));
            results.push(JsonValue::Object(result));
        }
        Ok(json!({ "ok": true, "simulated": self.simulated(), "results": results }))
    }

    pub(super) async fn quote(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let domain = normalized(data.get("domain"));
        let priced = self.simulated() && provider_cents(tld_of(&domain)).is_none();
        if !domain_shaped(&domain) || priced {
            return Ok(fail("DOMAIN_INVALID"));
        }
        let (free, provider, renew) = match self.offers(std::slice::from_ref(&domain)).await? {
            Ok(offers) => offers[0],
            Err(failure) => return Ok(failure),
        };
        if !free {
            return Ok(fail("DOMAIN_TAKEN"));
        }
        let renew = domain_price(renew);
        let held_until = js::iso(now_ms() + QUOTE_HOLD_MS);
        let entry = js::with(
            &domain_price(provider),
            [
                ("renew", renew.clone()),
                ("held_until", json!(held_until)),
                ("quote_id", json!(super::random_token(9))),
            ],
        );
        self.quotes
            .lock()
            .expect("quotes")
            .insert((owner.to_string(), domain.clone()), entry.clone());
        let mut quote = serde_json::Map::new();
        quote.insert("domain".into(), json!(domain));
        quote.insert("years".into(), json!(1));
        shown_into(&mut quote, &entry);
        quote.insert("renew".into(), shown(&renew));
        quote.insert("held_until".into(), json!(held_until));
        quote.insert("simulated".into(), json!(self.simulated()));
        Ok(json!({ "ok": true, "quote": quote }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_quote_is_held_for_its_own_account_only() {
        let mut quotes = std::collections::HashMap::new();
        let entry = json!({ "total_cents": 900, "held_until": js::iso(10_000) });
        quotes.insert(("alice".to_string(), "atome.fr".to_string()), entry.clone());
        let key = |owner: &str| (owner.to_string(), "atome.fr".to_string());
        assert_eq!(held_quote(&quotes, &key("alice"), 9_000), Some(entry));
        assert_eq!(held_quote(&quotes, &key("bob"), 9_000), None);
        assert_eq!(held_quote(&quotes, &key("alice"), 10_001), None);
    }
}
