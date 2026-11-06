// StoreKit 2 signed data (server/billing/apple_store_verify.js, ported): a JWS (ES256)
// trusted only through its x5c chain to Apple Root CA - G3, pinned here; the intermediate
// and leaf must carry Apple's receipt-signing OIDs. Development may add the Xcode
// StoreKit-testing certificate as a second root (`environment: 'Xcode'` only, never
// production).
use super::x509::Certificate;
use super::{Purchase, catalog, lenient};
use crate::vault_router::js;
use serde_json::Value as JsonValue;

const APPLE_ROOT_CA_G3: &str = "-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----";
const BUNDLE_ID: &str = "one.atome.app";
// DER encodings of 1.2.840.113635.100.6.11.1 (receipt signing leaf) and
// 1.2.840.113635.100.6.2.1 (WWDR intermediate).
const LEAF_OID: &[u8] = &[
    0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01,
];
const INTERMEDIATE_OID: &[u8] = &[
    0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01,
];
const INVALID: &str = "billing_proof_invalid";
const UNTRUSTED: &str = "billing_proof_untrusted";

fn segment(text: &str) -> Result<JsonValue, &'static str> {
    lenient(text)
        .and_then(|bytes| serde_json::from_str(&String::from_utf8_lossy(&bytes)).ok())
        .ok_or(INVALID)
}

fn contains(raw: &[u8], needle: &[u8]) -> bool {
    raw.windows(needle.len()).any(|window| window == needle)
}

/// A certificate given as PEM or DER.
pub fn certificate(bytes: &[u8]) -> Option<Certificate> {
    let text = String::from_utf8_lossy(bytes);
    let der = match crate::server_identity::pem_blocks(&text) {
        Some((_, der)) => der,
        None => bytes.to_vec(),
    };
    Certificate::parse(der)
}

pub struct Apple {
    apple: Certificate,
    xcode: Option<Certificate>,
}

impl Apple {
    pub fn new(xcode: Option<Certificate>) -> Self {
        Self {
            apple: certificate(APPLE_ROOT_CA_G3.as_bytes()).expect("Apple Root CA - G3"),
            xcode,
        }
    }

