// A person's sealed records (atome/src/squirrel/security/token_vault.js and the file storage of
// server/providerCredentialVault.js, ported): the provider keys and sessions (`credentials/`) and
// the account's own secrets (`secrets/`), one encrypted record per file named by the hash of its
// key, written atomically. The supervisor names the record and hands the master secret; the value
// is sealed here, inside the person's own directory, and never enters an Atome event.
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::pbkdf2;
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::num::NonZeroU32;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

const ITERATIONS: NonZeroU32 = NonZeroU32::new(120_000).expect("iterations");
const AREAS: [&str; 2] = ["credentials", "secrets"];

fn text<'a>(payload: &'a JsonValue, name: &str) -> Result<&'a str, String> {
    payload
        .get(name)
        .and_then(JsonValue::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("vault_sealed_{name}_required"))
}

fn random(count: usize) -> Result<Vec<u8>, String> {
    let mut bytes = vec![0u8; count];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| "vault_random_unavailable".to_string())?;
    Ok(bytes)
}

fn key_of(secret: &str, salt: &[u8]) -> Result<LessSafeKey, String> {
    let mut key = [0u8; 32];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        ITERATIONS,
        salt,
        secret.trim().as_bytes(),
        &mut key,
    );
    UnboundKey::new(&AES_256_GCM, &key)
        .map(LessSafeKey::new)
        .map_err(|_| "vault_sealed_key_invalid".to_string())
}

fn seal(secret: &str, value: &JsonValue) -> Result<JsonValue, String> {
    let (salt, iv) = (random(16)?, random(12)?);
    let mut data = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let nonce = Nonce::try_assume_unique_for_key(&iv).map_err(|_| "vault_sealed_iv_invalid")?;
    key_of(secret, &salt)?
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut data)
        .map_err(|_| "vault_sealed_encrypt_failed".to_string())?;
    Ok(
        json!({ "version": 1, "algorithm": "AES-GCM", "kdf": "PBKDF2-SHA-256",
        "salt": STANDARD.encode(salt), "iv": STANDARD.encode(iv), "cipher_text": STANDARD.encode(data) }),
    )
}

fn unseal(secret: &str, sealed: &JsonValue) -> Result<JsonValue, String> {
    let read = |name: &str| {
        STANDARD
            .decode(sealed.get(name).and_then(JsonValue::as_str).unwrap_or(""))
            .map_err(|_| "vault_sealed_record_invalid".to_string())
    };
    let cipher = sealed
        .get("cipher_text")
        .or_else(|| sealed.get("cipherText"))
        .and_then(JsonValue::as_str)
        .unwrap_or("");
    let mut data = STANDARD
        .decode(cipher)
        .map_err(|_| "vault_sealed_record_invalid".to_string())?;
    let iv = read("iv")?;
    let nonce = Nonce::try_assume_unique_for_key(&iv).map_err(|_| "vault_sealed_iv_invalid")?;
    let plain = key_of(secret, &read("salt")?)?
        .open_in_place(nonce, Aad::empty(), &mut data)
        .map_err(|_| "vault_sealed_decrypt_failed".to_string())?;
    serde_json::from_slice(plain).map_err(|_| "vault_sealed_record_invalid".to_string())
}

fn now() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

pub struct Sealed {
    root: PathBuf,
}

