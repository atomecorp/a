// The sealing at rest of the CB's takes (R-173 lot L4, AIPD « À trancher » 2, decided by the user on 18 Nov. 2026:
// sealed). Each file is AES-256-GCM (ring, already the server's), its nonce drawn per file, its recording id bound as
// associated data: a file renamed onto another take's row does not open. Layout: `CBS1` ‖ nonce (12) ‖ ciphertext ‖ tag.
//
// The key, 32 bytes as 64 hex digits, comes from `ATOME_CB_RECORDINGS_KEY` (the environment, the only source of a
// production server), else, outside production, from `Private/cb_recordings.env` (owner-only, `secret_file`), written
// once with a fresh key when it is missing. A production server without a key records nothing, so it refuses the CB's
// floor (`cb_recording_unavailable:cb_recording_key_missing`): a voice is never kept in the clear by mistake.
//
// The Appel's pairs put in touch (lot L5, social/cb/random_call.rs) are kept under a keyed fingerprint only, its key
// derived from this one (HKDF-SHA256, `CALL_PAIRS_INFO`): one secret, two uses that never share a key.
use super::Sealer;
use crate::settings::Settings;
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use ring::hkdf;
use ring::rand::{SecureRandom, SystemRandom};
use std::path::Path;
use std::sync::Arc;

pub const KEY_ENV: &str = "ATOME_CB_RECORDINGS_KEY";
const FILE_ENV: &str = "ATOME_CB_RECORDINGS_ENV_FILE";
const FILE_NAME: &str = "cb_recordings.env";
const MAGIC: &[u8; 4] = b"CBS1";
pub const MISSING: &str = "cb_recording_key_missing";
/// The derivation's label of the Appel pairs' key.
pub const CALL_PAIRS_INFO: &[u8] = b"atome cb call pairs v1";

/// AES-256-GCM over each take.
pub struct Aes256Gcm {
    key: LessSafeKey,
    random: SystemRandom,
}

impl Aes256Gcm {
    pub fn new(key: &[u8; 32]) -> Self {
        Self {
            key: LessSafeKey::new(
                UnboundKey::new(&AES_256_GCM, key).expect("a 32-byte AES-256 key"),
            ),
            random: SystemRandom::new(),
        }
    }

    /// The key written as 64 hex digits.
    pub fn from_hex(text: &str) -> Result<Self, String> {
        Ok(Self::new(&key_of_hex(text)?))
    }
}

// A key written as 64 hex digits.
fn key_of_hex(text: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(text.trim()).map_err(|_| "cb_recording_key_invalid".to_string())?;
    bytes
        .try_into()
        .map_err(|_| "cb_recording_key_invalid".to_string())
}

impl Sealer for Aes256Gcm {
    fn name(&self) -> &'static str {
        "aes-256-gcm"
    }
    fn extension(&self) -> &'static str {
        "ogg.sealed"
    }
    fn seal(&self, id: &str, plain: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce = [0u8; NONCE_LEN];
        self.random
            .fill(&mut nonce)
            .map_err(|_| "cb_recording_seal_failed".to_string())?;
        let mut body = plain.to_vec();
        self.key
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce),
                Aad::from(id.as_bytes()),
                &mut body,
            )
            .map_err(|_| "cb_recording_seal_failed".to_string())?;
        let mut stored = Vec::with_capacity(MAGIC.len() + NONCE_LEN + body.len());
        stored.extend_from_slice(MAGIC);
        stored.extend_from_slice(&nonce);
        stored.extend_from_slice(&body);
        Ok(stored)
    }
    fn open(&self, id: &str, stored: &[u8]) -> Result<Vec<u8>, String> {
        let unreadable = || "cb_recording_unreadable".to_string();
        let rest = stored
            .strip_prefix(MAGIC.as_slice())
            .ok_or_else(unreadable)?;
        if rest.len() < NONCE_LEN {
            return Err(unreadable());
        }
        let (nonce, body) = rest.split_at(NONCE_LEN);
        let nonce = Nonce::try_assume_unique_for_key(nonce).map_err(|_| unreadable())?;
        let mut body = body.to_vec();
        let plain = self
            .key
            .open_in_place(nonce, Aad::from(id.as_bytes()), &mut body)
            .map_err(|_| unreadable())?;
        Ok(plain.to_vec())
    }
}

/// No key on a production server: nothing is recorded, so the CB's floor is refused.
pub struct Missing;

impl Sealer for Missing {
    fn name(&self) -> &'static str {
        "missing"
    }
    fn ready(&self) -> Result<(), String> {
        Err(MISSING.into())
    }
    fn seal(&self, _id: &str, _plain: &[u8]) -> Result<Vec<u8>, String> {
        Err(MISSING.into())
    }
    fn open(&self, _id: &str, _stored: &[u8]) -> Result<Vec<u8>, String> {
        Err(MISSING.into())
    }
}

