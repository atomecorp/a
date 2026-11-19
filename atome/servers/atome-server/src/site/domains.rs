// Domains & mail of the websites (server/site_domains.js, ported; decisions Q13–Q16 of
// todo/publication_web_2026-10-28.md).
// - A domain the user already has is connected by proof (a TXT record) and a CNAME to atome;
//   once its DNS answers and its certificate is issued (ATOME_SITE_CERT_COMMAND, the
//   production's certbot step), its host serves the site.
// - Searching, quoting and buying go to the real registrar, OVHcloud (ovh_registrar.rs,
//   domain_orders.rs; R-193), when its order keys are set: the money is reserved, the name
//   ordered, and bought only once OVH has delivered it; answers say `simulated: false`.
// - Without those keys (none of them set), the registry is SIMULATED, as it always was: nothing
//   is bought, nothing is charged, and every answer says `simulated: true`; each charge is still
//   written to a ledger keeping the provider's cost, the price all taxes included, atome's 3 %
//   added on top for the buyer and the VAT the total holds. Transfers, DNS records, renewals and
//   mail boxes stay simulated in both cases.
// The hosting summary (Q15) is included in the subscription.
use super::domain_offers::held_quote;
use super::domain_orders::Order;
use super::{Site, fail, now_ms};
use crate::vault_router::js;
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};

pub(super) const TLDS: [&str; 6] = ["fr", "com", "shop", "net", "eu", "org"];
const HOUR: i64 = 3_600_000;
pub(super) const QUOTE_HOLD_MS: i64 = 15 * 60_000;
pub const SITE_CNAME_TARGET: &str = "sites.atome.one";

pub(super) fn provider_cents(tld: &str) -> Option<i64> {
    match tld {
        "fr" => Some(699),
        "com" | "org" => Some(1099),
        "net" => Some(1199),
        "eu" => Some(599),
        "shop" => Some(199),
        "site" => Some(299),
        _ => None,
    }
}

pub(super) fn renew_cents(tld: &str) -> Option<i64> {
    matches!(tld, "shop" | "site").then_some(2499)
}

pub(super) fn tld_of(domain: &str) -> &str {
    domain.rsplit('.').next().unwrap_or("")
}

// `/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/`.
pub(super) fn label_shaped(label: &str) -> bool {
    let bytes = label.as_bytes();
    let edge = |c: &u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    (1..=63).contains(&bytes.len())
        && bytes.iter().all(|c| edge(c) || *c == b'-')
        && edge(&bytes[0])
        && edge(&bytes[bytes.len() - 1])
}

// `/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/`.
pub(super) fn domain_shaped(domain: &str) -> bool {
    let labels: Vec<&str> = domain.split('.').collect();
    let Some((tld, names)) = labels.split_last() else {
        return false;
    };
    (3..=253).contains(&domain.len())
        && !names.is_empty()
        && names.iter().all(|label| label_shaped(label))
        && (2..=24).contains(&tld.len())
        && tld.bytes().all(|c| c.is_ascii_lowercase())
}

/// `normalized(value)`: trimmed, lower case, one final dot dropped.
pub(super) fn normalized(value: Option<&JsonValue>) -> String {
    let text = value
        .filter(|value| js::truthy(Some(value)))
        .map(|value| js::text(Some(value)))
        .unwrap_or_default();
    let lowered = js::trim(&text).to_lowercase();
    lowered.strip_suffix('.').unwrap_or(&lowered).to_string()
}

/// `domainPrice`: the price the user sees, the provider's cost with atome's share included,
/// then the tax.
pub(super) fn domain_price(provider: i64) -> JsonValue {
    // R-193: the registrar's price all taxes included, atome's 3 % added on top for the buyer
    // (half rounded up), its VAT within; the VAT the total holds is shown, never added again.
    let supplier = provider + (provider as f64 * 0.2 + 0.5).floor() as i64;
    let commission = crate::billing::pricing::commission(supplier);
    let total = supplier + commission;
    let tax = total - (total as f64 / 1.2 + 0.5).floor() as i64;
    json!({ "provider_cents": provider, "price_cents": supplier, "commission_cents": commission,
        "tax_cents": tax, "total_cents": total })
}

