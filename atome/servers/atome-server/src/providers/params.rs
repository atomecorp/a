// The parameter check of the provider's service tools (`validateParams` and `stableStringify` of
// atome/src/squirrel/ai/agent_gateway_normalize.js, ported): the JSON-schema subset the registry
// writes, read as the browser's agent gateway reads it.
use serde_json::Value as JsonValue;

/// `stableStringify`: keys sorted at every depth, numbers as JavaScript writes them.
pub fn stable_stringify(value: &JsonValue) -> String {
    match value {
        JsonValue::Array(items) => format!(
            "[{}]",
            items
                .iter()
                .map(stable_stringify)
                .collect::<Vec<_>>()
                .join(",")
        ),
        JsonValue::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            let parts: Vec<String> = keys
                .into_iter()
                .map(|key| {
                    format!(
                        "{}:{}",
                        JsonValue::String(key.clone()),
                        stable_stringify(&map[key])
                    )
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
        JsonValue::Number(number) => number
            .as_f64()
            .map(|value| {
                crate::vault_router::js::string(&crate::vault_router::js::number_json(value))
            })
            .unwrap_or_else(|| number.to_string()),
        other => other.to_string(),
    }
}

fn type_matches(value: &JsonValue, kind: &JsonValue) -> bool {
    match kind {
        JsonValue::Array(kinds) => kinds.iter().any(|kind| type_matches(value, kind)),
        JsonValue::String(kind) => match kind.as_str() {
            "array" => value.is_array(),
            "null" => value.is_null(),
            "integer" => value.as_f64().is_some_and(|n| n.fract() == 0.0),
            "number" => value.as_f64().is_some_and(f64::is_finite),
            "object" => value.is_object(),
            "string" => value.is_string(),
            "boolean" => value.is_boolean(),
            _ => false,
        },
        _ => false,
    }
}

fn number_of(schema: &JsonValue, name: &str) -> Option<f64> {
    schema.get(name).and_then(JsonValue::as_f64)
}

/// `validateParams(schema, params).ok`.
pub fn valid(schema: &JsonValue, value: &JsonValue) -> bool {
    check(schema, value, 0)
}

fn check(schema: &JsonValue, value: &JsonValue, depth: usize) -> bool {
    if depth > 32 || *schema == JsonValue::Bool(false) {
        return false;
    }
    if !crate::vault_router::js::truthy(Some(schema)) || *schema == JsonValue::Bool(true) {
        return true;
    }
    let all = |name: &str| schema.get(name).and_then(JsonValue::as_array);
    let matches = |rule: &JsonValue| check(rule, value, depth + 1);
    if all("anyOf").is_some_and(|rules| !rules.iter().any(matches)) {
        return false;
    }
    if all("oneOf").is_some_and(|rules| rules.iter().filter(|rule| matches(rule)).count() != 1) {
        return false;
    }
    if all("allOf").is_some_and(|rules| !rules.iter().all(matches)) {
        return false;
    }
    if schema.get("not").is_some_and(matches) {
        return false;
    }
    if let Some(kind) = schema
        .get("type")
        .filter(|kind| crate::vault_router::js::truthy(Some(kind)))
        && !type_matches(value, kind)
    {
        return false;
    }
    let stable = stable_stringify(value);
    if all("enum").is_some_and(|items| !items.iter().any(|item| stable_stringify(item) == stable)) {
        return false;
    }
    if schema
        .get("const")
        .is_some_and(|constant| stable_stringify(constant) != stable)
    {
        return false;
    }
    if let Some(number) = value.as_f64()
        && (number_of(schema, "minimum").is_some_and(|minimum| number < minimum)
            || number_of(schema, "maximum").is_some_and(|maximum| number > maximum))
    {
        return false;
    }
    if let Some(text) = value.as_str() {
        let length = text.encode_utf16().count() as f64;
        if number_of(schema, "minLength").is_some_and(|minimum| length < minimum)
            || number_of(schema, "maxLength").is_some_and(|maximum| length > maximum)
        {
            return false;
        }
        if let Some(pattern) = schema.get("pattern").and_then(JsonValue::as_str)
            && !regex::Regex::new(pattern).is_ok_and(|pattern| pattern.is_match(text))
        {
            return false;
        }
    }
    if let Some(items) = value.as_array() {
        let length = items.len() as f64;
        if number_of(schema, "minItems").is_some_and(|minimum| length < minimum)
            || number_of(schema, "maxItems").is_some_and(|maximum| length > maximum)
        {
            return false;
        }
        if crate::vault_router::js::truthy(schema.get("uniqueItems")) {
            let unique: std::collections::HashSet<String> =
                items.iter().map(stable_stringify).collect();
            if unique.len() != items.len() {
                return false;
            }
        }
        if let Some(rule) = schema
            .get("items")
            .filter(|rule| crate::vault_router::js::truthy(Some(rule)))
            && !items.iter().all(|item| check(rule, item, depth + 1))
        {
            return false;
        }
    } else if let Some(object) = value.as_object() {
        if all("required").is_some_and(|required| {
            required
                .iter()
                .any(|key| !key.as_str().is_some_and(|key| object.contains_key(key)))
        }) {
            return false;
        }
        for (key, item) in object {
            let rule = schema
                .get("properties")
                .and_then(|properties| properties.get(key))
                .filter(|rule| !rule.is_null())
                .or_else(|| schema.get("additionalProperties"));
            if let Some(rule) = rule
                && !check(rule, item, depth + 1)
            {
                return false;
            }
        }
    }
    true
}
