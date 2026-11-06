// The internal WebAuthn verifier (server/auth_webauthn.js, ported; no external
// dependency): ES256 and RS256 credentials, `none` and self `packed` attestation,
// user verification always required. The WebAuthn challenge is the SHA-256 of the
// existing signing message, so every approval reuses the purpose-bound, single-use
// challenge table.
use super::proof::{base64url, digest};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ring::signature::{
    ECDSA_P256_SHA256_ASN1, RSA_PKCS1_2048_8192_SHA256, RsaPublicKeyComponents, UnparsedPublicKey,
};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};

const FLAG_UP: u8 = 0x01;
const FLAG_UV: u8 = 0x04;
const FLAG_AT: u8 = 0x40;

fn invalid() -> String {
    "auth_webauthn_invalid".into()
}

fn rejected() -> String {
    "auth_webauthn_rejected".into()
}

/// The relying party: a fixed RP ID and an allow-list of origins from the
/// environment. Development may name `http://localhost:*`.
pub struct Config {
    rp_id: String,
    origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let setting = |name: &str| std::env::var(name).ok().filter(|value| !value.is_empty());
        let production = setting("NODE_ENV").as_deref() == Some("production");
        let rp_id = setting("SQUIRREL_WEBAUTHN_RP_ID")
            .unwrap_or_else(|| (if production { "atome.one" } else { "localhost" }).into());
        let origins: Vec<String> = setting("SQUIRREL_WEBAUTHN_ORIGINS")
            .unwrap_or_else(|| {
                (if production {
                    "https://atome.one"
                } else {
                    "http://localhost:*"
                })
                .into()
            })
            .split(',')
            .map(|origin| crate::vault_router::js::trim(origin).to_string())
            .filter(|origin| !origin.is_empty())
            .collect();
        if production && origins.iter().any(|origin| origin.ends_with(":*")) {
            return Err("auth_webauthn_origin_pattern_forbidden_in_production".into());
        }
        Ok(Self {
            rp_id: crate::vault_router::js::trim(&rp_id).to_string(),
            origins,
        })
    }

    fn allows(&self, origin: &str) -> bool {
        self.origins
            .iter()
            .any(|allowed| match allowed.strip_suffix(":*") {
                Some(prefix) => origin
                    .strip_prefix(prefix)
                    .and_then(|rest| rest.strip_prefix(':'))
                    .is_some_and(|port| {
                        (1..=5).contains(&port.len())
                            && port.bytes().all(|byte| byte.is_ascii_digit())
                    }),
                None => origin == allowed,
            })
    }
}

/// A CBOR (RFC 8949) item of an attestation object or a COSE key.
#[derive(Clone, Debug, PartialEq)]
pub enum Cbor {
    Integer(i64),
    Bytes(Vec<u8>),
    Text(String),
    Array(Vec<Cbor>),
    Map(Vec<(Cbor, Cbor)>),
    Bool(bool),
    Null,
}

