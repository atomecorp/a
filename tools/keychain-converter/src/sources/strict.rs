//! Strict, path-tracked reading of an untrusted JSON export: a member of the
//! wrong type is an error naming its path (never its value); an absent or null
//! optional member is `None`.

use serde_json::{Map, Value};

use crate::error::{Result, err};

pub type Object = Map<String, Value>;

fn wrong(path: &str, key: &str, expected: &str) -> crate::Error {
    err(
        "source_structure_invalid",
        format!("{path}.{key}: {expected} expected"),
    )
}

pub fn object<'a>(value: &'a Value, path: &str) -> Result<&'a Object> {
    value.as_object().ok_or_else(|| {
        err(
            "source_structure_invalid",
            format!("{path}: object expected"),
        )
    })
}

pub fn opt_object<'a>(map: &'a Object, key: &str, path: &str) -> Result<Option<&'a Object>> {
    match map.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Object(inner)) => Ok(Some(inner)),
        Some(_) => Err(wrong(path, key, "object")),
    }
}

pub fn opt_array<'a>(map: &'a Object, key: &str, path: &str) -> Result<&'a [Value]> {
    match map.get(key) {
        None | Some(Value::Null) => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(wrong(path, key, "array")),
    }
}

pub fn opt_str(map: &Object, key: &str, path: &str) -> Result<Option<String>> {
    match map.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err(wrong(path, key, "string")),
    }
}

pub fn str_or_empty(map: &Object, key: &str, path: &str) -> Result<String> {
    Ok(opt_str(map, key, path)?.unwrap_or_default())
}

pub fn req_str(map: &Object, key: &str, path: &str) -> Result<String> {
    opt_str(map, key, path)?
        .filter(|text| !text.is_empty())
        .ok_or_else(|| wrong(path, key, "non-empty string"))
}

/// An integer (a JSON float with no fraction is accepted: some exporters write `1.0e9`).
pub fn opt_i64(map: &Object, key: &str, path: &str) -> Result<Option<i64>> {
    match map.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(number)) => number
            .as_i64()
            .or_else(|| {
                number
                    .as_f64()
                    .filter(|f| f.fract() == 0.0 && f.abs() < 9.0e15)
                    .map(|f| f as i64)
            })
            .map(Some)
            .ok_or_else(|| wrong(path, key, "integer")),
        Some(_) => Err(wrong(path, key, "integer")),
    }
}

/// A Unix time in seconds; a negative one is not a CXF `uint`.
pub fn opt_time(map: &Object, key: &str, path: &str) -> Result<Option<u64>> {
    Ok(opt_i64(map, key, path)?.and_then(|time| u64::try_from(time).ok()))
}

pub fn opt_bool_like(map: &Object, key: &str) -> bool {
    match map.get(key) {
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number.as_f64().is_some_and(|n| n > 0.0),
        _ => false,
    }
}

pub fn strings(map: &Object, key: &str, path: &str) -> Result<Vec<String>> {
    opt_array(map, key, path)?
        .iter()
        .map(|tag| {
            tag.as_str()
                .map(str::to_string)
                .ok_or_else(|| wrong(path, key, "array of strings"))
        })
        .collect()
}

/// Members of `map` outside `known`, as `prefix.key`, for the report.
pub fn unknown_keys<'a>(
    map: &'a Object,
    known: &'a [&str],
    prefix: &'a str,
) -> impl Iterator<Item = String> + 'a {
    map.keys()
        .filter(move |key| !known.contains(&key.as_str()))
        .map(move |key| format!("{prefix}.{key}"))
}
