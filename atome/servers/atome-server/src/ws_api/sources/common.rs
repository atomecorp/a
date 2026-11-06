// What the public sources of `/ws/api` share: the families' own `reply` (with its `request_id`),
// the server's settings as Fastify's `process.env` holds them, `logStructured`'s warnings, and the
// JavaScript readings their handlers make (`Number(x)`, `String(x == null ? '' : x).trim()`,
// `String(x || '')`) beyond the vault router's (`crate::vault_router::js`).
use crate::settings::Settings;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::PathBuf;
use std::sync::LazyLock;

/// `{ type: '<kind>-response', requestId, request_id, success: fields.ok === true, ...fields }`.
pub(super) fn reply(kind: &str, message: &JsonValue, fields: JsonValue) -> JsonValue {
    let request_id = request_id(message);
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!(format!("{kind}-response")));
    reply.insert("requestId".into(), request_id.clone());
    reply.insert("request_id".into(), request_id);
    reply.insert(
        "success".into(),
        json!(fields.get("ok") == Some(&json!(true))),
    );
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

/// `{ ok: true, ...fields }`.
pub(super) fn ok_with(fields: JsonValue) -> JsonValue {
    let mut answer = JsonMap::from_iter([("ok".to_string(), json!(true))]);
    if let JsonValue::Object(fields) = fields {
        answer.extend(fields);
    }
    JsonValue::Object(answer)
}

struct Environment {
    settings: Settings,
    root: PathBuf,
}

// The front runs at the project root (main.rs `config`), where Fastify reads `.env` and `.env.local`.
static ENVIRONMENT: LazyLock<Result<Environment, String>> = LazyLock::new(|| {
    let root = std::env::current_dir().map_err(|error| error.to_string())?;
    Ok(Environment {
        settings: Settings::load(&root)?,
        root,
    })
});

/// The settings and the project root.
pub(super) fn environment() -> Result<(&'static Settings, &'static PathBuf), String> {
    ENVIRONMENT
        .as_ref()
        .map(|environment| (&environment.settings, &environment.root))
        .map_err(Clone::clone)
}

/// `process.env[name]`, blank or not.
pub(super) fn setting(name: &str) -> Result<Option<String>, String> {
    Ok(environment()?.0.value(name))
}

/// `logStructured('warn', { component, request_id, message, data })`.
pub(super) fn warn(component: &str, request_id: &JsonValue, message: &str, data: JsonValue) {
    eprintln!(
        "{}",
        json!({ "level": "warn", "source": "atome-server", "component": component,
            "request_id": request_id, "message": message, "data": data })
    );
}

/// The request id of a message (`message.requestId || message.request_id || null`).
pub(super) fn request_id(message: &JsonValue) -> JsonValue {
    js::first(message, &["requestId", "request_id"])
        .cloned()
        .unwrap_or(JsonValue::Null)
}

// A JavaScript StrDecimalLiteral, the only decimal form `Number(text)` reads.
static DECIMAL: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$").expect("decimal")
});

fn string_number(text: &str) -> f64 {
    let text = js::trim(text);
    if text.is_empty() {
        return 0.0;
    }
    let radix = match text.get(..2) {
        Some("0x" | "0X") => Some(16),
        Some("0o" | "0O") => Some(8),
        Some("0b" | "0B") => Some(2),
        _ => None,
    };
    if let Some(radix) = radix {
        let digits = &text[2..];
        if digits.is_empty() {
            return f64::NAN;
        }
        return digits
            .chars()
            .try_fold(0.0, |total, digit| {
                digit
                    .to_digit(radix)
                    .map(|digit| total * f64::from(radix) + f64::from(digit))
            })
            .unwrap_or(f64::NAN);
    }
    match text.strip_prefix(['+', '-']).unwrap_or(text) {
        "Infinity" if text.starts_with('-') => f64::NEG_INFINITY,
        "Infinity" => f64::INFINITY,
        _ if DECIMAL.is_match(text) => text.parse().unwrap_or(f64::NAN),
        _ => f64::NAN,
    }
}

/// `Number(value)`: a string read as JavaScript reads it, an array through its `String()`.
pub(super) fn number(value: Option<&JsonValue>) -> f64 {
    match value {
        Some(JsonValue::String(text)) => string_number(text),
        Some(JsonValue::Array(_)) => string_number(&js::text(value)),
        _ => js::number(value),
    }
}

/// `Number(value) || 0`.
pub(super) fn number_or_zero(value: Option<&JsonValue>) -> f64 {
    let number = number(value);
    if number.is_nan() { 0.0 } else { number }
}

/// `String(number)` of a number JavaScript computed.
pub(super) fn number_text(number: f64) -> String {
    if number.is_nan() {
        "NaN".into()
    } else if number.is_infinite() {
        if number > 0.0 {
            "Infinity"
        } else {
            "-Infinity"
        }
        .into()
    } else {
        js::number_json(number).to_string()
    }
}

/// `Number.isInteger(value)`: a JSON number without a fraction.
pub(super) fn integer(value: Option<&JsonValue>) -> Option<f64> {
    value
        .and_then(JsonValue::as_f64)
        .filter(|number| number.is_finite() && number.fract() == 0.0)
}

/// `String(value == null ? '' : value).trim()`.
pub(super) fn text(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        value => js::trim(&js::text(value)).to_string(),
    }
}

/// `a || b`.
pub(super) fn either<'a>(
    a: Option<&'a JsonValue>,
    b: Option<&'a JsonValue>,
) -> Option<&'a JsonValue> {
    if js::truthy(a) { a } else { b }
}

/// `String(value || '')`.
pub(super) fn or_empty(value: Option<&JsonValue>) -> String {
    if js::truthy(value) {
        js::text(value)
    } else {
        String::new()
    }
}

/// The UTF-16 length of a text (`text.length`).
pub(super) fn length(text: &str) -> usize {
    text.encode_utf16().count()
}

/// A value read back from `JSON.parse`, written again as `JSON.stringify` writes it: every
/// number is a double, an integral one written without a fraction.
pub(super) fn plain(value: &JsonValue) -> JsonValue {
    match value {
        JsonValue::Number(number) => js::number_json(number.as_f64().unwrap_or(f64::NAN)),
        JsonValue::Array(items) => JsonValue::Array(items.iter().map(plain).collect()),
        JsonValue::Object(map) => JsonValue::Object(
            map.iter()
                .map(|(key, value)| (key.clone(), plain(value)))
                .collect(),
        ),
        other => other.clone(),
    }
}

/// `JSON.parse(bytes.toString())`: the UTF-8 text, a bad sequence replaced.
pub(super) fn parse(bytes: &[u8]) -> Option<JsonValue> {
    serde_json::from_str(&String::from_utf8_lossy(bytes)).ok()
}

/// The text of `response.text()`: UTF-8, a bad sequence replaced, a leading byte order mark dropped.
pub(super) fn response_text(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    text.strip_prefix('\u{feff}').unwrap_or(&text).to_string()
}

/// `response.json()`: its text parsed, the parser's message when it is no JSON.
pub(super) fn response_json(bytes: &[u8]) -> Result<JsonValue, String> {
    serde_json::from_str(&response_text(bytes)).map_err(|error| format!("SyntaxError: {error}"))
}

/// `new Date(ms).toISOString()`, which throws past ±8.64e15 ms.
pub(super) fn iso(ms: f64) -> Option<String> {
    (ms.is_finite() && ms.abs() <= 8.64e15).then(|| js::iso(ms.trunc() as i64))
}
