// The streams a device subscribes, in the order a restore needs them.
use super::VaultRouter;
use super::js::{self, truthy};
use super::shares::ACTIVE_LINKED;
use super::streams::unique;
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;

impl VaultRouter {
    // A device subscribes in this order, and an old account holds tens of thousands of streams:
    // its vault's (`streams:restore-order`: the account's own record, which a new device's home
    // awaits, then its projects, its contacts, the rest). The registry, the access authority, is
    // written after each vault commit: a stream the vault holds that it lacks (a registration
    // lost after its commit, never replayed since) is registered here, never taken from another.
    pub async fn list_authorized_streams(&self, principal: &str) -> Result<Vec<String>, String> {
        let provisioned = self
            .central
            .get(
                "SELECT 1 AS found FROM vault_principal_registry WHERE principal_id = ? AND status = 'active'",
                vec![json!(principal)],
            )
            .await?
            .is_some();
        let ordered = if provisioned {
            self.ask(
                principal,
                "streams:restore-order",
                json!({ "principal_id": principal }),
            )
            .await?
        } else {
            json!([])
        };
        let ordered = ordered.as_array().cloned().unwrap_or_default();
        let registered = self
            .central
            .all(
                "SELECT stream_id FROM vault_stream_registry WHERE vault_principal_id = ? ORDER BY stream_id".into(),
                vec![json!(principal)],
            )
            .await?;
        let mut registered: Vec<String> = registered
            .iter()
            .map(|row| js::string(&row["stream_id"]))
            .collect();
        let known: HashSet<String> = registered.iter().cloned().collect();
        let missing: Vec<JsonValue> = ordered
            .iter()
            .filter(|row| !known.contains(&js::string(&row[0])))
            .cloned()
            .collect();
        if !missing.is_empty() {
            let owner = principal.to_string();
            let repaired = self
                .central
                .transaction(move |db| {
                    let mut insert = db
                        .prepare_cached(
                            "INSERT INTO vault_stream_registry (stream_id, vault_principal_id, project_id, atome_id)
                             VALUES (?1, ?2, ?3, ?4) ON CONFLICT(stream_id) DO NOTHING",
                        )
                        .map_err(|e| e.to_string())?;
                    let mut repaired = Vec::new();
                    for row in &missing {
                        let stream = js::string(&row[0]);
                        let inserted = insert
                            .execute(rusqlite::params![
                                stream,
                                owner,
                                row[1].as_str(),
                                row[2].as_str()
                            ])
                            .map_err(|e| e.to_string())?;
                        if inserted > 0 {
                            repaired.push(stream);
                        }
                    }
                    Ok(repaired)
                })
                .await?;
            if !repaired.is_empty() {
                eprintln!(
                    "{}",
                    json!({ "component": "vault-router", "message": "stream_registry_repaired",
                        "data": { "principal_id": principal, "streams": repaired.len() } })
                );
            }
            registered.extend(repaired);
        }
        let mine: HashSet<&str> = registered.iter().map(String::as_str).collect();
        let owned: Vec<String> = ordered
            .iter()
            .map(|row| js::string(&row[0]))
            .filter(|stream| mine.contains(stream.as_str()))
            .chain(registered.iter().cloned())
            .collect();
        let shared = self
            .central
            .all(
                format!("SELECT DISTINCT stream_id FROM sync_share_requests WHERE principal_id = ? AND {ACTIVE_LINKED} ORDER BY stream_id"),
                vec![json!(principal)],
            )
            .await?;
        Ok(unique(
            owned.into_iter().chain(
                shared
                    .iter()
                    .filter(|row| truthy(row.get("stream_id")))
                    .map(|row| js::string(&row["stream_id"])),
            ),
        ))
    }
}
