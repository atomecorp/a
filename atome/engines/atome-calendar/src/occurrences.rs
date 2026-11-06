// The occurrences of canonical events in a range (the former JavaScript
// `calendarRangeOccurrences`, `expandCalendarOccurrences`, `calendarOccurrence` and
// `calendarOccurrenceEnd` of atome/src/squirrel/calendar/icalendar.js, ported): the exceptions
// (RECURRENCE-ID) read before the masters are expanded (expansion.rs), each occurrence's end (its
// DURATION kept, else the event's length, a whole-day event's days in local time), sorted by their
// start then by their id as `localeCompare` sorts them, and bounded. The one reader of an event's
// occurrences: the server's public events and coaches' agendas, and the browser's agenda, next
// events, alarms and programmes (icalendar.js, through squirrel_audio_wasm).
use super::event_dates::{active_reference, format_date};
use super::event_ics::{INVALID, field, literal, timezones, zone_components};
use super::ical::{Component, calendar_date, duration_end};
use super::ical_time::date_utc;
use super::{expansion, js_date};
use atome_js_values as js;
use serde_json::Value as JsonValue;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

/// One occurrence: its start and its end (ms), none when the event has no end; the index of its
/// event in the list read, and of its series' master (its own index for a master or a lone event).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Occurrence {
    pub start: f64,
    pub end: Option<f64>,
    pub event: usize,
    pub series: usize,
}

/// `range`: its start and end (ms; none when the reader gives none), `futureOnly` (only what starts
/// after the start) and `excludeCompleted` (no done to-do).
#[derive(Clone, Copy, Debug, Default)]
pub struct Range {
    pub from: Option<f64>,
    pub until: Option<f64>,
    pub future_only: bool,
    pub exclude_completed: bool,
}

// The printable ASCII characters in the order of ICU's root collation, those it holds equal at its
// base level side by side (generated from Node's `localeCompare`, temp/l310_calendar/collation.mjs).
const COLLATION: [&str; 69] = [
    " ", "_", "-", ",", ";", ":", "!", "?", ".", "'", "\"", "(", ")", "[", "]", "{", "}", "@", "*",
    "/", "\\", "&", "#", "%", "`", "^", "+", "<", "=", ">", "|", "~", "$", "0", "1", "2", "3", "4",
    "5", "6", "7", "8", "9", "aA", "bB", "cC", "dD", "eE", "fF", "gG", "hH", "iI", "jJ", "kK",
    "lL", "mM", "nN", "oO", "pP", "qQ", "rR", "sS", "tT", "uU", "vV", "wW", "xX", "yY", "zZ",
];

// The weights of the ASCII characters (`u32::MAX` for one the table does not hold).
const ASCII_WEIGHTS: [(u32, u32); 128] = {
    let mut table = [(u32::MAX, 0); 128];
    let mut rank = 0;
    while rank < COLLATION.len() {
        let group = COLLATION[rank].as_bytes();
        let mut at = 0;
        while at < group.len() {
            table[group[at] as usize] = (rank as u32, at as u32);
            at += 1;
        }
        rank += 1;
    }
    table
};

/// A character's base weight and its case weight (a character past the table: after them all, by
/// its code point, an approximation of ICU's order).
fn weights(c: char) -> (u32, u32) {
    match ASCII_WEIGHTS.get(c as usize) {
        Some(&found) if found.0 != u32::MAX => found,
        _ => (COLLATION.len() as u32 + u32::from(c), 0),
    }
}

/// What `localeCompare` compares of a text: its base weights first, then its case, lower first.
/// Read once per occurrence before the sort (the sort compares an id many times: measured, the
/// step-7 bench spent 78 % of its time weighing the same ids again).
fn collation_key(text: &str) -> (Vec<u32>, Vec<u32>) {
    text.chars().map(weights).unzip()
}

