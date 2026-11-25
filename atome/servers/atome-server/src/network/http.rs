// An HTTP request a control's reaction sends « to the network » (R-347 L12): made by the server,
// never by the page. Only `http:` and `https:` addresses, no credentials in them, a bounded
// time; the answer's status alone comes back, its body is never read.
use reqwest::Method;
use serde_json::{Value as JsonValue, json};
use std::time::Duration;

// Under the page's own ten seconds of waiting for the answer (adole_websocket.js `send`).
const TIMEOUT: Duration = Duration::from_secs(8);
const MAX_ADDRESS: usize = 2048;

/// What is sent: where, how, and the JSON body (none for a GET).
#[derive(Debug, Clone, PartialEq)]
pub struct HttpRequest {
    pub url: url::Url,
    pub method: Method,
    pub body: Option<JsonValue>,
}

// The address, then the reaction's `path` after it when it names one.
fn joined(address: &str, path: &str) -> String {
    let path = path.trim();
    if path.is_empty() || path == "/" {
        return address.to_string();
    }
    format!(
        "{}/{}",
        address.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

impl HttpRequest {
    /// `{ address, path?, method?, body?, value? }`: the method is the message's (GET, POST, PUT,
    /// PATCH, DELETE), else POST when a value or a body is sent, GET otherwise; the body is the
    /// message's `body`, else `{ "value": value }`.
    pub fn from_message(message: &JsonValue) -> Result<Self, String> {
        let text = |key: &str| message.get(key).and_then(JsonValue::as_str).unwrap_or("");
        let address = joined(text("address").trim(), text("path"));
        if address.is_empty() || address.len() > MAX_ADDRESS {
            return Err("network_http_address_invalid".into());
        }
        let url = url::Url::parse(&address).map_err(|_| "network_http_address_invalid")?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none_or(str::is_empty)
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err("network_http_address_invalid".into());
        }
        let value = message.get("value").filter(|value| !value.is_null());
        let body = message.get("body").filter(|body| !body.is_null());
        let method = match text("method").trim().to_ascii_uppercase().as_str() {
            "" if value.is_some() || body.is_some() => Method::POST,
            "" | "GET" => Method::GET,
            "POST" => Method::POST,
            "PUT" => Method::PUT,
            "PATCH" => Method::PATCH,
            "DELETE" => Method::DELETE,
            _ => return Err("network_http_method_invalid".into()),
        };
        let body = match method {
            Method::GET => None,
            _ => body
                .cloned()
                .or_else(|| value.map(|value| json!({ "value": value }))),
        };
        Ok(Self { url, method, body })
    }

    /// Sends it with `client` (redirects not followed): the answer's status.
    pub async fn send(&self, client: reqwest::ClientBuilder) -> Result<u16, String> {
        let client = client
            .redirect(reqwest::redirect::Policy::none())
            .timeout(TIMEOUT)
            .build()
            .map_err(|_| "network_http_client_failed".to_string())?;
        let mut request = client.request(self.method.clone(), self.url.clone());
        if let Some(body) = &self.body {
            request = request.json(body);
        }
        let response = request.send().await.map_err(|error| {
            if error.is_timeout() {
                "network_http_timeout".to_string()
            } else {
                "network_http_failed".to_string()
            }
        })?;
        Ok(response.status().as_u16())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_value_is_posted_after_the_path() {
        let request = HttpRequest::from_message(
            &json!({ "address": "https://example.org/api/", "path": "/fader", "value": 0.5 }),
        )
        .unwrap();
        assert_eq!(request.url.as_str(), "https://example.org/api/fader");
        assert_eq!(request.method, Method::POST);
        assert_eq!(request.body, Some(json!({ "value": 0.5 })));
    }

    #[test]
    fn no_value_is_a_get_without_body() {
        let request =
            HttpRequest::from_message(&json!({ "address": "http://10.0.0.2:8080", "path": "/" }))
                .unwrap();
        assert_eq!(request.method, Method::GET);
        assert_eq!(request.body, None);
    }

    #[test]
    fn other_schemes_credentials_and_methods_are_refused() {
        let refused = |message: JsonValue| HttpRequest::from_message(&message).unwrap_err();
        assert_eq!(
            refused(json!({ "address": "file:///etc/passwd" })),
            "network_http_address_invalid"
        );
        assert_eq!(
            refused(json!({ "address": "https://me:secret@example.org" })),
            "network_http_address_invalid"
        );
        assert_eq!(
            refused(json!({ "address": "https://example.org", "method": "TRACE" })),
            "network_http_method_invalid"
        );
        assert_eq!(refused(json!({})), "network_http_address_invalid");
    }
}
