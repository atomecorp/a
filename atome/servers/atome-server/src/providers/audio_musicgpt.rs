// MusicGPT, the audio service's provider (audio.rs): its MusicAI endpoints, payload fields and
// statuses, on atome's key; its credits are dollars. Its names live here alone.
use super::audio::{CODES, positive_or_null};
use super::http::{self, Done};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub(super) struct MusicGpt {
    pub(super) base_url: String,
    pub(super) version: String,
    pub(super) model: Option<String>,
}

impl MusicGpt {
    pub(super) async fn call(
        &self,
        path: &str,
        key: &str,
        body: Option<JsonValue>,
    ) -> Done<JsonValue> {
        let address = format!("{}/{}/{path}", self.base_url, self.version);
        let mut request = match &body {
            Some(body) => http::client()
                .post(address)
                .header("Content-Type", "application/json")
                .body(body.to_string()),
            None => http::client().get(address),
        };
        request = request.header("Authorization", key);
        let response = http::send(request)
            .await
            .map_err(|_| CODES.error("PROVIDER_UNAVAILABLE"))?;
        // Provider messages are never forwarded: they may echo request data.
        if !response.status().is_success() {
            return Err(CODES.for_status(response.status().as_u16(), "GENERATION_FAILED"));
        }
        let bytes = http::bytes(response, usize::MAX)
            .await
            .map_err(|_| CODES.error("GENERATION_FAILED"))?;
        serde_json::from_slice(&bytes).map_err(|_| CODES.error("GENERATION_FAILED"))
    }

    pub(super) fn payload(&self, request: &JsonValue) -> (JsonValue, Vec<JsonValue>) {
        let mut payload = JsonMap::new();
        let mut put = |name: &str, value: &JsonValue| {
            if js::truthy(Some(value)) {
                payload.insert(name.into(), value.clone());
            }
        };
        put("prompt", &request["prompt"]);
        let style: Vec<String> = ["style", "instrument"]
            .iter()
            .filter(|f| !request[**f].is_null())
            .map(|f| js::string(&request[*f]))
            .collect();
        put("music_style", &json!(style.join(", ")));
        put("lyrics", &request["lyrics"]);
        put("title", &request["title"]);
        let instrumental = request["instrumental"] == json!(true)
            && !(request["vocals"] == json!(true) && request["lyrics"].is_null());
        payload.insert("make_instrumental".into(), json!(instrumental));
        payload.insert("generate_album_cover".into(), json!(false));
        let model = Some(request["model"].clone())
            .filter(|m| !m.is_null())
            .or_else(|| self.model.clone().map(JsonValue::from));
        if self.version != "v1"
            && let Some(model) = model
        {
            payload.insert("model".into(), model);
        }
        let mut warnings = Vec::new();
        if !request["duration"].is_null() {
            warnings.push(json!({ "field": "duration", "code": "CAPABILITY_UNAVAILABLE", "message": "duration is not controllable on this provider" }));
        }
        if !request["tempo"].is_null() {
            warnings.push(json!({ "field": "tempo", "code": "IGNORED", "message": "tempo is only conveyed through the prompt" }));
        }
        if !request["key"].is_null() {
            warnings.push(json!({ "field": "key", "code": "IGNORED", "message": "key is only conveyed through the prompt" }));
        }
        (JsonValue::Object(payload), warnings)
    }
}

/// `fromMusicGPTConversion`: a conversion record as canonical outputs.
pub(super) fn conversion(record: &JsonValue) -> (String, Vec<JsonValue>, JsonValue) {
    let wav_url = |url: &str| {
        regex::Regex::new(r"(?i)\.wav(\?|$)")
            .expect("pattern")
            .is_match(url)
    };
    let mut outputs = Vec::new();
    for n in [1, 2] {
        let mp3 = record
            .get(format!("conversion_path_{n}"))
            .filter(|v| js::truthy(Some(v)));
        let wav = record
            .get(format!("conversion_path_wav_{n}"))
            .filter(|v| js::truthy(Some(v)));
        if mp3.is_none() && wav.is_none() {
            continue;
        }
        let mut formats = JsonMap::new();
        if let Some(wav) = wav {
            formats.insert("wav".into(), wav.clone());
        }
        if let Some(mp3) = mp3 {
            formats.insert("mp3".into(), mp3.clone());
        }
        outputs.push(json!({ "index": n - 1, "format": if wav.is_some() { "wav" } else { "mp3" }, "formats": formats,
            "url": wav.or(mp3), "duration": positive_or_null(record.get(format!("conversion_duration_{n}"))),
            "title": record.get(format!("title_{n}")).filter(|v| js::truthy(Some(v))) }));
    }
    if outputs.is_empty()
        && let Some(url) = record.get("audio_url").filter(|v| js::truthy(Some(v)))
    {
        outputs.push(json!({ "index": 0, "format": if wav_url(&js::string(url)) { "wav" } else { "mp3" }, "formats": {},
            "url": url, "duration": positive_or_null(record.get("conversion_duration")),
            "title": record.get("title").filter(|v| js::truthy(Some(v))) }));
    }
    let status = match js::text(record.get("status").filter(|v| js::truthy(Some(v))))
        .to_uppercase()
        .as_str()
    {
        "IN_QUEUE" | "QUEUED" | "PENDING" => "queued",
        "COMPLETED" => "completed",
        "ERROR" | "FAILED" => "failed",
        _ => "running",
    };
    (
        status.into(),
        outputs,
        record
            .get("conversion_cost")
            .cloned()
            .unwrap_or(JsonValue::Null),
    )
}

/// MusicGPT's dollars (its credits) as the ledger's millionths of a euro cent.
pub(super) fn dollars_cost(dollars: f64) -> Done<i64> {
    Ok(crate::billing::pricing::usd_cents_micro_cents(
        dollars * 100.0,
    )?)
}
