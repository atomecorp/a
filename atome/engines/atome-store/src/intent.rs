// The idempotency intent of an event (S1): what a retry of the same event id must
// repeat exactly, else it is `event_id_conflict`. Same intent and same hash as
// Fastify (`eventIdempotencyIntent` in atome/src/shared/adole_event_contract.js,
// `intentHash` in database/adole_event_mutation.js): sha256 of the JavaScript
// `JSON.stringify` of the key-sorted intent, so a vault keeps one hash whichever
// server recorded the event.
use super::*;

// Keys that are structure or projection, never an atome property (EVENT_META_PROPERTY_KEYS).
pub const EVENT_META_PROPERTY_KEYS: [&str; 12] = [
    "type",
    "atome_type",
    "kind",
    "parent_id",
    "parentId",
    "project_id",
    "projectId",
    "owner_id",
    "ownerId",
    "owner",
    "__deleted",
    "deleted_at",
];

fn non_empty(value: Option<&JsonValue>) -> Option<&str> {
    value
        .and_then(JsonValue::as_str)
        .filter(|text| !text.is_empty())
}

fn payload_object(event: &EventRecord) -> JsonMap<String, JsonValue> {
    match event.payload.as_ref() {
        Some(JsonValue::Object(map)) => map.clone(),
        Some(JsonValue::String(raw)) => match serde_json::from_str(raw) {
            Ok(JsonValue::Object(map)) => map,
            _ => JsonMap::new(),
        },
        _ => JsonMap::new(),
    }
}

// `eventDeletedPropertyKeys`: trimmed, first occurrence kept, meta keys refused.
pub fn event_deleted_property_keys(payload: &JsonMap<String, JsonValue>) -> Vec<String> {
    let Some(JsonValue::Array(keys)) = payload
        .get("delete_keys")
        .or_else(|| payload.get("deleteKeys"))
    else {
        return Vec::new();
    };
    let mut seen = Vec::new();
    for key in keys {
        if !js_truthy(key) {
            continue;
        }
        let key = match key {
            JsonValue::String(text) => text.trim().to_string(),
            JsonValue::Number(number) => js_number(number),
            other => other.to_string(),
        };
        if !key.is_empty()
            && !EVENT_META_PROPERTY_KEYS.contains(&key.as_str())
            && !seen.contains(&key)
        {
            seen.push(key);
        }
    }
    seen
}

// `eventExpectedPropertyVersions`: whole non-negative versions, a numeric string included.
pub fn event_expected_property_versions(
    payload: &JsonMap<String, JsonValue>,
) -> JsonMap<String, JsonValue> {
    let mut versions = JsonMap::new();
    let Some(JsonValue::Object(source)) = payload
        .get("expected_versions")
        .or_else(|| payload.get("expectedVersions"))
    else {
        return versions;
    };
    for (raw_key, raw_version) in source {
        let key = raw_key.trim();
        if key.is_empty() || EVENT_META_PROPERTY_KEYS.contains(&key) {
            continue;
        }
        let version = match raw_version {
            JsonValue::Number(number) => number.as_f64(),
            JsonValue::String(text) if text.trim().is_empty() => Some(0.0),
            JsonValue::String(text) => text.trim().parse::<f64>().ok(),
            JsonValue::Bool(flag) => Some(f64::from(u8::from(*flag))),
            JsonValue::Null => Some(0.0),
            _ => None,
        };
        if let Some(version) = version.filter(|v| v.fract() == 0.0 && *v >= 0.0 && v.is_finite()) {
            versions.insert(key.to_string(), json!(version as u64));
        }
    }
    versions
}

fn actor_identity(actor: Option<&JsonValue>) -> JsonValue {
    let parsed = match actor {
        Some(JsonValue::String(raw)) => {
            serde_json::from_str(raw).unwrap_or(JsonValue::String(raw.clone()))
        }
        Some(value) => value.clone(),
        None => JsonValue::Null,
    };
    match &parsed {
        JsonValue::Object(map) => ["id", "user_id", "userId"]
            .iter()
            .find_map(|key| map.get(*key).filter(|v| js_truthy(v)).cloned())
            .unwrap_or(JsonValue::Null),
        value if js_truthy(value) => parsed,
        _ => JsonValue::Null,
    }
}

// The event as Fastify normalizes it: a structural `parent_id` is also merged into
// `payload.props` (normalizeEventInput), so the intent's props carry it.
fn intent_patch(
    event: &EventRecord,
    payload: &JsonMap<String, JsonValue>,
) -> JsonMap<String, JsonValue> {
    let mut shaped = payload.clone();
    if let Some(parent_id) = non_empty(payload.get("parent_id")) {
        let mut props = match payload.get("props") {
            Some(JsonValue::Object(props)) => props.clone(),
            _ => JsonMap::new(),
        };
        props.insert("parent_id".into(), json!(parent_id));
        shaped.insert("props".into(), JsonValue::Object(props));
    }
    extract_event_patch(&event.kind, &Some(JsonValue::Object(shaped)), &event.ts)
        .unwrap_or_default()
}

