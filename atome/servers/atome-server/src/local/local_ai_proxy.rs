// The AI provider completion route: a person's own provider called through the local server.
use super::*;

#[derive(Deserialize, Default)]
pub(super) struct AiProviderCompletionRequest {
    provider_id: Option<String>,
    provider_type: Option<String>,
    completion_endpoint: Option<String>,
    model: Option<String>,
    prompt: Option<String>,
    system_prompt: Option<String>,
    api_key: Option<String>,
    timeout_ms: Option<u64>,
}

pub(super) fn ai_proxy_timeout_ms(value: Option<u64>) -> u64 {
    let requested = value.unwrap_or(20_000);
    requested.clamp(1_000, 120_000)
}

pub(super) fn is_allowed_ai_proxy_endpoint(endpoint: &str) -> bool {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return false;
    }
    let parsed = match reqwest::Url::parse(trimmed) {
        Ok(url) => url,
        Err(_) => return false,
    };
    match parsed.scheme() {
        "https" => true,
        "http" => matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost")),
        _ => false,
    }
}

pub(super) fn provider_response_text(value: &JsonValue, provider_type: &str) -> String {
    match provider_type {
        "anthropic" => value
            .get("content")
            .and_then(|entry| entry.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        "google" => value
            .get("candidates")
            .and_then(|entry| entry.as_array())
            .and_then(|candidates| candidates.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|parts| parts.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(|text| text.as_str()))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default(),
        _ => value
            .get("choices")
            .and_then(|entry| entry.as_array())
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("message"))
            .and_then(|message| message.get("content"))
            .and_then(|content| content.as_str())
            .unwrap_or_default()
            .to_string(),
    }
}

pub(super) fn provider_response_usage(value: &JsonValue, provider_type: &str) -> JsonValue {
    match provider_type {
        "anthropic" => json!({
            "prompt_tokens": value.get("usage").and_then(|usage| usage.get("input_tokens")).and_then(|entry| entry.as_u64()).unwrap_or(0),
            "completion_tokens": value.get("usage").and_then(|usage| usage.get("output_tokens")).and_then(|entry| entry.as_u64()).unwrap_or(0),
        }),
        "google" => json!({
            "prompt_tokens": value.get("usageMetadata").and_then(|usage| usage.get("promptTokenCount")).and_then(|entry| entry.as_u64()).unwrap_or(0),
            "completion_tokens": value.get("usageMetadata").and_then(|usage| usage.get("candidatesTokenCount")).and_then(|entry| entry.as_u64()).unwrap_or(0),
            "total_tokens": value.get("usageMetadata").and_then(|usage| usage.get("totalTokenCount")).and_then(|entry| entry.as_u64()).unwrap_or(0),
        }),
        _ => value.get("usage").cloned().unwrap_or_else(|| json!({})),
    }
}

pub(super) async fn eve_ai_provider_completion_handler(
    Json(payload): Json<AiProviderCompletionRequest>,
) -> impl IntoResponse {
    let provider_id = payload.provider_id.unwrap_or_default();
    let provider_type = payload.provider_type.unwrap_or_default();
    let completion_endpoint = payload.completion_endpoint.unwrap_or_default();
    let model = payload.model.unwrap_or_default();
    let prompt = payload.prompt.unwrap_or_default();
    let system_prompt = payload.system_prompt.unwrap_or_default();
    let api_key = payload.api_key.unwrap_or_default();

    if provider_type.trim().is_empty()
        || completion_endpoint.trim().is_empty()
        || api_key.trim().is_empty()
    {
        return json_error(StatusCode::BAD_REQUEST, "Missing AI provider fields").into_response();
    }

    if !is_allowed_ai_proxy_endpoint(&completion_endpoint) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "AI provider endpoint is not allowed",
        )
        .into_response();
    }

    let timeout_ms = ai_proxy_timeout_ms(payload.timeout_ms);
    let client = match crate::tls::http_client().and_then(|builder| {
        builder
            .timeout(Duration::from_millis(timeout_ms))
            .build()
            .map_err(|error| error.to_string())
    }) {
        Ok(client) => client,
        Err(err) => {
            return json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to create AI proxy client: {}", err),
            )
            .into_response();
        }
    };

    let upstream_request = match provider_type.trim() {
        "openai" => client
            .post(completion_endpoint.clone())
            .bearer_auth(api_key.clone())
            .json(&json!({
                "model": model,
                "temperature": 0.2,
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": prompt }
                ]
            })),
        "anthropic" => client
            .post(completion_endpoint.clone())
            .header("x-api-key", api_key.clone())
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": model,
                "max_tokens": 2048,
                "system": system_prompt,
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            })),
        "google" => {
            let url = format!(
                "{}/{}:generateContent?key={}",
                completion_endpoint.trim_end_matches('/'),
                urlencoding::encode(&model),
                urlencoding::encode(&api_key)
            );
            client.post(url).json(&json!({
                "systemInstruction": {
                    "parts": [{ "text": system_prompt }]
                },
                "contents": [
                    {
                        "role": "user",
                        "parts": [{ "text": prompt }]
                    }
                ]
            }))
        }
        _ => {
            return json_error(StatusCode::BAD_REQUEST, "Unsupported AI provider type")
                .into_response();
        }
    };

    let upstream = match upstream_request.send().await {
        Ok(response) => response,
        Err(err) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                &format!("AI proxy request failed: {}", err),
            )
            .into_response();
        }
    };

    if !upstream.status().is_success() {
        let status =
            StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        let content_type = upstream
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.to_string())
            .unwrap_or_else(|| "application/json".to_string());
        let body = upstream.text().await.unwrap_or_else(|_| String::new());
        return Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, content_type)
            .body(Body::from(body))
            .unwrap_or_else(|_| {
                json_error(
                    StatusCode::BAD_GATEWAY,
                    "AI proxy upstream error forwarding failed",
                )
                .into_response()
            });
    }

    let payload_value: JsonValue = match upstream.json().await {
        Ok(value) => value,
        Err(err) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                &format!("AI proxy invalid upstream JSON: {}", err),
            )
            .into_response();
        }
    };

    let response_text = provider_response_text(&payload_value, provider_type.trim());
    let usage = provider_response_usage(&payload_value, provider_type.trim());

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "provider_id": provider_id,
            "provider_type": provider_type,
            "text": response_text,
            "usage": usage,
            "raw": payload_value
        })),
    )
        .into_response()
}
