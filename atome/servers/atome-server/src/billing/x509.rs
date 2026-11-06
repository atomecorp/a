// An X.509 certificate of a StoreKit `x5c` chain, read as node:crypto's X509Certificate
// serves server/billing/apple_store_verify.js: its DER, validity window, names and elliptic
// public key; `issued_by` is its `checkIssued(issuer) && verify(issuer.publicKey)`.
use crate::server_identity::der;
use ring::signature::{self, UnparsedPublicKey, VerificationAlgorithm};

const EC_PUBLIC_KEY: &[u8] = &[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01];
const P256: &[u8] = &[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
const P384: &[u8] = &[0x2b, 0x81, 0x04, 0x00, 0x22];
const ECDSA_SHA256: &[u8] = &[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02];
const ECDSA_SHA384: &[u8] = &[0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03];

pub struct Certificate {
    pub raw: Vec<u8>,
    // The signed part (the whole `tbsCertificate` element), its signature and algorithm.
    signed: Vec<u8>,
    signature: Vec<u8>,
    algorithm: Vec<u8>,
    issuer: Vec<u8>,
    subject: Vec<u8>,
    not_before: i64,
    not_after: i64,
    curve: Vec<u8>,
    key: Vec<u8>,
}

// One element: its tag, content, whole encoding and what follows it.
fn element(bytes: &[u8]) -> Option<(u8, &[u8], &[u8], &[u8])> {
    let (tag, content, rest) = der(bytes)?;
    Some((tag, content, &bytes[..bytes.len() - rest.len()], rest))
}

// UTCTime (years 1950–2049) or GeneralizedTime, in UTC, as ms.
fn time(tag: u8, content: &[u8]) -> Option<i64> {
    let text = std::str::from_utf8(content).ok()?.strip_suffix('Z')?;
    let full = match tag {
        0x17 => {
            let year: i32 = text.get(..2)?.parse().ok()?;
            format!(
                "{}{}",
                if year < 50 { 2000 + year } else { 1900 + year },
                &text[2..]
            )
        }
        0x18 => text.to_string(),
        _ => return None,
    };
    chrono::NaiveDateTime::parse_from_str(&full, "%Y%m%d%H%M%S")
        .ok()
        .map(|time| time.and_utc().timestamp_millis())
}

impl Certificate {
    pub fn parse(raw: Vec<u8>) -> Option<Self> {
        let (0x30, body, _, _) = element(&raw)? else {
            return None;
        };
        let (0x30, tbs, signed, rest) = element(body)? else {
            return None;
        };
        let (0x30, algorithm, _, rest) = element(rest)? else {
            return None;
        };
        let (0x06, algorithm, _, _) = element(algorithm)? else {
            return None;
        };
        let (0x03, bits, _, _) = element(rest)? else {
            return None;
        };
        let signature = bits.strip_prefix(&[0])?.to_vec();
        // version [0] (optional), serial, signature algorithm, issuer, validity, subject, key.
        let mut cursor = tbs;
        if cursor.first() == Some(&0xa0) {
            cursor = element(cursor)?.3;
        }
        let (0x02, _, _, cursor) = element(cursor)? else {
            return None;
        };
        let (0x30, _, _, cursor) = element(cursor)? else {
            return None;
        };
        let (0x30, _, issuer, cursor) = element(cursor)? else {
            return None;
        };
        let (0x30, validity, _, cursor) = element(cursor)? else {
            return None;
        };
        let (0x30, _, subject, cursor) = element(cursor)? else {
            return None;
        };
        let (0x30, key_info, _, _) = element(cursor)? else {
            return None;
        };
        let (start_tag, start, _, rest) = element(validity)?;
        let (end_tag, end, _, _) = element(rest)?;
        let (0x30, key_algorithm, _, rest) = element(key_info)? else {
            return None;
        };
        let (0x03, key_bits, _, _) = element(rest)? else {
            return None;
        };
        let (0x06, key_type, _, parameters) = element(key_algorithm)? else {
            return None;
        };
        // A key that is not elliptic parses, and verifies nothing.
        let curve = match (key_type == EC_PUBLIC_KEY, element(parameters)) {
            (true, Some((0x06, curve, _, _))) => curve.to_vec(),
            _ => Vec::new(),
        };
        Some(Self {
            signed: signed.to_vec(),
            signature,
            algorithm: algorithm.to_vec(),
            issuer: issuer.to_vec(),
            subject: subject.to_vec(),
            not_before: time(start_tag, start)?,
            not_after: time(end_tag, end)?,
            curve,
            key: key_bits.strip_prefix(&[0])?.to_vec(),
            raw,
        })
    }

    pub fn fingerprint(&self) -> ring::digest::Digest {
        ring::digest::digest(&ring::digest::SHA256, &self.raw)
    }

    pub fn within(&self, at: i64) -> bool {
        self.not_before <= at && at <= self.not_after
    }

    /// Named by `issuer` as its subject, and signed by its key.
    pub fn issued_by(&self, issuer: &Certificate) -> bool {
        let algorithm: &'static dyn VerificationAlgorithm =
            match (issuer.curve.as_slice(), self.algorithm.as_slice()) {
                (P256, ECDSA_SHA256) => &signature::ECDSA_P256_SHA256_ASN1,
                (P256, ECDSA_SHA384) => &signature::ECDSA_P256_SHA384_ASN1,
                (P384, ECDSA_SHA256) => &signature::ECDSA_P384_SHA256_ASN1,
                (P384, ECDSA_SHA384) => &signature::ECDSA_P384_SHA384_ASN1,
                _ => return false,
            };
        self.issuer == issuer.subject
            && UnparsedPublicKey::new(algorithm, &issuer.key)
                .verify(&self.signed, &self.signature)
                .is_ok()
    }

    /// An ES256 signature (P-256, SHA-256, `ieee-p1363` r‖s) of `message` by this key.
    pub fn signs(&self, message: &[u8], fixed: &[u8]) -> bool {
        self.curve == P256
            && UnparsedPublicKey::new(&signature::ECDSA_P256_SHA256_FIXED, &self.key)
                .verify(message, fixed)
                .is_ok()
    }
}