    // The verified payload of one StoreKit JWS.
    fn verify_jws(&self, jws: &JsonValue, now: i64) -> Result<JsonValue, &'static str> {
        let parts: Vec<&str> = match jws.as_str() {
            Some(jws) if jws.encode_utf16().count() < 65536 => jws.split('.').collect(),
            _ => Vec::new(),
        };
        let [head, body, signature] = parts[..] else {
            return Err(INVALID);
        };
        let header = segment(head)?;
        let payload = segment(body)?;
        let x5c = header["x5c"]
            .as_array()
            .filter(|x5c| (1..=3).contains(&x5c.len()));
        let (true, Some(x5c)) = (header["alg"] == "ES256", x5c) else {
            return Err(INVALID);
        };
        let chain = x5c
            .iter()
            .map(|entry| {
                entry
                    .as_str()
                    .and_then(lenient)
                    .and_then(Certificate::parse)
                    .ok_or(INVALID)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let at = js::number_or(payload.get("signedDate"), now as f64) as i64;
        let last = chain.last().ok_or(INVALID)?;
        let fingerprint = last.fingerprint();
        let by_apple =
            chain.len() == 3 && fingerprint.as_ref() == self.apple.fingerprint().as_ref();
        let by_xcode = self
            .xcode
            .as_ref()
            .is_some_and(|xcode| fingerprint.as_ref() == xcode.fingerprint().as_ref());
        if !by_apple && !by_xcode {
            return Err(UNTRUSTED);
        }
        for (index, certificate) in chain.iter().enumerate() {
            let issuer = chain.get(index + 1).unwrap_or(last);
            if !certificate.within(at) || !certificate.issued_by(issuer) {
                return Err(UNTRUSTED);
            }
        }
        if by_apple
            && (!contains(&chain[0].raw, LEAF_OID) || !contains(&chain[1].raw, INTERMEDIATE_OID))
        {
            return Err(UNTRUSTED);
        }
        let signature = lenient(signature).unwrap_or_default();
        if !chain[0].signs(format!("{head}.{body}").as_bytes(), &signature) {
            return Err(UNTRUSTED);
        }
        // A transaction names its environment; a notification names it under `data`.
        let environment = payload
            .get("environment")
            .filter(|environment| !environment.is_null())
            .or_else(|| payload.pointer("/data/environment"));
        let xcode = environment.and_then(JsonValue::as_str) == Some("Xcode");
        if if xcode { !by_xcode } else { !by_apple } {
            return Err(UNTRUSTED);
        }
        Ok(payload)
    }

    /// A verified StoreKit 2 transaction, normalized for `apply_purchase`.
    pub fn verify_transaction(&self, jws: &JsonValue, now: i64) -> Result<Purchase, &'static str> {
        let tx = self.verify_jws(jws, now)?;
        let product = tx["productId"].as_str().and_then(catalog::product);
        let transaction = tx["transactionId"].as_str().filter(|id| !id.is_empty());
        let (true, Some(product), Some(transaction)) =
            (tx["bundleId"] == BUNDLE_ID, product, transaction)
        else {
            return Err(INVALID);
        };
        let plan = product["kind"] == "plan";
        let start = js::number(tx.get("purchaseDate"));
        let end = js::number(tx.get("expiresDate"));
        if plan && end.partial_cmp(&start) != Some(std::cmp::Ordering::Greater) {
            return Err("billing_period_invalid");
        }
        let original = tx
            .get("originalTransactionId")
            .filter(|original| js::truthy(Some(original)))
            .map_or_else(|| transaction.to_string(), js::string);
        Ok(Purchase {
            source: "apple".into(),
            transaction_id: transaction.into(),
            original_transaction_id: original,
            product_id: product["productId"].as_str().unwrap_or_default().into(),
            period_start_ms: plan.then_some(start as i64),
            period_end_ms: plan.then_some(end as i64),
            account_token: tx["appAccountToken"].as_str().map(str::to_lowercase),
            revoked: js::truthy(tx.get("revocationDate")),
            ..Purchase::default()
        })
    }

    /// App Store Server Notifications v2: the outer payload and its transaction are both
    /// signed; only the transaction drives the ledger. Its type and transaction, if any.
    pub fn verify_notification(
        &self,
        signed: &JsonValue,
        now: i64,
    ) -> Result<(String, Option<Purchase>), &'static str> {
        let notice = self.verify_jws(signed, now)?;
        if notice.pointer("/data/bundleId").and_then(JsonValue::as_str) != Some(BUNDLE_ID) {
            return Err(INVALID);
        }
        let kind = notice
            .get("notificationType")
            .filter(|kind| js::truthy(Some(kind)))
            .map(js::string)
            .unwrap_or_default();
        let transaction = match notice.pointer("/data/signedTransactionInfo") {
            Some(info) if js::truthy(Some(info)) => Some(self.verify_transaction(info, now)?),
            _ => None,
        };
        Ok((kind, transaction))
    }
}

/// The Xcode StoreKit-testing certificate (Editor › Save Public Certificate), outside
/// production: `ATOME_STOREKIT_TEST_CERT`.
pub fn xcode_root(settings: &crate::settings::Settings) -> Result<Option<Certificate>, String> {
    if settings.get("NODE_ENV").as_deref() == Some("production") {
        return Ok(None);
    }
    let Some(path) = settings.get("ATOME_STOREKIT_TEST_CERT") else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path).map_err(|e| format!("storekit_test_cert_unreadable:{e}"))?;
    certificate(&bytes)
        .map(Some)
        .ok_or_else(|| "storekit_test_cert_invalid".into())
}
