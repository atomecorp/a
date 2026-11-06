// The AI Audio Service (server/ai_audio/, ported): provider-neutral audio generation, the client
// naming only canonical `audio.*` actions, the keys read from the person's vault. MusicGPT's names
// (endpoints, payload fields, statuses) live in its adapter alone; the mock (`ATOME_AI_AUDIO_MOCK=1`,
// probes only) renders a short sine arpeggio as a real WAV. Provider URLs stay here: a client
// fetches an output's bytes through `audio.output`.
use super::credentials::Credentials;
use super::generation::{self, Codes, Jobs, Provider, now_ms, or_null, round, text};
use super::http::{self, Done};
use crate::settings::Settings;
use crate::vault_router::js;
use base64::Engine;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

pub const ERRORS: [&str; 13] = [
    "PROVIDER_UNAVAILABLE",
    "AUTH_ERROR",
    "QUOTA_EXCEEDED",
    "PAYMENT_REQUIRED",
    "RATE_LIMITED",
    "INVALID_REQUEST",
    "CAPABILITY_UNAVAILABLE",
    "GENERATION_FAILED",
    "TIMEOUT",
    "CANCELLED",
    "OUTPUT_UNAVAILABLE",
    "NO_PROVIDER_KEY",
    "JOB_NOT_FOUND",
];
const CODES: Codes = Codes {
    list: &ERRORS,
    fallback: "GENERATION_FAILED",
    capability: "CAPABILITY_UNAVAILABLE",
};
const CANONICAL_FIELDS: [&str; 13] = [
    "prompt",
    "style",
    "instrument",
    "instrumental",
    "vocals",
    "lyrics",
    "title",
    "duration",
    "tempo",
    "key",
    "referenceAudio",
    "referenceMidi",
    "stemTargets",
];

struct MusicGpt {
    base_url: String,
    version: String,
    model: Option<String>,
}

enum Adapter {
    MusicGpt(MusicGpt),
    Mock,
}

impl Provider for Adapter {
    fn id(&self) -> &'static str {
        match self {
            Self::MusicGpt(_) => "musicgpt",
            Self::Mock => "mock",
        }
    }
    fn label(&self) -> &'static str {
        match self {
            Self::MusicGpt(_) => "MusicGPT",
            Self::Mock => "Mock audio",
        }
    }
    fn remote(&self) -> bool {
        matches!(self, Self::MusicGpt(_))
    }
    fn credential(&self) -> Option<&'static str> {
        match self {
            Self::MusicGpt(_) => Some("musicgpt"),
            Self::Mock => None,
        }
    }
    fn capabilities(&self) -> JsonValue {
        match self {
            // Not wired to a validated endpoint yet: never claimed.
            Self::MusicGpt(_) => {
                json!({ "textToMusic": true, "instrumentalGeneration": true, "vocalGeneration": true,
                "asyncJobs": true, "webhooks": false, "durationControl": false, "stems": false, "audioToMidi": false,
                "midiConditioning": false, "audioConditioning": false, "extend": false, "remix": false, "inpaint": false })
            }
            Self::Mock => {
                json!({ "textToMusic": true, "instrumentalGeneration": true, "vocalGeneration": false, "asyncJobs": true })
            }
        }
    }
    fn models(&self) -> Option<JsonValue> {
        None
    }
}

#[derive(Clone)]
struct Job {
    id: String,
    principal: String,
    provider: &'static str,
    requested: JsonValue,
    provider_job_id: JsonValue,
    model: JsonValue,
    status: String,
    eta: JsonValue,
    cost_estimate: JsonValue,
    cost_actual: JsonValue,
    variants: JsonValue,
    warnings: Vec<JsonValue>,
    outputs: Vec<JsonValue>,
    request: JsonValue,
    created_at: i64,
    completed_at: Option<i64>,
    error: Option<String>,
}

impl generation::Job for Job {
    fn principal(&self) -> &str {
        &self.principal
    }
    fn created_at(&self) -> i64 {
        self.created_at
    }
}

/// A positive finite `Number(value)`, else none.
fn positive(value: Option<&JsonValue>) -> Option<f64> {
    Some(js::number(value)).filter(|number| number.is_finite() && *number > 0.0)
}

