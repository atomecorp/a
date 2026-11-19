//! OTIO's JSON values: the document text (OTIO writes `Inf`, `-Infinity` and
//! `NaN` for non-finite floats, which strict JSON refuses), its rational times and
//! ranges, and its schema names.

use crate::ImportError;
use crate::frac::Frac;
use serde_json::Value;

/// The NTSC rates OTIO writes as decimals (23.976…), kept exact as N·1000/1001.
const NTSC_BASES: [i128; 6] = [24, 30, 48, 60, 120, 240];

/// Parses an `.otio` text; a bare non-finite float (outside strings) reads as null.
pub(super) fn parse(text: &str) -> Result<Value, ImportError> {
    let mut clean = String::with_capacity(text.len());
    let mut in_string = false;
    let mut escaped = false;
    let mut rest = text;
    while let Some(character) = rest.chars().next() {
        if in_string {
            clean.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                in_string = false;
            }
            rest = &rest[character.len_utf8()..];
            continue;
        }
        if character == '"' {
            in_string = true;
        }
        let word = ["-Infinity", "Infinity", "-Inf", "Inf", "NaN"]
            .into_iter()
            .find(|word| rest.starts_with(word));
        match word {
            Some(word) => {
                clean.push_str("null");
                rest = &rest[word.len()..];
            }
            None => {
                clean.push(character);
                rest = &rest[character.len_utf8()..];
            }
        }
    }
    serde_json::from_str(&clean)
        .map_err(|error| ImportError::new("otio_json_invalid", format!("OTIO JSON: {error}")))
}

/// The schema name without its version (`"Clip"` for `"Clip.2"`).
pub(super) fn schema(value: &Value) -> &str {
    let full = value
        .get("OTIO_SCHEMA")
        .and_then(Value::as_str)
        .unwrap_or("");
    full.split('.').next().unwrap_or("")
}

/// A rate kept exact: 23.976023976… is 24000/1001.
pub(super) fn rate(value: f64) -> Result<Frac, ImportError> {
    if !(value.is_finite() && value > 0.0) {
        return Err(ImportError::new(
            "otio_time_invalid",
            format!("rate {value} is not > 0"),
        ));
    }
    for base in NTSC_BASES {
        let ntsc = base as f64 * 1000.0 / 1001.0;
        if (value - ntsc).abs() < 1e-6 * ntsc {
            return Frac::new(base * 1000, 1001);
        }
    }
    Frac::from_f64(value)
}

/// A `RationalTime.1` in seconds, exact.
pub(super) fn time(value: &Value) -> Result<Frac, ImportError> {
    let bad = || ImportError::new("otio_time_invalid", format!("not a RationalTime: {value}"));
    let count = value
        .get("value")
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite())
        .ok_or_else(bad)?;
    let rate_value = value.get("rate").and_then(Value::as_f64).ok_or_else(bad)?;
    Frac::from_f64(count)?.over(rate(rate_value)?)
}

/// A RationalTime's own rate.
pub(super) fn time_rate(value: &Value) -> Option<f64> {
    value.get("rate").and_then(Value::as_f64)
}

/// A `TimeRange.1` (`start_time`, `duration`) in seconds; `None` when null or absent.
pub(super) fn range(value: Option<&Value>) -> Result<Option<(Frac, Frac)>, ImportError> {
    let Some(value) = value.filter(|value| !value.is_null()) else {
        return Ok(None);
    };
    let bad = || {
        ImportError::new(
            "otio_time_invalid",
            "a TimeRange lacks start_time or duration",
        )
    };
    let start = time(value.get("start_time").ok_or_else(bad)?)?;
    let duration = time(value.get("duration").ok_or_else(bad)?)?;
    if duration.is_negative() {
        return Err(ImportError::new(
            "otio_time_invalid",
            "a TimeRange lasts less than nothing",
        ));
    }
    Ok(Some((start, duration)))
}

/// A string field.
pub(super) fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

/// A list field (empty when null or absent).
pub(super) fn list<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value
        .get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
