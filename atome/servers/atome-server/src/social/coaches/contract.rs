// The coach contract on the server (atome/src/shared/coach_contract.js, ported; the browser keeps its
// own): what a coaching agenda carries once normalized, why a public one cannot be listed, its zone's
// wall arithmetic, its open windows and free slots, and whether a requested session fits. Instants
// are ms since the epoch; the hours are the coach's wall time in its zone (calendar/zone.rs: the
// name Intl resolves, the offsets of the system's zone files).
use crate::vault_router::js;
use atome_calendar::{date_utc, js_date, zone};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const QUALITIES: [&str; 3] = ["coach", "trainer", "health"];
const DAYS: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// AGENTS.md rule 19: a session of 45 min, a cancellation up to 24 h before, three weeks of slots.
const SLOT_MINUTES: f64 = 45.0;
const CANCEL_HOURS: f64 = 24.0;
const HORIZON_DAYS: f64 = 21.0;
const NAME_MAX: usize = 60;
const SPECIALTIES_MAX: usize = 6;
const SPECIALTY_MAX: usize = 30;
const PLACE_MAX: usize = 80;
const RANGES_MAX: usize = 21;
const OFF_MAX: usize = 34;
const MIN_MINUTES: f64 = 15.0;
const MAX_MINUTES: f64 = 240.0;
const MAX_CANCEL_HOURS: f64 = 336.0;
const SLOTS_MAX: usize = 89;
const MINUTE: f64 = 60_000.0;
const DAY: f64 = 86_400_000.0;

/// `text(value, max)`: `String(value ?? '')` trimmed, its first `max` UTF-16 units.
fn text(value: Option<&JsonValue>, max: usize) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        value => js::slice(js::trim(&js::text(value)), max),
    }
}

/// `Number(value)`, an array read through its text: `Number([60])` is 60, `Number([])` 0.
fn number(value: Option<&JsonValue>) -> f64 {
    match value {
        Some(JsonValue::Array(items)) => match items.as_slice() {
            [] => 0.0,
            [JsonValue::Bool(_) | JsonValue::Object(_)] => f64::NAN,
            [item] => number(Some(item)),
            _ => f64::NAN,
        },
        value => js::number(value),
    }
}

/// `whole(value, min, max)`: `Math.round(Number(value))` within the bounds.
fn whole(value: Option<&JsonValue>, min: f64, max: f64) -> Option<f64> {
    let number = (number(value) + 0.5).floor();
    (number.is_finite() && number >= min && number <= max).then_some(number + 0.0)
}

/// `coachClockMinutes(value)`: `HH:MM` on a 24-hour clock, in minutes.
fn clock(value: Option<&JsonValue>) -> Option<i64> {
    let Some(JsonValue::String(text)) = value else {
        return None;
    };
    let bytes = text.as_bytes();
    let digits = bytes.len() == 5
        && bytes[2] == b':'
        && [0, 1, 3, 4].iter().all(|&at| bytes[at].is_ascii_digit());
    let (hours, minutes) = (
        text.get(..2)?.parse::<i64>().ok()?,
        text.get(3..)?.parse::<i64>().ok()?,
    );
    (digits && hours <= 23 && minutes <= 59).then_some(hours * 60 + minutes)
}

