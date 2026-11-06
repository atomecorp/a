// A password's verifier (server/auth_password_crypto.js, ported): Argon2id at OWASP's
// floor (19 MiB, 2 passes, 1 lane), a legacy bcrypt verifier still proven until its
// login upgrades it, and the operator's SHA-256 blocklist. At most two derivations run
// at once; no password leaves this server.
use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use base64::alphabet::STANDARD;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value as JsonValue, json};
use std::sync::atomic::{AtomicUsize, Ordering};
use subtle::ConstantTimeEq;

const MEMORY: u32 = 19456;
const PASSES: u32 = 2;
const PARALLELISM: u32 = 1;
static ACTIVE: AtomicUsize = AtomicUsize::new(0);

// Node's `Buffer.toString('base64')` without its padding, and `Buffer.from(…, 'base64')`,
// which ignores a last character's unused bits.
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &STANDARD,
    GeneralPurposeConfig::new()
        .with_encode_padding(false)
        .with_decode_allow_trailing_bits(true)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

/// What a verifier proved: the password, and whether it was a legacy bcrypt one.
#[derive(Debug)]
pub struct Verified {
    pub ok: bool,
    pub legacy: bool,
}

// A UTF-8 text of 4 KiB at most (a JSON string holds no lone surrogate once parsed).
fn bounded(password: &str) -> Result<&str, String> {
    if password.len() > 4096 {
        return Err("auth_password_invalid".into());
    }
    Ok(password)
}

fn required(password: Option<&JsonValue>) -> Result<&str, String> {
    bounded(
        password
            .and_then(JsonValue::as_str)
            .ok_or("auth_password_invalid")?,
    )
}

async fn derive(
    password: &str,
    salt: Vec<u8>,
    memory: u32,
    passes: u32,
    parallelism: u32,
) -> Result<[u8; 32], String> {
    if ACTIVE.fetch_add(1, Ordering::SeqCst) >= 2 {
        ACTIVE.fetch_sub(1, Ordering::SeqCst);
        return Err("auth_rate_limited".into());
    }
    let password = password.to_string();
    let derived = tokio::task::spawn_blocking(move || {
        let params = Params::new(memory, passes, parallelism, Some(32))
            .map_err(|_| "auth_argon2_unavailable".to_string())?;
        let mut tag = [0u8; 32];
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
            .hash_password_into(password.as_bytes(), &salt, &mut tag)
            .map_err(|_| "auth_argon2_unavailable".to_string())?;
        Ok(tag)
    })
    .await;
    ACTIVE.fetch_sub(1, Ordering::SeqCst);
    derived.map_err(|error| error.to_string())?
}

/// `hashPassword`: 15 characters at least, unless a legacy credential is being upgraded.
pub async fn hash(password: &str, legacy_upgrade: bool) -> Result<String, String> {
    bounded(password)?;
    if !legacy_upgrade && password.chars().count() < 15 {
        return Err("auth_password_too_short".into());
    }
    let mut salt = [0u8; 16];
    SystemRandom::new()
        .fill(&mut salt)
        .map_err(|_| "auth_random_unavailable".to_string())?;
    let tag = derive(password, salt.to_vec(), MEMORY, PASSES, PARALLELISM).await?;
    Ok(format!(
        "$argon2id$v=19$m={MEMORY},t={PASSES},p={PARALLELISM}${}${}",
        BASE64.encode(salt),
        BASE64.encode(tag)
    ))
}

fn in_alphabet(text: &str, length: usize, extra: &[u8]) -> bool {
    text.len() == length
        && text
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || extra.contains(&byte))
}

/// `/^\$2[aby]\$/`: a legacy bcrypt verifier.
pub fn legacy(verifier: &str) -> bool {
    verifier.starts_with("$2")
        && matches!(verifier.as_bytes().get(2), Some(b'a' | b'b' | b'y'))
        && verifier.as_bytes().get(3) == Some(&b'$')
}

// `/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`.
fn bcrypt_shaped(encoded: &str) -> bool {
    let bytes = encoded.as_bytes();
    bytes.len() == 60
        && legacy(encoded)
        && bytes[4..6].iter().all(u8::is_ascii_digit)
        && bytes[6] == b'$'
        && in_alphabet(&encoded[7..], 53, b"./")
}

