// A person's provider keys, provider sessions and own secrets (server/providerCredentialVault.js,
// ported): what may be stored, under which name; the sealing itself is done by the person's
// vault process (atome-vault `sealed:*`), in that person's directory. The master secret is the
// vault root's `.provider-credentials.key`, made once, as Fastify made it.
use crate::vault_router::VaultRouter;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// Providers whose key lives only on the server (never readable by the browser).
pub const SERVER_VAULT_PROVIDERS: [&str; 5] = ["openai", "musicgpt", "runway", "spotify", "deezer"];
/// Provider sessions (OAuth tokens and the provider's identity) of the person.
pub const PROVIDER_VAULT_RECORDS: [&str; 5] = [
    "social.tiktok",
    "social.instagram",
    "social.facebook",
    "music.spotify",
    "health.strava",
];
// The token vault's own prefix, and the secrets'.
const PROVIDER_PREFIX: &str = "squirrel.token_vault.";
const SECRET_PREFIX: &str = "secret.";
const SECRET_MAX_BYTES: usize = 256 * 1024;
const SECRET_MAX_COUNT: usize = 1000;

fn master_secret(root: &Path) -> Result<String, String> {
    let path = root.join(".provider-credentials.key");
    let mut fresh = [0u8; 32];
    ring::rand::SecureRandom::fill(&ring::rand::SystemRandom::new(), &mut fresh)
        .map_err(|_| "provider_vault_random_unavailable".to_string())?;
    let hex: String = fresh.iter().map(|byte| format!("{byte:02x}")).collect();
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
    {
        Ok(mut file) => file.write_all(hex.as_bytes()).map_err(|e| e.to_string())?,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.to_string()),
    }
    let secret = std::fs::read_to_string(&path)
        .map_err(|e| e.to_string())?
        .trim()
        .to_string();
    if secret.len() != 64 {
        return Err("provider_vault_master_key_invalid".into());
    }
    Ok(secret)
}

// `SECRET_ID` of providerCredentialVault.js: /^[A-Za-z0-9._%:-]{1,512}$/.
fn secret_id(value: Option<&JsonValue>) -> Result<String, String> {
    let id = match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(JsonValue::String(text)) => text.trim().to_string(),
        Some(other) => crate::vault_router::js::text(Some(other))
            .trim()
            .to_string(),
    };
    let shaped = (1..=512).contains(&id.len())
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._%:-".contains(&c));
    if !shaped {
        return Err("provider_secret_id_invalid".into());
    }
    Ok(id)
}

/// One person's sealed records, read and written through their vault process.
#[derive(Clone)]
pub struct Credentials {
    router: Arc<VaultRouter>,
    principal: String,
    secret: String,
    // The person's own directory for sharing jobs and their prepared files.
    social: PathBuf,
}

impl Credentials {
    pub async fn open(
        router: &Arc<VaultRouter>,
        vault_root: &Path,
        principal: &str,
    ) -> Result<Self, String> {
        if principal.is_empty() {
            return Err("provider_vault_principal_required".into());
        }
        router.provision(principal).await?;
        Ok(Self {
            router: router.clone(),
            principal: principal.to_string(),
            secret: master_secret(vault_root)?,
            social: vault_root
                .join(crate::vault_router::vault_key(principal))
                .join("social"),
        })
    }

    pub fn social_root(&self) -> PathBuf {
        self.social.clone()
    }

    async fn sealed(
        &self,
        operation: &str,
        area: &str,
        mut payload: JsonValue,
    ) -> Result<JsonValue, String> {
        payload["area"] = json!(area);
        payload["secret"] = json!(self.secret);
        self.router.ask(&self.principal, operation, payload).await
    }

    fn provider(name: &str) -> Result<(), String> {
        if SERVER_VAULT_PROVIDERS.contains(&name) {
            Ok(())
        } else {
            Err("provider_not_supported".into())
        }
    }

    fn record_name(name: &str) -> Result<(), String> {
        if PROVIDER_VAULT_RECORDS.contains(&name) {
            Ok(())
        } else {
            Err("provider_not_supported".into())
        }
    }

    async fn put(&self, name: &str, value: JsonValue) -> Result<(), String> {
        let key = format!("{PROVIDER_PREFIX}{name}");
        self.sealed(
            "sealed:store",
            "credentials",
            json!({ "key": key, "entry_id": name, "value": value }),
        )
        .await
        .map(|_| ())
    }

    async fn get(&self, name: &str) -> Result<Option<JsonValue>, String> {
        let key = format!("{PROVIDER_PREFIX}{name}");
        let found = self
            .sealed("sealed:read", "credentials", json!({ "key": key }))
            .await?;
        Ok(found.get("value").cloned())
    }

    async fn drop_entry(&self, area: &str, key: String) -> Result<(), String> {
        self.sealed("sealed:remove", area, json!({ "key": key }))
            .await
            .map(|_| ())
    }