fn day_text(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(at, b)| {
            if at == 4 || at == 7 {
                *b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
}

/// `unique(items, key)`: one item per key, the first key's place, the last item's value.
fn unique(items: Vec<(String, JsonValue)>, max: usize) -> JsonValue {
    let mut kept: Vec<(String, JsonValue)> = Vec::new();
    for (key, item) in items {
        match kept.iter_mut().find(|(known, _)| *known == key) {
            Some(entry) => entry.1 = item,
            None => kept.push((key, item)),
        }
    }
    JsonValue::Array(kept.into_iter().take(max).map(|(_, item)| item).collect())
}

fn items(value: Option<&JsonValue>) -> &[JsonValue] {
    match value {
        Some(JsonValue::Array(items)) => items,
        _ => &[],
    }
}

/// `normalizeCoaching(value)`: what a coaching agenda carries (null when it is no object), anything
/// malformed dropped, a missing value at its default.
pub fn normalize_coaching(value: &JsonValue) -> JsonValue {
    let parsed = match value {
        JsonValue::String(text) => serde_json::from_str(text).unwrap_or(JsonValue::Null),
        value => value.clone(),
    };
    let JsonValue::Object(source) = parsed else {
        return JsonValue::Null;
    };
    let get = |key: &str| source.get(key);
    let specialties = items(get("specialties"))
        .iter()
        .map(|item| text(Some(item), SPECIALTY_MAX))
        .filter(|item| !item.is_empty())
        .map(|item| (item.to_lowercase(), json!(item)))
        .collect();
    let ranges = items(get("ranges"))
        .iter()
        .filter_map(|range| {
            let day = text(range.get("day"), 3).to_lowercase();
            let (start, end) = (clock(range.get("start")), clock(range.get("end")));
            let (Some(start), Some(end)) = (start, end) else {
                return None;
            };
            (DAYS.contains(&day.as_str()) && end > start).then(|| {
                let (start, end) = (js::text(range.get("start")), js::text(range.get("end")));
                (
                    format!("{day}{start}{end}"),
                    json!({ "day": day, "start": start, "end": end }),
                )
            })
        })
        .collect();
    let off = items(get("off"))
        .iter()
        .filter_map(|off| {
            let start = text(off.get("start"), 10);
            let end_value = off
                .get("end")
                .filter(|end| js::truthy(Some(end)))
                .or(off.get("start"));
            let end = text(end_value, 10);
            (day_text(&start) && day_text(&end) && end >= start).then(|| {
                (
                    format!("{start}{end}"),
                    json!({ "start": start, "end": end }),
                )
            })
        })
        .collect();
    let timezone = match get("timezone") {
        Some(JsonValue::String(zone)) if !zone.is_empty() => {
            zone::canonical(zone).unwrap_or_default()
        }
        _ => String::new(),
    };
    let quality = match get("quality") {
        Some(JsonValue::String(quality)) if QUALITIES.contains(&quality.as_str()) => {
            quality.as_str()
        }
        _ => "coach",
    };
    let mut coaching = JsonMap::new();
    for (key, value) in [
        (
            "visibility",
            json!(if get("visibility") == Some(&json!("public")) {
                "public"
            } else {
                "private"
            }),
        ),
        ("name", json!(text(get("name"), NAME_MAX))),
        ("quality", json!(quality)),
        ("specialties", unique(specialties, SPECIALTIES_MAX)),
        ("place", json!(text(get("place"), PLACE_MAX))),
        ("timezone", json!(timezone)),
        (
            "slot_minutes",
            js::number_json(
                whole(get("slot_minutes"), MIN_MINUTES, MAX_MINUTES).unwrap_or(SLOT_MINUTES),
            ),
        ),
        (
            "cancel_hours",
            js::number_json(
                whole(get("cancel_hours"), 0.0, MAX_CANCEL_HOURS).unwrap_or(CANCEL_HOURS),
            ),
        ),
        ("ranges", unique(ranges, RANGES_MAX)),
        ("off", unique(off, OFF_MAX)),
    ] {
        coaching.insert(key.into(), value);
    }
    JsonValue::Object(coaching)
}

/// `coachingError(coaching)`: why a public coaching cannot be listed, none when it can.
pub fn coaching_error(coaching: &JsonValue) -> Option<&'static str> {
    if !coaching.is_object() {
        return Some("coach_invalid");
    }
    if !js::truthy(coaching.get("name")) {
        return Some("coach_name_required");
    }
    if !js::truthy(coaching.get("timezone")) {
        return Some("coach_timezone_required");
    }
    None
}

/// A busy span as the contract compares it: a JSON number, `null` as 0, a missing one NaN.
#[derive(Clone, Copy, Debug)]
pub struct Span {
    pub start: f64,
    pub end: f64,
}

impl Span {
    /// The spans of a JSON `busy` list (`[{ start, end }]`).
    pub fn list(busy: &JsonValue) -> Vec<Span> {
        let read = |value: Option<&JsonValue>| match value {
            Some(JsonValue::Null) => 0.0,
            value => js::number(value),
        };
        items(Some(busy))
            .iter()
            .map(|item| Span {
                start: read(item.get("start")),
                end: read(item.get("end")),
            })
            .collect()
    }
}

/// The coach's zone and its wall arithmetic (`coachWallOf`, `coachWallToUtc`).
struct Wall {
    zone: zone::Zone,
}

impl Wall {
    fn of(coaching: &JsonValue) -> Result<Self, String> {
        Ok(Self {
            zone: zone::Zone::named(&js::text(coaching.get("timezone")))?,
        })
    }

    // The wall fields of an instant (the minutes of its day apart).
    fn at(&self, ms: f64) -> Result<js_date::Fields, String> {
        let offset = self.zone.offset((ms / 1000.0).floor() as i64)?;
        Ok(js_date::utc_fields(ms + offset as f64 * 1000.0))
    }

    fn offset_at(&self, ms: f64) -> Result<f64, String> {
        let f = self.at(ms)?;
        let wall = date_utc(
            f.year,
            f.month - 1,
            f.day,
            0,
            f.hour * 60 + f.minute,
            f.second,
        );
        Ok(wall - (ms / 1000.0).floor() * 1000.0)
    }

    fn to_utc(&self, year: i64, month: i64, day: i64, minutes: i64) -> Result<f64, String> {
        let guess = date_utc(year, month - 1, day, 0, minutes, 0);
        let first = guess - self.offset_at(guess)?;
        Ok(guess - self.offset_at(first)?)
    }
}

/// `coachOpenWindows(coaching, from, to)`: its weekly hours on each of its days between `from`
/// and `to`, its unavailabilities taken out.
fn open_windows(
    coaching: &JsonValue,
    wall: &Wall,
    from: f64,
    to: f64,
) -> Result<Vec<Span>, String> {
    let first = wall.at(from)?;
    let mut windows = Vec::new();
    let mut utc_day = date_utc(first.year, first.month - 1, first.day, 0, 0, 0);
    while utc_day <= to + DAY {
        let today = js_date::iso(utc_day)?[..10].to_string();
        let off = items(coaching.get("off"))
            .iter()
            .any(|off| js::text(off.get("start")) <= today && today <= js::text(off.get("end")));
        if !off {
            let f = js_date::utc_fields(utc_day);
            // `COACH_DAYS[(getUTCDay() + 6) % 7]`: the epoch was a Thursday.
            let weekday = DAYS[((utc_day / DAY).floor() + 3.0).rem_euclid(7.0) as usize];
            for range in items(coaching.get("ranges"))
                .iter()
                .filter(|range| range.get("day") == Some(&json!(weekday)))
            {
                let (Some(open), Some(close)) =
                    (clock(range.get("start")), clock(range.get("end")))
                else {
                    continue;
                };
                let start = wall.to_utc(f.year, f.month, f.day, open)?;
                let end = wall.to_utc(f.year, f.month, f.day, close)?;
                if end > from && start < to {
                    windows.push(Span {
                        start: start.max(from),
                        end: end.min(to),
                    });
                }
            }
        }
        utc_day += DAY;
    }
    windows.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(windows)
}

/// `coachFreeSlots({ coaching, busy, now })`: each window cut in sessions of the coach's length
/// from its start (on the five minutes), none overlapping what is busy, none begun.
pub fn free_slots(coaching: &JsonValue, busy: &[Span], now: f64) -> Result<JsonValue, String> {
    let wall = Wall::of(coaching)?;
    let minutes = js::number(coaching.get("slot_minutes"));
    let length = minutes * MINUTE;
    let aligned = |ms: f64| (ms / (MINUTE * 5.0)).ceil() * MINUTE * 5.0;
    let mut slots = Vec::new();
    for window in open_windows(coaching, &wall, now, now + HORIZON_DAYS * DAY)? {
        let mut start = aligned(window.start.max(now + 1.0));
        while start + length <= window.end && slots.len() < SLOTS_MAX {
            let met: Vec<f64> = busy
                .iter()
                .filter(|item| item.start < start + length && start < item.end)
                .map(|item| item.end)
                .collect();
            if !met.is_empty() {
                start = aligned(met.into_iter().fold(f64::NEG_INFINITY, |a, b| {
                    if a.is_nan() || b.is_nan() {
                        f64::NAN
                    } else {
                        a.max(b)
                    }
                }));
                continue;
            }
            slots.push(
                json!({ "start": js_date::iso(start)?, "minutes": coaching["slot_minutes"] }),
            );
            start += length;
        }
    }
    Ok(JsonValue::Array(slots))
}

/// `coachSessionFits({ coaching, busy, start, minutes, now })`: whole in one open window, later
/// than now, overlapping nothing busy.
pub fn session_fits(
    coaching: &JsonValue,
    busy: &[Span],
    start: f64,
    minutes: f64,
    now: f64,
) -> Result<bool, String> {
    let end = start + minutes * MINUTE;
    let later = start.partial_cmp(&now) == Some(std::cmp::Ordering::Greater);
    // NaN minutes pass this bound, as in JavaScript; no window then holds them.
    let bounded = minutes.is_nan() || (MIN_MINUTES..=MAX_MINUTES).contains(&minutes);
    if !later || !bounded {
        return Ok(false);
    }
    let wall = Wall::of(coaching)?;
    let inside = open_windows(coaching, &wall, start - DAY, end + DAY)?
        .iter()
        .any(|window| window.start <= start && end <= window.end);
    Ok(inside && !busy.iter().any(|item| item.start < end && start < item.end))
}
