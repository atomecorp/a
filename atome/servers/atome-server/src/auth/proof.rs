// The proof security of the account system (server/auth_link_security.js, ported): the
// keys derived from the server's master secret (`JWT_SECRET`) — a keyed index of a
// phone number and its sealed copy —, the security audit, the send limits, and the
// device challenges a proof consumes once: an ECDSA P-256 signature over the
// versioned signing message (atome/src/shared/auth_link_contract.js), by the
// device key a request names. Every write runs on the caller's connection, inside
// its transaction.
use super::AUTH_LINK_ORIGIN;
use crate::vault_router::js;
use base64::Engine;
use base64::alphabet::URL_SAFE;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::agreement::{self, ECDH_P256, EphemeralPrivateKey};
use ring::hkdf::{HKDF_SHA256, Salt};
use ring::hmac;
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{ECDSA_P256_SHA256_ASN1, ECDSA_P256_SHA256_FIXED, UnparsedPublicKey};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};

pub const AUTH_LINK_PROTOCOL: &str = "atome.phone-link.v1";
const CHALLENGE_TTL_MS: i64 = 60_000;
const AUDIT_KEPT_MS: i64 = 180 * 86_400_000;

// Node's `Buffer.from(text, 'base64url')`: padding optional, stray trailing bits kept quiet.
const BASE64URL: GeneralPurpose = GeneralPurpose::new(
    &URL_SAFE,
    GeneralPurposeConfig::new()
        .with_encode_padding(false)
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

pub fn base64url(bytes: &[u8]) -> String {
    BASE64URL.encode(bytes)
}

pub fn digest(value: &str) -> String {
    hex(&Sha256::digest(value.as_bytes()))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn base64url_text(value: &str, length: std::ops::RangeInclusive<usize>) -> bool {
    length.contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// `requireHandle`: a 32-byte random handle, as base64url text.
pub fn require_handle(value: &JsonValue) -> Result<&str, String> {
    value
        .as_str()
        .filter(|text| base64url_text(text, 43..=43))
        .ok_or_else(|| "auth_request_invalid".to_string())
}

/// A device's public key: its canonical JWK, its id (the digest of that JWK) and its point.
pub struct DeviceKey {
    pub jwk: JsonValue,
    pub key_id: String,
    point: Vec<u8>,
}

/// `publicDeviceKey`: a public P-256 JWK, checked on the curve.
pub fn public_device_key(value: &JsonValue) -> Result<DeviceKey, String> {
    let invalid = || "auth_key_invalid".to_string();
    let coordinate = |name: &str| {
        value
            .get(name)
            .and_then(JsonValue::as_str)
            .filter(|text| base64url_text(text, 43..=43))
    };
    let (Some(x), Some(y)) = (coordinate("x"), coordinate("y")) else {
        return Err(invalid());
    };
    if value.get("kty").and_then(JsonValue::as_str) != Some("EC")
        || value.get("crv").and_then(JsonValue::as_str) != Some("P-256")
        || value.get("d").is_some()
    {
        return Err(invalid());
    }
    // Node's `createPublicKey` refuses a point off the curve; an ECDH agreement with it does too.
    let point = curve_point(x, y).ok_or_else(invalid)?;
    let random = SystemRandom::new();
    let ephemeral = EphemeralPrivateKey::generate(&ECDH_P256, &random).map_err(|_| invalid())?;
    agreement::agree_ephemeral(
        ephemeral,
        &agreement::UnparsedPublicKey::new(&ECDH_P256, &point),
        |_| (),
    )
    .map_err(|_| invalid())?;
    let jwk = json!({ "kty": "EC", "crv": "P-256", "x": x, "y": y });
    let key_id = digest(&jwk.to_string());
    Ok(DeviceKey { jwk, key_id, point })
}

// The uncompressed SEC1 point `04 || x || y`.
fn curve_point(x: &str, y: &str) -> Option<Vec<u8>> {
    let (x, y) = (BASE64URL.decode(x).ok()?, BASE64URL.decode(y).ok()?);
    (x.len() == 32 && y.len() == 32).then(|| [&[4u8][..], &x, &y].concat())
}

/// `authSigningMessage`: the domain-separated input a device signs.
pub fn signing_message(
    purpose: &str,
    reference: &str,
    challenge: &str,
    nonce: &str,
    key_id: &str,
    issued_ms: i64,
) -> String {
    json!([
        AUTH_LINK_PROTOCOL,
        AUTH_LINK_ORIGIN,
        purpose,
        reference,
        challenge,
        nonce,
        key_id,
        issued_ms
    ])
    .to_string()
}

/// `backupKeysOf`: the account's backup keys as a device carries them, opaque here
/// (a sealed box: version 1, an iv and its data); None when none is carried.
pub fn backup_keys_of(value: Option<&JsonValue>) -> Result<Option<String>, String> {
    let Some(value) = value.filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let text = value
        .as_str()
        .filter(|text| text.encode_utf16().count() <= 16384);
    let sealed = text
        .and_then(|text| serde_json::from_str::<JsonValue>(text).ok())
        .is_some_and(|box_| {
            box_.get("version").and_then(JsonValue::as_f64) == Some(1.0)
                && box_.get("iv").is_some_and(JsonValue::is_string)
                && box_.get("data").is_some_and(JsonValue::is_string)
        });
    match text {
        Some(text) if sealed => Ok(Some(text.to_string())),
        _ => Err("auth_request_invalid".into()),
    }
}

/// What an approval binds carried backup keys to (the client computes the same).
pub fn backup_keys_digest(value: Option<&str>) -> String {
    value.map_or_else(|| "-".to_string(), digest)
}

/// `crypto.randomInt(bound)`: uniform, by rejection.
pub fn random_below(random: &SystemRandom, bound: u32) -> u32 {
    let limit = u32::MAX - u32::MAX % bound;
    loop {
        let mut bytes = [0u8; 4];
        random.fill(&mut bytes).expect("system randomness");
        let value = u32::from_le_bytes(bytes);
        if value < limit {
            return value % bound;
        }
    }
}

pub struct Proof {
    seal: LessSafeKey,
    index: hmac::Key,
    random: SystemRandom,
}

impl Proof {
    /// `createAuthProofSecurity`: refused (`auth_secret_required`) under 32 characters.
    pub fn new(master_secret: &str) -> Result<Self, String> {
        if master_secret.encode_utf16().count() < 32 {
            return Err("auth_secret_required".into());
        }
        let prk = Salt::new(HKDF_SHA256, b"atome-auth-v1").extract(master_secret.as_bytes());
        let one_block = "HKDF output of one block";
        let seal = LessSafeKey::new(UnboundKey::from(
            prk.expand(&[b"phone-encryption"], &AES_256_GCM)
                .expect(one_block),
        ));
        let index = hmac::Key::from(
            prk.expand(&[b"phone-lookup"], hmac::HMAC_SHA256)
                .expect(one_block),
        );
        Ok(Self {
            seal,
            index,
            random: SystemRandom::new(),
        })
    }

    pub fn random_handle(&self) -> String {
        let mut bytes = [0u8; 32];
        self.random.fill(&mut bytes).expect("system randomness");
        base64url(&bytes)
    }

    pub fn random_int(&self, bound: u32) -> u32 {
        random_below(&self.random, bound)
    }

    pub fn keyed_index(&self, value: &str) -> String {
        hex(hmac::sign(&self.index, value.as_bytes()).as_ref())
    }

    /// `iv (12) | tag (16) | ciphertext`, base64url.
    pub fn seal_phone(&self, phone: &str) -> String {
        let mut iv = [0u8; 12];
        self.random.fill(&mut iv).expect("system randomness");
        let mut ciphertext = phone.as_bytes().to_vec();
        let tag = self
            .seal
            .seal_in_place_separate_tag(
                Nonce::assume_unique_for_key(iv),
                Aad::empty(),
                &mut ciphertext,
            )
            .expect("AES-GCM sealing");
        base64url(&[&iv[..], tag.as_ref(), &ciphertext].concat())
    }

    pub fn open_phone(&self, sealed: &str) -> Result<String, String> {
        let invalid = || "auth_phone_unreadable".to_string();
        let bytes = BASE64URL.decode(sealed).map_err(|_| invalid())?;
        if bytes.len() < 28 {
            return Err(invalid());
        }
        let iv: [u8; 12] = bytes[..12].try_into().map_err(|_| invalid())?;
        let mut opened = [&bytes[28..], &bytes[12..28]].concat();
        let plain = self
            .seal
            .open_in_place(Nonce::assume_unique_for_key(iv), Aad::empty(), &mut opened)
            .map_err(|_| invalid())?;
        String::from_utf8(plain.to_vec()).map_err(|_| invalid())
    }

    pub fn audit(
        &self,
        db: &Connection,
        event: &str,
        principal: Option<&str>,
        reference: Option<&str>,
        now: i64,
    ) -> Result<(), String> {
        db.execute(
            "INSERT INTO auth_security_events VALUES (?, ?, ?, ?, ?)",
            params![self.random_handle(), principal, event, reference, now],
        )
        .map(drop)
        .map_err(|e| e.to_string())
    }

    /// One more send in `bucket`'s window; refused (`auth_rate_limited`) past `maximum`.
    pub fn limit(
        db: &Connection,
        bucket: &str,
        maximum: i64,
        window_ms: i64,
        now: i64,
    ) -> Result<(), String> {
        db.execute(
            "INSERT INTO auth_send_limits VALUES (?, 1, ?)
             ON CONFLICT(bucket) DO UPDATE SET
             count = CASE WHEN reset_ms <= ? THEN 1 ELSE count + 1 END,
             reset_ms = CASE WHEN reset_ms <= ? THEN excluded.reset_ms ELSE reset_ms END",
            params![bucket, now + window_ms, now, now],
        )
        .map_err(|e| e.to_string())?;
        let count: i64 = db
            .query_row(
                "SELECT count FROM auth_send_limits WHERE bucket = ?",
                [bucket],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if count > maximum {
            return Err("auth_rate_limited".into());
        }
        Ok(())
    }

    /// A fresh challenge bound to purpose, reference and key, for a minute.
    pub fn challenge(
        &self,
        db: &Connection,
        purpose: &str,
        reference: &str,
        key_id: &str,
        client_nonce: Option<&JsonValue>,
        now: i64,
    ) -> Result<JsonValue, String> {
        let nonce = match client_nonce.filter(|nonce| js::truthy(Some(nonce))) {
            Some(client) => format!("{}:{}", self.random_handle(), require_handle(client)?),
            None => self.random_handle(),
        };
        let challenge = self.random_handle();
        db.execute(
            "INSERT INTO auth_device_challenges VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
            params![
                challenge,
                purpose,
                reference,
                key_id,
                nonce,
                now,
                now + CHALLENGE_TTL_MS
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(
            json!({ "purpose": purpose, "reference": reference, "keyId": key_id,
            "challenge": challenge, "nonce": nonce, "issuedAt": now }),
        )
    }

    /// The challenge consumed once by a proof `verify` makes over its signing message.
    pub fn consume_challenge<T>(
        db: &Connection,
        challenge_id: &JsonValue,
        purpose: &str,
        reference: &str,
        key_id: &str,
        now: i64,
        verify: impl FnOnce(&[u8]) -> Result<T, String>,
    ) -> Result<T, String> {
        let invalid = || "auth_proof_invalid".to_string();
        let challenge_id = require_handle(challenge_id)?;
        let row = db
            .query_row(
                "SELECT purpose, reference_id, key_id, nonce, issued_ms, expires_ms, consumed_ms
                 FROM auth_device_challenges WHERE challenge_id = ?",
                [challenge_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, Option<i64>>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((stored_purpose, stored_reference, stored_key, nonce, issued, expires, consumed)) =
            row
        else {
            return Err(invalid());
        };
        if consumed.is_some()
            || expires <= now
            || stored_purpose != purpose
            || stored_reference != reference
            || stored_key != key_id
        {
            return Err(invalid());
        }
        let message = signing_message(purpose, reference, challenge_id, &nonce, key_id, issued);
        let outcome = verify(message.as_bytes())?;
        let changed = db
            .execute(
                "UPDATE auth_device_challenges SET consumed_ms = ?
                 WHERE challenge_id = ? AND consumed_ms IS NULL",
                params![now, challenge_id],
            )
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err(invalid());
        }
        Ok(outcome)
    }

    /// `consumeProof({ challengeId, signature }, purpose, reference, publicKey)`.
    pub fn consume_proof(
        db: &Connection,
        proof: &JsonValue,
        purpose: &str,
        reference: &str,
        public_key: &JsonValue,
        now: i64,
    ) -> Result<(), String> {
        let signed = proof
            .get("signature")
            .and_then(JsonValue::as_str)
            .is_some_and(|text| base64url_text(text, 86..=96));
        if !signed {
            return Err("auth_proof_invalid".into());
        }
        let key = public_device_key(public_key)?;
        Self::consume_signed(db, proof, purpose, reference, &key.key_id, &key, now)
    }

    /// The challenge `proof.challengeId`, issued to `challenge_key` (the signer itself, or
    /// the session key a new approve key is bound to), consumed by `key`'s signature.
    pub fn consume_signed(
        db: &Connection,
        proof: &JsonValue,
        purpose: &str,
        reference: &str,
        challenge_key: &str,
        key: &DeviceKey,
        now: i64,
    ) -> Result<(), String> {
        let signature = proof
            .get("signature")
            .and_then(JsonValue::as_str)
            .unwrap_or_default();
        let challenge_id = proof.get("challengeId").unwrap_or(&JsonValue::Null);
        Self::consume_challenge(
            db,
            challenge_id,
            purpose,
            reference,
            challenge_key,
            now,
            |message| {
                let encoded = node_base64url(signature);
                // 64 bytes is IEEE P1363 (r || s), anything else DER, as Node reads it.
                let algorithm = if encoded.len() == 64 {
                    &ECDSA_P256_SHA256_FIXED
                } else {
                    &ECDSA_P256_SHA256_ASN1
                };
                UnparsedPublicKey::new(algorithm, &key.point)
                    .verify(message, &encoded)
                    .map_err(|_| "auth_proof_invalid".to_string())
            },
        )
    }

    pub fn cleanup(db: &Connection, now: i64) -> Result<(), String> {
        let swept = || -> rusqlite::Result<()> {
            db.execute(
                "DELETE FROM auth_device_challenges WHERE expires_ms <= ?",
                [now],
            )?;
            db.execute(
                "DELETE FROM auth_phone_changes WHERE attempt_id IN
                     (SELECT attempt_id FROM auth_link_attempts WHERE expires_ms <= ?)",
                [now],
            )?;
            db.execute(
                "DELETE FROM auth_link_attempts WHERE expires_ms <= ?",
                [now],
            )?;
            db.execute("DELETE FROM auth_send_limits WHERE reset_ms <= ?", [now])?;
            db.execute(
                "DELETE FROM auth_security_events WHERE created_ms < ?",
                [now - AUDIT_KEPT_MS],
            )?;
            db.execute(
                "UPDATE auth_pair_requests SET state = 'expired'
                     WHERE expires_ms <= ? AND state IN ('pending', 'approved')",
                [now],
            )?;
            db.execute(
                "DELETE FROM auth_pair_requests WHERE expires_ms <= ?",
                [now - 86_400_000],
            )?;
            db.execute(
                "UPDATE auth_recovery_requests SET state = 'expired'
                     WHERE expires_ms <= ? AND state = 'pending'",
                [now],
            )?;
            Ok(())
        };
        swept().map_err(|e| e.to_string())
    }
}

// Node decodes a base64url text of 4n+1 characters by dropping its lone last one.
fn node_base64url(text: &str) -> Vec<u8> {
    let usable = if text.len() % 4 == 1 {
        &text[..text.len() - 1]
    } else {
        text
    };
    BASE64URL.decode(usable).unwrap_or_default()
}
