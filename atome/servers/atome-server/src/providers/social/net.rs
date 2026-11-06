// The social networks' HTTP calls (server/social/social_http.js, ported). A provider message is
// never forwarded as it is (an authentication failure may quote a token): only a slug-shaped
// provider code survives, beside atome's own code.
use crate::providers::http::{self, Failure};
use crate::vault_router::js;
use serde_json::Value as JsonValue;

/// A social failure (`SocialError`): its code, the provider's slug, the HTTP status, whether the
/// request may have reached the provider (a publishing request then becomes `unconfirmed`, never
/// retried blindly), and a detail.
#[derive(Debug, Default, Clone)]
pub struct Se {
    pub code: String,
    pub provider_code: Option<String>,
    pub http_status: Option<u16>,
    pub reached: bool,
    pub detail: Option<String>,
}

pub type Sd<T> = Result<T, Se>;

impl Se {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            ..Self::default()
        }
    }

    pub fn reached(code: &str) -> Self {
        Self {
            reached: true,
            ..Self::new(code)
        }
    }

    pub fn detail(code: &str, detail: &str) -> Self {
        Self {
            detail: Some(detail.into()),
            ..Self::new(code)
        }
    }
}

impl From<String> for Se {
    fn from(code: String) -> Self {
        Self {
            code,
            ..Self::default()
        }
    }
}

impl From<Failure> for Se {
    fn from(failure: Failure) -> Self {
        failure.message.into()
    }
}

// The provider op's failure: the social code travels with its detail and provider slug.
impl From<Se> for Failure {
    fn from(failure: Se) -> Self {
        Failure {
            message: failure.code,
            http_status: failure.http_status,
            detail: failure.detail,
            social_code: failure.provider_code,
            ..Failure::default()
        }
    }
}

fn slug(value: Option<&JsonValue>) -> Option<String> {
    let value = value.filter(|value| !value.is_null())?;
    let text = js::trim(&js::text(Some(value))).to_string();
    let shaped = (1..=80).contains(&text.len())
        && text
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c));
    shaped.then_some(text)
}

fn provider_code_of(body: &JsonValue) -> Option<String> {
    let error = body.get("error");
    let first = error
        .and_then(|error| error.get("code"))
        .filter(|code| !code.is_null())
        .or_else(|| body.get("error_code").filter(|code| !code.is_null()))
        .or_else(|| error.and_then(|error| error.get("error_subcode")));
    slug(first)
        .or_else(|| slug(error.and_then(|error| error.get("type"))))
        .or_else(|| slug(error.filter(|error| error.is_string())))
}

/// `classifyHttpFailure`.
pub fn classify(status: u16, provider_code: Option<&str>) -> &'static str {
    let code = provider_code.unwrap_or("");
    if status == 401 || code == "access_token_invalid" || code == "190" {
        return "social_session_expired";
    }
    if status == 403 || ["scope_not_authorized", "200", "10"].contains(&code) {
        return "social_permission_missing";
    }
    let limited = code.contains("rate_limit")
        || code.contains("spam_risk_too_many_posts")
        || ["4", "17", "32", "613"].contains(&code);
    if status == 429 || limited {
        return "social_provider_rate_limited";
    }
    if status >= 500 {
        return "social_provider_unavailable";
    }
    "social_provider_rejected"
}

/// `socialFetch`: the provider's JSON answer, or its refusal as a social failure.
pub async fn fetch(request: reqwest::RequestBuilder, reaches: bool) -> Sd<JsonValue> {
    let response = http::send(request).await.map_err(|_| Se {
        reached: reaches,
        ..Se::new("social_network_interrupted")
    })?;
    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let bytes = http::bytes(response, usize::MAX).await.unwrap_or_default();
    let body: JsonValue = if bytes.is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_slice(&bytes).unwrap_or_else(|_| serde_json::json!({}))
    };
    // TikTok answers 200 with `error.code !== 'ok'` for refusals.
    let tiktok = body
        .get("error")
        .filter(|error| {
            error.is_object() && error.get("code").is_some() && error.get("log_id").is_some()
        })
        .and_then(|error| slug(error.get("code")));
    if !ok || tiktok.as_deref().is_some_and(|code| code != "ok") {
        let provider_code = tiktok.or_else(|| provider_code_of(&body));
        // An explicit refusal is final; only a provider-side failure (5xx) on a publishing
        // request leaves the outcome unknown.
        return Err(Se {
            code: classify(status, provider_code.as_deref()).into(),
            http_status: Some(status),
            reached: reaches && status >= 500,
            provider_code,
            detail: None,
        });
    }
    Ok(body)
}

/// `formBody`: the fields that are set, an object as its JSON.
pub fn form_body(fields: &[(&str, JsonValue)]) -> String {
    let pairs: Vec<(&str, String)> = fields
        .iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(key, value)| {
            let text = if value.is_object() || value.is_array() {
                value.to_string()
            } else {
                js::string(value)
            };
            (*key, text)
        })
        .collect();
    http::form(&pairs)
}

pub fn form_post(url: &str, fields: &[(&str, JsonValue)]) -> reqwest::RequestBuilder {
    http::client()
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_body(fields))
}

pub async fn delay(ms: u64) {
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}