impl Cbor {
    // `map.get(key)`: the last value set for that key.
    fn get(&self, key: &Cbor) -> Option<&Cbor> {
        match self {
            Cbor::Map(entries) => entries.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    fn int(&self, key: i64) -> Option<&Cbor> {
        self.get(&Cbor::Integer(key))
    }

    fn text(&self, key: &str) -> Option<&Cbor> {
        self.get(&Cbor::Text(key.into()))
    }

    fn bytes(&self) -> Option<&[u8]> {
        match self {
            Cbor::Bytes(bytes) => Some(bytes),
            _ => None,
        }
    }
}

// Minimal decoder: one item at `offset`, and where it ends.
fn decode(buffer: &[u8], offset: usize, depth: usize) -> Result<(Cbor, usize), String> {
    if depth > 8 || offset >= buffer.len() {
        return Err(invalid());
    }
    let initial = buffer[offset];
    let (major, info) = (initial >> 5, initial & 0x1f);
    let mut position = offset + 1;
    let read = |position: usize, width: usize| -> Result<u64, String> {
        let bytes = buffer
            .get(position..position + width)
            .ok_or("ERR_OUT_OF_RANGE")?;
        Ok(bytes
            .iter()
            .fold(0u64, |value, byte| (value << 8) | u64::from(*byte)))
    };
    let length = match info {
        0..=23 => u64::from(info),
        24..=26 => {
            let width = 1usize << (info - 24);
            let value = read(position, width)?;
            position += width;
            value
        }
        _ => return Err(invalid()),
    };
    match major {
        0 => Ok((Cbor::Integer(length as i64), position)),
        1 => Ok((Cbor::Integer(-1 - length as i64), position)),
        2 | 3 => {
            let end = position + length as usize;
            let slice = buffer.get(position..end).ok_or_else(invalid)?;
            let item = if major == 2 {
                Cbor::Bytes(slice.to_vec())
            } else {
                Cbor::Text(String::from_utf8_lossy(slice).into_owned())
            };
            Ok((item, end))
        }
        4 => {
            let mut items = Vec::new();
            for _ in 0..length {
                let (item, end) = decode(buffer, position, depth + 1)?;
                items.push(item);
                position = end;
            }
            Ok((Cbor::Array(items), position))
        }
        5 => {
            let mut entries = Vec::new();
            for _ in 0..length {
                let (key, end) = decode(buffer, position, depth + 1)?;
                let (value, end) = decode(buffer, end, depth + 1)?;
                entries.push((key, value));
                position = end;
            }
            Ok((Cbor::Map(entries), position))
        }
        7 if (20..=22).contains(&info) => Ok((
            [Cbor::Bool(false), Cbor::Bool(true), Cbor::Null][usize::from(info - 20)].clone(),
            position,
        )),
        _ => Err(invalid()),
    }
}

/// A credential's public key, as its JWK.
pub enum CredentialKey {
    Ec { x: Vec<u8>, y: Vec<u8> },
    Rsa { n: Vec<u8>, e: Vec<u8> },
}

impl CredentialKey {
    pub fn jwk(&self) -> JsonValue {
        match self {
            CredentialKey::Ec { x, y } => {
                json!({ "kty": "EC", "crv": "P-256", "x": base64url(x), "y": base64url(y) })
            }
            CredentialKey::Rsa { n, e } => {
                json!({ "kty": "RSA", "n": base64url(n), "e": base64url(e) })
            }
        }
    }

    fn of_jwk(jwk: &JsonValue) -> Result<Self, String> {
        let part = |name: &str| {
            jwk.get(name)
                .and_then(JsonValue::as_str)
                .and_then(|text| URL_SAFE_NO_PAD.decode(text.trim_end_matches('=')).ok())
                .ok_or("auth_key_invalid")
        };
        match jwk.get("kty").and_then(JsonValue::as_str) {
            Some("EC") => Ok(CredentialKey::Ec {
                x: part("x")?,
                y: part("y")?,
            }),
            Some("RSA") => Ok(CredentialKey::Rsa {
                n: part("n")?,
                e: part("e")?,
            }),
            _ => Err("auth_key_invalid".into()),
        }
    }

    // `crypto.verify('sha256', signed, key, signature)`: DER ECDSA, or PKCS #1 v1.5.
    fn verifies(&self, signed: &[u8], signature: &[u8]) -> bool {
        match self {
            CredentialKey::Ec { x, y } => {
                UnparsedPublicKey::new(&ECDSA_P256_SHA256_ASN1, [&[4u8][..], x, y].concat())
                    .verify(signed, signature)
                    .is_ok()
            }
            CredentialKey::Rsa { n, e } => {
                let strip = |bytes: &[u8]| -> Vec<u8> {
                    bytes
                        .iter()
                        .skip_while(|byte| **byte == 0)
                        .copied()
                        .collect()
                };
                RsaPublicKeyComponents {
                    n: strip(n),
                    e: strip(e),
                }
                .verify(&RSA_PKCS1_2048_8192_SHA256, signed, signature)
                .is_ok()
            }
        }
    }
}

// ES256 (P-256) and RS256 (RSASSA-PKCS1-v1_5, used by Windows Hello).
fn cose_key(cose: &Cbor) -> Result<CredentialKey, String> {
    if !matches!(cose, Cbor::Map(_)) {
        return Err(invalid());
    }
    let is = |key: i64, value: i64| cose.int(key) == Some(&Cbor::Integer(value));
    if is(1, 2) && is(3, -7) && is(-1, 1) {
        let (Some(x), Some(y)) = (
            cose.int(-2).and_then(Cbor::bytes),
            cose.int(-3).and_then(Cbor::bytes),
        ) else {
            return Err(invalid());
        };
        if x.len() != 32 || y.len() != 32 {
            return Err(invalid());
        }
        let key = CredentialKey::Ec {
            x: x.to_vec(),
            y: y.to_vec(),
        };
        // Node's `createPublicKey` refuses a point off the curve.
        super::proof::public_device_key(&key.jwk())?;
        return Ok(key);
    }
    if is(1, 3) && is(3, -257) {
        let (Some(n), Some(e)) = (
            cose.int(-1).and_then(Cbor::bytes),
            cose.int(-2).and_then(Cbor::bytes),
        ) else {
            return Err(invalid());
        };
        if n.len() < 256 || e.len() > 8 {
            return Err(invalid());
        }
        return Ok(CredentialKey::Rsa {
            n: n.to_vec(),
            e: e.to_vec(),
        });
    }
    Err("auth_webauthn_algorithm_unsupported".into())
}

struct AuthenticatorData {
    rp_id_hash: Vec<u8>,
    flags: u8,
    sign_count: u32,
    credential: Option<(String, CredentialKey)>,
}

fn authenticator_data(data: &[u8], require_credential: bool) -> Result<AuthenticatorData, String> {
    if data.len() < 37 {
        return Err(invalid());
    }
    let flags = data[32];
    let sign_count = u32::from_be_bytes([data[33], data[34], data[35], data[36]]);
    let credential = if require_credential {
        if flags & FLAG_AT == 0 || data.len() < 55 {
            return Err(invalid());
        }
        let id_length = usize::from(u16::from_be_bytes([data[53], data[54]]));
        let id = &data[55..(55 + id_length).min(data.len())];
        if id.len() != id_length || !(16..=1023).contains(&id_length) {
            return Err(invalid());
        }
        let (cose, _) = decode(data, 55 + id_length, 0)?;
        Some((base64url(id), cose_key(&cose)?))
    } else {
        None
    };
    Ok(AuthenticatorData {
        rp_id_hash: data[..32].to_vec(),
        flags,
        sign_count,
        credential,
    })
}

// `bytesOf`: base64url text of 16 KiB at most.
fn bytes_of(value: Option<&JsonValue>) -> Result<Vec<u8>, String> {
    let text = value
        .and_then(JsonValue::as_str)
        .filter(|text| {
            !text.is_empty()
                && text.len() <= 16384
                && text
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        })
        .ok_or_else(invalid)?;
    let usable = if text.len() % 4 == 1 {
        &text[..text.len() - 1]
    } else {
        text
    };
    base64::engine::GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        base64::engine::GeneralPurposeConfig::new()
            .with_decode_padding_mode(base64::engine::DecodePaddingMode::Indifferent)
            .with_decode_allow_trailing_bits(true),
    )
    .decode(usable)
    .map_err(|_| invalid())
}

fn sha256(bytes: &[u8]) -> Vec<u8> {
    Sha256::digest(bytes).to_vec()
}

fn check_client_data(
    client_data: &[u8],
    kind: &str,
    message: &[u8],
    config: &Config,
) -> Result<(), String> {
    let parsed: JsonValue = serde_json::from_slice(client_data).map_err(|_| invalid())?;
    let origin = parsed.get("origin").and_then(JsonValue::as_str);
    let valid = parsed.get("type").and_then(JsonValue::as_str) == Some(kind)
        && parsed.get("challenge").and_then(JsonValue::as_str)
            == Some(base64url(&sha256(message)).as_str())
        && origin.is_some_and(|origin| config.allows(origin));
    if valid { Ok(()) } else { Err(rejected()) }
}

fn check_flags(parsed: &AuthenticatorData, config: &Config) -> Result<(), String> {
    if parsed.rp_id_hash != sha256(config.rp_id.as_bytes()) {
        return Err(rejected());
    }
    if parsed.flags & FLAG_UP == 0 || parsed.flags & FLAG_UV == 0 {
        return Err("auth_user_verification_required".into());
    }
    Ok(())
}

/// A registered credential: its id, its key (as a JWK), its counter.
pub struct Registered {
    pub credential_id: String,
    pub jwk: JsonValue,
    pub key_id: String,
    pub sign_count: u32,
}

pub fn verify_registration(
    input: &JsonValue,
    message: &[u8],
    config: &Config,
) -> Result<Registered, String> {
    let client_data = bytes_of(input.get("clientDataJSON"))?;
    check_client_data(&client_data, "webauthn.create", message, config)?;
    let (attestation, _) = decode(&bytes_of(input.get("attestationObject"))?, 0, 0)?;
    let auth_data = match (&attestation, attestation.text("authData")) {
        (Cbor::Map(_), Some(Cbor::Bytes(bytes))) => bytes.clone(),
        _ => return Err(invalid()),
    };
    let parsed = authenticator_data(&auth_data, true)?;
    check_flags(&parsed, config)?;
    let (credential_id, key) = parsed.credential.ok_or_else(invalid)?;
    match attestation.text("fmt") {
        Some(Cbor::Text(format)) if format == "packed" => {
            // Self attestation only: no trust chain is evaluated in V1.
            let statement = attestation.text("attStmt");
            let algorithm = if matches!(key, CredentialKey::Rsa { .. }) {
                -257
            } else {
                -7
            };
            let signature = statement
                .and_then(|statement| statement.text("sig"))
                .and_then(Cbor::bytes);
            let self_attested = statement.is_some_and(|statement| {
                matches!(statement, Cbor::Map(_))
                    && statement.text("x5c").is_none()
                    && statement.text("alg") == Some(&Cbor::Integer(algorithm))
            });
            let Some(signature) = signature.filter(|_| self_attested) else {
                return Err("auth_webauthn_attestation_unsupported".into());
            };
            let signed = [&auth_data[..], &sha256(&client_data)].concat();
            if !key.verifies(&signed, signature) {
                return Err(rejected());
            }
        }
        Some(Cbor::Text(format)) if format == "none" => {}
        _ => return Err("auth_webauthn_attestation_unsupported".into()),
    }
    let jwk = key.jwk();
    Ok(Registered {
        credential_id,
        key_id: digest(&jwk.to_string()),
        jwk,
        sign_count: parsed.sign_count,
    })
}

/// An assertion of the approve key `key` (its stored row); its new counter.
pub fn verify_assertion(
    input: &JsonValue,
    message: &[u8],
    key: &JsonValue,
    config: &Config,
) -> Result<u32, String> {
    if input.get("credentialId") != key.get("credential_id") {
        return Err(rejected());
    }
    let client_data = bytes_of(input.get("clientDataJSON"))?;
    check_client_data(&client_data, "webauthn.get", message, config)?;
    let auth_data = bytes_of(input.get("authenticatorData"))?;
    let parsed = authenticator_data(&auth_data, false)?;
    check_flags(&parsed, config)?;
    // A counter that does not move forward betrays a cloned authenticator.
    let previous = crate::vault_router::js::number_or(key.get("sign_count"), 0.0);
    let count = f64::from(parsed.sign_count);
    if (count != 0.0 || previous != 0.0) && count <= previous {
        return Err("auth_webauthn_counter_regressed".into());
    }
    let signed = [&auth_data[..], &sha256(&client_data)].concat();
    let public_key: JsonValue =
        serde_json::from_str(key["public_key"].as_str().unwrap_or_default())
            .map_err(|e| e.to_string())?;
    if !CredentialKey::of_jwk(&public_key)?.verifies(&signed, &bytes_of(input.get("signature"))?) {
        return Err(rejected());
    }
    Ok(parsed.sign_count)
}
