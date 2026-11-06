// What every provider call shares (atome/src/squirrel/ai/openai_stream.js, ported): one HTTPS client
// that never follows a redirect (`redirect: 'error'`), the provider's failure read without ever
// forwarding its message (it can hold a credential), bounded binary answers and the incremental
// server-sent events of a streamed answer.
use serde_json::{Value as JsonValue, json};
use std::sync::OnceLock;

/// A failed provider operation: its code, the provider's own known code, the HTTP status, and for a
/// social network its detail.
#[derive(Debug, Default)]
pub struct Failure {
    pub message: String,
    pub provider_code: String,
    pub http_status: Option<u16>,
    pub detail: Option<String>,
    pub social_code: Option<String>,
}

impl From<String> for Failure {
    fn from(message: String) -> Self {
        Self {
            message,
            ..Self::default()
        }
    }
}

impl From<&str> for Failure {
    fn from(message: &str) -> Self {
        message.to_string().into()
    }
}

pub type Done<T> = Result<T, Failure>;

/// `Buffer.from(text, 'base64')`: both alphabets, padding optional, any other character skipped,
/// the text ending at its first `=`.
pub fn node_base64(text: &str) -> Vec<u8> {
    use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
    let cleaned: String = text
        .split('=')
        .next()
        .unwrap_or("")
        .chars()
        .filter_map(|c| match c {
            '-' => Some('+'),
            '_' => Some('/'),
            c if c.is_ascii_alphanumeric() || c == '+' || c == '/' => Some(c),
            _ => None,
        })
        .collect();
    // A last lone character carries no byte.
    let usable = if cleaned.len() % 4 == 1 {
        &cleaned[..cleaned.len() - 1]
    } else {
        &cleaned[..]
    };
    let engine = GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    base64::Engine::decode(&engine, usable).unwrap_or_default()
}

/// `new URLSearchParams(pairs).toString()`: a form body or a query.
pub fn form<K: AsRef<str>, V: AsRef<str>>(pairs: &[(K, V)]) -> String {
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    for (key, value) in pairs {
        serializer.append_pair(key.as_ref(), value.as_ref());
    }
    serializer.finish()
}

pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        crate::tls::http_client()
            .expect("https client")
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("https client")
    })
}

/// The client of a generated output's download, which follows redirects (`redirect: 'follow'`,
/// twenty at most as fetch follows them).
pub fn following() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        crate::tls::http_client()
            .expect("https client")
            .redirect(reqwest::redirect::Policy::limited(20))
            .build()
            .expect("https client")
    })
}

// The codes a failure may travel as; any other provider text stays here.
const KNOWN: [&str; 13] = [
    "invalid_api_key",
    "insufficient_quota",
    "rate_limit_exceeded",
    "model_not_found",
    "invalid_model",
    "billing_hard_limit_reached",
    "billing_not_active",
    "invalid_request_error",
    "permission_denied",
    "server_error",
    "context_length_exceeded",
    "session_expired",
    "provider_connection_closed",
];

/// `openAiFailure(body, defaultCode, httpStatus)`.
pub fn openai_failure(body: &JsonValue, default: &str, http_status: Option<u16>) -> Failure {
    let failure = [
        body.pointer("/response/status_details/error"),
        body.pointer("/response/error"),
        body.get("error"),
    ]
    .into_iter()
    .flatten()
    .find(|value| crate::vault_router::js::truthy(Some(value)))
    .unwrap_or(body);
    let code = [failure.get("code"), failure.get("type")]
        .into_iter()
        .flatten()
        .filter_map(JsonValue::as_str)
        .find(|code| KNOWN.contains(code))
        .unwrap_or("");
    Failure {
        message: if code.is_empty() {
            default.into()
        } else {
            code.into()
        },
        provider_code: code.into(),
        http_status,
        ..Failure::default()
    }
}

/// A request sent: a redirect or an unreachable provider fail as fetch fails.
pub async fn send(request: reqwest::RequestBuilder) -> Done<reqwest::Response> {
    let response = request
        .send()
        .await
        .map_err(|_| Failure::from("fetch failed"))?;
    if response.status().is_redirection() {
        return Err("fetch failed".into());
    }
    Ok(response)
}

