// The AI Video Service (server/ai_video/, ported): provider-neutral video generation through the
// canonical `video.*` actions, a budget a routing constraint, the generated file stored as one of
// the person's files (their `Downloads`, registered as an atome) and answered as a file reference,
// never as bytes nor a provider URL. Runway's names and pricing live in its adapter alone; the mock
// (`ATOME_AI_VIDEO_MOCK=1`, probes only) answers the bundled demo video.
use super::credentials::Credentials;
use super::generation::{self, Codes, Jobs, Provider, now_ms, or_null, round, text};
use super::http::{self, Done};
use crate::media::storage::{self, Registration, Storage};
use crate::settings::Settings;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::path::PathBuf;
use std::sync::Arc;

pub const ERRORS: [&str; 17] = [
    "AUTH_ERROR",
    "QUOTA_EXCEEDED",
    "PAYMENT_REQUIRED",
    "RATE_LIMITED",
    "INVALID_REQUEST",
    "UNSUPPORTED_CAPABILITY",
    "UNSUPPORTED_MODEL",
    "CONTENT_REJECTED",
    "PROVIDER_UNAVAILABLE",
    "JOB_TIMEOUT",
    "JOB_FAILED",
    "DOWNLOAD_FAILED",
    "COST_LIMIT_EXCEEDED",
    "UNKNOWN_PROVIDER_ERROR",
    "NO_PROVIDER_KEY",
    "JOB_NOT_FOUND",
    "CANCELLED",
];
const CODES: Codes = Codes {
    list: &ERRORS,
    fallback: "UNKNOWN_PROVIDER_ERROR",
    capability: "UNSUPPORTED_CAPABILITY",
};
const ASPECT_RATIOS: [&str; 6] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const PRICING_VERSION: &str = "2026-09-21";
const USD_PER_CREDIT: f64 = 0.01;
const UNIT: &str = "credits_per_second";

struct Runway {
    base_url: String,
    version: String,
    text_model: String,
    image_model: String,
}

enum Adapter {
    Runway(Runway),
    Mock(PathBuf),
}

impl Provider for Adapter {
    fn id(&self) -> &'static str {
        match self {
            Self::Runway(_) => "runway",
            Self::Mock(_) => "mock",
        }
    }
    fn label(&self) -> &'static str {
        match self {
            Self::Runway(_) => "Runway",
            Self::Mock(_) => "Mock video",
        }
    }
    fn remote(&self) -> bool {
        matches!(self, Self::Runway(_))
    }
    fn credential(&self) -> Option<&'static str> {
        match self {
            Self::Runway(_) => Some("runway"),
            Self::Mock(_) => None,
        }
    }
    fn capabilities(&self) -> JsonValue {
        match self {
            // Not wired to a validated endpoint in this adapter: never claimed.
            Self::Runway(_) => {
                json!({ "textToVideo": true, "imageToVideo": true, "asyncJobs": true, "polling": true,
                "costEstimate": true, "cancel": true, "videoToVideo": false, "referenceImage": false, "referenceVideo": false,
                "firstFrame": false, "lastFrame": false, "keyframes": false, "cameraControl": false, "audioConditioning": false,
                "nativeAudio": false, "extend": false, "edit": false, "inpaint": false, "outpaint": false, "upscale": false,
                "frameRateEnhancement": false, "alphaOutput": false, "nativeSemanticLayers": false, "webhooks": false })
            }
            Self::Mock(_) => {
                json!({ "textToVideo": true, "imageToVideo": true, "asyncJobs": true, "polling": true,
                "costEstimate": true, "cancel": true })
            }
        }
    }
    fn models(&self) -> Option<JsonValue> {
        match self {
            Self::Runway(runway) => Some(
                json!({ "textToVideo": runway.text_model, "imageToVideo": runway.image_model,
                "pricingVersion": PRICING_VERSION }),
            ),
            Self::Mock(_) => None,
        }
    }
}

