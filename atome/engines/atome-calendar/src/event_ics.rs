// One canonical event written as `buildIcs([event])` writes it (atome/src/squirrel/calendar/icalendar.js),
// read back as ICAL.js reads that text: its VTIMEZONEs (their safe properties), then its VEVENT's
// properties in their order, each one checked as `buildContentLine` checks it (its dates are
// event_dates.rs).
//
// The event is the JSON its readers build (the server's public events and coaches, the browser's
// canonical events): a field of another JSON type than the canonical event gives it (an
// `icalendar` that is no object, a property list that is no array of objects, an alarm that is no
// object) is refused as `ics_event_invalid`, where the JS code would fail on its own TypeError, or
// read it otherwise. Its alarms are written as `buildIcs` writes them (VALARM components inside
// the VEVENT): ICAL reads their lines and nothing more, so they can only refuse an event.
use super::content_lines::{Property, decode};
use super::event_dates::{active_reference, format_date, rule_value};
use super::ical::{Component, MANAGED};
use super::js_date;
use super::vtimezone;
use atome_js_values as js;
use serde_json::Value as JsonValue;

pub(super) const INVALID: &str = "ics_event_invalid";

/// The calendar ICAL reads: the components written before the event (its VTIMEZONEs), then the
/// event's properties.
pub(super) struct Ics {
    pub zones: Vec<Component>,
    pub event: Vec<Property>,
    pub alarms: Vec<Component>,
}

// A key JavaScript lists before an object's other keys, ascending: an array index.
pub(super) fn index(key: &str) -> Option<u64> {
    (key == "0" || (!key.starts_with('0') && key.len() <= 10))
        .then(|| key.parse::<u64>().ok().filter(|n| *n < 4_294_967_295))
        .flatten()
}

fn token(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// `value?.[key]`, none on a value that has no such key.
pub(super) fn field<'a>(value: Option<&'a JsonValue>, key: &str) -> Option<&'a JsonValue> {
    value.and_then(|value| value.get(key))
}

/// `value || fallback` of a list: a JSON array, nothing when falsy, else `ics_event_invalid`.
pub(super) fn list(value: Option<&JsonValue>) -> Result<&[JsonValue], String> {
    match value {
        Some(JsonValue::Array(items)) => Ok(items),
        value if !js::truthy(value) => Ok(&[]),
        _ => Err(INVALID.into()),
    }
}

/// `Object.entries(params)` of a property's parameters (none when `undefined`), in the order
/// JavaScript lists an object's keys: its array indices first, ascending.
fn entries(params: Option<&JsonValue>) -> Result<Vec<(&str, &JsonValue)>, String> {
    let map = match params {
        None => return Ok(Vec::new()),
        Some(JsonValue::Object(map)) => map,
        Some(_) => return Err(INVALID.into()),
    };
    let mut indices: Vec<(&str, &JsonValue)> = map
        .iter()
        .filter(|(key, _)| index(key).is_some())
        .map(|(key, value)| (key.as_str(), value))
        .collect();
    indices.sort_by_key(|(key, _)| index(key));
    indices.extend(
        map.iter()
            .filter(|(key, _)| index(key).is_none())
            .map(|(key, value)| (key.as_str(), value)),
    );
    Ok(indices)
}

/// `buildContentLine({ name, group, params, value })`: its refusals, then the line as ICAL reads its
/// name and parameters (upper-case keys, a repeated one keeping its first place and its last value).
fn built(
    name: &str,
    group: &str,
    params: Option<&JsonValue>,
    value: &str,
) -> Result<Property, String> {
    if !token(name) || (!group.is_empty() && !token(group)) {
        return Err("content_property_invalid".into());
    }
    if value.contains(['\r', '\n']) {
        return Err("content_value_newline".into());
    }
    let mut property = Property {
        name: name.to_ascii_uppercase(),
        group: group.to_string(),
        params: Vec::new(),
        value: value.to_string(),
    };
    for (key, entry) in entries(params)? {
        if !token(key) {
            return Err("content_parameter_invalid".into());
        }
        property.set_param(&key.to_ascii_uppercase(), js::text(Some(entry)));
    }
    Ok(property)
}