// `/^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/`.
fn argon2_parts(encoded: &str) -> Option<([u64; 3], &str, &str)> {
    let rest = encoded.strip_prefix("$argon2id$v=19$m=")?;
    let mut parts = rest.split('$');
    let (cost, salt, tag) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() || !in_alphabet(salt, 22, b"+/") || !in_alphabet(tag, 43, b"+/") {
        return None;
    }
    let (memory, cost) = cost.split_once(",t=")?;
    let (passes, parallelism) = cost.split_once(",p=")?;
    let number = |digits: &str| -> Option<u64> {
        if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        // Beyond u64 the value is out of every accepted range anyway.
        Some(digits.parse().unwrap_or(u64::MAX))
    };
    Some((
        [number(memory)?, number(passes)?, number(parallelism)?],
        salt,
        tag,
    ))
}

/// `verifyPassword(password, encoded)`.
pub async fn verify(password: Option<&JsonValue>, encoded: &str) -> Result<Verified, String> {
    let password = required(password)?;
    if bcrypt_shaped(encoded) {
        // bcrypt cannot prove any suffix beyond 72 bytes. Do not authenticate a truncated
        // input or silently choose its replacement credential.
        if password.len() > 72 {
            return Ok(Verified {
                ok: false,
                legacy: true,
            });
        }
        let (password, encoded) = (password.to_string(), encoded.to_string());
        let ok = tokio::task::spawn_blocking(move || bcrypt::verify(password, &encoded))
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?;
        return Ok(Verified { ok, legacy: true });
    }
    let refused = Verified {
        ok: false,
        legacy: false,
    };
    let Some(([memory, passes, parallelism], salt, tag)) = argon2_parts(encoded) else {
        return Ok(refused);
    };
    if !(u64::from(MEMORY)..=65536).contains(&memory)
        || !(u64::from(PASSES)..=6).contains(&passes)
        || !(1..=4).contains(&parallelism)
    {
        return Ok(refused);
    }
    let decode = |text: &str| BASE64.decode(text).map_err(|error| error.to_string());
    let actual = derive(
        password,
        decode(salt)?,
        memory as u32,
        passes as u32,
        parallelism as u32,
    )
    .await?;
    Ok(Verified {
        ok: actual.ct_eq(&decode(tag)?).into(),
        legacy: false,
    })
}

/// `screenPassword`: the operator-maintained SHA-256 blocklist
/// (`AUTH_PASSWORD_BLOCKLIST_PATH`), required.
pub async fn screen(password: &str) -> Result<(), String> {
    bounded(password)?;
    if password.chars().count() < 15 {
        return Err("auth_password_too_short".into());
    }
    let unavailable = || "auth_password_screening_unavailable".to_string();
    let path = std::env::var("AUTH_PASSWORD_BLOCKLIST_PATH")
        .ok()
        .filter(|path| !path.is_empty())
        .ok_or_else(unavailable)?;
    let contents = tokio::fs::read_to_string(path)
        .await
        .map_err(|_| unavailable())?;
    // `split(/\r?\n/).filter(Boolean)`.
    let hashes: Vec<&str> = contents
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .filter(|line| !line.is_empty())
        .collect();
    let hex64 = |hash: &&str| {
        hash.len() == 64
            && hash
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    };
    if hashes.is_empty() || !hashes.iter().all(hex64) {
        return Err(unavailable());
    }
    let candidate = super::proof::digest(password);
    if hashes.contains(&candidate.as_str()) {
        return Err("auth_password_compromised".into());
    }
    Ok(())
}

/// `authPasswordRequestDigest(password, currentPassword)`
/// (atome/src/shared/auth_link_contract.js): what a `set-password` signature binds.
pub fn request_digest(password: Option<&JsonValue>, current: &JsonValue) -> Result<String, String> {
    let (Some(JsonValue::String(password)), JsonValue::String(current)) = (password, current)
    else {
        return Err("auth_password_invalid".into());
    };
    Ok(super::proof::digest(
        &json!(["atome.password.set.v1", password, current]).to_string(),
    ))
}
