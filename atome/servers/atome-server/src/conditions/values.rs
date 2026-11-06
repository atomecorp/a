// The JavaScript readings of a value the condition engine makes (atome/src/squirrel/conditions/):
// a value as the engine holds it (JSON, `undefined`, a computed number, a `Date`), `String(x)`,
// `Number(x)`, `new Date(x).getTime()`, `Object.is`, `JSON.stringify` and own properties, so the
// same condition reads the same candidates the same way. The scalar readings are
// vault_router/js.rs's; this file adds what only the condition engine needs.
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::borrow::Cow;

/// A property as JavaScript reads it: `None` is `undefined`.
pub(super) type Slot<'a> = Option<Cow<'a, JsonValue>>;

/// A value of the engine.
#[derive(Clone, Debug)]
pub(super) enum Js<'a> {
    Undefined,
    Json(Cow<'a, JsonValue>),
    /// A number computed by the engine (it may be infinite).
    Num(f64),
    /// `new Date()`: the time a `time.now` without `context.now` reads.
    Date(f64),
}

impl<'a> Js<'a> {
    pub(super) fn from_slot(slot: Slot<'a>) -> Self {
        slot.map_or(Js::Undefined, Js::Json)
    }

    pub(super) fn borrowed(value: Option<&'a JsonValue>) -> Self {
        value.map_or(Js::Undefined, |value| Js::Json(Cow::Borrowed(value)))
    }

    pub(super) fn json(&self) -> Option<&JsonValue> {
        match self {
            Js::Json(value) => Some(value),
            _ => None,
        }
    }

    pub(super) fn number(&self) -> Option<f64> {
        match self {
            Js::Num(number) => Some(*number),
            Js::Json(value) => value.as_f64(),
            _ => None,
        }
    }

    /// `value === undefined || value === null`.
    pub(super) fn nullish(&self) -> bool {
        matches!(self, Js::Undefined) || self.json().is_some_and(JsonValue::is_null)
    }

    pub(super) fn truthy(&self) -> bool {
        match self {
            Js::Undefined => false,
            Js::Num(number) => *number != 0.0 && !number.is_nan(),
            Js::Date(_) => true,
            Js::Json(value) => js::truthy(Some(value)),
        }
    }

    /// `String(value)`.
    pub(super) fn text(&self) -> String {
        match self {
            Js::Undefined => "undefined".into(),
            Js::Num(number) => number_text(*number),
            // `Date.prototype.toString` without its zone's name, which chrono does not know.
            Js::Date(ms) => chrono::DateTime::from_timestamp_millis(*ms as i64)
                .map(|time| {
                    time.with_timezone(&chrono::Local)
                        .format("%a %b %d %Y %H:%M:%S GMT%z")
                        .to_string()
                })
                .unwrap_or_else(|| "Invalid Date".into()),
            Js::Json(value) => js::text(Some(value)),
        }
    }

    /// `Number(value)`: an array through its text, as `ToPrimitive` reads it.
    pub(super) fn to_number(&self) -> f64 {
        match self {
            Js::Undefined => f64::NAN,
            Js::Num(number) | Js::Date(number) => *number,
            Js::Json(value) if value.is_array() => {
                js::number(Some(&JsonValue::String(js::text(Some(value)))))
            }
            Js::Json(value) => js::number(Some(value)),
        }
    }

    /// `new Date(value).getTime()`, none when it is NaN.
    pub(super) fn time(&self) -> Option<f64> {
        match self {
            Js::Undefined => None,
            Js::Date(ms) => Some(*ms),
            Js::Num(number) => {
                (number.is_finite() && number.abs() <= 8.64e15).then(|| number.trunc() + 0.0)
            }
            Js::Json(value) if value.is_array() => {
                js::date(Some(&JsonValue::String(js::text(Some(value))))).map(|ms| ms as f64)
            }
            Js::Json(value) => js::date(Some(value)).map(|ms| ms as f64),
        }
    }

    fn is_object(&self) -> bool {
        matches!(self, Js::Date(_)) || self.json().is_some_and(|v| v.is_object() || v.is_array())
    }
}

/// `String(number)`.
pub(super) fn number_text(number: f64) -> String {
    if number.is_nan() {
        "NaN".into()
    } else if number.is_infinite() {
        if number > 0.0 {
            "Infinity"
        } else {
            "-Infinity"
        }
        .into()
    } else {
        js::string(&js::number_json(number))
    }
}