/// `buildContentLine(p)` of a stored property `{ name, group, params, value }`.
fn stored_line(p: &JsonValue) -> Result<Property, String> {
    if !p.is_object() {
        return Err(INVALID.into());
    }
    let group = p.get("group").filter(|group| js::truthy(Some(group)));
    built(
        &js::text(p.get("name")),
        &group.map(|group| js::text(Some(group))).unwrap_or_default(),
        p.get("params"),
        &js::text(p.get("value")),
    )
}

/// `safeProperty(p)`: an upper-case name, none of the private words in it.
fn safe(p: &JsonValue) -> bool {
    let name = js::text(p.get("name"));
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-')
        && !super::content_lines::private_name(&name)
}

/// A stored component as `component(c)` writes it in `buildIcs` (its safe properties) or as
/// `componentLines(c)` writes it (all of them).
fn component(c: &JsonValue, safe_only: bool) -> Result<Component, String> {
    if !c.is_object() {
        return Err(INVALID.into());
    }
    let mut properties = Vec::new();
    for p in list(c.get("properties"))? {
        if !p.is_object() {
            return Err(INVALID.into());
        }
        if !safe_only || safe(p) {
            properties.push(stored_line(p)?);
        }
    }
    let children = list(c.get("children"))?
        .iter()
        .map(|child| component(child, safe_only))
        .collect::<Result<_, _>>()?;
    Ok(Component {
        name: js::text(c.get("name")),
        properties,
        children,
    })
}

/// `text(zone.properties, 'TZID')` of a stored zone.
fn zone_key(zone: &JsonValue) -> Result<String, String> {
    let JsonValue::Array(properties) = zone.get("properties").ok_or(INVALID)? else {
        return Err(INVALID.into());
    };
    let found = properties
        .iter()
        .find(|p| p.get("name") == Some(&"TZID".into()));
    let value = field(found, "value").filter(|value| js::truthy(Some(value)));
    Ok(decode(&js::text(Some(value.unwrap_or(&"".into())))))
}

/// The event's stored zones (`event.icalendar?.timezones || []`).
pub(super) fn timezones(event: &JsonValue) -> Result<&[JsonValue], String> {
    let icalendar = event
        .get("icalendar")
        .filter(|value| js::truthy(Some(value)));
    if icalendar.is_some_and(|value| !value.is_object()) {
        return Err(INVALID.into());
    }
    list(field(icalendar, "timezones"))
}

/// The stored zone whose TZID is `tzid` (`timezones.find(…)`), written as `componentLines` writes it.
pub(super) fn defined_zone(
    timezones: &[JsonValue],
    tzid: &str,
) -> Result<Option<Component>, String> {
    for zone in timezones {
        if zone_key(zone)? == tzid {
            return component(zone, false).map(Some);
        }
    }
    Ok(None)
}

/// `{ value, params }` as `calendarDate` and `durationEnd` read such an object: its parameters as
/// they are (no line is written).
pub(super) fn literal(value: &str, params: Option<&JsonValue>) -> Result<Property, String> {
    let mut property = Property {
        name: String::new(),
        group: String::new(),
        params: Vec::new(),
        value: value.to_string(),
    };
    for (key, entry) in entries(params.filter(|params| js::truthy(Some(params))))? {
        property.set_param(key, js::text(Some(entry)));
    }
    Ok(property)
}

/// `escapeContentText(value)`.
fn escaped(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace("\r\n", "\\n")
        .replace('\n', "\\n")
        .replace(';', "\\;")
        .replace(',', "\\,")
}

/// The first truthy of `keys`, written as a template literal writes it.
fn truthy_text(event: &JsonValue, keys: &[&str]) -> Option<String> {
    js::first(event, keys).map(|value| js::text(Some(value)))
}

