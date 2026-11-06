//! What a CXF document becomes in atome's one existing store for a person's
//! secrets, the account secret vault (`server/providerCredentialVault.js`
//! `createAccountSecretVault`, reached by the `secret.store` operation of
//! `atome/src/squirrel/security/bootstrap.js#storeToken`): one entry per CXF item,
//! within that vault's limits. atome has no CXF importer yet; this is the shape
//! such an importer would write, used for the synthetic example.

use serde_json::{Value, json};

use crate::error::{Result, err};

/// `SECRET_ID`, `SECRET_MAX_BYTES` and `SECRET_MAX_COUNT` of the account secret vault.
const MAX_ID_BYTES: usize = 512;
const MAX_ENTRY_BYTES: usize = 256 * 1024;
const MAX_ENTRIES: usize = 1000;

fn id_is_valid(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_BYTES
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._%:-".contains(&b))
}

/// `{ entry_id, value, metadata }` per item, refused when an entry or their count
/// exceeds the vault's limits (the importer would have to split them).
pub fn entries(index: &Value) -> Result<Vec<Value>> {
    let mut entries = Vec::new();
    for account in index["accounts"].as_array().into_iter().flatten() {
        let account_id = account["id"].as_str().unwrap_or_default();
        for item in account["items"].as_array().into_iter().flatten() {
            let item_id = item["id"].as_str().unwrap_or_default();
            let entry_id = format!("cxf:{account_id}:{item_id}");
            if !id_is_valid(&entry_id) {
                return Err(err("atome_entry_id_invalid", entry_id));
            }
            let metadata =
                json!({ "kind": "cxf-item", "cxf_version": "1.0", "account": account_id });
            let size = serde_json::to_vec(&json!({ "value": item, "metadata": metadata }))
                .map_or(usize::MAX, |b| b.len());
            if size > MAX_ENTRY_BYTES {
                return Err(err("atome_entry_too_large", entry_id));
            }
            entries.push(json!({ "entry_id": entry_id, "value": item, "metadata": metadata }));
        }
    }
    if entries.len() > MAX_ENTRIES {
        return Err(err("atome_entry_limit", entries.len().to_string()));
    }
    Ok(entries)
}