impl Sealed {
    // `credentials/` or `secrets/` of the person's directory, created private.
    fn open(directory: &Path, payload: &JsonValue) -> Result<Self, String> {
        let area = text(payload, "area")?;
        if !AREAS.contains(&area) {
            return Err("vault_sealed_area_invalid".into());
        }
        let root = directory.join(area);
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&root)
            .map_err(|e| e.to_string())?;
        Ok(Self { root })
    }

    fn file(&self, key: &str) -> PathBuf {
        let digest = Sha256::digest(key.as_bytes());
        let name: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
        self.root.join(format!("{name}.json"))
    }

    fn record(&self, key: &str) -> Result<Option<JsonValue>, String> {
        match std::fs::read_to_string(self.file(key)) {
            Ok(raw) => serde_json::from_str(&raw)
                .map(Some)
                .map_err(|_| "vault_sealed_record_invalid".to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn store(&self, payload: &JsonValue) -> Result<JsonValue, String> {
        let (key, entry) = (text(payload, "key")?, text(payload, "entry_id")?);
        let value = payload.get("value").ok_or("vault_sealed_value_required")?;
        let metadata = payload
            .get("metadata")
            .filter(|metadata| !metadata.is_null())
            .cloned()
            .unwrap_or_else(|| json!({}));
        let stamp = now();
        let record = json!({ "entry_id": entry, "created_at": stamp, "updated_at": stamp,
            "metadata": metadata, "sealed": seal(text(payload, "secret")?, value)? });
        let target = self.file(key);
        let temporary = target.with_extension(format!(
            "json.{}",
            random(8)?
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        ));
        let written = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .and_then(|mut file| file.write_all(record.to_string().as_bytes()))
            .and_then(|()| std::fs::rename(&temporary, &target));
        let _ = std::fs::remove_file(&temporary);
        written.map_err(|e| e.to_string())?;
        Ok(json!({ "entry_id": entry, "metadata": record["metadata"] }))
    }

    fn read(&self, payload: &JsonValue) -> Result<JsonValue, String> {
        let Some(record) = self.record(text(payload, "key")?)? else {
            return Ok(JsonValue::Null);
        };
        let value = unseal(text(payload, "secret")?, &record["sealed"])?;
        Ok(json!({ "entry_id": record["entry_id"],
            "metadata": record.get("metadata").filter(|m| !m.is_null()).cloned().unwrap_or_else(|| json!({})),
            "value": value }))
    }

    fn remove(&self, payload: &JsonValue) -> Result<JsonValue, String> {
        match std::fs::remove_file(self.file(text(payload, "key")?)) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
            _ => Ok(json!({ "removed": true })),
        }
    }

    // Every record's entry and metadata, never a value.
    fn list(&self) -> Result<JsonValue, String> {
        let mut items = Vec::new();
        for entry in std::fs::read_dir(&self.root).map_err(|e| e.to_string())? {
            let name = entry.map_err(|e| e.to_string())?.file_name();
            let name = name.to_string_lossy();
            let shaped = name.len() == 69
                && name.ends_with(".json")
                && name[..64]
                    .bytes()
                    .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c));
            if !shaped {
                continue;
            }
            let raw = std::fs::read_to_string(self.root.join(&*name)).map_err(|e| e.to_string())?;
            let record: JsonValue = serde_json::from_str(&raw)
                .map_err(|_| "vault_sealed_record_invalid".to_string())?;
            let or_null = |field: &str| {
                record
                    .get(field)
                    .filter(|value| value.as_str().is_some_and(|text| !text.is_empty()))
                    .cloned()
                    .unwrap_or(JsonValue::Null)
            };
            items.push(json!({ "entry_id": record["entry_id"],
                "metadata": record.get("metadata").filter(|m| !m.is_null()).cloned().unwrap_or_else(|| json!({})),
                "created_at": or_null("created_at"), "updated_at": or_null("updated_at") }));
        }
        Ok(JsonValue::Array(items))
    }
}

/// A `sealed:*` operation in the person's directory.
pub fn handle(directory: &Path, operation: &str, payload: &JsonValue) -> Result<JsonValue, String> {
    let sealed = Sealed::open(directory, payload)?;
    match operation {
        "sealed:store" => sealed.store(payload),
        "sealed:read" => sealed.read(payload),
        "sealed:remove" => sealed.remove(payload),
        "sealed:list" => sealed.list(),
        _ => Err("vault_operation_not_allowed".into()),
    }
}