/// `Object.is` of two numbers.
pub(super) fn same_number(left: f64, right: f64) -> bool {
    (left.is_nan() && right.is_nan()) || left.to_bits() == right.to_bits()
}

/// `Object.is(left, right)`: two objects are never the same one.
pub(super) fn object_is(left: &Js, right: &Js) -> bool {
    if let (Some(a), Some(b)) = (left.number(), right.number()) {
        return same_number(a, b);
    }
    match (left, right) {
        (Js::Undefined, Js::Undefined) => true,
        (Js::Json(a), Js::Json(b)) => match (a.as_ref(), b.as_ref()) {
            (JsonValue::Null, JsonValue::Null) => true,
            (JsonValue::Bool(a), JsonValue::Bool(b)) => a == b,
            (JsonValue::String(a), JsonValue::String(b)) => a == b,
            _ => false,
        },
        _ => false,
    }
}

/// The registry's `sameValue`: `Object.is`, else two objects of the same JSON text.
pub(super) fn same_value(left: &Js, right: &Js) -> bool {
    object_is(left, right)
        || (left.is_object() && right.is_object() && stringify_js(left) == stringify_js(right))
}

fn stringify_js(value: &Js) -> String {
    let mut out = String::new();
    match value {
        Js::Json(value) => stringify(value, &mut out),
        Js::Date(ms) => out.push_str(&format!("\"{}\"", js::iso(*ms as i64))),
        Js::Num(number) if number.is_finite() => out.push_str(&number_text(*number)),
        _ => out.push_str("null"),
    }
    out
}

/// `JSON.stringify(value)`, its keys in JavaScript's order.
pub(super) fn stringify(value: &JsonValue, out: &mut String) {
    match value {
        JsonValue::Number(number) => {
            let number = number.as_f64().unwrap_or(f64::NAN);
            out.push_str(&if number.is_finite() {
                number_text(number)
            } else {
                "null".into()
            });
        }
        JsonValue::Array(items) => {
            out.push('[');
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                stringify(item, out);
            }
            out.push(']');
        }
        JsonValue::Object(map) => {
            out.push('{');
            for (index, (key, item)) in entries(map).into_iter().enumerate() {
                if index > 0 {
                    out.push(',');
                }
                out.push_str(&JsonValue::String(key.clone()).to_string());
                out.push(':');
                stringify(item, out);
            }
            out.push('}');
        }
        other => out.push_str(&other.to_string()),
    }
}

/// A canonical array index (`"0"`, `"17"`, never `"017"`), which JavaScript lists first.
pub(super) fn array_index(key: &str) -> Option<u32> {
    let canonical = !key.is_empty()
        && key.bytes().all(|b| b.is_ascii_digit())
        && (key == "0" || !key.starts_with('0'));
    canonical
        .then(|| key.parse::<u64>().ok())
        .flatten()
        .filter(|index| *index < u64::from(u32::MAX))
        .map(|index| index as u32)
}

/// `Object.entries(map)`: the array indices in ascending order, then the other keys as written.
pub(super) fn entries(map: &JsonMap<String, JsonValue>) -> Vec<(&String, &JsonValue)> {
    let mut indexed: Vec<(u32, (&String, &JsonValue))> = Vec::new();
    let mut named = Vec::new();
    for entry in map {
        match array_index(entry.0) {
            Some(index) => indexed.push((index, entry)),
            None => named.push(entry),
        }
    }
    indexed.sort_by_key(|(index, _)| *index);
    indexed
        .into_iter()
        .map(|(_, entry)| entry)
        .chain(named)
        .collect()
}

fn utf16_unit(text: &str, index: usize) -> Option<JsonValue> {
    let unit = text.encode_utf16().nth(index)?;
    Some(JsonValue::String(String::from_utf16_lossy(&[unit])))
}

/// `Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined`, none when
/// `value` has no such own property (an array's and a string's indices and `length` are theirs).
pub(super) fn own<'a>(value: &'a JsonValue, key: &str) -> Option<Cow<'a, JsonValue>> {
    match value {
        JsonValue::Object(map) => map.get(key).map(Cow::Borrowed),
        JsonValue::Array(items) if key == "length" => Some(Cow::Owned(items.len().into())),
        JsonValue::Array(items) => items.get(array_index(key)? as usize).map(Cow::Borrowed),
        JsonValue::String(text) if key == "length" => {
            Some(Cow::Owned(text.encode_utf16().count().into()))
        }
        JsonValue::String(text) => utf16_unit(text, array_index(key)? as usize).map(Cow::Owned),
        _ => None,
    }
}

