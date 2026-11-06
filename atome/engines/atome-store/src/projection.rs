// Projection of committed events into state_current and the atome rows.
use super::*;

// Same patch as Fastify's `extractEventPatch` (atome/src/shared/adole_event_contract.js):
// a delete marks the atome deleted; a restore unmarks it and re-applies what it carries.
pub fn extract_event_patch(
    kind: &str,
    payload: &Option<JsonValue>,
    ts: &str,
) -> Option<JsonMap<String, JsonValue>> {
    let kind = kind.to_ascii_lowercase();
    if kind == "delete" {
        let mut map = JsonMap::new();
        map.insert("__deleted".to_string(), JsonValue::Bool(true));
        map.insert("deleted_at".to_string(), JsonValue::String(ts.to_string()));
        return Some(map);
    }

    let payload_obj = match payload.as_ref() {
        Some(JsonValue::Object(map)) => Some(map.clone()),
        Some(JsonValue::String(raw)) => match serde_json::from_str(raw) {
            Ok(JsonValue::Object(map)) => Some(map),
            _ => None,
        },
        _ => None,
    };
    let carried = payload_obj.as_ref().and_then(|map| {
        ["props", "properties", "patch", "delta"]
            .iter()
            .find_map(|key| map.get(*key).filter(|value| js_truthy(value)))
    });

    if kind == "restore" {
        let mut restored = match carried {
            Some(JsonValue::Object(map)) => map.clone(),
            _ => JsonMap::new(),
        };
        restored.insert("__deleted".into(), json!(false));
        restored.insert("deleted_at".into(), JsonValue::Null);
        return Some(restored);
    }

    match carried {
        Some(JsonValue::Object(map)) => Some(map.clone()),
        _ => None,
    }
}

// JavaScript truthiness of a JSON value (the `a || b` of the Fastify contract).
pub fn js_truthy(value: &JsonValue) -> bool {
    match value {
        JsonValue::Null => false,
        JsonValue::Bool(flag) => *flag,
        JsonValue::Number(number) => number.as_f64().is_some_and(|v| v != 0.0),
        JsonValue::String(text) => !text.is_empty(),
        _ => true,
    }
}

pub fn resolve_event_actor_user_id(event: &EventRecord) -> Option<String> {
    let actor = event.actor.as_ref()?;
    if let Some(raw) = actor.as_str() {
        let value = raw.trim();
        if !value.is_empty() && value != "anonymous" {
            return Some(value.to_string());
        }
        return None;
    }
    let object = actor.as_object()?;
    for key in ["id", "user_id", "userId", "atome_id", "atomeId"] {
        if let Some(raw) = object.get(key).and_then(|value| value.as_str()) {
            let value = raw.trim();
            if !value.is_empty() && value != "anonymous" {
                return Some(value.to_string());
            }
        }
    }
    None
}
