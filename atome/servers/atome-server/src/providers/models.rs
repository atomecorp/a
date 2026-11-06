// A provider's model listing (server/providerModelCatalog.js, ported): only the registry's own list
// endpoint is reached, the key stays in its header and never returns with the catalog; every page
// shares one deadline (the operation's).
use super::catalog;
use super::http::{self, Done, Failure};
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;

const KNOWN: [&str; 5] = [
    "invalid_api_key",
    "authentication_error",
    "permission_denied",
    "rate_limit_exceeded",
    "insufficient_quota",
];

fn listed<'a>(provider: &str, payload: &'a JsonValue) -> Option<&'a Vec<JsonValue>> {
    if provider == "google" {
        payload.get("models")?.as_array()
    } else {
        payload
            .as_array()
            .or_else(|| payload.get("data")?.as_array())
    }
}

/// `listProviderModelCatalog({ provider, key })`: `{ data: [{ id }] }`.
pub async fn list(provider: &str, key: &str) -> Done<JsonValue> {
    let Some(endpoint) = catalog::list_endpoint(provider) else {
        return Err("provider_catalog_unavailable".into());
    };
    if key.is_empty() || key.encode_utf16().count() > 1024 || key.chars().any(char::is_whitespace) {
        return Err("provider_key_invalid".into());
    }
    let mut models: indexmap::IndexMap<String, JsonValue> = indexmap::IndexMap::new();
    let mut cursors = HashSet::new();
    let mut cursor = String::new();
    for _ in 0..100 {
        let mut url = url::Url::parse(endpoint).map_err(|_| Failure::from("Invalid URL"))?;
        {
            let mut query = url.query_pairs_mut();
            match provider {
                "anthropic" => {
                    query.append_pair("limit", "100");
                }
                "google" => {
                    query.append_pair("pageSize", "1000");
                }
                _ => {}
            }
            if !cursor.is_empty() {
                let name = match provider {
                    "google" => "pageToken",
                    "anthropic" => "after_id",
                    _ => "after",
                };
                query.append_pair(name, &cursor);
            }
        }
        let request = http::client().get(url.as_str());
        let request = match provider {
            "anthropic" => request
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01"),
            "google" => request.header("x-goog-api-key", key),
            _ => request.header("Authorization", format!("Bearer {key}")),
        };
        let response = http::send(request).await?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let code = http::bytes(response, 65536)
                .await
                .ok()
                .and_then(|bytes| serde_json::from_slice::<JsonValue>(&bytes).ok())
                .and_then(|payload| {
                    [
                        payload.pointer("/error/code"),
                        payload.pointer("/error/type"),
                    ]
                    .into_iter()
                    .flatten()
                    .find(|code| crate::vault_router::js::truthy(Some(code)))
                    .and_then(JsonValue::as_str)
                    .map(str::to_string)
                })
                .filter(|code| KNOWN.contains(&code.as_str()));
            return Err(Failure {
                message: code.unwrap_or_else(|| format!("provider_catalog_http_{status}")),
                http_status: Some(status),
                ..Failure::default()
            });
        }
        let bytes = http::bytes(response, 20_000_000).await?;
        let payload: JsonValue = serde_json::from_slice(&bytes)
            .map_err(|_| Failure::from("provider_catalog_response_invalid"))?;
        let Some(page) = listed(provider, &payload) else {
            return Err("provider_catalog_response_invalid".into());
        };
        for model in page {
            if model.get("lifecycle") == Some(&json!("retired"))
                || model.get("archived") == Some(&json!(true))
            {
                continue;
            }
            if provider == "google"
                && !model
                    .get("supportedGenerationMethods")
                    .and_then(JsonValue::as_array)
                    .is_some_and(|methods| methods.contains(&json!("generateContent")))
            {
                continue;
            }
            if provider == "mistral"
                && model.pointer("/capabilities/completion_chat") != Some(&json!(true))
            {
                continue;
            }
            let raw = crate::vault_router::js::first(model, &["id", "name"])
                .filter(|id| crate::vault_router::js::truthy(Some(id)))
                .map(|id| crate::vault_router::js::text(Some(id)))
                .unwrap_or_default();
            let id = raw
                .strip_prefix("models/")
                .unwrap_or(&raw)
                .trim()
                .to_string();
            if id.is_empty() || id.encode_utf16().count() > 256 {
                continue;
            }
            models.insert(id.clone(), json!({ "id": id }));
            if provider == "mistral" {
                for alias in model
                    .get("aliases")
                    .and_then(JsonValue::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(JsonValue::as_str)
                    .filter(|alias| !alias.is_empty() && alias.encode_utf16().count() <= 256)
                {
                    models.insert(alias.into(), json!({ "id": alias }));
                }
            }
        }
        let has_more = crate::vault_router::js::truthy(payload.get("has_more"));
        let next = if provider == "google" {
            payload.get("nextPageToken").cloned()
        } else if has_more {
            payload
                .get("last_id")
                .filter(|id| crate::vault_router::js::truthy(Some(id)))
                .or_else(|| page.last().and_then(|last| last.get("id")))
                .cloned()
        } else {
            None
        };
        let next = next.filter(|next| crate::vault_router::js::truthy(Some(next)));
        let Some(next) = next else {
            if has_more {
                return Err("provider_catalog_cursor_invalid".into());
            }
            return Ok(json!({ "data": models.into_values().collect::<Vec<_>>() }));
        };
        let Some(next) = next
            .as_str()
            .filter(|next| next.encode_utf16().count() <= 4096 && !cursors.contains(*next))
        else {
            return Err("provider_catalog_cursor_invalid".into());
        };
        cursors.insert(next.to_string());
        cursor = next.to_string();
    }
    Err("provider_catalog_page_limit".into())
}
