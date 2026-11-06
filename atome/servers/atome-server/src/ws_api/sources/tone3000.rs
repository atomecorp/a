// `tone3000` (server/ws_tone3000.js, ported): one « Atome » account of TONE3000 for every user.
// Its secret key (`TONE3000_SECRET_KEY`, in development `private/tone3000.txt`) is read here only
// and never leaves the server: the server searches the NAM captures, lists a tone's models and
// downloads the chosen `.nam`, which the client stores as a library atome (synced, offline).
// API: https://www.tone3000.com/api (v1; 100 requests a minute).
use super::Asker;
use super::common::{
    either, environment, length, number, number_or_zero, number_text, plain, reply, request_id,
    response_json, response_text, setting, text, warn,
};
use super::public_source::RateLimit;
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::LazyLock;
use std::time::Duration;

const KIND: &str = "tone3000";
const API: &str = "https://www.tone3000.com/api/v1";
const MAX_MODEL_UNITS: usize = 16 * 1024 * 1024;

static WINDOWS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, 30));

// `tone3000Key()`: the environment's key, else the development file's `t3k_cs_…` line.
fn tone3000_key() -> Result<String, String> {
    let from_env = js::trim(&setting("TONE3000_SECRET_KEY")?.unwrap_or_default()).to_string();
    if !from_env.is_empty() {
        return Ok(from_env);
    }
    let Ok(content) = std::fs::read(environment()?.1.join("private").join("tone3000.txt")) else {
        return Ok(String::new());
    };
    let content = String::from_utf8_lossy(&content);
    let lines: Vec<&str> = content
        .split('\n')
        .map(|line| js::trim(line.strip_suffix('\r').unwrap_or(line)))
        .filter(|line| !line.is_empty())
        .collect();
    let fallback = regex::Regex::new(r"^[A-Za-z0-9_\-.]{20,}$").expect("key line");
    Ok(lines
        .iter()
        .find(|line| line.starts_with("t3k_cs_"))
        .or_else(|| lines.iter().find(|line| fallback.is_match(line)))
        .map(|line| line.to_string())
        .unwrap_or_default())
}

// A field as it is, left out when absent (`JSON.stringify` drops `undefined`).
fn put(fields: &mut JsonMap<String, JsonValue>, name: &str, value: Option<&JsonValue>) {
    if let Some(value) = value {
        fields.insert(name.into(), plain(value));
    }
}

fn tone(entry: &JsonValue) -> JsonValue {
    let mut fields = JsonMap::new();
    put(&mut fields, "id", entry.get("id"));
    let user = entry.get("user");
    let author = either(
        user.and_then(|user| user.get("username")),
        user.and_then(|user| user.get("name")),
    );
    let rest = json!({
        "title": text(entry.get("title")), "author": text(author), "gear": text(entry.get("gear")),
        "license": text(entry.get("license")),
        "sizes": entry.get("sizes").filter(|sizes| sizes.is_array()).map_or_else(|| json!([]), plain),
        "a2_models": js::number_json(number_or_zero(entry.get("a2_models_count"))),
        "models": js::number_json(number_or_zero(entry.get("models_count"))),
        "downloads": js::number_json(number_or_zero(entry.get("downloads_count"))),
        "image": match entry.get("images") { Some(JsonValue::Array(images)) => text(images.first()), _ => String::new() },
        "url": text(entry.get("url")),
    });
    fields.extend(rest.as_object().cloned().unwrap_or_default());
    JsonValue::Object(fields)
}

fn model(entry: &JsonValue) -> JsonValue {
    let mut fields = JsonMap::new();
    put(&mut fields, "id", entry.get("id"));
    put(&mut fields, "tone_id", entry.get("tone_id"));
    fields.insert("name".into(), json!(text(entry.get("name"))));
    fields.insert("size".into(), json!(text(entry.get("size"))));
    fields.insert(
        "architecture".into(),
        entry
            .get("architecture_version")
            .map_or(JsonValue::Null, plain),
    );
    JsonValue::Object(fields)
}

// A failed step: its message (a `tone3000_` code travels as it is) and its HTTP status.
struct Failure {
    message: String,
    status: Option<u16>,
}

impl From<&str> for Failure {
    fn from(message: &str) -> Self {
        Self {
            message: message.into(),
            status: None,
        }
    }
}