// What the user is shown of a price: the registrar's price (taxes included), atome's 3 %, the total.
pub(super) fn shown(price: &JsonValue) -> JsonValue {
    json!({ "price_cents": price["price_cents"], "commission_cents": price["commission_cents"],
        "tax_cents": price["tax_cents"], "total_cents": price["total_cents"] })
}

pub(super) fn shown_into(target: &mut serde_json::Map<String, JsonValue>, price: &JsonValue) {
    if let JsonValue::Object(fields) = shown(price) {
        target.extend(fields);
    }
}

// The simulated registry: a name is taken when its hash says so (stable, so a search answers
// the same twice).
pub(super) fn taken_in_simulation(domain: &str) -> bool {
    Sha256::digest(domain.as_bytes())[0] % 4 == 0
}

pub(super) fn records_of(row: &JsonValue, key: &str) -> Vec<JsonValue> {
    row[key]
        .as_str()
        .and_then(|raw| serde_json::from_str::<JsonValue>(raw).ok())
        .and_then(|list| list.as_array().cloned())
        .unwrap_or_default()
}

pub(super) fn managed_records() -> JsonValue {
    json!([{ "type": "A", "name": "@", "value": "atome", "managed": true },
        { "type": "CNAME", "name": "www", "value": SITE_CNAME_TARGET, "managed": true },
        { "type": "MX", "name": "@", "value": "mail.atome.one", "priority": 10, "managed": true },
        { "type": "TXT", "name": "@", "value": "v=spf1 include:atome.one ~all", "managed": false }])
}

// `String(value ?? '')` of a raw field (`site_id` reaches these actions as it came).
pub(super) fn raw(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        value => js::text(value),
    }
}

impl Site {
    pub(super) async fn known(&self, domain: &str) -> Result<Option<JsonValue>, String> {
        self.store
            .central
            .get(
                "SELECT * FROM site_domains WHERE domain = ?",
                vec![json!(domain)],
            )
            .await
    }

    pub(super) async fn owned_domain(
        &self,
        owner: &str,
        data: &JsonValue,
    ) -> Result<Option<JsonValue>, String> {
        Ok(self
            .known(&normalized(data.get("domain")))
            .await?
            .filter(|row| row["owner_id"] == json!(owner)))
    }

    async fn ledger_entry(
        &self,
        owner: &str,
        domain: &str,
        kind: &str,
        price: &JsonValue,
    ) -> Result<(), String> {
        self.store
            .central
            .run(
                "INSERT INTO site_domain_ledger (entry_ref, owner_id, domain, kind, provider_cents, commission_cents, tax_cents, total_cents)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entry_ref) DO NOTHING",
                vec![json!(format!("{kind}:{domain}")), json!(owner), json!(domain), json!(kind), price["provider_cents"].clone(),
                    price["commission_cents"].clone(), price["tax_cents"].clone(), price["total_cents"].clone()],
            )
            .await
    }

