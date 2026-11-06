//! The sealed envelope (`.atomecxf`, FORMATS.md §4): Argon2id (RFC 9106) derives
//! a 256-bit key from the passphrase and a random 16-byte salt; AES-256-GCM
//! (NIST SP 800-38D, `ring`) encrypts the package once under a random 96-bit
//! nonce, the whole header being authenticated as associated data. No primitive
//! is implemented here: the KDF is the RustCrypto `argon2` crate, the AEAD `ring`.

use argon2::{Algorithm, Argon2, Params, Version};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use ring::rand::{SecureRandom, SystemRandom};
use zeroize::{Zeroize, Zeroizing};

use crate::error::{Result, err};

pub const MAGIC: &[u8; 8] = b"ATOMECXF";
pub const ENVELOPE_VERSION: u8 = 1;
const KDF_ARGON2ID: u8 = 1;
const AEAD_AES_256_GCM: u8 = 1;
const SALT_LEN: usize = 16;
pub const HEADER_LEN: usize = 8 + 1 + 1 + 12 + SALT_LEN + 1 + NONCE_LEN;
const TAG_LEN: usize = 16;
pub const MIN_PASSPHRASE_CHARS: usize = 12;
const SALT_AT: usize = 22;
const AEAD_AT: usize = SALT_AT + SALT_LEN;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl KdfParams {
    /// RFC 9106 §4, second recommended option: 64 MiB, 3 passes, 4 lanes.
    pub const DEFAULT: KdfParams = KdfParams {
        memory_kib: 64 * 1024,
        iterations: 3,
        parallelism: 4,
    };
    /// Upper bounds accepted when opening, so a hostile header cannot exhaust memory or time.
    const MAX: KdfParams = KdfParams {
        memory_kib: 1024 * 1024,
        iterations: 16,
        parallelism: 16,
    };
}

pub fn check_passphrase(passphrase: &str) -> Result<()> {
    if passphrase.chars().count() < MIN_PASSPHRASE_CHARS {
        return Err(err(
            "passphrase_too_short",
            MIN_PASSPHRASE_CHARS.to_string(),
        ));
    }
    Ok(())
}

fn derive_key(passphrase: &str, salt: &[u8], params: KdfParams) -> Result<LessSafeKey> {
    let argon_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(32),
    )
    .map_err(|e| err("seal_kdf_params_invalid", e.to_string()))?;
    let mut key = Zeroizing::new([0u8; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params)
        .hash_password_into(passphrase.as_bytes(), salt, key.as_mut())
        .map_err(|e| err("seal_kdf_failed", e.to_string()))?;
    let unbound =
        UnboundKey::new(&AES_256_GCM, key.as_ref()).map_err(|_| err("seal_key_invalid", ""))?;
    Ok(LessSafeKey::new(unbound))
}

fn header(params: KdfParams, salt: &[u8; SALT_LEN], nonce: &[u8; NONCE_LEN]) -> Vec<u8> {
    let mut header = Vec::with_capacity(HEADER_LEN);
    header.extend_from_slice(MAGIC);
    header.push(ENVELOPE_VERSION);
    header.push(KDF_ARGON2ID);
    header.extend_from_slice(&params.memory_kib.to_be_bytes());
    header.extend_from_slice(&params.iterations.to_be_bytes());
    header.extend_from_slice(&params.parallelism.to_be_bytes());
    header.extend_from_slice(salt);
    header.push(AEAD_AES_256_GCM);
    header.extend_from_slice(nonce);
    header
}

/// Seals `plain` (consumed and wiped) under `passphrase`.
pub fn seal(mut plain: Vec<u8>, passphrase: &str, params: KdfParams) -> Result<Vec<u8>> {
    check_passphrase(passphrase)?;
    let random = SystemRandom::new();
    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    random
        .fill(&mut salt)
        .map_err(|_| err("seal_random_failed", ""))?;
    random
        .fill(&mut nonce)
        .map_err(|_| err("seal_random_failed", ""))?;
    let key = derive_key(passphrase, &salt, params)?;
    let mut sealed = header(params, &salt, &nonce);
    sealed.reserve(plain.len() + TAG_LEN);
    sealed.extend_from_slice(&plain);
    plain.zeroize();
    let (head, body) = sealed.split_at_mut(HEADER_LEN);
    let tag = key
        .seal_in_place_separate_tag(Nonce::assume_unique_for_key(nonce), Aad::from(&*head), body)
        .map_err(|_| err("seal_encrypt_failed", ""))?;
    sealed.extend_from_slice(tag.as_ref());
    Ok(sealed)
}

fn be_u32(bytes: &[u8]) -> u32 {
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

/// The KDF parameters a sealed file declares, checked against `KdfParams::MAX`.
pub fn declared_params(sealed: &[u8]) -> Result<KdfParams> {
    if sealed.len() < HEADER_LEN + TAG_LEN || &sealed[..8] != MAGIC {
        return Err(err("seal_not_an_envelope", ""));
    }
    if sealed[8] != ENVELOPE_VERSION
        || sealed[9] != KDF_ARGON2ID
        || sealed[AEAD_AT] != AEAD_AES_256_GCM
    {
        return Err(err(
            "seal_version_unsupported",
            format!("{}/{}", sealed[8], sealed[9]),
        ));
    }
    let params = KdfParams {
        memory_kib: be_u32(&sealed[10..14]),
        iterations: be_u32(&sealed[14..18]),
        parallelism: be_u32(&sealed[18..22]),
    };
    let max = KdfParams::MAX;
    if params.memory_kib > max.memory_kib
        || params.iterations > max.iterations
        || params.parallelism > max.parallelism
    {
        return Err(err("seal_kdf_params_out_of_bounds", ""));
    }
    Ok(params)
}

/// Opens a sealed file. A wrong passphrase and any altered byte give the same error.
pub fn open(sealed: &[u8], passphrase: &str) -> Result<Zeroizing<Vec<u8>>> {
    let params = declared_params(sealed)?;
    let salt = &sealed[SALT_AT..SALT_AT + SALT_LEN];
    let nonce_at = AEAD_AT + 1;
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&sealed[nonce_at..nonce_at + NONCE_LEN]);
    let key = derive_key(passphrase, salt, params)?;
    let mut body = Zeroizing::new(sealed[HEADER_LEN..].to_vec());
    let plain_len = key
        .open_in_place(
            Nonce::assume_unique_for_key(nonce),
            Aad::from(&sealed[..HEADER_LEN]),
            &mut body,
        )
        .map_err(|_| err("seal_authentication_failed", ""))?
        .len();
    body.truncate(plain_len);
    Ok(body)
}