async fn read_api(key: &str, route: &str, params: &[(&str, String)]) -> Result<JsonValue, Failure> {
    let response = http::client()
        .get(format!("{API}/{route}?{}", http::form(params)))
        .timeout(Duration::from_secs(10))
        .header("accept", "application/json")
        .header("authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|_| Failure::from("fetch failed"))?;
    let status = response.status();
    if status.is_redirection() {
        return Err("fetch failed".into());
    }
    if !status.is_success() {
        let status = status.as_u16();
        return Err(Failure {
            message: format!("tone3000_status_{status}"),
            status: Some(status),
        });
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| Failure::from("terminated"))?;
    response_json(&bytes).map_err(|error| Failure::from(error.as_str()))
}

// `(found.data || []).map(each)`: anything else than a list there is a TypeError.
fn listed(found: &JsonValue, each: fn(&JsonValue) -> JsonValue) -> Result<Vec<JsonValue>, Failure> {
    if found.is_null() {
        return Err("TypeError: found is null".into());
    }
    match found.get("data").filter(|data| js::truthy(Some(data))) {
        None => Ok(Vec::new()),
        Some(JsonValue::Array(entries)) if !entries.iter().any(JsonValue::is_null) => {
            Ok(entries.iter().map(each).collect())
        }
        Some(_) => Err("TypeError: data.map".into()),
    }
}

// The model's file, fetched with the key only from TONE3000 itself.
async fn read_model(key: &str, address: Option<&JsonValue>) -> Result<String, Failure> {
    let url = url::Url::parse(&js::text(address)).map_err(|_| Failure::from("Invalid URL"))?;
    let host = url.host_str().unwrap_or("");
    if url.scheme() != "https" || !(host == "tone3000.com" || host.ends_with(".tone3000.com")) {
        return Err("tone3000_model_host_unexpected".into());
    }
    let mut response = http::following()
        .get(url.as_str())
        .timeout(Duration::from_secs(30))
        .header("authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|_| Failure::from("fetch failed"))?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        return Err(Failure {
            message: format!("tone3000_status_{status}"),
            status: Some(status),
        });
    }
    // A UTF-8 text holds at least a third as many UTF-16 units as bytes: past three times the
    // bound, it is too large whatever it holds.
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| Failure::from("terminated"))?
    {
        bytes.extend_from_slice(&chunk);
        if bytes.len() > 3 * MAX_MODEL_UNITS {
            return Err("tone3000_model_too_large".into());
        }
    }
    let body = response_text(&bytes);
    if length(&body) > MAX_MODEL_UNITS {
        return Err("tone3000_model_too_large".into());
    }
    let parsed: JsonValue =
        serde_json::from_str(&body).map_err(|error| Failure::from(error.to_string().as_str()))?;
    if !parsed.is_object()
        || !js::truthy(parsed.get("architecture"))
        || !js::truthy(parsed.get("weights"))
    {
        return Err("tone3000_model_not_nam".into());
    }
    Ok(body)
}

async fn act(message: &JsonValue, key: &str) -> Result<JsonValue, Failure> {
    let invalid = |error: &str| Ok(json!({ "ok": false, "error": error }));
    match message.get("action").and_then(JsonValue::as_str) {
        Some("search") => {
            let query = text(message.get("query"));
            if length(&query) > 120 {
                return invalid("tone3000_invalid_query");
            }
            let page = number(message.get("page"));
            let page = (if page.is_nan() || page == 0.0 {
                1.0
            } else {
                page
            })
            .trunc()
            .max(1.0);
            let mut params = vec![
                ("format", "nam".to_string()),
                ("architecture", "2".into()),
                ("page", number_text(page)),
                ("page_size", "25".into()),
            ];
            if query.is_empty() {
                params.push(("sort", "downloads-all-time".into()));
            } else {
                params.extend([("query", query), ("sort", "best-match".into())]);
            }
            let gear = text(message.get("gear"));
            if !gear.is_empty() {
                params.push(("gears", gear));
            }
            let found = read_api(key, "tones/search", &params).await?;
            let mut fields = JsonMap::from_iter([
                ("ok".to_string(), json!(true)),
                ("tones".into(), json!(listed(&found, tone)?)),
            ]);
            put(&mut fields, "page", found.get("page"));
            put(&mut fields, "total_pages", found.get("total_pages"));
            Ok(JsonValue::Object(fields))
        }
        Some("models") => {
            let tone_id = number(message.get("tone_id")).trunc();
            if tone_id.is_nan() || tone_id == 0.0 {
                return invalid("tone3000_invalid_tone");
            }
            let params = [
                ("tone_id", number_text(tone_id)),
                ("architecture", "2".into()),
                ("page_size", "100".into()),
            ];
            let found = read_api(key, "models", &params).await?;
            Ok(json!({ "ok": true, "models": listed(&found, model)? }))
        }
        Some("download") => {
            let model_id = number(message.get("model_id")).trunc();
            if model_id.is_nan() || model_id == 0.0 {
                return invalid("tone3000_invalid_model");
            }
            let entry = read_api(key, &format!("models/{}", number_text(model_id)), &[]).await?;
            if entry.is_null() {
                return Err("TypeError: entry is null".into());
            }
            let capture = read_model(key, entry.get("model_url")).await?;
            let owner = read_api(
                key,
                &format!("tones/{}", js::text(entry.get("tone_id"))),
                &[],
            )
            .await?;
            if owner.is_null() {
                return Err("TypeError: owner is null".into());
            }
            Ok(
                json!({ "ok": true, "model": model(&entry), "tone": tone(&owner), "capture": capture }),
            )
        }
        _ => invalid("tone3000_invalid_action"),
    }
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let key = tone3000_key()?;
    let id = request_id(message);
    if key.is_empty() {
        warn(
            "tone3000",
            &id,
            "tone3000_not_configured",
            json!({ "missing": "private/tone3000.txt" }),
        );
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "tone3000_not_configured" }),
        ));
    }
    if WINDOWS.limited(asker.address, crate::auth::now_ms() as i64) {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "tone3000_rate_limited" }),
        ));
    }
    let fields = act(message, &key).await.unwrap_or_else(|failure| {
        warn(
            "tone3000",
            &id,
            &failure.message,
            json!({ "action": message.get("action"), "status": failure.status }),
        );
        let error = if failure.message.starts_with("tone3000_") {
            failure.message.as_str()
        } else {
            "tone3000_unavailable"
        };
        json!({ "ok": false, "error": error })
    });
    Ok(reply(KIND, message, fields))
}
