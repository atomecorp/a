// The JavaScript readings of a JSON value that the code ported from JavaScript keeps (Fastify's
// server/userVaultRouter.js, the calendar of atome/src/squirrel/calendar/icalendar.js): `a || b`
// truthiness, `String(x)`, `Number(x)`, `new Date(x)`, so the same input takes the same path. Its
// readers: atome-server (vault_router::js) and atome-calendar.
use serde_json::Value as JsonValue;

pub mod dates;

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
const DAY_MS: i64 = 86_400_000;

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
    let days = dates::date_days(year, month, day)?;
    if rest.is_empty() {
        return Some(days * DAY_MS);
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
    if !(hour < 24 || midnight) || minute > 59 || second > 59 {
        return None;
    }
    let wall = days * DAY_MS + ((hour * 60 + minute) * 60 + second) * 1000 + millis;
    let ms = match rest {
        "" => local_instant(wall)?,
        "Z" | "z" => wall,
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
            wall - sign * (hours * 60 + minutes) * 60_000
        }
    };
    (ms.unsigned_abs() as f64 <= MAX_TIME_MS).then_some(ms)
}

/// A wall time without an offset read in the server's local time (`TZ`), the first instant of a
/// fold as chrono gave it.
#[cfg(not(target_arch = "wasm32"))]
fn local_instant(wall_ms: i64) -> Option<i64> {
    Some(
        dates::local(dates::Instant::from_millis(wall_ms)?)
            .first()?
            .millis(),
    )
}

/// A wall time without an offset read in the browser's local time: `Date.parse` of its
/// ECMAScript form, exact where an old zone's offset is not whole minutes.
#[cfg(target_arch = "wasm32")]
fn local_instant(wall_ms: i64) -> Option<i64> {
    let f = dates::Instant::from_millis(wall_ms)?.fields();
    let ms = js_sys::Date::parse(&format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}",
        dates::js_iso_year(f.year),
        f.month,
        f.day,
        f.hour,
        f.minute,
        f.second,
        f.nanos / 1_000_000
    ));
    ms.is_finite().then_some(ms as i64)
}

// The UTC fields of an instant of the Date range; the epoch's past it.
fn date_fields(ms: i64) -> dates::Fields {
    let ms = if ms.unsigned_abs() as f64 <= MAX_TIME_MS {
        ms
    } else {
        0
    };
    dates::Instant {
        seconds: ms.div_euclid(1000),
        nanos: (ms.rem_euclid(1000) as u32) * 1_000_000,
    }
    .fields()
}

/// `new Date(ms).toUTCString()`; the epoch's past the Date range.
pub fn utc_string(ms: i64) -> String {
    let f = date_fields(ms);
    format!(
        "{}, {:02} {} {} {:02}:{:02}:{:02} GMT",
        dates::weekday_name(f.weekday),
        f.day,
        dates::month_name(f.month),
        dates::js_year(f.year),
        f.hour,
        f.minute,
        f.second
    )
}

/// `Date.prototype.toString` in the server's local time, without the zone's name (which the
/// server does not know): `Tue Nov 18 2025 09:30:00 GMT+0100`, "Invalid Date" past chrono's range.
#[cfg(not(target_arch = "wasm32"))]
pub fn local_string(ms: i64) -> String {
    let Some((wall, offset)) = dates::Instant::from_millis(ms).and_then(dates::local_wall) else {
        return "Invalid Date".into();
    };
    let f = wall.fields();
    let sign = if offset < 0 { '-' } else { '+' };
    // chrono's `%z`: the offset rounded to the nearest minute.
    let minutes = (offset.unsigned_abs() + 30) / 60;
    format!(
        "{} {} {:02} {} {:02}:{:02}:{:02} GMT{sign}{:02}{:02}",
        dates::weekday_name(f.weekday),
        dates::month_name(f.month),
        f.day,
        dates::js_year(f.year),
        f.hour,
        f.minute,
        f.second,
        minutes / 60,
        minutes % 60
    )
}

/// `new Date(ms).toISOString()`; the epoch's past the Date range.
pub fn iso(ms: i64) -> String {
    let f = date_fields(ms);
    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        dates::js_iso_year(f.year),
        f.month,
        f.day,
        f.hour,
        f.minute,
        f.second,
        f.nanos / 1_000_000
    )
}
