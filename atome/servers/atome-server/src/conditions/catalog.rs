// How a candidate's properties are read (atome/src/squirrel/conditions/property_catalog.js):
// its envelope (its properties, then its id, type, owner, project, dates and custom fields
// whichever level holds them), `resolveCandidatePath` through it, a custom field by its
// normalised id, and the type a value is inferred to be.
use super::values::{Slot, coalesce, get, or_chain, plain_text, read_path, spread};
use crate::vault_router::js;
use icu_normalizer::DecomposingNormalizerBorrowed;
use regex::Regex;
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::borrow::Cow;
use std::sync::LazyLock;

// `/^\d{4}-\d{2}-\d{2}(?:[T ][^ ]+)?$/` and `/^[-+]?(?:\d+\.?\d*|\.\d+)\s*[a-z%]+$/i`.
static DATE_SHAPED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:[T ][^ ]+)?$").expect("date"));
static QUANTITY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[-+]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)\s*[a-zA-Z%]+$").expect("quantity")
});

const ENVELOPE_KEYS: [&str; 7] = [
    "id",
    "type",
    "owner_id",
    "project_id",
    "created_at",
    "updated_at",
    "custom_fields",
];

fn plain_object(value: Option<&JsonValue>) -> Option<&JsonValue> {
    value.filter(|value| value.is_object())
}

// The level whose entries the envelope spreads: `properties`, else `props`, else the candidate.
fn properties_of(candidate: &JsonValue) -> &JsonValue {
    plain_object(get(Some(candidate), "properties"))
        .or_else(|| plain_object(get(Some(candidate), "props")))
        .unwrap_or(candidate)
}

// The envelope's own `key` (`candidate.id ?? candidate.atome_id ?? properties.id`…).
fn envelope_key<'a>(candidate: &'a JsonValue, key: &str) -> Slot<'a> {
    let properties = Some(properties_of(candidate));
    let at = |object: Option<&'a JsonValue>, name: &str| get(object, name);
    let meta = at(Some(candidate), "meta");
    let value = match key {
        "id" => coalesce(&[
            at(Some(candidate), "id"),
            at(Some(candidate), "atome_id"),
            at(properties, "id"),
        ]),
        "type" => coalesce(&[
            at(Some(candidate), "type"),
            at(Some(candidate), "atome_type"),
            at(properties, "type"),
        ]),
        "custom_fields" => coalesce(&[
            at(Some(candidate), "custom_fields"),
            at(properties, "custom_fields"),
        ]),
        _ => coalesce(&[at(Some(candidate), key), at(meta, key), at(properties, key)]),
    };
    value.map(Cow::Borrowed)
}

/// `Object.entries(candidateEnvelope(candidate))`, in its order.
pub(super) fn envelope(candidate: &JsonValue) -> Vec<(Cow<'_, str>, Slot<'_>)> {
    let mut entries = spread(properties_of(candidate));
    for key in ENVELOPE_KEYS {
        let value = envelope_key(candidate, key);
        match entries.iter_mut().find(|(name, _)| name == key) {
            Some(entry) => entry.1 = value,
            None => entries.push((Cow::Borrowed(key), value)),
        }
    }
    entries
}

// `hasOwnProperty(envelope, key) ? envelope[key]`: `None` when it has no such key.
fn envelope_get<'a>(candidate: &'a JsonValue, key: &str) -> Option<Slot<'a>> {
    if ENVELOPE_KEYS.contains(&key) {
        return Some(envelope_key(candidate, key));
    }
    match properties_of(candidate) {
        JsonValue::Object(map) => map.get(key).map(|value| Some(Cow::Borrowed(value))),
        JsonValue::Array(items) => super::values::array_index(key)
            .and_then(|index| items.get(index as usize))
            .map(|value| Some(Cow::Borrowed(value))),
        JsonValue::String(text) => super::values::array_index(key)
            .and_then(|index| text.encode_utf16().nth(index as usize))
            .map(|unit| {
                Some(Cow::Owned(JsonValue::String(String::from_utf16_lossy(&[
                    unit,
                ]))))
            }),
        _ => None,
    }
}

// The envelope as one object (a path of no part reads it whole); `undefined` entries left out.
fn envelope_object(candidate: &JsonValue) -> JsonValue {
    let map: JsonMap<String, JsonValue> = envelope(candidate)
        .into_iter()
        .filter_map(|(key, value)| Some((key.into_owned(), value?.into_owned())))
        .collect();
    JsonValue::Object(map)
}

/// `normalizeFieldId`: lower case, decomposed, accents dropped, every other run an underscore.
pub(super) fn normalize_field_id(value: Option<&JsonValue>) -> String {
    let lower = plain_text(value).to_lowercase();
    let decomposed = DecomposingNormalizerBorrowed::new_nfkd().normalize(&lower);
    let mut id = String::new();
    for c in decomposed
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
    {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            id.push(c);
        } else if !id.ends_with('_') {
            id.push('_');
        }
    }
    id.trim_matches('_').to_string()
}

fn custom_field_value<'a>(candidate: &'a JsonValue, field: &str) -> Option<Slot<'a>> {
    let custom_id = &field["custom.".len()..];
    let fields = envelope_key(candidate, "custom_fields")?;
    let Cow::Borrowed(JsonValue::Array(fields)) = fields else {
        return None;
    };
    fields
        .iter()
        .find(|entry| {
            let named = or_chain(&[get(Some(entry), "id"), get(Some(entry), "label")]);
            normalize_field_id(named) == custom_id
        })
        .map(|entry| get(Some(entry), "value").map(Cow::Borrowed))
}

/// `resolveCandidatePath(candidate, field)`: the value, `None` when it is not available.
pub(super) fn resolve_candidate_path<'a>(
    candidate: &'a JsonValue,
    field: &str,
) -> Option<Slot<'a>> {
    let field = js::trim(field);
    if field.starts_with("custom.") {
        return custom_field_value(candidate, field);
    }
    let mut parts = field.split('.').filter(|part| !part.is_empty());
    let Some(head) = parts.next() else {
        return Some(Some(Cow::Owned(envelope_object(candidate))));
    };
    let rest: Vec<&str> = parts.collect();
    read_path(envelope_get(candidate, head)?, &rest.join("."))
}

/// `inferType(value)`.
pub(super) fn infer_type(value: Option<&JsonValue>) -> &'static str {
    match value {
        None | Some(JsonValue::Null) => "any",
        Some(JsonValue::Array(_)) => "array",
        Some(JsonValue::Number(_)) => "number",
        Some(JsonValue::Bool(_)) => "boolean",
        Some(JsonValue::Object(_)) => "object",
        Some(JsonValue::String(text)) => {
            let text = js::trim(text);
            if DATE_SHAPED.is_match(text)
                && js::date(Some(&JsonValue::String(text.into()))).is_some()
            {
                if text.encode_utf16().count() > 10 {
                    "datetime"
                } else {
                    "date"
                }
            } else if QUANTITY.is_match(text) {
                "number"
            } else {
                "string"
            }
        }
    }
}
