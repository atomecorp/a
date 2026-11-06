// The one calendar engine (atome-calendar), reached from the page: the occurrences of events in a
// range, the starts of one recurring event and the end of one occurrence, which
// atome/src/squirrel/calendar/icalendar.js turns back into its occurrence objects. The events come as
// their JSON (`JSON.stringify`: a Date as its ISO string, which the engine reads back to the same
// instant), the results as flat Float64Arrays, a refusal as an Error carrying the engine's message.
// Its local time is the browser's (chrono reads it from `Date`), its named zones the browser's Intl.
use atome_calendar::{Range, expand_event, occurrence_end, range_occurrences};
use js_sys::Float64Array;
use serde_json::Value as JsonValue;
use wasm_bindgen::prelude::*;

fn refusal(message: String) -> JsValue {
    js_sys::Error::new(&message).into()
}

fn read(json: &str) -> Result<JsonValue, JsValue> {
    serde_json::from_str(json).map_err(|error| refusal(format!("calendar_json_invalid: {error}")))
}

/// `calendarRangeOccurrences(events, range, limit)`: per occurrence, in order, the index of its event,
/// the index of its series' master, its start, 1 or 0 for an end or none, and that end (ms).
#[wasm_bindgen(js_name = calendarRangeOccurrences)]
pub fn calendar_range_occurrences(
    events: &str,
    from: Option<f64>,
    until: Option<f64>,
    future_only: bool,
    exclude_completed: bool,
    limit: u32,
) -> Result<Float64Array, JsValue> {
    let JsonValue::Array(events) = read(events)? else {
        return Err(refusal("calendar_events_array_required".into()));
    };
    let range = Range {
        from,
        until,
        future_only,
        exclude_completed,
    };
    let found = range_occurrences(&events, &range, limit as usize).map_err(refusal)?;
    let mut flat = Vec::with_capacity(found.len() * 5);
    for occurrence in found {
        flat.extend([
            occurrence.event as f64,
            occurrence.series as f64,
            occurrence.start,
            f64::from(u8::from(occurrence.end.is_some())),
            occurrence.end.unwrap_or(f64::NAN),
        ]);
    }
    Ok(Float64Array::from(flat.as_slice()))
}

/// `expandCalendarOccurrences(event, start, end, limit)`: the starts (ms) of one recurring event.
#[wasm_bindgen(js_name = calendarExpand)]
pub fn calendar_expand(
    event: &str,
    from: Option<f64>,
    until: Option<f64>,
    limit: u32,
) -> Result<Float64Array, JsValue> {
    let starts = expand_event(&read(event)?, from, until, limit as usize).map_err(refusal)?;
    Ok(Float64Array::from(starts.as_slice()))
}

/// `calendarOccurrenceEnd(event, start)`: the end (ms) of the occurrence starting at `start`,
/// `undefined` when the event has none.
#[wasm_bindgen(js_name = calendarOccurrenceEnd)]
pub fn calendar_occurrence_end(event: &str, start: f64) -> Result<Option<f64>, JsValue> {
    occurrence_end(&read(event)?, start).map_err(refusal)
}