pub fn event_intent(event: &EventRecord) -> JsonValue {
    let payload = payload_object(event);
    let props = intent_patch(event, &payload);
    let parent_id = if event.kind.eq_ignore_ascii_case("delete") {
        None
    } else {
        non_empty(payload.get("parent_id"))
            .or_else(|| non_empty(props.get("parent_id")))
            .or_else(|| non_empty(props.get("parentId")))
    };
    json!({
        "kind": event.kind,
        "atome_id": event.atome_id.as_deref().filter(|id| !id.is_empty()),
        "project_id": event.project_id.as_deref().filter(|id| !id.is_empty()),
        "parent_id": parent_id,
        "tx_id": event.tx_id.as_deref().filter(|id| !id.is_empty()),
        "gesture_id": event.gesture_id.as_deref().filter(|id| !id.is_empty()),
        "actor_id": actor_identity(event.actor.as_ref()),
        "props": props,
        "delete_keys": event_deleted_property_keys(&payload),
        "expected_versions": event_expected_property_versions(&payload),
    })
}

pub fn intent_hash(event: &EventRecord) -> String {
    let digest = Sha256::digest(js_json(&event_intent(event)).as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

// A retry carries the intent the event was recorded with, else it is refused.
// An event recorded before intent hashes keeps its compacted payload (unchanged
// keys dropped by `capture_before`, the project resolved by containment): only
// what it still proves is compared — identity, actor, versions, deletes and the
// properties it recorded.
pub fn assert_replay(stored: &EventRecord, incoming: &EventRecord) -> Result<(), String> {
    let recorded_hash = payload_object(stored)
        .get("idempotency_intent_hash")
        .and_then(JsonValue::as_str)
        .map(String::from);
    let same = match recorded_hash {
        Some(hash) => hash == intent_hash(incoming),
        None => {
            let mut left = event_intent(stored);
            let mut right = event_intent(incoming);
            let recorded = left["props"].as_object().cloned().unwrap_or_default();
            let expected = right["expected_versions"]
                .as_object()
                .cloned()
                .unwrap_or_default();
            if let Some(props) = right["props"].as_object_mut() {
                props.retain(|key, _| recorded.contains_key(key) || expected.contains_key(key));
            }
            left["project_id"] = JsonValue::Null;
            right["project_id"] = JsonValue::Null;
            js_json(&left) == js_json(&right)
        }
    };
    if same {
        Ok(())
    } else {
        Err("event_id_conflict".into())
    }
}

// ---------------------------------------------------------------------------
// JavaScript `JSON.stringify` of a key-sorted value (`stableValue`)
// ---------------------------------------------------------------------------

pub fn js_json(value: &JsonValue) -> String {
    let mut out = String::new();
    write_js(value, &mut out, true);
    out
}

// `JSON.stringify(value)` of the object as it was built: array-index keys first,
// ascending, then the others in insertion order. Every value the store writes as
// text goes through it, so a stored particle or payload is byte-equal to Fastify's.
pub fn js_stringify(value: &JsonValue) -> String {
    let mut out = String::new();
    write_js(value, &mut out, false);
    out
}

// A JavaScript object lists its array-index keys first, ascending, then the others
// in insertion order — for an intent, the UTF-16 order `Object.keys(..).sort()` gave them.
fn array_index(key: &str) -> Option<u32> {
    if key == "0" {
        return Some(0);
    }
    if key.starts_with('0') {
        return None;
    }
    key.parse::<u32>().ok().filter(|index| *index != u32::MAX)
}

fn write_js(value: &JsonValue, out: &mut String, sorted: bool) {
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(flag) => out.push_str(if *flag { "true" } else { "false" }),
        JsonValue::Number(number) => out.push_str(&js_number(number)),
        JsonValue::String(text) => out.push_str(&serde_json::to_string(text).unwrap_or_default()),
        JsonValue::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                write_js(item, out, sorted);
            }
            out.push(']');
        }
        JsonValue::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| match (array_index(a), array_index(b)) {
                (Some(x), Some(y)) => x.cmp(&y),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) if sorted => a.encode_utf16().cmp(b.encode_utf16()),
                (None, None) => std::cmp::Ordering::Equal,
            });
            out.push('{');
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(key).unwrap_or_default());
                out.push(':');
                write_js(&map[key], out, sorted);
            }
            out.push('}');
        }
    }
}

// ECMAScript Number::toString (the shortest round-trip digits, laid out as JS does).
fn js_number(number: &serde_json::Number) -> String {
    if number.is_i64() || number.is_u64() {
        return number.to_string();
    }
    let value = number.as_f64().unwrap_or(0.0);
    if value == 0.0 {
        return "0".into();
    }
    let sign = if value < 0.0 { "-" } else { "" };
    let scientific = format!("{:e}", value.abs());
    let (mantissa, exponent) = scientific.split_once('e').unwrap_or((&scientific, "0"));
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let k = digits.len() as i32;
    let n = exponent.parse::<i32>().unwrap_or(0) + 1;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let exp = if e >= 0 {
            format!("+{e}")
        } else {
            e.to_string()
        };
        if k == 1 {
            format!("{digits}e{exp}")
        } else {
            format!("{}.{}e{exp}", &digits[..1], &digits[1..])
        }
    };
    format!("{sign}{body}")
}