#[derive(Clone)]
struct Job {
    id: String,
    principal: String,
    provider: &'static str,
    request: JsonValue,
    provider_job_id: JsonValue,
    model: JsonValue,
    effective: JsonValue,
    status: String,
    progress: JsonValue,
    estimate: JsonValue,
    actual_cost: JsonValue,
    warnings: Vec<JsonValue>,
    outputs: Vec<JsonValue>,
    routing_reason: String,
    created_at: i64,
    started_at: Option<i64>,
    completed_at: Option<i64>,
    error: Option<String>,
    stored: JsonMap<String, JsonValue>,
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
fn finite(value: Option<&JsonValue>) -> Option<f64> {
    Some(js::number(value)).filter(|number| number.is_finite() && *number > 0.0)
}

/// `normalizeVideoAiRequest`: the only shape the domain accepts.
fn normalize(input: &JsonValue) -> Done<JsonValue> {
    let field = |name: &str| input.get(name);
    let image = input
        .pointer("/source/image")
        .filter(|v| js::truthy(Some(v)));
    let data_uri = image
        .and_then(|image| image.get("dataUri"))
        .and_then(JsonValue::as_str)
        .filter(|uri| {
            regex::Regex::new(r"^data:image/(png|jpeg|webp);base64,")
                .expect("pattern")
                .is_match(uri)
        });
    let options = field("providerOptions")
        .filter(|v| v.is_object() || v.is_array())
        .cloned()
        .unwrap_or_else(|| json!({}));
    let priority = input
        .pointer("/routing/priority")
        .and_then(JsonValue::as_str)
        .filter(|p| ["quality", "cost", "latency"].contains(p));
    let seed = input
        .pointer("/controls/seed")
        .filter(|seed| seed.as_f64().is_some_and(|s| s.fract() == 0.0))
        .cloned();
    let request = json!({
        "operation": Some(text(field("operation"), None)).filter(|t| !t.is_empty()).unwrap_or_else(|| "generate".into()),
        "provider": Some(text(field("provider"), None)).filter(|t| !t.is_empty()).unwrap_or_else(|| "auto".into()),
        "model": or_null(text(field("model"), None)), "prompt": text(field("prompt"), Some(1000)),
        "negativePrompt": or_null(text(field("negativePrompt"), Some(1000))),
        "duration": js::number_json(finite(field("duration")).map_or(5.0, |d| d.min(60.0))),
        "aspectRatio": field("aspectRatio").and_then(JsonValue::as_str).filter(|r| ASPECT_RATIOS.contains(r)).unwrap_or("16:9"),
        "resolution": or_null(text(field("resolution"), Some(20))), "fps": finite(field("fps")).map(js::number_json),
        "source": {
            "image": image.map(|image| json!({ "dataUri": data_uri, "atomeId": or_null(text(image.get("atomeId"), Some(200))) })),
            "video": js::truthy(input.pointer("/source/video")).then_some(true),
            "audio": js::truthy(input.pointer("/source/audio")).then_some(true),
        },
        "controls": { "seed": seed },
        "routing": { "priority": priority.unwrap_or("quality"), "maxCostUsd": finite(input.pointer("/routing/maxCostUsd")).map(js::number_json) },
        "providerOptions": options,
    });
    let image = &request["source"]["image"];
    if !image.is_null() && image["dataUri"].is_null() {
        return Err(CODES.error("INVALID_REQUEST"));
    }
    if image["dataUri"]
        .as_str()
        .is_some_and(|uri| uri.len() > 5_000_000)
    {
        return Err(CODES.error("INVALID_REQUEST"));
    }
    if request["operation"] != json!("generate") {
        return Err(CODES.error("UNSUPPORTED_CAPABILITY"));
    }
    if request["prompt"] == json!("") && image.is_null() {
        return Err(CODES.error("INVALID_REQUEST"));
    }
    Ok(request)
}

fn required(request: &JsonValue) -> Vec<&'static str> {
    let mut required = vec![if request["source"]["image"].is_null() {
        "textToVideo"
    } else {
        "imageToVideo"
    }];
    if !request["source"]["video"].is_null() {
        required.push("videoToVideo");
    }
    if !request["source"]["audio"].is_null() {
        required.push("audioConditioning");
    }
    required
}

/// `Math.round(credits * usdPerCredit * 100) / 100`.
fn usd(credits: f64) -> JsonValue {
    js::number_json(round(credits * USD_PER_CREDIT * 100.0) / 100.0)
}

// Canonical aspect ratio as Runway's `ratio`, and what each model takes (only documented values).
fn runway_ratio(aspect: &str) -> &'static str {
    match aspect {
        "9:16" => "720:1280",
        "1:1" => "960:960",
        "4:3" => "1104:832",
        "3:4" => "832:1104",
        "21:9" => "1584:672",
        _ => "1280:720",
    }
}

