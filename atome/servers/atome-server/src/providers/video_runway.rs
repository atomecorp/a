// Runway, the video service's provider (video.rs): its models, ratios, credits per second and its
// HTTP API (`X-Runway-Version`), on atome's key. Its names and pricing live here alone.
use super::generation::round;
use super::http::{self, Done};
use super::video::CODES;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub(super) const PRICING_VERSION: &str = "2026-09-21";
pub(super) const USD_PER_CREDIT: f64 = 0.01;
pub(super) const UNIT: &str = "credits_per_second";

pub(super) struct Runway {
    pub(super) base_url: String,
    pub(super) version: String,
    pub(super) text_model: String,
    pub(super) image_model: String,
}

/// `Math.round(credits * usdPerCredit * 100) / 100`.
pub(super) fn usd(credits: f64) -> JsonValue {
    js::number_json(round(credits * USD_PER_CREDIT * 100.0) / 100.0)
}

/// Runway credits as the ledger's millionths of a euro cent.
pub(super) fn credits_cost(credits: f64) -> Done<i64> {
    Ok(crate::billing::pricing::usd_cents_micro_cents(
        credits * USD_PER_CREDIT * 100.0,
    )?)
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
    pub(super) fn payload(
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

    pub(super) fn estimate(&self, request: &JsonValue) -> Done<JsonValue> {
        let (model, limits, _) = self.pick(request)?;
        let (_, _, _, effective) = self.payload(request)?;
        let credits = limits.credits_per_second * effective["duration"].as_f64().unwrap_or(0.0);
        Ok(
            json!({ "model": model, "credits": js::number_json(credits), "costUsd": usd(credits), "unit": UNIT,
            "pricingVersion": PRICING_VERSION }),
        )
    }

    pub(super) async fn call(
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
