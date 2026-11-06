// The JavaScript `Date` the calendar code reads (atome/src/squirrel/calendar/icalendar.js): an
// instant's fields in UTC and in the server's local time (`TZ`), `toISOString` with its six-digit
// years, `setDate` in local time, and `canonicalCalendarDate`.
use super::zone;
use atome_js_values as js;
use serde_json::Value as JsonValue;

/// ECMAScript's time range, in ms either side of the epoch.
pub const MAX_TIME_MS: f64 = 8.64e15;

/// `new Date(ms).getTime()` (TimeClip): NaN past the range, else the integer part.
pub fn clip(ms: f64) -> f64 {
    if ms.is_finite() && ms.abs() <= MAX_TIME_MS {
        ms.trunc() + 0.0
    } else {
        f64::NAN
    }
}

/// The fields of a wall clock (the month from 1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Fields {
    pub year: i64,
    pub month: i64,
    pub day: i64,
    pub hour: i64,
    pub minute: i64,
    pub second: i64,
    pub ms: i64,
}

/// The UTC fields of a valid instant (`getUTCFullYear()`…).
pub fn utc_fields(ms: f64) -> Fields {
    let ms = ms as i64;
    let (days, rest) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    // Days to a proleptic Gregorian date (H. Hinnant's `civil_from_days`).
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let doe = shifted - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let (day, month) = (
        doy - (153 * mp + 2) / 5 + 1,
        if mp < 10 { mp + 3 } else { mp - 9 },
    );
    Fields {
        year: yoe + era * 400 + i64::from(month <= 2),
        month,
        day,
        hour: rest / 3_600_000,
        minute: rest / 60_000 % 60,
        second: rest / 1000 % 60,
        ms: rest % 1000,
    }
}

/// The local fields of a valid instant (`getFullYear()`…).
pub fn local_fields(ms: f64) -> Result<Fields, String> {
    let offset = zone::local_offset((ms / 1000.0).floor() as i64)?;
    Ok(utc_fields(ms + offset as f64 * 1000.0))
}

/// `new Date(ms).toISOString()`: RangeError on an invalid date.
pub fn iso(ms: f64) -> Result<String, String> {
    if !ms.is_finite() || ms.abs() > MAX_TIME_MS {
        return Err("Invalid time value".into());
    }
    let f = utc_fields(ms);
    let year = if (0..=9999).contains(&f.year) {
        format!("{:04}", f.year)
    } else {
        let sign = if f.year < 0 { '-' } else { '+' };
        format!("{sign}{:06}", f.year.abs())
    };
    Ok(format!(
        "{year}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        f.month, f.day, f.hour, f.minute, f.second, f.ms
    ))
}

/// `date.setDate(date.getDate() + days)`: the same local wall time `days` later (NaN past the range).
pub fn add_local_days(ms: f64, days: f64) -> Result<f64, String> {
    if !ms.is_finite() || !days.is_finite() {
        return Ok(f64::NAN);
    }
    let f = local_fields(ms)?;
    let at = zone::local(
        f.year,
        f.month - 1,
        f.day + days as i64,
        f.hour,
        f.minute,
        f.second,
    )?;
    Ok(at + f.ms as f64)
}

/// `canonicalCalendarDate(value)`: a `YYYY-MM-DD` date at local midnight (none when it does not read
/// back the same), else `new Date(value)` (js.rs: ECMAScript's date-time format); none when falsy or
/// invalid.
pub fn canonical(value: Option<&JsonValue>) -> Result<Option<f64>, String> {
    if !js::truthy(value) {
        return Ok(None);
    }
    if let Some(JsonValue::String(text)) = value
        && text.len() == 10
        && text.bytes().enumerate().all(|(at, b)| {
            if at == 4 || at == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
    {
        let part = |range: std::ops::Range<usize>| text[range].parse::<i64>().unwrap_or_default();
        let at = zone::local(part(0..4), part(5..7) - 1, part(8..10), 0, 0, 0)?;
        if !at.is_finite() {
            return Ok(None);
        }
        let f = local_fields(at)?;
        let again = format!("{}-{:02}-{:02}", f.year, f.month, f.day);
        return Ok((again == *text).then_some(at));
    }
    Ok(js::date(value).map(|ms| ms as f64))
}