/// `buildIcs([event])` read back by `ICAL.parse`: every refusal of `buildIcs`, in its order (the
/// ones `ICAL.parse` makes of the written lines are the reader's, expansion.rs).
pub(super) fn build(event: &JsonValue) -> Result<Ics, String> {
    let mut zones = Vec::new();
    let mut keys: Vec<String> = Vec::new();
    for zone in timezones(event)? {
        let key = zone_key(zone)?;
        if !keys.contains(&key) {
            zones.push(component(zone, true)?);
            keys.push(key);
        }
    }
    let mut lines = Vec::new();
    if !js::truthy(event.get("start")) && event.get("status") != Some(&"cancelled".into()) {
        return Ok(Ics {
            zones,
            event: lines,
            alarms: Vec::new(),
        });
    }
    let uid = truthy_text(event, &["exchange_uid", "uid", "id"]).ok_or("ics_uid_required")?;
    lines.push(built("UID", "", None, &escaped(&uid))?);
    let start_reference = active_reference(event, "start")?;
    let end_reference = active_reference(event, "end")?;
    let stamp = match js::first(event, &["updatedAt", "updated_at"]) {
        Some(value) => js_date::canonical(Some(value))?,
        None => Some(chrono::Utc::now().timestamp_millis() as f64),
    };
    lines.push(built(
        "DTSTAMP",
        "",
        None,
        &format_date(stamp, None, false, None)?,
    )?);
    let sequence = event
        .get("sequence")
        .filter(|value| js::truthy(Some(value)));
    lines.push(built(
        "SEQUENCE",
        "",
        None,
        &js::text(Some(sequence.unwrap_or(&0.into()))),
    )?);
    let all_day = js::truthy(event.get("allDay"));
    let date_params = |reference: &Option<JsonValue>| {
        if all_day {
            Some(serde_json::json!({ "VALUE": "DATE" }))
        } else {
            field(reference.as_ref(), "params")
                .filter(|params| js::truthy(Some(params)))
                .cloned()
        }
    };
    let zones_of = || timezones(event);
    let current_start = if js::truthy(event.get("start")) {
        let at = js_date::canonical(event.get("start"))?;
        let value = format_date(at, start_reference.as_ref(), all_day, Some(zones_of()?))?;
        let params = date_params(&start_reference);
        lines.push(built("DTSTART", "", params.as_ref(), &value)?);
        Some(literal(&value, params.as_ref())?)
    } else {
        None
    };
    let icalendar = event
        .get("icalendar")
        .filter(|value| js::truthy(Some(value)));
    let duration = field(icalendar, "duration").filter(|value| js::truthy(Some(value)));
    let end = event.get("end").filter(|value| js::truthy(Some(value)));
    let mut keep_duration = false;
    if let (Some(duration), Some(start), Some(end)) = (duration, &current_start, end) {
        let JsonValue::String(text) = duration.get("value").ok_or(INVALID)? else {
            return Err(INVALID.into());
        };
        let defined = zone_components(zones_of()?, start)?;
        let refs: Vec<&Component> = defined.iter().collect();
        let stored = literal(text, None)?;
        let ends = super::ical::duration_end(Some(start), &stored, &refs)?;
        keep_duration = js_date::canonical(Some(end))? == Some(ends);
    }
    if let (true, Some(duration)) = (keep_duration, duration) {
        let value = js::text(duration.get("value"));
        lines.push(built("DURATION", "", duration.get("params"), &value)?);
    } else if let Some(end) = end {
        let at = js_date::canonical(Some(end))?;
        let value = format_date(at, end_reference.as_ref(), all_day, Some(zones_of()?))?;
        lines.push(built(
            "DTEND",
            "",
            date_params(&end_reference).as_ref(),
            &value,
        )?);
    }
    let title = truthy_text(event, &["title"]).unwrap_or_default();
    lines.push(built("SUMMARY", "", None, &escaped(&title))?);
    for (key, name) in [("description", "DESCRIPTION"), ("location", "LOCATION")] {
        if let Some(text) = truthy_text(event, &[key]) {
            lines.push(built(name, "", None, &escaped(&text))?);
        }
    }
    let status = if event.get("status") == Some(&"cancelled".into()) {
        "CANCELLED".to_string()
    } else {
        truthy_text(event, &["ical_status"]).unwrap_or_else(|| "CONFIRMED".into())
    };
    lines.push(built("STATUS", "", None, &status)?);
    if let Some(rule) = event
        .get("recurrence")
        .filter(|rule| js::truthy(Some(rule)))
    {
        lines.push(built("RRULE", "", None, &rule_value(rule)?)?);
    }
    if let Some(id) = truthy_text(event, &["recurrence_id"]) {
        let params =
            field(field(icalendar, "recurrence_id"), "params").filter(|p| js::truthy(Some(p)));
        lines.push(built("RECURRENCE-ID", "", params, &id)?);
    }
    for (key, name) in [("exdates", "EXDATE"), ("rdates", "RDATE")] {
        for entry in list(event.get(key))? {
            if !entry.is_object() {
                return Err(INVALID.into());
            }
            let params = entry
                .get("params")
                .filter(|params| js::truthy(Some(params)));
            lines.push(built(name, "", params, &js::text(entry.get("value")))?);
        }
    }
    for p in list(field(icalendar, "extra_properties"))? {
        if !p.is_object() {
            return Err(INVALID.into());
        }
        if !MANAGED.contains(&js::text(p.get("name")).as_str()) && safe(p) {
            lines.push(stored_line(p)?);
        }
    }
    let alarms = list(event.get("alarms"))?
        .iter()
        .map(alarm)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Ics {
        zones,
        event: lines,
        alarms,
    })
}