struct Limits {
    text: Option<&'static [&'static str]>,
    image: &'static [&'static str],
    credits_per_second: f64,
}

fn limits(model: &str) -> Option<Limits> {
    match model {
        "gen4.5" => Some(Limits {
            text: Some(&["1280:720", "720:1280"]),
            image: &[
                "1280:720", "720:1280", "1104:832", "960:960", "832:1104", "1584:672",
            ],
            credits_per_second: 12.0,
        }),
        "gen4_turbo" => Some(Limits {
            text: None,
            image: &[
                "1280:720", "720:1280", "1104:832", "832:1104", "960:960", "1584:672",
            ],
            credits_per_second: 5.0,
        }),
        _ => None,
    }
}

impl Runway {
    fn pick(&self, request: &JsonValue) -> Done<(String, Limits, bool)> {
        let image = !request["source"]["image"].is_null();
        let wanted = [
            request.get("model"),
            request.pointer("/providerOptions/runway/model"),
        ]
        .into_iter()
        .flatten()
        .find(|v| js::truthy(Some(v)));
        let model = match wanted {
            Some(JsonValue::String(model)) => model.clone(),
            Some(_) => return Err(CODES.error("UNSUPPORTED_MODEL")),
            None if image => self.image_model.clone(),
            None => self.text_model.clone(),
        };
        match limits(&model) {
            Some(limits) if image || limits.text.is_some() => Ok((model, limits, image)),
            _ => Err(CODES.error("UNSUPPORTED_MODEL")),
        }
    }

    /// `toRunwayPayload`: every adjusted or ignored field a warning.
    fn payload(
        &self,
        request: &JsonValue,
    ) -> Done<(JsonValue, Vec<JsonValue>, &'static str, JsonValue)> {
        let (model, limits, image) = self.pick(request)?;
        let mut warnings = Vec::new();
        let allowed = if image {
            limits.image
        } else {
            limits.text.unwrap_or_default()
        };
        let aspect = js::string(&request["aspectRatio"]);
        let mut ratio = runway_ratio(&aspect);
        if !allowed.contains(&ratio) {
            let wanted = if aspect == "9:16" || aspect == "3:4" {
                "720:1280"
            } else {
                "1280:720"
            };
            warnings.push(json!({ "field": "aspectRatio", "code": "ADJUSTED", "message": format!("{aspect} unavailable for {model}") }));
            ratio = if allowed.contains(&wanted) {
                wanted
            } else {
                allowed[0]
            };
        }
        let asked = request["duration"].as_f64().unwrap_or(5.0);
        let duration = round(asked).clamp(2.0, 10.0);
        if duration != asked {
            warnings.push(json!({ "field": "duration", "code": "ADJUSTED", "message": format!("clamped to {duration}s") }));
        }
        if !request["resolution"].is_null() {
            warnings.push(json!({ "field": "resolution", "code": "IGNORED", "message": "resolution follows the ratio on this provider" }));
        }
        if !request["fps"].is_null() {
            warnings.push(json!({ "field": "fps", "code": "IGNORED" }));
        }
        if !request["negativePrompt"].is_null() {
            warnings.push(json!({ "field": "negativePrompt", "code": "IGNORED" }));
        }
        let mut payload =
            json!({ "model": model, "ratio": ratio, "duration": js::number_json(duration) });
        if request["prompt"] != json!("") {
            payload["promptText"] = request["prompt"].clone();
        }
        if image {
            payload["promptImage"] = request["source"]["image"]["dataUri"].clone();
        }
        if !request["controls"]["seed"].is_null() {
            payload["seed"] = request["controls"]["seed"].clone();
        }
        let path = if image {
            "image_to_video"
        } else {
            "text_to_video"
        };
        Ok((
            payload,
            warnings,
            path,
            json!({ "duration": js::number_json(duration), "ratio": ratio }),
        ))
    }

    fn estimate(&self, request: &JsonValue) -> Done<JsonValue> {
        let (model, limits, _) = self.pick(request)?;
        let (_, _, _, effective) = self.payload(request)?;
        let credits = limits.credits_per_second * effective["duration"].as_f64().unwrap_or(0.0);
        Ok(
            json!({ "model": model, "credits": js::number_json(credits), "costUsd": usd(credits), "unit": UNIT,
            "pricingVersion": PRICING_VERSION }),
        )
    }