/// `normalizeAudioAiRequest`: the only shape the domain accepts.
fn normalize(input: &JsonValue) -> Done<JsonValue> {
    let field = |name: &str| input.get(name);
    let operation = Some(text(field("operation"), None))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "generate".into());
    let provider = Some(text(field("provider"), None))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "auto".into());
    let stems = field("stemTargets")
        .and_then(JsonValue::as_array)
        .filter(|items| !items.is_empty())
        .map(|items| {
            json!(
                items
                    .iter()
                    .take(8)
                    .map(|item| js::text(Some(item)))
                    .collect::<Vec<_>>()
            )
        });
    let format = input
        .pointer("/output/preferredFormat")
        .and_then(JsonValue::as_str)
        .filter(|f| ["wav", "mp3"].contains(f));
    let request = json!({
        "operation": operation, "provider": provider, "model": or_null(text(field("model"), None)),
        "prompt": text(field("prompt"), Some(1000)), "style": or_null(text(field("style"), Some(200))),
        "instrument": or_null(text(field("instrument"), Some(100))), "instrumental": field("instrumental") == Some(&json!(true)),
        "vocals": match field("vocals") { Some(JsonValue::Bool(flag)) => json!(flag), _ => JsonValue::Null },
        "lyrics": or_null(text(field("lyrics"), Some(4000))), "title": or_null(text(field("title"), Some(200))),
        "duration": positive(field("duration")).map(|d| js::number_json(d.min(600.0))),
        "tempo": positive(field("tempo")).map(js::number_json), "key": or_null(text(field("key"), Some(20))),
        "referenceAudio": js::truthy(field("referenceAudio")).then_some(true),
        "referenceMidi": js::truthy(field("referenceMidi")).then_some(true), "stemTargets": stems,
        "output": { "preferredFormat": format.unwrap_or("wav") },
        "routing": { "allowFallback": input.pointer("/routing/allowFallback") != Some(&json!(false)) },
    });
    if request["operation"] != json!("generate") {
        return Err(CODES.error("CAPABILITY_UNAVAILABLE"));
    }
    if request["prompt"] == json!("") && request["lyrics"].is_null() {
        return Err(CODES.error("INVALID_REQUEST"));
    }
    Ok(request)
}

/// The capabilities a request needs.
fn required(request: &JsonValue) -> Vec<&'static str> {
    let mut required = vec!["textToMusic"];
    if request["instrumental"] == json!(true) {
        required.push("instrumentalGeneration");
    }
    if request["vocals"] == json!(true) || !request["lyrics"].is_null() {
        required.push("vocalGeneration");
    }
    for (field, capability) in [
        ("referenceMidi", "midiConditioning"),
        ("referenceAudio", "audioConditioning"),
        ("stemTargets", "stems"),
    ] {
        if !request[field].is_null() {
            required.push(capability);
        }
    }
    required
}

/// A 16-bit mono WAV of a four-note sine arpeggio, two seconds at 22 050 Hz.
fn mock_wav() -> Vec<u8> {
    const RATE: u32 = 22050;
    let frames = 2 * RATE;
    let mut out = Vec::with_capacity(44 + frames as usize * 2);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + frames * 2).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    for value in [
        16u32.to_le_bytes().to_vec(),
        1u16.to_le_bytes().to_vec(),
        1u16.to_le_bytes().to_vec(),
        RATE.to_le_bytes().to_vec(),
        (RATE * 2).to_le_bytes().to_vec(),
        2u16.to_le_bytes().to_vec(),
        16u16.to_le_bytes().to_vec(),
    ] {
        out.extend_from_slice(&value);
    }
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(frames * 2).to_le_bytes());
    let notes = [440.0, 554.37, 659.25, 880.0];
    for i in 0..frames {
        let note = notes[(f64::from(i) / f64::from(frames) * 4.0).floor() as usize];
        let envelope = (f64::from(frames - i) / 2000.0).min(1.0);
        let sample = (2.0 * std::f64::consts::PI * note * f64::from(i) / f64::from(RATE)).sin()
            * 9000.0
            * envelope;
        out.extend_from_slice(&(round(sample) as i16).to_le_bytes());
    }
    out
}

