// The JavaScript readings of a JSON value that the code ported from JavaScript keeps (Fastify's
// server/userVaultRouter.js, the calendar of atome/src/squirrel/calendar/icalendar.js): `a || b`
// truthiness, `String(x)`, `Number(x)`, `new Date(x)`, so the same input takes the same path. Its
// readers: atome-server (vault_router::js) and atome-calendar.
use serde_json::Value as JsonValue;

pub fn truthy(value: Option<&JsonValue>) -> bool {
    match value {
        None | Some(JsonValue::Null) => false,
        Some(JsonValue::Bool(flag)) => *flag,
        Some(JsonValue::Number(number)) => number.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Some(JsonValue::String(text)) => !text.is_empty(),
        Some(_) => true,
    }
}

/// `String(value)` of a scalar.
pub fn string(value: &JsonValue) -> String {
    match value {
        JsonValue::String(text) => text.clone(),
        // JavaScript writes an integral number without a fraction (`String(1.0)` is "1").
        JsonValue::Number(number) if number.is_f64() => {
            number_json(number.as_f64().unwrap_or(f64::NAN)).to_string()
        }
        JsonValue::Number(number) => number.to_string(),
        JsonValue::Bool(flag) => flag.to_string(),
        JsonValue::Null => "null".into(),
        _ => value.to_string(),
    }
}

/// `String(value)` of anything a JSON message holds, and of a missing field
/// (`undefined`), as a template literal writes it.
pub fn text(value: Option<&JsonValue>) -> String {
    match value {
        None => "undefined".into(),
        Some(JsonValue::Object(_)) => "[object Object]".into(),
        Some(JsonValue::Array(items)) => items
            .iter()
            .map(|item| {
                if item.is_null() {
                    String::new()
                } else {
                    text(Some(item))
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(value) => string(value),
    }
}

/// `text.trim()`: JavaScript's white space, which leaves U+0085 and takes U+FEFF.
pub fn trim(text: &str) -> &str {
    text.trim_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}')
}

/// `text.slice(0, max)`: the first `max` UTF-16 units.
pub fn slice(text: &str, max: usize) -> String {
    let units: Vec<u16> = text.encode_utf16().take(max).collect();
    String::from_utf16_lossy(&units)
}

/// The first truthy of `keys` on `object`.
pub fn first<'a>(object: &'a JsonValue, keys: &[&str]) -> Option<&'a JsonValue> {
    keys.iter()
        .map(|key| object.get(*key))
        .find(|value| truthy(*value))
        .flatten()
}