/// `${event.calendarId || ''}|${event.exchange_uid || event.id}`.
fn series_key(event: &JsonValue) -> String {
    let calendar = js::first(event, &["calendarId"]).map(|id| js::text(Some(id)));
    let uid = js::first(event, &["exchange_uid"]).or(event.get("id"));
    format!("{}|{}", calendar.unwrap_or_default(), js::text(uid))
}

/// `event.recurrence || event.rdates?.length`.
fn recurring(event: &JsonValue) -> bool {
    js::truthy(event.get("recurrence"))
        || match event.get("rdates") {
            Some(JsonValue::Array(dates)) => !dates.is_empty(),
            Some(JsonValue::String(text)) => !text.is_empty(),
            _ => false,
        }
}

/// A start as a key of the exceptions' set (`${date.getTime()}`: -0 and 0 alike, every NaN alike).
fn instant_key(ms: f64) -> u64 {
    if ms.is_nan() {
        f64::NAN.to_bits()
    } else {
        (ms + 0.0).to_bits()
    }
}

/// `calendarDate(p, timezones)` of a `{ value, params }` the event holds.
fn stored_date(
    event: &JsonValue,
    value: &JsonValue,
    params: Option<&JsonValue>,
) -> Result<f64, String> {
    let JsonValue::String(value) = value else {
        return Err("p.value.match is not a function".into());
    };
    let p = literal(value, params)?;
    let defined: Vec<Component> = zone_components(timezones(event)?, &p)?;
    let refs: Vec<&Component> = defined.iter().collect();
    Ok(calendar_date(Some(&p), &refs)?.unwrap_or(f64::NAN))
}

/// `durationEnd(start, duration, timezones)` of a start written like the event's start.
fn duration_from(
    event: &JsonValue,
    start: &super::content_lines::Property,
    duration: &JsonValue,
) -> Result<f64, String> {
    let Some(JsonValue::String(value)) = duration.get("value") else {
        return Err(INVALID.into());
    };
    let defined: Vec<Component> = zone_components(timezones(event)?, start)?;
    let refs: Vec<&Component> = defined.iter().collect();
    duration_end(Some(start), &literal(value, None)?, &refs)
}

/// `calendarOccurrenceEnd(event, start)`.
pub fn occurrence_end(event: &JsonValue, start: f64) -> Result<Option<f64>, String> {
    let base_start = js_date::canonical(event.get("start"))?;
    let base_end = js_date::canonical(event.get("end"))?;
    let (Some(base_start), Some(base_end)) = (base_start, base_end) else {
        return Ok(None);
    };
    let reference = active_reference(event, "start")?;
    let zones = timezones(event)?;
    let all_day = js::truthy(event.get("allDay"));
    let params = field(reference.as_ref(), "params");
    let at = |date: f64| -> Result<_, String> {
        let value = format_date(Some(date), reference.as_ref(), all_day, Some(zones))?;
        literal(&value, params)
    };
    let icalendar = event
        .get("icalendar")
        .filter(|value| js::truthy(Some(value)));
    if let Some(duration) = field(icalendar, "duration").filter(|value| js::truthy(Some(value)))
        && duration_from(event, &at(base_start)?, duration)? == base_end
    {
        return Ok(Some(js_date::clip(duration_from(
            event,
            &at(start)?,
            duration,
        )?)));
    }
    if !all_day {
        return Ok(Some(js_date::clip(base_end + start - base_start)));
    }
    let day = |ms: f64| -> Result<f64, String> {
        let f = js_date::local_fields(ms)?;
        Ok(date_utc(f.year, f.month - 1, f.day, 0, 0, 0))
    };
    let days = ((day(base_end)? - day(base_start)?) / 86_400_000.0 + 0.5).floor();
    js_date::add_local_days(start, days).map(Some)
}

