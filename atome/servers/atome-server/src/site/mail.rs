// The mail boxes of a domain and the hosting summary (server/site_domains.js and
// site_services.js, ported; Q15, Q16): boxes, forwards and aliases of the simulated provider, and
// what a subscription includes (traffic, storage) against what the account uses.
use super::contract::traffic_gb;
use super::domains::{normalized, records_of};
use super::{Site, fail, now_ms};
use crate::billing::{catalog, ledger};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::path::Path;

const MAILBOX_CENTS_PER_MONTH: i64 = 149;
const MAILBOX_QUOTA_GB: i64 = 5;
const GB: f64 = 1e9;

fn folder_bytes(folder: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                folder_bytes(&entry.path())
            } else {
                std::fs::metadata(entry.path()).map_or(0, |meta| meta.len())
            }
        })
        .sum()
}

impl Site {
    pub(super) async fn mail_add(
        &self,
        owner: &str,
        data: &JsonValue,
    ) -> Result<JsonValue, String> {
        let row = self.owned_domain(owner, data).await?;
        let name = normalized(data.get("local"));
        let Some(row) = row else {
            return Ok(fail("NOT_FOUND"));
        };
        let bytes = name.as_bytes();
        let shaped = (1..=63).contains(&bytes.len())
            && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
            && bytes
                .iter()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"._-".contains(c));
        if !shaped {
            return Ok(fail("INVALID_ARGUMENT"));
        }
        let mut list = records_of(&row, "mail_json");
        if list.iter().any(|entry| entry["local"] == json!(name)) {
            return Ok(fail("DOMAIN_TAKEN"));
        }
        let domain = js::text(row.get("domain"));
        let (forward, alias) = (
            data.get("forward_to").filter(|v| js::truthy(Some(v))),
            data.get("alias_of").filter(|v| js::truthy(Some(v))),
        );
        let kind = if forward.is_some() {
            "forward"
        } else if alias.is_some() {
            "alias"
        } else {
            "box"
        };
        let mut entry =
            json!({ "local": name, "address": format!("{name}@{domain}"), "kind": kind });
        if kind == "box" {
            entry["quota_gb"] = json!(MAILBOX_QUOTA_GB);
            entry["used_gb"] = json!(0);
            entry["cents_per_month"] = json!(MAILBOX_CENTS_PER_MONTH);
        }
        if let Some(to) = forward {
            entry["to"] = json!(js::text(Some(to)));
        }
        if let Some(to) = alias {
            entry["to"] = json!(js::text(Some(to)));
        }
        list.push(entry);
        self.set_domain_column(
            "mail_json",
            json!(JsonValue::Array(list.clone()).to_string()),
            &domain,
        )
        .await?;
        Ok(json!({ "ok": true, "simulated": true, "boxes": list }))
    }
    pub(super) async fn mail_remove(
        &self,
        owner: &str,
        data: &JsonValue,
    ) -> Result<JsonValue, String> {
        let Some(row) = self.owned_domain(owner, data).await? else {
            return Ok(fail("NOT_FOUND"));
        };
        let local = normalized(data.get("local"));
        let next: Vec<JsonValue> = records_of(&row, "mail_json")
            .into_iter()
            .filter(|entry| entry["local"] != json!(local))
            .collect();
        self.set_domain_column(
            "mail_json",
            json!(JsonValue::Array(next.clone()).to_string()),
            &js::text(row.get("domain")),
        )
        .await?;
        Ok(json!({ "ok": true, "boxes": next }))
    }
    pub(super) async fn hosting(&self, owner: &str) -> Result<JsonValue, String> {
        let principal = owner.to_string();
        let status = self
            .billing
            .central()
            .transaction(move |db| ledger::status(db, &principal, now_ms()))
            .await
            .ok();
        let wanted = status.as_ref().map(|status| {
            status
                .pointer("/plan/productId")
                .cloned()
                .unwrap_or(JsonValue::Null)
        });
        let plan = catalog::catalog()["plans"].as_array().and_then(|plans| {
            plans
                .iter()
                .find(|plan| Some(&plan["productId"]) == wanted.as_ref())
        });
        let sites: Vec<JsonValue> = self
            .store
            .of_owner(owner)
            .await?
            .into_iter()
            .filter(|row| row["state"] == json!("online"))
            .map(|row| {
                let domain = if row["domain_state"] == json!("active") {
                    row["domain"].clone()
                } else {
                    JsonValue::Null
                };
                json!({ "slug": row["slug"], "domain": domain })
            })
            .collect();
        let month = js::iso(now_ms())[..7].to_string();
        let home = self
            .user_root
            .join(crate::media::storage::sanitize_segment(owner));
        let storage = tokio::task::spawn_blocking(move || folder_bytes(&home))
            .await
            .map_err(|e| e.to_string())?;
        let traffic_limit = plan
            .and_then(|plan| traffic_gb(plan["tier"].as_str().unwrap_or("")))
            .map_or(JsonValue::Null, |gb| js::number_json(gb * GB));
        let domains: Vec<JsonValue> = self
            .store
            .central
            .all("SELECT domain, state, expires_at, auto_renew, mail_json FROM site_domains WHERE owner_id = ?".into(), vec![json!(owner)])
            .await?
            .into_iter()
            .map(|row| {
                let domain = js::text(row.get("domain"));
                json!({ "domain": domain, "state": row["state"], "expires_at": row["expires_at"], "auto_renew": row["auto_renew"] == json!(1),
                    "renew": Self::renewal_price(&domain), "boxes": records_of(&row, "mail_json") })
            })
            .collect();
        Ok(
            json!({ "ok": true, "simulated": true, "hosting": { "included": true, "sites": sites,
            "traffic_bytes": self.store.traffic(owner, &month).await?, "traffic_limit_bytes": traffic_limit,
            "storage_bytes": storage, "storage_limit_bytes": plan.map_or(JsonValue::Null, |plan| plan["storageBytes"].clone()),
            "domains": domains } }),
        )
    }
}