/// `readProviderBytes`: the whole answer, refused past `max` bytes.
pub async fn bytes(mut response: reqwest::Response, max: usize) -> Done<Vec<u8>> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| Failure::from("terminated"))?
    {
        if bytes.len() + chunk.len() > max {
            return Err("provider_result_too_large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

/// A failed answer read as `providerError`: its JSON body (or none) through `openai_failure`.
pub async fn failure(response: reqwest::Response) -> Failure {
    let status = response.status().as_u16();
    let body = bytes(response, 20_000_000)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| json!({}));
    openai_failure(&body, &format!("provider_http_{status}"), Some(status))
}

/// `readOpenAiEvents`: the server-sent events of a streamed answer, one JSON event at a time.
pub struct Events {
    response: reqwest::Response,
    pending: Vec<u8>,
    buffer: String,
    done: bool,
}

const MAX_EVENT_BYTES: usize = 4_000_000;

impl Events {
    pub fn new(response: reqwest::Response) -> Self {
        Self {
            response,
            pending: Vec::new(),
            buffer: String::new(),
            done: false,
        }
    }

    // The UTF-8 text decoded so far, a character cut by a chunk kept for the next one.
    fn decode(&mut self, chunk: &[u8], last: bool) {
        self.pending.extend_from_slice(chunk);
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(text) => {
                    self.buffer.push_str(text);
                    self.pending.clear();
                    return;
                }
                Err(error) => {
                    let valid = error.valid_up_to();
                    let text = std::str::from_utf8(&self.pending[..valid]).expect("valid prefix");
                    self.buffer.push_str(text);
                    match error.error_len() {
                        Some(length) => {
                            self.buffer.push('\u{fffd}');
                            self.pending.drain(..valid + length);
                        }
                        None if last => {
                            self.buffer.push('\u{fffd}');
                            self.pending.clear();
                            return;
                        }
                        None => {
                            self.pending.drain(..valid);
                            return;
                        }
                    }
                }
            }
        }
    }

    fn block(&mut self) -> Option<(usize, usize)> {
        let bytes = self.buffer.as_bytes();
        let mut at = 0;
        while at < bytes.len() {
            let first = match bytes[at..] {
                [b'\n', ..] => 1,
                [b'\r', b'\n', ..] => 2,
                _ => {
                    at += 1;
                    continue;
                }
            };
            let second = match bytes[at + first..] {
                [b'\n', ..] => 1,
                [b'\r', b'\n', ..] => 2,
                _ => {
                    at += 1;
                    continue;
                }
            };
            return Some((at, first + second));
        }
        None
    }

    pub async fn next(&mut self) -> Done<Option<JsonValue>> {
        loop {
            while let Some((at, length)) = self.block() {
                let block = self.buffer[..at].to_string();
                self.buffer.drain(..at + length);
                if block.len() > MAX_EVENT_BYTES {
                    return Err("provider_event_too_large".into());
                }
                let data: Vec<&str> = block
                    .split('\n')
                    .map(|line| line.strip_suffix('\r').unwrap_or(line))
                    .filter_map(|line| line.strip_prefix("data:"))
                    .map(|line| line.strip_prefix(' ').unwrap_or(line))
                    .collect();
                let data = data.join("\n");
                if data == "[DONE]" {
                    self.buffer.clear();
                    self.done = true;
                    return Ok(None);
                }
                if !data.is_empty() {
                    // A malformed event fails as `JSON.parse` fails: no provider code.
                    return serde_json::from_str(&data)
                        .map(Some)
                        .map_err(|_| Failure::from("SyntaxError"));
                }
            }
            if self.buffer.len() > MAX_EVENT_BYTES {
                return Err("provider_event_too_large".into());
            }
            if self.done {
                if self.buffer.trim().is_empty() {
                    return Ok(None);
                }
                return Err("provider_stream_truncated".into());
            }
            match self
                .response
                .chunk()
                .await
                .map_err(|_| Failure::from("terminated"))?
            {
                Some(chunk) => self.decode(&chunk, false),
                None => {
                    self.decode(&[], true);
                    self.done = true;
                }
            }
        }
    }
}