/// `expandCalendarOccurrences(event, start, end, limit)`: the starts of one recurring event from
/// `from` (its own start when none) to `until` (no end when none), at most `limit`.
pub fn expand_event(
    event: &JsonValue,
    from: Option<f64>,
    until: Option<f64>,
    limit: usize,
) -> Result<Vec<f64>, String> {
    let from = match from {
        Some(from) => from,
        None => js_date::canonical(event.get("start"))?
            .ok_or("Cannot read properties of null (reading 'getTime')")?,
    };
    expansion::expand(event, from, until.unwrap_or(f64::INFINITY), limit)
}

/// `calendarRangeOccurrences(events, range, limit)`: the occurrences of the events in `range`, at
/// most `limit`.
pub fn range_occurrences(
    events: &[JsonValue],
    range: &Range,
    limit: usize,
) -> Result<Vec<Occurrence>, String> {
    let rid = |event: &JsonValue| js::truthy(event.get("recurrence_id"));
    let mut masters: HashMap<String, usize> = HashMap::new();
    for (index, event) in events.iter().enumerate() {
        if !rid(event) && recurring(event) {
            masters.insert(series_key(event), index);
        }
    }
    let mut exceptions: HashSet<(String, u64)> = HashSet::new();
    for event in events.iter().filter(|event| rid(event)) {
        let icalendar = event
            .get("icalendar")
            .filter(|value| js::truthy(Some(value)));
        let params = field(field(icalendar, "recurrence_id"), "params");
        let date = stored_date(event, &event["recurrence_id"], params)?;
        exceptions.insert((series_key(event), instant_key(date)));
    }
    // `new Date(range.start.getTime() + 1)` of a future-only reading.
    let after = |from: Option<f64>| {
        from.map(|from| js_date::clip(from + 1.0))
            .ok_or("Cannot read properties of undefined (reading 'getTime')")
    };
    let mut occurrences: Vec<(Occurrence, (Vec<u32>, Vec<u32>))> = Vec::new();
    for (index, event) in events.iter().enumerate() {
        let Some(base_start) = js_date::canonical(event.get("start"))? else {
            continue;
        };
        if event.get("status") == Some(&"cancelled".into())
            || (range.exclude_completed
                && event.get("kind") == Some(&"todo".into())
                && event.get("status") == Some(&"done".into()))
        {
            continue;
        }
        let series = if rid(event) {
            match masters.get(&series_key(event)) {
                Some(&master) => master,
                None => continue,
            }
        } else {
            index
        };
        // `baseStart <= range.start` (false against an undefined start).
        if range.future_only
            && !recurring(event)
            && range.from.is_some_and(|from| base_start <= from)
        {
            continue;
        }
        let starts = if recurring(event) {
            let from = if range.future_only {
                Some(after(range.from)?)
            } else {
                range.from
            };
            expand_event(event, from, range.until, limit + exceptions.len())?
        } else {
            vec![base_start]
        };
        for start in starts {
            if !rid(event) && exceptions.contains(&(series_key(event), instant_key(start))) {
                continue;
            }
            let id = format!("{}_{}", js::text(event.get("id")), js_date::iso(start)?);
            let end = occurrence_end(event, start)?;
            if range.future_only && range.from.is_some_and(|from| start <= from) {
                continue;
            }
            if range.from.is_some_and(|from| end.unwrap_or(start) < from)
                || range.until.is_some_and(|until| start > until)
            {
                continue;
            }
            occurrences.push((
                Occurrence {
                    start,
                    end,
                    event: index,
                    series,
                },
                collation_key(&id),
            ));
        }
    }
    occurrences.sort_by(|(left, left_id), (right, right_id)| {
        let by_start = left.start - right.start;
        if by_start != 0.0 && !by_start.is_nan() {
            return by_start.partial_cmp(&0.0).unwrap_or(Ordering::Equal);
        }
        left_id.cmp(right_id)
    });
    occurrences.truncate(limit);
    Ok(occurrences
        .into_iter()
        .map(|(occurrence, _)| occurrence)
        .collect())
}
