// The provider contract, read from its generated copy (eVe/registry/generated/ai_provider_catalog.json,
// scripts/registry/registry_ai_provider_catalog.mjs, from atome/src/squirrel/ai/model_catalog_registry.js):
// the OpenAI service tools and their parameter schemas, the model profiles and modality models, the
// model providers' list endpoints, the tools one voice session may carry.
use serde_json::Value as JsonValue;
use std::sync::OnceLock;

fn catalog() -> &'static JsonValue {
    static CATALOG: OnceLock<JsonValue> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../../../eVe/registry/generated/ai_provider_catalog.json"
        ))
        .expect("ai_provider_catalog.json is the registry's own output")
    })
}

/// The service tool answering `action`.
pub fn service(action: &str) -> Option<&'static JsonValue> {
    catalog()["service_tools"]
        .as_array()?
        .iter()
        .find(|tool| tool["action"] == JsonValue::String(action.into()))
}

/// `OPENAI_MODEL_PROFILES[0].model`.
pub fn first_model() -> &'static str {
    catalog()["model_profiles"][0]["model"]
        .as_str()
        .unwrap_or_default()
}

/// `OPENAI_MODALITY_MODELS[name]`, the voice backend's model for `voice_backend`.
pub fn modality(name: &str) -> &'static str {
    let model = &catalog()["modality_models"][name];
    model
        .as_str()
        .or_else(|| model["model"].as_str())
        .unwrap_or_default()
}

/// `getAiModelProviderDefinition(provider).list_models_endpoint`.
pub fn list_endpoint(provider: &str) -> Option<&'static str> {
    catalog()["list_models_endpoints"][provider.trim().to_lowercase()]
        .as_str()
        .filter(|endpoint| !endpoint.is_empty())
}

/// `PROVIDER_SESSION_TOOL_LIMIT`.
pub fn session_tool_limit() -> usize {
    catalog()["session_tool_limit"].as_u64().unwrap_or(0) as usize
}

fn commands(family: &str) -> &'static [JsonValue] {
    catalog()[format!("{family}_commands")]
        .as_array()
        .map_or(&[], Vec::as_slice)
}

/// The command `action` of `family` (`music`, `strava`, `social`: `MUSIC_COMMANDS`…), its input
/// schema with it.
pub fn command(family: &str, action: &str) -> Option<&'static JsonValue> {
    commands(family)
        .iter()
        .find(|command| command["action"] == JsonValue::String(action.into()))
}

/// Every music command's action, in the registry's order.
pub fn music_actions() -> Vec<&'static str> {
    commands("music")
        .iter()
        .filter_map(|command| command["action"].as_str())
        .collect()
}
