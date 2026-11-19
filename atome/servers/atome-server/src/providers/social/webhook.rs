// `GET|POST /api/social/webhook/meta` (R-190): the one webhook Meta calls for Facebook Pages,
// Instagram and Threads. The subscription is confirmed by the operator's verify token; every event
// is refused unless its `X-Hub-Signature-256` is the HMAC-SHA256 of the exact body under one of
// the operator's Meta application secrets, checked before the body is even parsed. What it tells
// then goes the canonical way (inbox.rs: kept, then told through the notification writer) to
// each person holding the account it names.
use super::inbox;
use super::meta_inbox;
use super::net;
use super::network::Network;
use super::poll::Reach;
use super::sessions;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use std::collections::HashMap;

const SECRETS: [&str; 3] = [
    "FACEBOOK_APP_SECRET",
    "INSTAGRAM_APP_SECRET",
    "THREADS_APP_SECRET",
];

/// The request as the router received it.
pub struct Call<'a> {
    pub method: &'a Method,
    pub headers: &'a HeaderMap,
    pub query: Option<&'a str>,
    pub body: &'a [u8],
}

fn plain(status: StatusCode, text: &str) -> Response {
    let mut response = (status, text.to_string()).into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// Whether `signature` (`sha256=<hex>`) signs `body` under one of `secrets`, in constant time.
pub fn signed(secrets: &[&str], body: &[u8], signature: &str) -> bool {
    let Some(tag) = signature
        .strip_prefix("sha256=")
        .and_then(|hex_tag| hex::decode(hex_tag.trim()).ok())
    else {
        return false;
    };
    secrets
        .iter()
        .filter(|secret| !secret.is_empty())
        .any(|secret| {
            let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret.as_bytes());
            ring::hmac::verify(&key, body, &tag).is_ok()
        })
}

/// The subscription's check: the challenge echoed when the verify token is the operator's.
pub fn verify(expected: &str, query: Option<&str>) -> Response {
    let fields: HashMap<String, String> =
        url::form_urlencoded::parse(query.unwrap_or("").as_bytes())
            .into_owned()
            .collect();
    let field = |key: &str| fields.get(key).map_or("", String::as_str);
    let matches = !expected.is_empty()
        && field("hub.mode") == "subscribe"
        && bool::from(subtle::ConstantTimeEq::ct_eq(
            field("hub.verify_token").as_bytes(),
            expected.as_bytes(),
        ));
    if matches {
        plain(StatusCode::OK, field("hub.challenge"))
    } else {
        plain(StatusCode::FORBIDDEN, "forbidden")
    }
}

pub async fn answer(reach: &Reach<'_>, call: Call<'_>) -> Response {
    if *call.method == Method::GET {
        return verify(reach.config.get("META_WEBHOOK_VERIFY_TOKEN"), call.query);
    }
    if *call.method != Method::POST {
        return plain(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }
    let signature = call
        .headers
        .get("x-hub-signature-256")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let secrets: Vec<&str> = SECRETS.iter().map(|key| reach.config.get(key)).collect();
    if signature.is_empty() || !signed(&secrets, call.body, signature) {
        return plain(StatusCode::UNAUTHORIZED, "signature refused");
    }
    let Ok(body) = serde_json::from_slice::<serde_json::Value>(call.body) else {
        return plain(StatusCode::BAD_REQUEST, "invalid body");
    };
    reach.linked.load(reach.vault_root).await;
    let mut failed = false;
    for told in meta_inbox::parse(&body) {
        for (principal, account) in reach.linked.owners(told.network.name(), &told.owner) {
            if let Err(code) = deliver(reach, &principal, &account, &told).await {
                eprintln!(
                    "[social] {} webhook item not kept: {code}",
                    told.network.name()
                );
                failed = true;
            }
        }
    }
    // Meta sends again what was not acknowledged: a failed item is kept on the next attempt, a
    // kept one is never told twice.
    if failed {
        plain(StatusCode::INTERNAL_SERVER_ERROR, "retry")
    } else {
        plain(StatusCode::OK, "EVENT_RECEIVED")
    }
}

async fn deliver(
    reach: &Reach<'_>,
    principal: &str,
    account: &str,
    told: &meta_inbox::Told,
) -> Result<(), String> {
    let vault = reach.vault(principal).await.map_err(|f| f.code)?;
    let mut item = told.item.clone();
    if told.network == Network::Facebook {
        item.reference["page"] = told.owner.clone().into();
    }
    let unnamed = item.author["name"].as_str().is_none_or(str::is_empty);
    if unnamed && item.kind == "dm" {
        let session = sessions::load(told.network, Some(account), &vault, reach.config)
            .await
            .map_err(|f| f.code)?;
        let record = session.record.unwrap_or_default();
        let author = net::text(item.author.get("id"));
        match meta_inbox::name_of(reach.config, told.network, &record, &told.owner, &author).await {
            Ok(name) => item.author["name"] = name.into(),
            // The message is kept and told without its author's name, which the network refused.
            Err(failure) => eprintln!("[social] author name not read: {}", failure.code),
        }
    }
    inbox::deliver(
        principal,
        &vault.social_root(),
        reach.notifier,
        told.network.name(),
        account,
        item,
    )
    .await
    .map(|_| ())
    .map_err(|f| f.code)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(secret: &str, body: &[u8]) -> String {
        let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret.as_bytes());
        format!(
            "sha256={}",
            hex::encode(ring::hmac::sign(&key, body).as_ref())
        )
    }

    #[test]
    fn only_a_body_signed_by_an_operator_secret_passes() {
        let body = br#"{"object":"page"}"#;
        let signature = sign("app-secret", body);
        assert!(signed(&["", "app-secret"], body, &signature));
        assert!(!signed(&["other"], body, &signature));
        assert!(!signed(
            &["app-secret"],
            br#"{"object":"pagE"}"#,
            &signature
        ));
        assert!(!signed(&["app-secret"], body, "sha1=00"));
        assert!(!signed(&["app-secret"], body, "sha256=zz"));
        assert!(!signed(&[""], body, &sign("", body)));
    }

    #[test]
    fn the_subscription_check_echoes_the_challenge_for_the_right_token() {
        let ok = verify(
            "tok",
            Some("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42"),
        );
        assert_eq!(ok.status(), StatusCode::OK);
        let wrong = verify(
            "tok",
            Some("hub.mode=subscribe&hub.verify_token=no&hub.challenge=42"),
        );
        assert_eq!(wrong.status(), StatusCode::FORBIDDEN);
        let unset = verify(
            "",
            Some("hub.mode=subscribe&hub.verify_token=&hub.challenge=42"),
        );
        assert_eq!(unset.status(), StatusCode::FORBIDDEN);
    }
}
