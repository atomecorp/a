// A domain joined to a site (server/site_domains.js, ported; Q13): a domain bought here or the
// user's own, proven by a TXT record and a CNAME to atome, its certificate issued
// (`ATOME_SITE_CERT_COMMAND`, the production's certbot step), chosen as the site's main address
// or let go.
use super::domains::{SITE_CNAME_TARGET, normalized, raw};
use super::{Site, dns, fail};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

fn proof_records(domain: &str, token: &JsonValue) -> JsonValue {
    json!([{ "type": "TXT", "name": format!("_atome.{domain}"), "value": format!("atome-verify={}", js::text(Some(token))) },
        { "type": "CNAME", "name": domain, "value": SITE_CNAME_TARGET }])
}

impl Site {
    pub(super) async fn attach(
        &self,
        owner: &str,
        site_id: &str,
        domain: &str,
        state: &str,
    ) -> Result<JsonValue, String> {
        let row = match self.ensure_row(owner, site_id).await? {
            Ok(row) => row,
            Err(failure) => return Ok(failure),
        };
        if self
            .store
            .by_domain(domain)
            .await?
            .is_some_and(|holder| holder["site_id"] != json!(site_id))
        {
            return Ok(fail("DOMAIN_TAKEN"));
        }
        let token = if row["domain"] == json!(domain) && js::truthy(row.get("domain_token")) {
            row["domain_token"].clone()
        } else {
            json!(super::random_hex(8))
        };
        self.store
            .update(
                site_id,
                vec![
                    ("domain", json!(domain)),
                    ("domain_state", json!(state)),
                    ("domain_token", token.clone()),
                ],
            )
            .await?;
        Ok(
            json!({ "ok": true, "site": self.write_status(owner, site_id, Vec::new()).await?, "records": proof_records(domain, &token) }),
        )
    }
    async fn issue_certificate(&self, domain: &str) -> bool {
        let Some(command) = self.cert_command.as_deref() else {
            return false;
        };
        let run = tokio::process::Command::new(command)
            .arg(domain)
            .kill_on_drop(true)
            .status();
        matches!(tokio::time::timeout(std::time::Duration::from_secs(120), run).await, Ok(Ok(status)) if status.success())
    }
    pub(super) async fn verify(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let site_id = raw(data.get("site_id"));
        let row = self.store.site(&site_id).await?;
        let Some(row) =
            row.filter(|row| row["owner_id"] == json!(owner) && js::truthy(row.get("domain")))
        else {
            return Ok(fail("NOT_FOUND"));
        };
        let domain = js::text(row.get("domain"));
        let token = &row["domain_token"];
        let txt = dns::txt(&format!("_atome.{domain}"))
            .await
            .unwrap_or_default();
        let cname = dns::cname(&domain).await.unwrap_or_default();
        let proven = txt.contains(&format!("atome-verify={}", js::text(Some(token))))
            && cname
                .iter()
                .any(|name| normalized(Some(&json!(name))) == SITE_CNAME_TARGET);
        let certificate = proven
            && (row["domain_state"] == json!("active") || self.issue_certificate(&domain).await);
        let state = if certificate {
            "active"
        } else if proven {
            "certificate_pending"
        } else {
            "pending"
        };
        self.store
            .update(&site_id, vec![("domain_state", json!(state))])
            .await?;
        Ok(
            json!({ "ok": true, "steps": { "domain": true, "dns": proven, "certificate": certificate },
            "site": self.write_status(owner, &site_id, Vec::new()).await?, "records": proof_records(&domain, token) }),
        )
    }
    pub(super) async fn primary(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let site_id = raw(data.get("site_id"));
        let Some(row) = self
            .store
            .site(&site_id)
            .await?
            .filter(|row| row["owner_id"] == json!(owner))
        else {
            return Ok(fail("NOT_FOUND"));
        };
        let domain = data.get("primary") == Some(&json!("domain"));
        if domain && row["domain_state"] != json!("active") {
            return Ok(fail("DOMAIN_NOT_VERIFIED"));
        }
        let host = if domain { "domain" } else { "atome" };
        self.store
            .update(&site_id, vec![("primary_host", json!(host))])
            .await?;
        Ok(json!({ "ok": true, "site": self.write_status(owner, &site_id, Vec::new()).await? }))
    }
    pub(super) async fn unlink(&self, owner: &str, data: &JsonValue) -> Result<JsonValue, String> {
        let site_id = raw(data.get("site_id"));
        if self
            .store
            .site(&site_id)
            .await?
            .filter(|row| row["owner_id"] == json!(owner))
            .is_none()
        {
            return Ok(fail("NOT_FOUND"));
        }
        let none = JsonValue::Null;
        self.store
            .update(
                &site_id,
                vec![
                    ("domain", none.clone()),
                    ("domain_state", none.clone()),
                    ("domain_token", none),
                    ("primary_host", json!("atome")),
                ],
            )
            .await?;
        Ok(json!({ "ok": true, "site": self.write_status(owner, &site_id, Vec::new()).await? }))
    }
}
