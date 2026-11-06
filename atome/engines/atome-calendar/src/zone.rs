// The time zones a calendar names without defining them (`Intl.DateTimeFormat({ timeZone })` in the
// former atome/src/squirrel/calendar/icalendar.js#calendarDate): an IANA zone (zone_named: the
// system's TZif files on a native host, the browser's own Intl in WASM), or an offset zone
// (`+01:00`); the host's local zone (`new Date(y, m, d, …)`) through chrono. A wall time resolves as
// the JS code resolves it: the earlier instant in a fold, the offset before the change in a gap. A
// zone's one name is the name Intl resolves it to (`canonical`, the table zone_names.json generated
// from Node by temp/l310_calendar/zone_names.mjs).
use super::ical_time::date_utc;
use crate::zone_named::NamedZone;
pub use crate::zone_named::local_offset;
use std::collections::HashMap;
use std::sync::LazyLock;

static NAMES: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("zone_names.json")).expect("the zone names table")
});

/// `new Intl.DateTimeFormat('en-US', { timeZone: tzid }).resolvedOptions().timeZone`: the one name
/// Intl reads `tzid` as (Asia/Kolkata as Asia/Calcutta, `+0530` as `+05:30`), none when it refuses it.
pub fn canonical(tzid: &str) -> Option<String> {
    if !tzid.starts_with(['+', '-']) {
        return NAMES.get(&tzid.to_ascii_lowercase()).cloned();
    }
    let Ok(Zone::Fixed(offset)) = Zone::named(tzid) else {
        return None;
    };
    let sign = if offset < 0 { '-' } else { '+' };
    Some(format!(
        "{sign}{:02}:{:02}",
        offset.abs() / 3600,
        offset.abs() / 60 % 60
    ))
}

pub enum Zone {
    Fixed(i64),
    Named(NamedZone),
}

impl Zone {
    /// The zone `Intl.DateTimeFormat` accepts as `timeZone: tzid`; any other is its RangeError.
    pub fn named(tzid: &str) -> Result<Zone, String> {
        let invalid = || format!("Invalid time zone specified: {tzid}");
        let bytes = tzid.as_bytes();
        if matches!(bytes.first(), Some(b'+' | b'-')) {
            let digits = |at: usize| -> Option<i64> {
                let pair = bytes.get(at..at + 2)?;
                pair.iter()
                    .all(u8::is_ascii_digit)
                    .then(|| i64::from((pair[0] - b'0') * 10 + pair[1] - b'0'))
            };
            let minutes = match bytes.len() {
                3 => Some(0),
                5 => digits(3),
                6 if bytes[3] == b':' => digits(4),
                _ => None,
            };
            let (hours, minutes) = digits(1)
                .zip(minutes)
                .filter(|(h, m)| *h <= 23 && *m <= 59)
                .ok_or_else(invalid)?;
            let sign = if bytes[0] == b'-' { -1 } else { 1 };
            return Ok(Zone::Fixed(sign * (hours * 3600 + minutes * 60)));
        }
        NamedZone::read(tzid).map(Zone::Named).ok_or_else(invalid)
    }

    /// The offset (seconds east of UTC) at `seconds` since the epoch (Intl's RangeError past the
    /// Date range in the browser).
    pub fn offset(&self, seconds: i64) -> Result<i64, String> {
        match self {
            Zone::Fixed(offset) => Ok(*offset),
            Zone::Named(zone) => zone.offset(seconds),
        }
    }
}

/// `new Date(year, month, day, hour, minute, second)`: the wall time read in the host's zone (NaN
/// past the Date range).
pub fn local(
    year: i64,
    month: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
) -> Result<f64, String> {
    let target = date_utc(year, month, day, hour, minute, second);
    if target.is_nan() {
        return Ok(target);
    }
    resolve(target, local_offset)
}

/// The instant (ms) whose wall clock is `target` (a UTC-read wall time in ms) in the zone of `offset`:
/// the offsets 36 hours around it, the earliest instant showing that wall, else the offset before a gap.
pub fn resolve(target: f64, offset: impl Fn(i64) -> Result<i64, String>) -> Result<f64, String> {
    let wall_at = |instant: f64| -> Result<f64, String> {
        Ok(instant + offset((instant / 1000.0).floor() as i64)? as f64 * 1000.0)
    };
    let mut offsets: Vec<f64> = Vec::new();
    for hours in [-36.0, 0.0, 36.0] {
        let instant = target + hours * 3_600_000.0;
        let found = wall_at(instant)? - instant;
        if !offsets.contains(&found) {
            offsets.push(found);
        }
    }
    let mut earliest: Option<f64> = None;
    for found in &offsets {
        let instant = target - found;
        if wall_at(instant)? == target {
            earliest = Some(earliest.map_or(instant, |at: f64| at.min(instant)));
        }
    }
    let smallest = offsets.iter().copied().fold(f64::INFINITY, f64::min);
    Ok(earliest.unwrap_or(target - smallest))
}