/// `String(value || '').trim()`.
pub fn id(value: Option<&JsonValue>) -> String {
    value
        .filter(|value| truthy(Some(value)))
        .map(string)
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// `Number(value)`.
pub fn number(value: Option<&JsonValue>) -> f64 {
    match value {
        None => f64::NAN,
        Some(JsonValue::Null) => 0.0,
        Some(JsonValue::Bool(flag)) => f64::from(u8::from(*flag)),
        Some(JsonValue::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
        Some(JsonValue::String(text)) if text.trim().is_empty() => 0.0,
        Some(JsonValue::String(text)) => text.trim().parse().unwrap_or(f64::NAN),
        Some(_) => f64::NAN,
    }
}

/// `Number(value) || fallback`.
pub fn number_or(value: Option<&JsonValue>, fallback: f64) -> f64 {
    let number = number(value);
    if number == 0.0 || number.is_nan() {
        fallback
    } else {
        number
    }
}

/// A number as JSON writes it: an integer stays one.
pub fn number_json(number: f64) -> JsonValue {
    if number.fract() == 0.0 && number.abs() < 9.0e15 {
        JsonValue::from(number as i64)
    } else {
        JsonValue::from(number)
    }
}

/// `{ ...object, key: value }`.
pub fn with(
    object: &JsonValue,
    entries: impl IntoIterator<Item = (&'static str, JsonValue)>,
) -> JsonValue {
    let mut map = object.as_object().cloned().unwrap_or_default();
    for (key, value) in entries {
        map.insert(key.to_string(), value);
    }
    JsonValue::Object(map)
}

const MAX_TIME_MS: f64 = 8.64e15;

/// `new Date(value).getTime()`, none when it is NaN: a number as it is, `null` the epoch, a
/// boolean 0 or 1, a string read in ECMAScript's date-time format (a date alone in UTC, a date
/// and a time without an offset in the server's local time). V8's other legacy spellings are
/// not read.
pub fn date(value: Option<&JsonValue>) -> Option<i64> {
    let ms = match value? {
        JsonValue::Null => 0.0,
        JsonValue::Bool(flag) => f64::from(u8::from(*flag)),
        JsonValue::Number(number) => number.as_f64()?,
        JsonValue::String(text) => return date_text(trim(text)),
        _ => return None,
    };
    (ms.is_finite() && ms.abs() <= MAX_TIME_MS).then_some(ms.trunc() as i64)
}

fn digits(text: &str, count: usize) -> Option<(i64, &str)> {
    let head = text.get(..count)?;
    head.bytes()
        .all(|b| b.is_ascii_digit())
        .then(|| (head.parse().ok(), &text[count..]))
        .and_then(|(number, rest)| Some((number?, rest)))
}

// `Date.parse` of ECMAScript's `YYYY-MM-DDTHH:mm:ss.sssZ` and its shorter forms.
fn date_text(text: &str) -> Option<i64> {
    let (year, mut rest) = match text.as_bytes().first()? {
        b'+' | b'-' => {
            let (year, rest) = digits(&text[1..], 6)?;
            if text.starts_with('-') && year == 0 {
                return None;
            }
            (if text.starts_with('-') { -year } else { year }, rest)
        }
        _ => digits(text, 4)?,
    };
    let (mut month, mut day) = (1, 1);
    if let Some(after) = rest.strip_prefix('-') {
        (month, rest) = digits(after, 2)?;
        if let Some(after) = rest.strip_prefix('-') {
            (day, rest) = digits(after, 2)?;
        }
    }
    let date = chrono::NaiveDate::from_ymd_opt(
        i32::try_from(year).ok()?,
        u32::try_from(month).ok()?,
        u32::try_from(day).ok()?,
    )?;
    if rest.is_empty() {
        return Some(date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis());
    }
    let after = rest.strip_prefix(['T', 't', ' '])?;
    let (hour, after) = digits(after, 2)?;
    let (minute, mut rest) = digits(after.strip_prefix(':')?, 2)?;
    let (mut second, mut millis) = (0, 0);
    if let Some(after) = rest.strip_prefix(':') {
        (second, rest) = digits(after, 2)?;
        if let Some(after) = rest.strip_prefix('.') {
            let count = after.bytes().take_while(u8::is_ascii_digit).count();
            if count == 0 {
                return None;
            }
            let fraction = &after[..count.min(3)];
            millis = fraction.parse::<i64>().ok()? * 10_i64.pow(3 - fraction.len() as u32);
            rest = &after[count..];
        }
    }
    // 24:00 is the end of the day.
    let midnight = hour == 24 && minute == 0 && second == 0 && millis == 0;
    let time = chrono::NaiveTime::from_hms_milli_opt(
        u32::try_from(if midnight { 0 } else { hour }).ok()?,
        u32::try_from(minute).ok()?,
        u32::try_from(second).ok()?,
        u32::try_from(millis).ok()?,
    )?;
    let wall = date.and_time(time) + chrono::TimeDelta::days(i64::from(midnight));
    let ms = match rest {
        "" => local_instant(wall)?,
        "Z" | "z" => wall.and_utc().timestamp_millis(),
        offset => {
            let sign = match offset.as_bytes()[0] {
                b'+' => 1,
                b'-' => -1,
                _ => return None,
            };
            let (hours, after) = digits(&offset[1..], 2)?;
            let (minutes, after) = digits(after.strip_prefix(':')?, 2)?;
            if !after.is_empty() || hours > 23 || minutes > 59 {
                return None;
            }
            wall.and_utc().timestamp_millis() - sign * (hours * 60 + minutes) * 60_000
        }
    };
    (ms.unsigned_abs() as f64 <= MAX_TIME_MS).then_some(ms)
}

/// A wall time without an offset read in the server's local time (`TZ`), the earlier instant in
/// a fold.
#[cfg(not(target_arch = "wasm32"))]
fn local_instant(wall: chrono::NaiveDateTime) -> Option<i64> {
    Some(
        wall.and_local_timezone(chrono::Local)
            .earliest()?
            .timestamp_millis(),
    )
}

/// A wall time without an offset read in the browser's local time: `Date.parse` of its
/// ECMAScript form, exact where an old zone's offset is not whole minutes (chrono rounds it).
#[cfg(target_arch = "wasm32")]
fn local_instant(wall: chrono::NaiveDateTime) -> Option<i64> {
    use chrono::Datelike;
    let year = wall.year();
    let year = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else {
        format!("{}{:06}", if year < 0 { '-' } else { '+' }, year.abs())
    };
    let ms = js_sys::Date::parse(&format!("{year}-{}", wall.format("%m-%dT%H:%M:%S%.3f")));
    ms.is_finite().then_some(ms as i64)
}

/// `new Date(ms).toISOString()`.
pub fn iso(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .unwrap_or_default()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}