/// `value?.[key]` of an object only (what every other JSON value answers `undefined` to).
pub(super) fn get<'a>(value: Option<&'a JsonValue>, key: &str) -> Option<&'a JsonValue> {
    value?.as_object()?.get(key)
}

/// `{ ...value }`: an object's entries, an array's or a string's indices.
pub(super) fn spread(value: &JsonValue) -> Vec<(Cow<'_, str>, Slot<'_>)> {
    match value {
        JsonValue::Object(map) => entries(map)
            .into_iter()
            .map(|(key, item)| (Cow::Borrowed(key.as_str()), Some(Cow::Borrowed(item))))
            .collect(),
        JsonValue::Array(items) => items
            .iter()
            .enumerate()
            .map(|(index, item)| (Cow::Owned(index.to_string()), Some(Cow::Borrowed(item))))
            .collect(),
        JsonValue::String(text) => text
            .encode_utf16()
            .enumerate()
            .map(|(index, unit)| {
                let unit = JsonValue::String(String::from_utf16_lossy(&[unit]));
                (Cow::Owned(index.to_string()), Some(Cow::Owned(unit)))
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// The `readPath` of the catalog, the engine and the computed expressions: every part an own
/// property of an object or an array; `None` when one is missing.
pub(super) fn read_path<'a>(start: Slot<'a>, path: &str) -> Option<Slot<'a>> {
    let mut current = start;
    for part in path.split('.').filter(|part| !part.is_empty()) {
        current = Some(match current? {
            Cow::Borrowed(value) if value.is_object() || value.is_array() => own(value, part)?,
            Cow::Owned(value) if value.is_object() || value.is_array() => {
                Cow::Owned(own(&value, part)?.into_owned())
            }
            _ => return None,
        });
    }
    Some(current)
}

/// `String(value || '')`.
pub(super) fn key_text(value: Option<&JsonValue>) -> String {
    if js::truthy(value) {
        js::text(value)
    } else {
        String::new()
    }
}

/// `String(value || '').trim().toLowerCase()`, the registry's `normalizeKey`.
pub(super) fn normalize_key(value: Option<&JsonValue>) -> String {
    js::trim(&key_text(value)).to_lowercase()
}

/// `String(value == null ? '' : value).trim()`.
pub(super) fn plain_text(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::trim(&js::text(Some(value))).to_string(),
    }
}

/// `a || b || …`: the first truthy, else the last.
pub(super) fn or_chain<'a>(values: &[Option<&'a JsonValue>]) -> Option<&'a JsonValue> {
    values
        .iter()
        .find(|value| js::truthy(**value))
        .or(values.last())
        .copied()
        .flatten()
}

/// `a ?? b ?? …`: the first neither null nor undefined, else the last.
pub(super) fn coalesce<'a>(values: &[Option<&'a JsonValue>]) -> Option<&'a JsonValue> {
    values
        .iter()
        .find(|value| value.is_some_and(|value| !value.is_null()))
        .or(values.last())
        .copied()
        .flatten()
}

/// `Number.parseInt(value, 10)`, none when it is NaN.
pub(super) fn parse_int(value: Option<&JsonValue>) -> Option<i64> {
    let text = js::text(value);
    let text = text.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    let (sign, digits) = match text.as_bytes().first() {
        Some(b'-') => (-1, &text[1..]),
        Some(b'+') => (1, &text[1..]),
        _ => (1, text),
    };
    let count = digits.bytes().take_while(u8::is_ascii_digit).count();
    let number: f64 = digits[..count].parse().ok()?;
    Some(sign * number.min(9.0e15) as i64)
}

/// `left < right` (the abstract relational comparison) of two values neither of them a string.
pub(super) fn less(left: &Js, right: &Js) -> bool {
    let primitive = |value: &Js| match value {
        Js::Json(value) if value.is_object() || value.is_array() => Some(js::text(Some(value))),
        Js::Json(value) => value.as_str().map(str::to_string),
        _ => None,
    };
    if let (Some(a), Some(b)) = (primitive(left), primitive(right)) {
        return a.encode_utf16().lt(b.encode_utf16());
    }
    left.to_number() < right.to_number()
}