/// `String(number)` of a number JavaScript computed.
fn number_text(number: f64) -> String {
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

/// One alarm as `buildIcs` writes it: an imported one's safe properties as they were (inert data),
/// else its TRIGGER before or after the start or the end, DISPLAY and its message.
fn alarm(alarm: &JsonValue) -> Result<Component, String> {
    if !alarm.is_object() {
        return Err(INVALID.into());
    }
    let mut properties = Vec::new();
    // `alarm.ical_properties?.length`: an array's own length (a JSON array has no `length` key).
    let imported = alarm.get("ical_properties");
    let has_imported = match imported {
        Some(JsonValue::Array(items)) => !items.is_empty(),
        Some(JsonValue::String(text)) => !text.is_empty(),
        other => js::truthy(field(other, "length")),
    };
    if has_imported {
        for p in list(imported)? {
            if !p.is_object() {
                return Err(INVALID.into());
            }
            if safe(p) {
                properties.push(stored_line(p)?);
            }
        }
    } else {
        // `Number(alarm.offsetMinutes ?? -15)`.
        let minutes = match alarm.get("offsetMinutes") {
            None | Some(JsonValue::Null) => -15.0,
            value => js::number(value),
        };
        let sign = if minutes < 0.0 { "-" } else { "" };
        let trigger = format!("{sign}PT{}M", number_text(minutes.abs()));
        let related = (alarm.get("relativeTo") == Some(&"end".into()))
            .then(|| serde_json::json!({ "RELATED": "END" }));
        properties.push(built("TRIGGER", "", related.as_ref(), &trigger)?);
        properties.push(built("ACTION", "", None, "DISPLAY")?);
        let message = truthy_text(alarm, &["message"]).unwrap_or_else(|| "Reminder".into());
        properties.push(built("DESCRIPTION", "", None, &escaped(&message))?);
    }
    Ok(Component {
        name: "VALARM".into(),
        properties,
        children: Vec::new(),
    })
}

/// The stored zone a `{ value, params }` names by its TZID, as `calendarDate` finds it.
pub(super) fn zone_components(
    timezones: &[JsonValue],
    p: &Property,
) -> Result<Vec<Component>, String> {
    let tzid = p.param("TZID").unwrap_or_default();
    if tzid.is_empty() {
        return Ok(Vec::new());
    }
    Ok(defined_zone(timezones, tzid)?.into_iter().collect())
}

/// `getFirstPropertyValue('tzid')` of a written VTIMEZONE: its first TZID as ICAL reads a text.
pub(super) fn zone_tzid(zone: &Component) -> Result<Option<String>, String> {
    let Some(tzid) = vtimezone::first(zone, "TZID") else {
        return Ok(None);
    };
    if !matches!(vtimezone::value_type(tzid).as_str(), "other" | "text") {
        return Err("ics_timezone_value_unsupported".into());
    }
    Ok(Some(decode(&tzid.value)))
}
