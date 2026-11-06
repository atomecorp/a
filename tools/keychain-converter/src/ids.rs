use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

const NAMESPACE: &[u8] = b"atome.one/keychain-converter/id/v1";

/// A CXF identifier (§1.3): 16 opaque bytes, base64url, the same for the same
/// source entity on every conversion, and carrying no personal data — it is a
/// hash of source identifiers, never of a secret.
pub fn derive(parts: &[&str]) -> String {
    let mut hash = Sha256::new();
    hash.update(NAMESPACE);
    for part in parts {
        hash.update([0u8]);
        hash.update(part.as_bytes());
    }
    URL_SAFE_NO_PAD.encode(&hash.finalize()[..16])
}

pub fn b64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn sha256_b64url(bytes: &[u8]) -> String {
    b64url(&Sha256::digest(bytes))
}