impl MusicGpt {
    async fn call(&self, path: &str, key: &str, body: Option<JsonValue>) -> Done<JsonValue> {
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

    fn payload(&self, request: &JsonValue) -> (JsonValue, Vec<JsonValue>) {
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
fn conversion(record: &JsonValue) -> (String, Vec<JsonValue>, JsonValue) {
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

/// `Number(value) || null`.
fn positive_or_null(value: Option<&JsonValue>) -> JsonValue {
    let number = value.map_or(f64::NAN, |v| js::number(Some(v)));
    if number == 0.0 || number.is_nan() {
        JsonValue::Null
    } else {
        js::number_json(number)
    }
}

/// The process's audio service: its providers in preference order, and the jobs.
pub struct Audio {
    adapters: Vec<Adapter>,
    jobs: Jobs<Job>,
}

impl Audio {
    pub fn load(settings: &Settings) -> Self {
        let version = settings.get("MUSICGPT_API_VERSION").filter(|v| {
            v.len() > 1 && v.starts_with('v') && v[1..].bytes().all(|c| c.is_ascii_digit())
        });
        let mut adapters = vec![Adapter::MusicGpt(MusicGpt {
            base_url: settings
                .get("MUSICGPT_API_BASE")
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| "https://api.musicgpt.com/api/public".into())
                .trim_end_matches('/')
                .to_string(),
            version: version.unwrap_or_else(|| "v1".into()),
            model: settings.get("MUSICGPT_MODEL").filter(|v| !v.is_empty()),
        })];
        if settings.get("ATOME_AI_AUDIO_MOCK").as_deref() == Some("1") {
            adapters.push(Adapter::Mock);
        }
        Self {
            adapters,
            jobs: Jobs::default(),
        }
    }

    /// Whether `credential` is one of this service's provider keys.
    pub fn holds_credential(&self, credential: &str) -> bool {
        self.adapters
            .iter()
            .any(|adapter| adapter.credential() == Some(credential))
    }

    /// `validateKey`: a lookup of an unknown task is a 4xx for a valid key, 401/403 for a refused one.
    pub async fn validate_key(&self, credential: &str, key: &str) -> Done<()> {
        for adapter in &self.adapters {
            if let Adapter::MusicGpt(gpt) = adapter
                && adapter.credential() == Some(credential)
            {
                let probe =
                    "byId?conversionType=MUSIC_AI&task_id=00000000-0000-0000-0000-000000000000";
                if let Err(failure) = gpt.call(probe, key, None).await
                    && (failure.message == "AUTH_ERROR"
                        || failure.message == "PROVIDER_UNAVAILABLE")
                {
                    return Err(failure);
                }
            }
        }
        Ok(())
    }

    /// One `audio.*` action.
    pub async fn action(
        &self,
        action: &str,
        payload: &JsonValue,
        principal: &str,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let input = payload
            .get("request")
            .filter(|v| js::truthy(Some(v)))
            .unwrap_or(payload);
        match action {
            "audio.providers" => {
                Ok(json!({ "providers": generation::list(&self.adapters, vault).await? }))
            }
            "audio.capabilities" => {
                let id = payload
                    .get("provider")
                    .filter(|v| js::truthy(Some(v)))
                    .map(|v| js::text(Some(v)))
                    .unwrap_or_default();
                generation::capabilities(&self.adapters, &CODES, &id)
            }
            "audio.generate" => self.generate(principal, input, vault).await,
            "audio.job" => self.job(principal, payload.get("job_id"), vault).await,
            "audio.output" => {
                let format = payload
                    .get("format")
                    .and_then(JsonValue::as_str)
                    .filter(|f| ["wav", "mp3"].contains(f));
                self.output(principal, payload, format).await
            }
            _ => Err("provider_operation_not_allowed".into()),
        }
    }

    fn public(job: &Job) -> JsonValue {
        let parameters: JsonMap<String, JsonValue> = CANONICAL_FIELDS
            .iter()
            .filter(|field| !job.request[**field].is_null() && job.request[**field] != json!(false))
            .map(|field| (field.to_string(), job.request[*field].clone()))
            .collect();
        let outputs: Vec<JsonValue> = job.outputs.iter().map(|output| {
            let formats: Vec<&String> = output["formats"].as_object().map(|f| f.keys().collect()).unwrap_or_default();
            json!({ "type": "audio", "index": output["index"], "format": output["format"], "formats": formats,
                "duration": output["duration"], "title": output["title"] })
        }).collect();
        json!({ "jobId": job.id, "provider": job.provider, "requestedProvider": job.requested,
            "providerJobId": job.provider_job_id, "model": job.model, "status": job.status, "eta": job.eta,
            "costEstimate": job.cost_estimate, "costActual": job.cost_actual, "outputs": outputs,
            "metadata": { "prompt": job.request["prompt"], "generationParameters": parameters, "variants": job.variants,
                "createdAt": js::iso(job.created_at), "completedAt": job.completed_at.map(js::iso),
                "elapsedMs": job.completed_at.unwrap_or_else(now_ms) - job.created_at },
            "warnings": job.warnings })
    }

    async fn generate(
        &self,
        principal: &str,
        input: &JsonValue,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let request = normalize(input)?;
        let wanted = js::string(&request["provider"]);
        let (adapter, key, _reason) = generation::resolve(
            &self.adapters,
            &CODES,
            &wanted,
            &required(&request),
            vault,
            |_| Ok(None),
        )
        .await?;
        let (provider_job_id, model, eta, cost, variants, warnings) = match adapter {
            Adapter::Mock => (
                json!(format!("mock-{}", now_ms())),
                json!("mock-sine"),
                json!(1),
                json!({ "amount": 0, "unit": "credits" }),
                json!([]),
                Vec::new(),
            ),
            Adapter::MusicGpt(gpt) => {
                let (payload, mut warnings) = gpt.payload(&request);
                let data = gpt
                    .call(
                        "MusicAI",
                        key.as_deref().unwrap_or(""),
                        Some(payload.clone()),
                    )
                    .await?;
                if data.get("success") == Some(&json!(false)) || !js::truthy(data.get("task_id")) {
                    return Err(CODES.error("GENERATION_FAILED"));
                }
                if js::truthy(data.get("is_flagged")) {
                    warnings.push(
                        json!({ "code": "FLAGGED", "message": "prompt flagged by provider" }),
                    );
                }
                let estimate = data.get("credit_estimate").filter(|v| !v.is_null())
                    .map_or(JsonValue::Null, |v| json!({ "amount": js::number_json(js::number(Some(v))), "unit": "credits" }));
                let variants: Vec<&JsonValue> = ["conversion_id_1", "conversion_id_2"]
                    .iter()
                    .filter_map(|f| data.get(*f).filter(|v| js::truthy(Some(v))))
                    .collect();
                let model = payload
                    .get("model")
                    .filter(|m| js::truthy(Some(m)))
                    .cloned()
                    .unwrap_or_else(|| json!(format!("musicai-{}", gpt.version)));
                (
                    data["task_id"].clone(),
                    model,
                    positive_or_null(data.get("eta")),
                    estimate,
                    json!(variants),
                    warnings,
                )
            }
        };
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            principal: principal.into(),
            provider: adapter.id(),
            requested: request["provider"].clone(),
            provider_job_id,
            model,
            status: "queued".into(),
            eta,
            cost_estimate: cost,
            cost_actual: JsonValue::Null,
            variants,
            warnings,
            outputs: Vec::new(),
            request,
            created_at: now_ms(),
            completed_at: None,
            error: None,
        };
        let out = Self::public(&job);
        self.jobs.put(&job.id.clone(), job);
        Ok(out)
    }

    async fn job(
        &self,
        principal: &str,
        id: Option<&JsonValue>,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let mut job = self.jobs.owned(&CODES, principal, id)?;
        if job.status == "completed" || job.status == "failed" {
            return Ok(Self::public(&job));
        }
        let Some(adapter) = self.adapters.iter().find(|a| a.id() == job.provider) else {
            return Err(CODES.error("PROVIDER_UNAVAILABLE"));
        };
        let key = generation::key_for(adapter, vault).await?;
        if adapter.credential().is_some() && key.is_none() {
            return Err(CODES.error("NO_PROVIDER_KEY"));
        }
        let (status, outputs, cost, error) = match adapter {
            Adapter::Mock => (
                "completed".to_string(),
                vec![
                    json!({ "index": 0, "format": "wav", "formats": {}, "url": null, "duration": 2, "title": "Mock" }),
                ],
                None,
                None,
            ),
            Adapter::MusicGpt(gpt) => {
                let path = format!(
                    "byId?conversionType=MUSIC_AI&task_id={}",
                    generation::component(&job.provider_job_id)
                );
                let data = gpt.call(&path, key.as_deref().unwrap_or(""), None).await?;
                let record = data
                    .get("conversion")
                    .filter(|v| js::truthy(Some(v)))
                    .unwrap_or(&data);
                let record = if js::truthy(Some(record)) {
                    record.clone()
                } else {
                    json!({})
                };
                let (status, outputs, cost) = conversion(&record);
                let cost = (!cost.is_null()).then(|| json!({ "amount": js::number_json(js::number(Some(&cost))), "unit": "credits" }));
                let error = (status == "failed").then_some("GENERATION_FAILED");
                (status, outputs, cost, error)
            }
        };
        job.status = status;
        if let Some(cost) = cost {
            job.cost_actual = cost;
        }
        if job.status == "completed" {
            job.outputs = outputs;
            job.completed_at = Some(now_ms());
            if job.outputs.is_empty() {
                job.status = "failed".into();
                job.error = Some("OUTPUT_UNAVAILABLE".into());
            }
        }
        if job.status == "failed" {
            job.error = Some(
                job.error
                    .clone()
                    .or(error.map(str::to_string))
                    .unwrap_or_else(|| "GENERATION_FAILED".into()),
            );
        }
        let mut out = Self::public(&job);
        if job.status == "failed" {
            out["error"] = json!(job.error);
        }
        self.jobs.put(&job.id.clone(), job);
        Ok(out)
    }

    /// One output downloaded here, so a client (an opaque iOS origin) never fetches a provider URL.
    async fn output(
        &self,
        principal: &str,
        payload: &JsonValue,
        preferred: Option<&str>,
    ) -> Done<JsonValue> {
        let job = self.jobs.owned(&CODES, principal, payload.get("job_id"))?;
        if job.status != "completed" {
            return Err(CODES.error("OUTPUT_UNAVAILABLE"));
        }
        let index = js::number(Some(
            payload
                .get("index")
                .filter(|v| js::truthy(Some(v)))
                .unwrap_or(&json!(0)),
        ));
        let Some(output) = job
            .outputs
            .iter()
            .find(|o| o["index"].as_f64() == Some(index))
            .or(job.outputs.first())
        else {
            return Err(CODES.error("OUTPUT_UNAVAILABLE"));
        };
        if job.provider == "mock" {
            return Ok(
                json!({ "base64": base64::engine::general_purpose::STANDARD.encode(mock_wav()), "mime": "audio/wav",
                "format": output["format"], "duration": output["duration"] }),
            );
        }
        let format = preferred
            .map(str::to_string)
            .unwrap_or_else(|| js::string(&job.request["output"]["preferredFormat"]));
        let mut candidates: Vec<String> = Vec::new();
        let listed = std::iter::once(&output["formats"][format.as_str()])
            .chain(
                output["formats"]
                    .as_object()
                    .into_iter()
                    .flat_map(|f| f.values()),
            )
            .chain(std::iter::once(&output["url"]));
        for url in listed.filter(|v| js::truthy(Some(v))).map(js::string) {
            if !candidates.contains(&url) {
                candidates.push(url);
            }
        }
        let wav_url = regex::Regex::new(r"(?i)\.wav(\?|$)").expect("pattern");
        for url in candidates {
            if !url
                .get(..8)
                .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https://"))
            {
                continue;
            }
            let response = http::following()
                .get(&url)
                .send()
                .await
                .map_err(|_| super::http::Failure::from("fetch failed"))?;
            if !response.status().is_success() {
                continue;
            }
            let mime = response
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .filter(|v| !v.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| {
                    if wav_url.is_match(&url) {
                        "audio/wav".into()
                    } else {
                        "audio/mpeg".into()
                    }
                });
            let bytes = http::bytes(response, 20_000_000).await?;
            let wav = mime.to_lowercase().contains("wav") || wav_url.is_match(&url);
            return Ok(
                json!({ "base64": base64::engine::general_purpose::STANDARD.encode(bytes), "mime": mime,
                "format": if wav { "wav" } else { "mp3" }, "duration": output["duration"] }),
            );
        }
        Err(CODES.error("OUTPUT_UNAVAILABLE"))
    }
}
