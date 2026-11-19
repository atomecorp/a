// The one OVHcloud API client (R-193): a call signed as OVH asks (`$1$` + SHA-1 of the
// application secret, the consumer key, the method, the full URL, the body and OVH's own time,
// read from `/auth/time`), with the `X-Ovh-*` headers. Its users (the SMS of auth/sms.rs, the
// domain registrar of site/ovh_registrar.rs) hold their own keys and name their own errors from
// the `Failure` it answers. No retry here: a timeout may come after OVH has accepted the call.
use serde_json::Value as JsonValue;
use std::time::Duration;

/// OVHcloud Europe's API (`ovh-eu`).
pub const EU_ENDPOINT: &str = "https://eu.api.ovh.com/1.0";

/// The three keys of an OVH application and the consumer it acts for.
#[derive(Clone)]
pub struct Credentials {
    pub application_key: String,
    pub application_secret: String,
    pub consumer_key: String,
}

/// Why a call has no answer.
#[derive(Debug, PartialEq, Eq)]
pub enum Failure {
    /// The call may or may not have reached OVH (network, timeout, unreadable answer).
    Uncertain,
    /// OVH's clock (`/auth/time`) did not answer.
    Unavailable,
    /// OVH refused the call (its HTTP status).
    Rejected(u16),
    /// OVH refused the keys (401 or 403).
    CredentialsRejected,
}

/// The signature of one call (`$1$` + hex SHA-1 of `secret+consumer+method+url+body+time`).
pub fn signature(
    credentials: &Credentials,
    method: &str,
    url: &str,
    body: &str,
    timestamp: i64,
) -> String {
    let signed = [
        credentials.application_secret.as_str(),
        &credentials.consumer_key,
        method,
        url,
        body,
        &timestamp.to_string(),
    ]
    .join("+");
    format!(
        "$1${}",
        crate::auth::proof::hex(
            ring::digest::digest(&ring::digest::SHA1_FOR_LEGACY_USE_ONLY, signed.as_bytes())
                .as_ref()
        )
    )
}

/// A signed call to `endpoint` + `resource` (its query included). `payload` is the JSON body;
/// none for a call without one (a GET), signed with an empty body.
pub async fn request(
    endpoint: &str,
    credentials: &Credentials,
    method: &str,
    resource: &str,
    payload: Option<&JsonValue>,
) -> Result<JsonValue, Failure> {
    let uncertain = |_| Failure::Uncertain;
    let client = crate::tls::http_client()
        .map_err(|_| Failure::Uncertain)?
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(uncertain)?;
    let time = client
        .get(format!("{endpoint}/auth/time"))
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(uncertain)?;
    if !time.status().is_success() {
        return Err(Failure::Unavailable);
    }
    let timestamp = time
        .json::<JsonValue>()
        .await
        .map_err(uncertain)?
        .as_i64()
        .filter(|stamp| *stamp > 0 && *stamp <= 9_007_199_254_740_991)
        .ok_or(Failure::Unavailable)?;
    let url = format!("{endpoint}{resource}");
    let body = payload.map(JsonValue::to_string).unwrap_or_default();
    let signature = signature(credentials, method, &url, &body, timestamp);
    let mut call = client
        .request(method.parse().map_err(|_| Failure::Rejected(0))?, &url)
        .timeout(Duration::from_secs(15))
        .header("Content-Type", "application/json")
        .header("X-Ovh-Application", &credentials.application_key)
        .header("X-Ovh-Consumer", &credentials.consumer_key)
        .header("X-Ovh-Timestamp", timestamp.to_string())
        .header("X-Ovh-Signature", signature);
    if payload.is_some() {
        call = call.body(body);
    }
    let response = call.send().await.map_err(uncertain)?;
    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => Failure::CredentialsRejected,
            code => Failure::Rejected(code),
        });
    }
    response.json().await.map_err(uncertain)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ovh_signature_is_sha1_of_the_joined_parts() {
        let keys = Credentials {
            application_key: "ak".into(),
            application_secret: "secret".into(),
            consumer_key: "consumer".into(),
        };
        let signed = signature(
            &keys,
            "GET",
            "https://eu.api.ovh.com/1.0/me",
            "",
            1_700_000_000,
        );
        let expected = ring::digest::digest(
            &ring::digest::SHA1_FOR_LEGACY_USE_ONLY,
            b"secret+consumer+GET+https://eu.api.ovh.com/1.0/me++1700000000",
        );
        assert_eq!(
            signed,
            format!("$1${}", crate::auth::proof::hex(expected.as_ref()))
        );
    }
}
