// The browser's logs and the UI state snapshots of server/http_dev_routes.js: each log entry
// coerced into the log envelope (atome/src/shared/logging.js `coerceLogEnvelope`, ported, and
// valid by construction) and appended as one JSON line; a snapshot written whole, as
// `JSON.stringify(snapshot, null, 2)` lays it out.
use crate::http::fastify_reply;
use crate::vault_router::js;
use atome_store::intent::js_stringify;
use axum::http::StatusCode;
use axum::response::Response;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::Path;
use tokio::io::AsyncWriteExt;

const LEVELS: [&str; 4] = ["debug", "info", "warn", "error"];

// `coerceLogEnvelope(entry, { source: 'browser', component: 'ui' })`: an entry that is no
// object (a string, a body Fastify read as text or bytes, none) is read as an empty one.
fn coerced(entry: Option<&JsonValue>) -> JsonValue {
    let empty = JsonMap::new();
    let base = entry.and_then(JsonValue::as_object).unwrap_or(&empty);
    let named = |key: &str, default: &str| match base.get(key) {
        Some(JsonValue::String(text)) if !js::trim(text).is_empty() => json!(text),
        _ => json!(default),
    };
    let text_or_null = |key: &str| match base.get(key) {
        Some(JsonValue::String(text)) => json!(text),
        _ => JsonValue::Null,
    };
    let level = match base.get("level") {
        Some(JsonValue::String(level)) if LEVELS.contains(&level.as_str()) => json!(level),
        _ => json!("info"),
    };
    let message = match base.get("message") {
        Some(JsonValue::String(text)) => json!(text),
        None | Some(JsonValue::Null) => json!(""),
        Some(other) => json!(js_stringify(other)),
    };
    let timestamp = match base.get("timestamp") {
        Some(JsonValue::String(text)) if !text.is_empty() => json!(text),
        _ => json!(atome_store::append::iso_now()),
    };
    json!({
        "timestamp": timestamp,
        "level": level,
        "source": named("source", "browser"),
        "component": named("component", "ui"),
        "request_id": text_or_null("request_id"),
        "session_id": text_or_null("session_id"),
        "message": message,
        "data": base.get("data").cloned().unwrap_or(JsonValue::Null),
    })
}

fn failed(message: String) -> Response {
    fastify_reply::json(
        StatusCode::INTERNAL_SERVER_ERROR,
        &json!({ "success": false, "error": message }),
    )
}

/// `POST /dev/client-log`: the body's entries (an array, `{ logs: [...] }`, else the body as one
/// entry) appended to `file`.
pub async fn ingest(file: &Path, body: Option<JsonValue>) -> Response {
    let inputs: Vec<Option<&JsonValue>> = match &body {
        Some(JsonValue::Array(items)) => items.iter().map(Some).collect(),
        Some(JsonValue::Object(object)) if object.get("logs").is_some_and(JsonValue::is_array) => {
            object["logs"]
                .as_array()
                .into_iter()
                .flatten()
                .map(Some)
                .collect()
        }
        other => vec![other.as_ref()],
    };
    if inputs.is_empty() {
        return fastify_reply::json(
            StatusCode::BAD_REQUEST,
            &json!({ "success": false, "error": "invalid log envelope" }),
        );
    }
    let mut lines = String::new();
    for entry in &inputs {
        lines.push_str(&js_stringify(&coerced(*entry)));
        lines.push('\n');
    }
    let opened = tokio::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(file)
        .await;
    let written = match opened {
        Ok(mut log) => log.write_all(lines.as_bytes()).await,
        Err(error) => return failed(fastify_reply::node_fs_error(&error, "open", file).message),
    };
    if let Err(error) = written {
        return failed(fastify_reply::node_fs_error(&error, "write", file).message);
    }
    fastify_reply::json(
        StatusCode::OK,
        &json!({ "success": true, "accepted": inputs.len(), "dropped": 0 }),
    )
}

// `JSON.stringify(value, null, 2)` of the compact `text` JSON.stringify wrote.
fn laid_out(text: &str) -> String {
    let mut out = String::with_capacity(text.len() * 2);
    let mut depth = 0usize;
    let (mut quoted, mut escaped) = (false, false);
    let mut chars = text.chars().peekable();
    let newline = |out: &mut String, depth: usize| {
        out.push('\n');
        out.push_str(&"  ".repeat(depth));
    };
    while let Some(c) = chars.next() {
        if quoted {
            out.push(c);
            match c {
                _ if escaped => escaped = false,
                '\\' => escaped = true,
                '"' => quoted = false,
                _ => {}
            }
            continue;
        }
        match c {
            '"' => {
                quoted = true;
                out.push(c);
            }
            '{' | '[' => {
                out.push(c);
                let close = if c == '{' { '}' } else { ']' };
                if chars.peek() == Some(&close) {
                    out.push(close);
                    chars.next();
                } else {
                    depth += 1;
                    newline(&mut out, depth);
                }
            }
            '}' | ']' => {
                depth -= 1;
                newline(&mut out, depth);
                out.push(c);
            }
            ',' => {
                out.push(c);
                newline(&mut out, depth);
            }
            ':' => out.push_str(": "),
            _ => out.push(c),
        }
    }
    out
}

/// `POST /dev/snapshot`: the body's `state`, its last 500 `logs` and its `meta` written to
/// `snapshot-<time>.json` in `directory`.
pub async fn snapshot(directory: &Path, body: Option<JsonValue>) -> Response {
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let file = directory.join(format!("snapshot-{}.json", now.replace([':', '.'], "-")));
    // `request.body && typeof request.body === 'object'`: an object or an array.
    let payload = body.filter(|body| body.is_object() || body.is_array());
    let field = |key: &str| {
        payload
            .as_ref()
            .and_then(|payload| payload.get(key))
            .filter(|value| js::truthy(Some(value)))
            .cloned()
            .unwrap_or(JsonValue::Null)
    };
    let logs = match payload.as_ref().and_then(|payload| payload.get("logs")) {
        Some(JsonValue::Array(logs)) => logs[logs.len().saturating_sub(500)..].to_vec(),
        _ => Vec::new(),
    };
    let written = json!({ "timestamp": now, "source": crate::status::SERVER_TYPE,
                          "state": field("state"), "logs": logs, "meta": field("meta") });
    if let Err(error) = tokio::fs::write(&file, laid_out(&js_stringify(&written))).await {
        return failed(fastify_reply::node_fs_error(&error, "open", &file).message);
    }
    fastify_reply::json(StatusCode::OK, &json!({ "success": true, "path": file }))
}