/// The server's sealer: its key from the environment, else (outside production) from the owner-only secret file,
/// written with a fresh key the first time. A key that is not 64 hex digits stops the start.
pub fn from_settings(settings: &Settings, project_root: &Path) -> Result<Arc<dyn Sealer>, String> {
    match recordings_key(settings, project_root)? {
        Some(key) => Ok(Arc::new(Aes256Gcm::new(&key))),
        None => {
            eprintln!("[cb] {KEY_ENV} is not set: the CB records nothing and refuses its floor.");
            Ok(Arc::new(Missing))
        }
    }
}

/// The key of the Appel's pairs (lot L5): derived from the recordings' key, read as `from_settings` reads it (called
/// after it, the development file is already there); none without that key (a production server without one).
pub fn call_pairs_key(settings: &Settings, project_root: &Path) -> Option<[u8; 32]> {
    recordings_key(settings, project_root)
        .ok()
        .flatten()
        .map(|key| derive_call_pairs_key(&key))
}

/// The pairs' key derived from the recordings' `key` (HKDF-SHA256, no salt, `CALL_PAIRS_INFO`).
pub fn derive_call_pairs_key(key: &[u8; 32]) -> [u8; 32] {
    struct Bytes32;
    impl hkdf::KeyType for Bytes32 {
        fn len(&self) -> usize {
            32
        }
    }
    let mut derived = [0u8; 32];
    hkdf::Salt::new(hkdf::HKDF_SHA256, &[])
        .extract(key)
        .expand(&[CALL_PAIRS_INFO], Bytes32)
        .and_then(|okm| okm.fill(&mut derived))
        .expect("32 bytes of HKDF-SHA256");
    derived
}

// The recordings' key: the environment's, else (outside production) the owner-only secret file's, written fresh the first
// time; none on a production server without one.
fn recordings_key(settings: &Settings, project_root: &Path) -> Result<Option<[u8; 32]>, String> {
    if let Some(key) = settings.get(KEY_ENV) {
        return key_of_hex(&key).map(Some);
    }
    if settings.get("NODE_ENV").as_deref() == Some("production") {
        return Ok(None);
    }
    development(settings, project_root)
}

#[cfg(unix)]
fn development(settings: &Settings, project_root: &Path) -> Result<Option<[u8; 32]>, String> {
    let file = settings.secret_file(
        project_root,
        FILE_ENV,
        FILE_NAME,
        &[KEY_ENV],
        "cb_recordings_secret_file",
    )?;
    if let Some(key) = file.get(KEY_ENV) {
        return key_of_hex(key).map(Some);
    }
    // The first start: a fresh key, written owner-only beside the other development secrets (never served, ignored by git).
    let path = settings.value(FILE_ENV).map_or_else(
        || project_root.join("Private").join(FILE_NAME),
        std::path::PathBuf::from,
    );
    let mut key = [0u8; 32];
    SystemRandom::new()
        .fill(&mut key)
        .map_err(|_| "cb_recording_key_failed".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut out = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(
        out,
        "# The key of the CB's recordings at rest (R-173). Losing it loses the takes kept."
    )
    .and_then(|()| writeln!(out, "{KEY_ENV}={}", hex::encode(key)))
    .map_err(|e| e.to_string())?;
    Ok(Some(key))
}

#[cfg(not(unix))]
fn development(_settings: &Settings, _project_root: &Path) -> Result<Option<[u8; 32]>, String> {
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_take_opens_with_its_key_and_its_id_only() {
        let sealer = Aes256Gcm::new(&[7; 32]);
        let plain = b"OggS a take".to_vec();
        let stored = sealer.seal("cbrec_a", &plain).expect("sealed");
        assert!(
            stored.starts_with(MAGIC)
                && !stored.windows(plain.len()).any(|w| w == plain.as_slice())
        );
        assert_eq!(sealer.open("cbrec_a", &stored).expect("opened"), plain);
        // Another take's id, another key, a byte changed: nothing opens.
        assert!(sealer.open("cbrec_b", &stored).is_err());
        assert!(Aes256Gcm::new(&[8; 32]).open("cbrec_a", &stored).is_err());
        let mut changed = stored.clone();
        *changed.last_mut().expect("a tag") ^= 1;
        assert!(sealer.open("cbrec_a", &changed).is_err());
        // Each file its own nonce.
        assert_ne!(sealer.seal("cbrec_a", &plain).expect("sealed"), stored);
    }

    #[test]
    fn a_key_is_64_hex_digits_and_none_refuses() {
        assert!(Aes256Gcm::from_hex(&"ab".repeat(32)).is_ok());
        assert!(
            Aes256Gcm::from_hex("abcd").is_err() && Aes256Gcm::from_hex(&"zz".repeat(32)).is_err()
        );
        assert_eq!(Missing.ready(), Err(MISSING.to_string()));
    }

    #[test]
    fn the_pairs_key_is_derived_never_the_recordings_own() {
        let derived = derive_call_pairs_key(&[7; 32]);
        assert_eq!(
            derived,
            derive_call_pairs_key(&[7; 32]),
            "the same each start"
        );
        assert_ne!(derived, [7; 32]);
        assert_ne!(derived, derive_call_pairs_key(&[8; 32]));
    }
}