    pub(super) async fn set_domain_column(
        &self,
        column: &'static str,
        value: JsonValue,
        domain: &str,
    ) -> Result<(), String> {
        let sql: &'static str = match column {
            "records_json" => "UPDATE site_domains SET records_json = ? WHERE domain = ?",
            "mail_json" => "UPDATE site_domains SET mail_json = ? WHERE domain = ?",
            "auto_renew" => "UPDATE site_domains SET auto_renew = ? WHERE domain = ?",
            _ => "UPDATE site_domains SET state = ? WHERE domain = ?",
        };
        self.store
            .central
            .run(sql, vec![value, json!(domain)])
            .await
    }

    pub(super) fn year_later() -> String {
        js::iso(now_ms() + 365 * 24 * HOUR)
    }

    async fn buy(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let domain = normalized(data.get("domain"));
        // A quote is the account's own: another account's quote of the same name is not held.
        let key = (owner.to_string(), domain.clone());
        let held = held_quote(&self.quotes.lock().expect("quotes"), &key, now_ms());
        let Some(held) = held else {
            return Ok(fail("QUOTE_EXPIRED"));
        };
        let registrar = match self.registrar() {
            Ok(registrar) => registrar,
            Err(failure) => return Ok(failure),
        };
        if let Some(registrar) = registrar {
            self.quotes.lock().expect("quotes").remove(&key);
            let order = Order {
                owner: owner.to_string(),
                hold: format!("domain:{owner}:{domain}:{}", js::text(held.get("quote_id"))),
                domain,
                site_id: raw(data.get("site_id")),
                auto_renew: data.get("renew") != Some(&JsonValue::Bool(false)),
                quote: held,
                expires_at: Self::year_later(),
                records: managed_records().to_string(),
            };
            return self.order_at(registrar, order).await;
        }
        if self.known(&domain).await?.is_some() {
            return Ok(fail("DOMAIN_TAKEN"));
        }
        self.ledger_entry(owner, &domain, "buy", &held).await?;
        let renew = data.get("renew") != Some(&JsonValue::Bool(false));
        self.store
            .central
            .run(
                "INSERT INTO site_domains (domain, owner_id, state, expires_at, auto_renew, records_json) VALUES (?, ?, 'active', ?, ?, ?)",
                vec![json!(domain), json!(owner), json!(Self::year_later()), json!(i64::from(renew)), json!(managed_records().to_string())],
            )
            .await?;
        self.quotes.lock().expect("quotes").remove(&key);
        let site_id = raw(data.get("site_id"));
        let attached = if site_id.is_empty() {
            None
        } else {
            Some(self.attach(owner, &site_id, &domain, "active").await?)
        };
        let mut out = json!({ "ok": true, "simulated": true, "domain": domain, "total_cents": held["total_cents"] });
        if let Some(attached) = attached.filter(|attached| attached["ok"] == json!(true)) {
            out["site"] = attached["site"].clone();
        }
        Ok(out)
    }

    async fn transfer(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let domain = normalized(data.get("domain"));
        let code = data
            .get("code")
            .filter(|code| js::truthy(Some(code)))
            .map(|code| js::text(Some(code)).encode_utf16().count())
            .unwrap_or(0);
        let Some(provider) =
            provider_cents(tld_of(&domain)).filter(|_| domain_shaped(&domain) && code >= 4)
        else {
            return Ok(fail("DOMAIN_INVALID"));
        };
        if self.known(&domain).await?.is_some() {
            return Ok(fail("DOMAIN_TAKEN"));
        }
        let price = domain_price(renew_cents(tld_of(&domain)).unwrap_or(provider));
        self.ledger_entry(owner, &domain, "transfer", &price)
            .await?;
        self.store
            .central
            .run(
                "INSERT INTO site_domains (domain, owner_id, state, expires_at, records_json) VALUES (?, ?, 'transferring', ?, ?)",
                vec![json!(domain), json!(owner), json!(Self::year_later()), json!(managed_records().to_string())],
            )
            .await?;
        Ok(
            json!({ "ok": true, "simulated": true, "domain": domain, "state": "transferring", "total_cents": price["total_cents"] }),
        )
    }

    pub(super) fn renewal_price(domain: &str) -> JsonValue {
        let tld = tld_of(domain);
        shown(&domain_price(
            renew_cents(tld).or(provider_cents(tld)).unwrap_or(0),
        ))
    }

    async fn domain_records(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let Some(mut row) = self.owned_domain(owner, data).await? else {
            return Ok(fail("NOT_FOUND"));
        };
        let domain = js::text(row.get("domain"));
        // A name ordered at the registrar and not yet delivered: OVH is asked again.
        if let (Ok(Some(registrar)), true) = (self.registrar(), row["state"] == json!("pending")) {
            self.confirm(registrar, owner, &domain).await?;
            let Some(again) = self.owned_domain(owner, data).await? else {
                return Ok(fail("NOT_FOUND"));
            };
            row = again;
        }
        let renew = match self.ordered_renewal(&domain).await? {
            Some(provider) => shown(&domain_price(provider)),
            None => Self::renewal_price(&domain),
        };
        Ok(
            json!({ "ok": true, "simulated": self.simulated(), "domain": domain, "state": row["state"], "expires_at": row["expires_at"],
            "auto_renew": row["auto_renew"] == json!(1), "renew": renew, "records": records_of(&row, "records_json") }),
        )
    }

    async fn record_set(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let Some(row) = self.owned_domain(owner, data).await? else {
            return Ok(fail("NOT_FOUND"));
        };
        let list = records_of(&row, "records_json");
        // `record_type`: a frame's own `type` is its family (`site`).
        let kind = data.get("record_type");
        let name = match data.get("name") {
            None => json!("@"),
            Some(name) if js::truthy(Some(name)) => name.clone(),
            Some(_) => json!("@"),
        };
        let same =
            |entry: &JsonValue| entry.get("type") == kind && entry.get("name") == Some(&name);
        if list
            .iter()
            .any(|entry| same(entry) && js::truthy(entry.get("managed")))
        {
            return Ok(fail("NOT_ALLOWED"));
        }
        let mut next: Vec<JsonValue> = list.iter().filter(|entry| !same(entry)).cloned().collect();
        if !js::truthy(data.get("remove")) {
            let mut entry = serde_json::Map::new();
            if let Some(kind) = kind {
                entry.insert("type".into(), kind.clone());
            }
            entry.insert("name".into(), name);
            entry.insert("value".into(), json!(js::text(data.get("value"))));
            entry.insert("managed".into(), json!(false));
            next.push(JsonValue::Object(entry));
        }
        let domain = js::text(row.get("domain"));
        self.set_domain_column(
            "records_json",
            json!(JsonValue::Array(next.clone()).to_string()),
            &domain,
        )
        .await?;
        Ok(json!({ "ok": true, "records": next }))
    }

    async fn renewal(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let Some(row) = self.owned_domain(owner, data).await? else {
            return Ok(fail("NOT_FOUND"));
        };
        let auto = js::truthy(data.get("auto"));
        self.set_domain_column(
            "auto_renew",
            json!(i64::from(auto)),
            &js::text(row.get("domain")),
        )
        .await?;
        Ok(json!({ "ok": true, "auto_renew": auto }))
    }

    async fn leave(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let Some(row) = self.owned_domain(owner, data).await? else {
            return Ok(fail("NOT_FOUND"));
        };
        let domain = js::text(row.get("domain"));
        self.set_domain_column("state", json!("leaving"), &domain)
            .await?;
        let digest =
            Sha256::digest(format!("{domain}|{}", js::text(row.get("created_at"))).as_bytes());
        let code: String = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(digest)
            .chars()
            .take(12)
            .collect();
        Ok(json!({ "ok": true, "simulated": true, "code": code }))
    }

    /// The domain, mail and hosting actions of a `site` frame; none for another action.
    pub(super) async fn domains(
        &self,
        data: &JsonValue,
        user: &str,
        action: &str,
    ) -> Result<Option<JsonValue>, String> {
        Ok(Some(match action {
            "domain_search" => self.search(data).await?,
            "domain_quote" => self.quote(user, data).await?,
            "hosting" => self.hosting(user).await?,
            "domain_buy" => self.buy(user, data).await?,
            "domain_confirm" => match self.registrar() {
                Ok(Some(registrar)) => {
                    self.confirm(registrar, user, &normalized(data.get("domain")))
                        .await?
                }
                Ok(None) => fail("NOT_FOUND"),
                Err(failure) => failure,
            },
            "domain_connect" => {
                let domain = normalized(data.get("domain"));
                if !domain_shaped(&domain) {
                    return Ok(Some(fail("DOMAIN_INVALID")));
                }
                // A domain of « Mes domaines » (bought here, R-157) is active at once: atome holds its DNS.
                let owned = self.owned_domain(user, data).await?;
                let state = if owned.is_some_and(|row| row["state"] == json!("active")) {
                    "active"
                } else {
                    "pending"
                };
                self.attach(user, &raw(data.get("site_id")), &domain, state)
                    .await?
            }
            "domain_verify" => self.verify(user, data).await?,
            "domain_primary" => self.primary(user, data).await?,
            "domain_unlink" => self.unlink(user, data).await?,
            "domain_transfer" => self.transfer(user, data).await?,
            "domain_records" => self.domain_records(user, data).await?,
            "domain_record_set" => self.record_set(user, data).await?,
            "domain_renewal" => self.renewal(user, data).await?,
            "domain_leave" => self.leave(user, data).await?,
            "mail_list" => match self.owned_domain(user, data).await? {
                Some(row) => {
                    json!({ "ok": true, "simulated": true, "boxes": records_of(&row, "mail_json") })
                }
                None => fail("NOT_FOUND"),
            },
            "mail_add" => self.mail_add(user, data).await?,
            "mail_remove" => self.mail_remove(user, data).await?,
            _ => return Ok(None),
        }))
    }
}
