// The server's identity (server/serverIdentity.js, ported): an RSA key pair named by
// `SERVER_PRIVATE_KEY_PATH` / `SERVER_PUBLIC_KEY_PATH` (read from the project root),
// whose public half's fingerprint is the SHA-256 of its SPKI DER. A client challenges
// the server (`POST /api/server/verify`) and checks the RSA-PSS SHA-256 signature of
// `serverId:challenge:timestamp:nonce` with the public key. Without both files, or with
// a pair that does not match, the server has no signing capability.
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{KeyPair, RSA_PSS_SHA256, RsaKeyPair};
use serde_json::{Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::path::Path;

pub const ALGORITHM: &str = "RSA-PSS-SHA256";

struct Signing {
    key: RsaKeyPair,
    public_pem: String,
    fingerprint: String,
}

pub struct ServerIdentity {
    pub server_id: String,
    pub server_name: String,
    signing: Option<Signing>,
    random: SystemRandom,
}

pub(crate) fn pem_blocks(text: &str) -> Option<(String, Vec<u8>)> {
    let begin = text.find("-----BEGIN ")?;
    let rest = &text[begin + "-----BEGIN ".len()..];
    let label_end = rest.find("-----")?;
    let label = rest[..label_end].to_string();
    let body_start = label_end + 5;
    let end = rest.find(&format!("-----END {label}-----"))?;
    let body: String = rest[body_start..end]
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    Some((label, STANDARD.decode(body).ok()?))
}

// One DER element at the head of `bytes`: its tag, its content, what follows it.
pub(crate) fn der(bytes: &[u8]) -> Option<(u8, &[u8], &[u8])> {
    let (&tag, rest) = bytes.split_first()?;
    let (&first, rest) = rest.split_first()?;
    let (length, rest) = if first < 0x80 {
        (usize::from(first), rest)
    } else {
        let count = usize::from(first & 0x7f);
        if count == 0 || count > 4 || rest.len() < count {
            return None;
        }
        let length = rest[..count]
            .iter()
            .fold(0usize, |length, byte| (length << 8) | usize::from(*byte));
        (length, &rest[count..])
    };
    (rest.len() >= length).then(|| (tag, &rest[..length], &rest[length..]))
}

// The RSAPublicKey inside an SPKI: SEQUENCE { AlgorithmIdentifier, BIT STRING }.
fn spki_rsa_key(spki: &[u8]) -> Option<&[u8]> {
    let (0x30, inner, _) = der(spki)? else {
        return None;
    };
    let (0x30, _algorithm, rest) = der(inner)? else {
        return None;
    };
    let (0x03, bits, _) = der(rest)? else {
        return None;
    };
    bits.strip_prefix(&[0])
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn signing(project_root: &Path, private: &str, public: &str) -> Result<Signing, String> {
    let private_text = std::fs::read_to_string(project_root.join(private))
        .map_err(|e| format!("server_identity_private_key_unreadable:{e}"))?;
    let public_pem = std::fs::read_to_string(project_root.join(public))
        .map_err(|e| format!("server_identity_public_key_unreadable:{e}"))?;
    let (label, private_der) =
        pem_blocks(&private_text).ok_or("server_identity_private_key_invalid")?;
    let key = match label.as_str() {
        "PRIVATE KEY" => RsaKeyPair::from_pkcs8(&private_der),
        "RSA PRIVATE KEY" => RsaKeyPair::from_der(&private_der),
        _ => return Err("server_identity_private_key_invalid".into()),
    }
    .map_err(|e| format!("server_identity_private_key_invalid:{e}"))?;
    let (label, spki) = pem_blocks(&public_pem).ok_or("server_identity_public_key_invalid")?;
    if label != "PUBLIC KEY" {
        return Err("server_identity_public_key_invalid".into());
    }
    if spki_rsa_key(&spki) != Some(key.public_key().as_ref()) {
        return Err("server_identity_key_pair_mismatch".into());
    }
    Ok(Signing {
        key,
        public_pem,
        fingerprint: format!("sha256:{}", hex(&Sha256::digest(&spki))),
    })
}

impl ServerIdentity {
    /// Fastify's `initServerIdentity`: a missing or invalid pair leaves the server
    /// without signing capability, said once at start.
    pub fn load(
        project_root: &Path,
        server_id: Option<String>,
        server_name: Option<String>,
        private_path: Option<String>,
        public_path: Option<String>,
    ) -> Self {
        let signing = match (private_path, public_path) {
            (Some(private), Some(public)) => match signing(project_root, &private, &public) {
                Ok(signing) => Some(signing),
                Err(error) => {
                    eprintln!("[server-identity] signature verification disabled: {error}");
                    None
                }
            },
            _ => {
                eprintln!(
                    "[server-identity] SERVER_PRIVATE_KEY_PATH or SERVER_PUBLIC_KEY_PATH not configured: signature verification disabled"
                );
                None
            }
        };
        Self {
            server_id: server_id.unwrap_or_else(|| "squirrel-server-unknown".into()),
            server_name: server_name.unwrap_or_else(|| "Squirrel Server".into()),
            signing,
            random: SystemRandom::new(),
        }
    }

    pub fn configured(&self) -> bool {
        self.signing.is_some()
    }

    pub fn fingerprint(&self) -> Option<&str> {
        self.signing
            .as_ref()
            .map(|signing| signing.fingerprint.as_str())
    }

    /// `signChallenge(challenge)`: the signed answer, or Fastify's refusal.
    pub fn sign(&self, challenge: &str, now_ms: u64) -> Result<JsonValue, JsonValue> {
        let Some(signing) = &self.signing else {
            return Err(json!({ "success": false, "verified": false,
                "error": "Server signature not configured", "errorCode": "NO_SIGNING_CAPABILITY" }));
        };
        let failed = || json!({ "success": false, "verified": false, "error": "Signing failed", "errorCode": "SIGNING_ERROR" });
        let mut nonce = [0u8; 16];
        self.random.fill(&mut nonce).map_err(|_| failed())?;
        let nonce = hex(&nonce);
        let data = format!("{}:{challenge}:{now_ms}:{nonce}", self.server_id);
        let mut signature = vec![0u8; signing.key.public().modulus_len()];
        signing
            .key
            .sign(
                &RSA_PSS_SHA256,
                &self.random,
                data.as_bytes(),
                &mut signature,
            )
            .map_err(|_| failed())?;
        Ok(json!({
            "success": true,
            "verified": true,
            "serverId": self.server_id,
            "serverName": self.server_name,
            "challenge": challenge,
            "timestamp": now_ms,
            "nonce": nonce,
            "signature": STANDARD.encode(signature),
            "publicKey": signing.public_pem,
            "fingerprint": signing.fingerprint,
            "algorithm": ALGORITHM,
        }))
    }
}