    /// A provider's key, checked as Fastify checks it.
    pub async fn store(&self, provider: &str, value: &str) -> Result<JsonValue, String> {
        Self::provider(provider)?;
        let key = value.trim();
        if key.is_empty()
            || key.encode_utf16().count() > 1024
            || key.chars().any(char::is_whitespace)
        {
            return Err("provider_key_invalid".into());
        }
        self.put(provider, json!({ "key": key })).await?;
        Ok(json!({ "configured": true }))
    }

    pub async fn read(&self, provider: &str) -> Result<Option<String>, String> {
        Self::provider(provider)?;
        Ok(self.get(provider).await?.and_then(|value| {
            value
                .get("key")
                .and_then(JsonValue::as_str)
                .map(str::to_string)
        }))
    }

    pub async fn remove(&self, provider: &str) -> Result<JsonValue, String> {
        Self::provider(provider)?;
        self.drop_entry("credentials", format!("{PROVIDER_PREFIX}{provider}"))
            .await?;
        Ok(json!({ "configured": false }))
    }

    pub async fn store_record(&self, name: &str, record: JsonValue) -> Result<(), String> {
        Self::record_name(name)?;
        if !record.is_object() || record.to_string().encode_utf16().count() > 64 * 1024 {
            return Err("provider_record_invalid".into());
        }
        self.put(name, record).await
    }

    pub async fn read_record(&self, name: &str) -> Result<Option<JsonValue>, String> {
        Self::record_name(name)?;
        self.get(name).await
    }

    pub async fn remove_record(&self, name: &str) -> Result<(), String> {
        Self::record_name(name)?;
        self.drop_entry("credentials", format!("{PROVIDER_PREFIX}{name}"))
            .await
    }

    /// The person's own secret (a mail password, a saved login…), metadata kept beside it.
    pub async fn secret_store(
        &self,
        id: Option<&JsonValue>,
        value: Option<&JsonValue>,
        metadata: Option<&JsonValue>,
    ) -> Result<JsonValue, String> {
        let id = secret_id(id)?;
        let Some(value) = value else {
            return Err("provider_secret_invalid".into());
        };
        // `JSON.stringify({ value, metadata })`: an absent metadata is left out.
        let mut sized = json!({ "value": value });
        if let Some(metadata) = metadata {
            sized["metadata"] = metadata.clone();
        }
        let size = sized.to_string().len();
        if size > SECRET_MAX_BYTES {
            return Err("provider_secret_invalid".into());
        }
        let items = self.secret_list().await?;
        let known = items
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item["entry_id"] == json!(id)));
        if !known && items.as_array().map_or(0, Vec::len) >= SECRET_MAX_COUNT {
            return Err("provider_secret_limit".into());
        }
        let metadata = metadata
            .filter(|metadata| metadata.is_object() || metadata.is_array())
            .cloned()
            .unwrap_or_else(|| json!({}));
        self.sealed(
            "sealed:store",
            "secrets",
            json!({ "key": format!("{SECRET_PREFIX}{id}"), "entry_id": id, "value": value, "metadata": metadata }),
        )
        .await
    }

    pub async fn secret_read(&self, id: Option<&JsonValue>) -> Result<JsonValue, String> {
        let id = secret_id(id)?;
        self.sealed(
            "sealed:read",
            "secrets",
            json!({ "key": format!("{SECRET_PREFIX}{id}") }),
        )
        .await
    }

    pub async fn secret_remove(&self, id: Option<&JsonValue>) -> Result<JsonValue, String> {
        let id = secret_id(id)?;
        self.drop_entry("secrets", format!("{SECRET_PREFIX}{id}"))
            .await?;
        Ok(json!({ "entry_id": id }))
    }

    /// Entry ids and metadata only, never a value.
    pub async fn secret_list(&self) -> Result<JsonValue, String> {
        self.sealed("sealed:list", "secrets", json!({})).await
    }
}

type Lock = Arc<tokio::sync::Mutex<()>>;

/// Per person, a provider session's refresh under way and its writes, each one at a time.
#[derive(Default)]
pub struct Locks {
    refreshing: std::sync::Mutex<HashMap<String, Lock>>,
    writing: std::sync::Mutex<HashMap<String, Lock>>,
}

fn lock_of(locks: &std::sync::Mutex<HashMap<String, Lock>>, principal: &str) -> Lock {
    locks
        .lock()
        .expect("provider session locks")
        .entry(principal.into())
        .or_default()
        .clone()
}

impl Locks {
    pub async fn refreshing(&self, principal: &str) -> tokio::sync::OwnedMutexGuard<()> {
        lock_of(&self.refreshing, principal).lock_owned().await
    }

    pub async fn writing(&self, principal: &str) -> tokio::sync::OwnedMutexGuard<()> {
        lock_of(&self.writing, principal).lock_owned().await
    }
}