    async fn call(
        &self,
        method: reqwest::Method,
        path: &str,
        key: &str,
        body: Option<JsonValue>,
    ) -> Done<JsonValue> {
        let mut request = http::client()
            .request(method, format!("{}{path}", self.base_url))
            .header("Authorization", format!("Bearer {key}"))
            .header("X-Runway-Version", &self.version);
        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body.to_string());
        }
        let response = http::send(request)
            .await
            .map_err(|_| CODES.error("PROVIDER_UNAVAILABLE"))?;
        // Provider messages are never forwarded (they may echo request data).
        if !response.status().is_success() {
            return Err(CODES.for_status(response.status().as_u16(), "UNKNOWN_PROVIDER_ERROR"));
        }
        if response.status().as_u16() == 204 {
            return Ok(json!({}));
        }
        let bytes = http::bytes(response, usize::MAX).await.unwrap_or_default();
        Ok(serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({})))
    }
}

/// The process's video service: its providers in preference order, the jobs, where outputs go.
pub struct Video {
    adapters: Vec<Adapter>,
    jobs: Jobs<Job>,
    storage: Arc<Storage>,
    central: Central,
}

impl Video {
    pub fn load(
        settings: &Settings,
        project_root: &std::path::Path,
        storage: Arc<Storage>,
        central: Central,
    ) -> Self {
        let get = |name: &str, default: &str| {
            settings
                .get(name)
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| default.into())
        };
        let mut adapters = vec![Adapter::Runway(Runway {
            base_url: get("RUNWAY_API_BASE", "https://api.dev.runwayml.com")
                .trim_end_matches('/')
                .to_string(),
            version: get("RUNWAY_API_VERSION", "2024-11-06"),
            text_model: get("RUNWAY_TEXT_MODEL", "gen4.5"),
            image_model: get("RUNWAY_IMAGE_MODEL", "gen4_turbo"),
        })];
        if settings.get("ATOME_AI_VIDEO_MOCK").as_deref() == Some("1") {
            adapters.push(Adapter::Mock(
                project_root.join("atome/src/assets/videos/superman.mp4"),
            ));
        }
        Self {
            adapters,
            jobs: Jobs::default(),
            storage,
            central,
        }
    }

    pub fn holds_credential(&self, credential: &str) -> bool {
        self.adapters
            .iter()
            .any(|adapter| adapter.credential() == Some(credential))
    }

    pub async fn validate_key(&self, credential: &str, key: &str) -> Done<()> {
        for adapter in &self.adapters {
            if let Adapter::Runway(runway) = adapter
                && adapter.credential() == Some(credential)
            {
                runway
                    .call(reqwest::Method::GET, "/v1/organization", key, None)
                    .await?;
            }
        }
        Ok(())
    }

    fn estimate_of(adapter: &Adapter, request: &JsonValue) -> Done<JsonValue> {
        match adapter {
            Adapter::Runway(runway) => runway.estimate(request),
            Adapter::Mock(_) => Ok(
                json!({ "model": "mock-demo", "credits": 0, "costUsd": 0, "unit": UNIT, "pricingVersion": "mock" }),
            ),
        }
    }

    async fn route<'a>(
        &'a self,
        request: &JsonValue,
        vault: &Credentials,
    ) -> Done<(&'a Adapter, Option<String>, String)> {
        let wanted = js::string(&request["provider"]);
        let budget = request["routing"]["maxCostUsd"].as_f64();
        generation::resolve(
            &self.adapters,
            &CODES,
            &wanted,
            &required(request),
            vault,
            |adapter| {
                let cost = Self::estimate_of(adapter, request)?["costUsd"].as_f64();
                Ok(match (budget, cost) {
                    (Some(budget), Some(cost)) if cost > budget => Some("COST_LIMIT_EXCEEDED"),
                    _ => None,
                })
            },
        )
        .await
    }

    /// One `video.*` action.
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
            "video.providers" => {
                Ok(json!({ "providers": generation::list(&self.adapters, vault).await? }))
            }
            "video.capabilities" => {
                let id = payload
                    .get("provider")
                    .filter(|v| js::truthy(Some(v)))
                    .map(|v| js::text(Some(v)))
                    .unwrap_or_default();
                generation::capabilities(&self.adapters, &CODES, &id)
            }
            "video.estimate" => {
                let request = normalize(input)?;
                let (adapter, _, reason) = self.route(&request, vault).await?;
                let mut out = json!({ "provider": adapter.id(), "routingReason": reason });
                if let JsonValue::Object(estimate) = Self::estimate_of(adapter, &request)? {
                    out.as_object_mut().expect("object").extend(estimate);
                }
                Ok(out)
            }
            "video.generate" => self.generate(principal, input, vault).await,
            "video.job" => self.job(principal, payload.get("job_id"), vault).await,
            "video.cancel" => self.cancel(principal, payload.get("job_id"), vault).await,
            "video.output" => {
                let index = js::number_or(payload.get("index"), 0.0);
                self.store_output(principal, payload.get("job_id"), index, vault)
                    .await
            }
            _ => Err("provider_operation_not_allowed".into()),
        }
    }

    fn public(job: &Job) -> JsonValue {
        let iso = |at: Option<i64>| at.map(js::iso);
        let outputs: Vec<JsonValue> = job.outputs.iter()
            .map(|output| json!({ "type": "video", "index": output["index"], "format": output["format"] })).collect();
        let request = &job.request;
        json!({ "jobId": job.id, "provider": job.provider, "requestedProvider": request["provider"],
            "providerJobId": job.provider_job_id, "model": job.model,
            "operation": if request["source"]["image"].is_null() { "textToVideo" } else { "imageToVideo" },
            "status": job.status, "progress": job.progress, "createdAt": js::iso(job.created_at),
            "startedAt": iso(job.started_at), "completedAt": iso(job.completed_at),
            "estimatedCostUsd": job.estimate["costUsd"], "actualCostUsd": job.actual_cost,
            "pricingVersion": job.estimate["pricingVersion"], "latencyMs": job.completed_at.map(|at| at - job.created_at),
            "error": job.error, "routingReason": job.routing_reason, "outputAssets": outputs,
            "parameters": { "prompt": request["prompt"], "negativePrompt": request["negativePrompt"],
                "duration": if job.effective["duration"].is_null() { request["duration"].clone() } else { job.effective["duration"].clone() },
                "aspectRatio": request["aspectRatio"], "ratio": job.effective["ratio"], "resolution": request["resolution"],
                "seed": request["controls"]["seed"], "sourceImageAtomeId": request["source"]["image"]["atomeId"] },
            "warnings": job.warnings })
    }

    async fn generate(
        &self,
        principal: &str,
        input: &JsonValue,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let request = normalize(input)?;
        let (adapter, key, reason) = self.route(&request, vault).await?;
        let estimate = Self::estimate_of(adapter, &request)?;
        let (provider_job_id, model, effective, warnings) = match adapter {
            Adapter::Mock(_) => (
                json!(format!("mock-{}", now_ms())),
                json!("mock-demo"),
                json!({ "duration": request["duration"], "ratio": request["aspectRatio"] }),
                Vec::new(),
            ),
            Adapter::Runway(runway) => {
                let (payload, warnings, path, effective) = runway.payload(&request)?;
                let data = runway
                    .call(
                        reqwest::Method::POST,
                        &format!("/v1/{path}"),
                        key.as_deref().unwrap_or(""),
                        Some(payload.clone()),
                    )
                    .await?;
                if !js::truthy(data.get("id")) {
                    return Err(CODES.error("UNKNOWN_PROVIDER_ERROR"));
                }
                (
                    data["id"].clone(),
                    payload["model"].clone(),
                    effective,
                    warnings,
                )
            }
        };
        let model = if js::truthy(Some(&model)) {
            model
        } else {
            estimate["model"].clone()
        };
        let job = Job {
            id: uuid::Uuid::new_v4().to_string(),
            principal: principal.into(),
            provider: adapter.id(),
            request,
            provider_job_id,
            model,
            effective,
            status: "queued".into(),
            progress: JsonValue::Null,
            estimate,
            actual_cost: JsonValue::Null,
            warnings,
            outputs: Vec::new(),
            routing_reason: reason,
            created_at: now_ms(),
            started_at: None,
            completed_at: None,
            error: None,
            stored: JsonMap::new(),
        };
        let out = Self::public(&job);
        self.jobs.put(&job.id.clone(), job);
        Ok(out)
    }

    async fn ready(&self, job: &Job, vault: &Credentials) -> Done<(&Adapter, String)> {
        let Some(adapter) = self.adapters.iter().find(|a| a.id() == job.provider) else {
            return Err(CODES.error("PROVIDER_UNAVAILABLE"));
        };
        let key = generation::key_for(adapter, vault).await?;
        if adapter.credential().is_some() && key.is_none() {
            return Err(CODES.error("NO_PROVIDER_KEY"));
        }
        Ok((adapter, key.unwrap_or_default()))
    }

    async fn job(
        &self,
        principal: &str,
        id: Option<&JsonValue>,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let mut job = self.jobs.owned(&CODES, principal, id)?;
        if ["succeeded", "failed", "cancelled", "expired"].contains(&job.status.as_str()) {
            return Ok(Self::public(&job));
        }
        let (adapter, key) = self.ready(&job, vault).await?;
        let polled = match adapter {
            Adapter::Mock(_) => {
                json!({ "status": "succeeded", "outputs": [{ "index": 0, "url": null, "format": "mp4" }], "costActualUsd": 0 })
            }
            Adapter::Runway(runway) => {
                let path = format!("/v1/tasks/{}", generation::component(&job.provider_job_id));
                let task = runway.call(reqwest::Method::GET, &path, &key, None).await?;
                let status = match js::text(task.get("status").filter(|v| js::truthy(Some(v))))
                    .to_uppercase()
                    .as_str()
                {
                    "PENDING" | "THROTTLED" => "queued",
                    "SUCCEEDED" => "succeeded",
                    "FAILED" => "failed",
                    "CANCELLED" => "cancelled",
                    _ => "running",
                };
                let failure = format!(
                    "{} {}",
                    js::id(task.get("failureCode")),
                    js::id(task.get("failure"))
                );
                let rejected = regex::Regex::new(r"(?i)SAFETY|MODERATION|CONTENT")
                    .expect("pattern")
                    .is_match(&failure);
                let webm = regex::Regex::new(r"(?i)\.webm(\?|$)").expect("pattern");
                let outputs: Vec<JsonValue> = if status == "succeeded" {
                    task["output"].as_array().into_iter().flatten().enumerate().map(|(index, url)| json!({ "index": index, "url": url,
                        "format": if webm.is_match(&js::text(Some(url))) { "webm" } else { "mp4" } })).collect()
                } else {
                    Vec::new()
                };
                let progress = js::number(task.get("progress"));
                let credits = js::number(task.pointer("/estimatedCost/credits"));
                let mut polled = json!({ "status": status, "progress": progress.is_finite().then(|| js::number_json(progress)),
                    "outputs": outputs, "error": (status == "failed").then_some(if rejected { "CONTENT_REJECTED" } else { "JOB_FAILED" }) });
                if status == "succeeded" && credits.is_finite() {
                    polled["costActualUsd"] = usd(credits);
                }
                polled
            }
        };
        let status = js::string(&polled["status"]);
        if status == "running" && job.started_at.is_none() {
            job.started_at = Some(now_ms());
        }
        job.status = status.clone();
        if polled["progress"].as_f64().is_some_and(f64::is_finite) {
            job.progress = polled["progress"].clone();
        }
        if !polled["costActualUsd"].is_null() {
            job.actual_cost = polled["costActualUsd"].clone();
        }
        if status == "succeeded" {
            job.outputs = polled["outputs"].as_array().cloned().unwrap_or_default();
            job.completed_at = Some(now_ms());
            if job.outputs.is_empty() {
                job.status = "failed".into();
                job.error = Some("DOWNLOAD_FAILED".into());
            }
        }
        if status == "failed" || status == "cancelled" {
            job.completed_at = Some(now_ms());
            let known = polled["error"]
                .as_str()
                .filter(|e| ERRORS.contains(e))
                .unwrap_or("JOB_FAILED");
            job.error = Some(
                if status == "cancelled" {
                    "CANCELLED"
                } else {
                    known
                }
                .into(),
            );
        }
        let out = Self::public(&job);
        self.jobs.put(&job.id.clone(), job);
        Ok(out)
    }

    async fn cancel(
        &self,
        principal: &str,
        id: Option<&JsonValue>,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let mut job = self.jobs.owned(&CODES, principal, id)?;
        if ["succeeded", "failed", "cancelled"].contains(&job.status.as_str()) {
            return Ok(Self::public(&job));
        }
        let (adapter, key) = self.ready(&job, vault).await?;
        if let Adapter::Runway(runway) = adapter {
            let path = format!("/v1/tasks/{}", generation::component(&job.provider_job_id));
            runway
                .call(reqwest::Method::DELETE, &path, &key, None)
                .await?;
        }
        job.status = "cancelled".into();
        job.error = Some("CANCELLED".into());
        job.completed_at = Some(now_ms());
        let out = Self::public(&job);
        self.jobs.put(&job.id.clone(), job);
        Ok(out)
    }

    /// The provider's temporary output stored as one of the person's files.
    async fn store_output(
        &self,
        principal: &str,
        id: Option<&JsonValue>,
        index: f64,
        vault: &Credentials,
    ) -> Done<JsonValue> {
        let mut job = self.jobs.owned(&CODES, principal, id)?;
        if job.status != "succeeded" {
            return Err(CODES.error("DOWNLOAD_FAILED"));
        }
        let slot = js::string(&js::number_json(index));
        if let Some(stored) = job.stored.get(&slot) {
            return Ok(stored.clone());
        }
        let Some(output) = job
            .outputs
            .iter()
            .find(|o| o["index"].as_f64() == Some(index))
            .or(job.outputs.first())
            .cloned()
        else {
            return Err(CODES.error("DOWNLOAD_FAILED"));
        };
        let (adapter, _) = self.ready(&job, vault).await?;
        let (bytes, mime) = match adapter {
            Adapter::Mock(file) => (
                tokio::fs::read(file)
                    .await
                    .map_err(|e| super::http::Failure::from(e.to_string()))?,
                "video/mp4".to_string(),
            ),
            Adapter::Runway(_) => {
                let url = output["url"].as_str().unwrap_or("");
                if !url
                    .get(..8)
                    .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https://"))
                {
                    return Err(CODES.error("DOWNLOAD_FAILED"));
                }
                let response = http::following()
                    .get(url)
                    .send()
                    .await
                    .map_err(|_| CODES.error("DOWNLOAD_FAILED"))?;
                if !response.status().is_success() {
                    return Err(CODES.error("DOWNLOAD_FAILED"));
                }
                let mime = response
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .filter(|v| !v.is_empty())
                    .unwrap_or("video/mp4")
                    .to_string();
                (http::bytes(response, 200_000_000).await?, mime)
            }
        };
        let lowered = mime.to_lowercase();
        let extension = if lowered.contains("webm") {
            ".webm"
        } else if lowered.contains("quicktime") {
            ".mov"
        } else {
            ".mp4"
        };
        let prompt = Some(js::string(&job.request["prompt"]))
            .filter(|p| !p.is_empty())
            .unwrap_or_else(|| "video_ai".into());
        let decomposed: String = icu_normalizer::DecomposingNormalizerBorrowed::new_nfd()
            .normalize(&prompt.to_lowercase())
            .chars()
            .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
            .collect();
        let slug = regex::Regex::new("[^a-z0-9]+")
            .expect("pattern")
            .replace_all(&decomposed, "_");
        let slug = js::slice(slug.trim_matches('_'), 40);
        let slug = if slug.is_empty() {
            "video_ai".to_string()
        } else {
            slug
        };
        let placed = self
            .storage
            .upload_path(principal, &format!("{slug}{extension}"))
            .map_err(|e| super::http::Failure::from(e.to_string()))?;
        tokio::fs::write(&placed.file_path, &bytes)
            .await
            .map_err(|e| super::http::Failure::from(e.to_string()))?;
        let registration = Registration {
            atome_id: None,
            atome_type: Some("video"),
            original_name: placed.file_name.clone(),
            mime_type: Some(mime.clone()),
            size: bytes.len() as u64,
            file_path: Some(placed.relative_path.clone()),
        };
        let atome_id = match storage::register(
            &self.central,
            &placed.file_name,
            principal,
            registration,
        )
        .await
        {
            Ok(atome_id) => atome_id,
            Err(_) => {
                let _ = tokio::fs::remove_file(&placed.file_path).await;
                return Err(CODES.error("DOWNLOAD_FAILED"));
            }
        };
        let stored = json!({ "file_name": placed.file_name, "owner_id": principal, "file_path": placed.relative_path,
            "atome_id": atome_id, "size_bytes": bytes.len(), "mime": mime, "job": Self::public(&job) });
        job.stored.insert(slot, stored.clone());
        self.jobs.put(&job.id.clone(), job);
        Ok(stored)
    }
}
