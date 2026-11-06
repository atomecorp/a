// The dates of one canonical event as `buildIcs` writes them (atome/src/squirrel/calendar/icalendar.js,
// ported): `activeReference` (the stored property a date is written like, moved to the event's own
// zone), `formatDate` (an instant written in that zone: a VTIMEZONE the event carries, read as ICAL.js
// reads it, an IANA zone, the server's local time or UTC) and `ruleValue` (the RRULE written over).
use super::event_ics::{INVALID, defined_zone, field, index};
use super::ical::Component;
use super::ical_time::{Time, Tz, Wall};
use super::js_date::{self, Fields};
use super::recur::WEEKDAYS;
use super::vtimezone::{self, Coverage};
use super::zone;
use atome_js_values as js;
use serde_json::{Map as JsonMap, Value as JsonValue};

/// `reference.value.endsWith('Z')` (`chained`: `reference?.value.endsWith('Z')`).
fn ends_zulu(reference: &JsonValue, chained: bool) -> Result<bool, String> {
    match reference.get("value") {
        Some(JsonValue::String(value)) => Ok(value.ends_with('Z')),
        None => Err("Cannot read properties of undefined (reading 'endsWith')".into()),
        Some(JsonValue::Null) => Err("Cannot read properties of null (reading 'endsWith')".into()),
        Some(_) if chained => Err("reference?.value.endsWith is not a function".into()),
        Some(_) => Err("reference.value.endsWith is not a function".into()),
    }
}

/// `reference?.params?.TZID`, when truthy.
fn reference_zone(reference: Option<&JsonValue>) -> Option<&JsonValue> {
    field(field(reference, "params"), "TZID").filter(|tzid| js::truthy(Some(tzid)))
}

/// `activeReference(event, field)`: the stored property the event's `field` is written like, moved
/// to the event's own zone when it names another one.
pub(super) fn active_reference(event: &JsonValue, name: &str) -> Result<Option<JsonValue>, String> {
    let icalendar = event
        .get("icalendar")
        .filter(|value| js::truthy(Some(value)));
    // `icalendar[field] || icalendar.start`, a null one read as none (`reference?.value`).
    let reference = field(icalendar, name)
        .filter(|value| js::truthy(Some(value)))
        .or(field(icalendar, "start"))
        .filter(|value| !value.is_null())
        .cloned();
    let timezone = event.get("timezone").filter(|zone| !zone.is_null());
    let (Some(timezone), false) = (timezone, js::truthy(event.get("allDay"))) else {
        return Ok(reference);
    };
    let original = match reference_zone(reference.as_ref()) {
        Some(tzid) => tzid.clone(),
        None => match &reference {
            Some(reference) if ends_zulu(reference, true)? => "UTC".into(),
            _ => "".into(),
        },
    };
    if original == *timezone {
        return Ok(reference);
    }
    let mut params = match field(reference.as_ref(), "params") {
        Some(JsonValue::Object(params)) => params.clone(),
        None | Some(JsonValue::Null) => JsonMap::new(),
        Some(_) => return Err(INVALID.into()),
    };
    params.retain(|key, _| key != "TZID");
    if js::truthy(Some(timezone)) && *timezone != "UTC" {
        params.insert("TZID".into(), timezone.clone());
    }
    let mut moved = match reference {
        Some(JsonValue::Object(reference)) => reference,
        None => JsonMap::new(),
        Some(_) => return Err(INVALID.into()),
    };
    moved.insert("params".into(), JsonValue::Object(params));
    let value = if *timezone == "UTC" { "Z" } else { "" };
    moved.insert("value".into(), value.into());
    Ok(Some(JsonValue::Object(moved)))
}

fn two(number: i64) -> String {
    format!("{number:02}")
}

/// `formatDate(value, reference, allDay, timezones)` of an instant `canonicalCalendarDate` read
/// (none: `ics_date_invalid`).
pub(super) fn format_date(
    at: Option<f64>,
    reference: Option<&JsonValue>,
    all_day: bool,
    timezones: Option<&[JsonValue]>,
) -> Result<String, String> {
    let at = at.filter(|at| at.is_finite()).ok_or("ics_date_invalid")?;
    let tzid = reference_zone(reference);
    let fields = match tzid {
        Some(tzid) if !all_day => {
            let definition = match tzid {
                JsonValue::String(tzid) => defined_zone(timezones.unwrap_or_default(), tzid)?,
                _ => None,
            };
            if let Some(definition) = definition {
                return defined_wall(&definition, &js::text(Some(tzid)), at);
            }
            let named = zone::Zone::named(&js::text(Some(tzid)))?;
            js_date::utc_fields(at + named.offset((at / 1000.0).floor() as i64)? as f64 * 1000.0)
        }
        _ => {
            let local = all_day
                || match reference {
                    Some(reference) => !ends_zulu(reference, false)?,
                    None => false,
                };
            if local {
                js_date::local_fields(at)?
            } else {
                js_date::utc_fields(at)
            }
        }
    };
    let Fields {
        year,
        month,
        day,
        hour,
        minute,
        second,
        ..
    } = fields;
    let base = format!("{year}{}{}", two(month), two(day));
    if all_day {
        return Ok(base);
    }
    let floating = tzid.is_some()
        || match reference {
            Some(reference) => !ends_zulu(reference, false)?,
            None => false,
        };
    let zulu = if floating { "" } else { "Z" };
    Ok(format!(
        "{base}T{}{}{}{zulu}",
        two(hour),
        two(minute),
        two(second)
    ))
}

/// The wall time of `at` in a VTIMEZONE the event carries: `ICAL.Time.fromJSDate(date, true)
/// .convertToZone(zone)` on a new `Timezone`, written without its dashes and colons.
fn defined_wall(definition: &Component, tzid: &str, at: f64) -> Result<String, String> {
    vtimezone::tree(definition)?;
    let utc = js_date::utc_fields(at);
    let mut wall = Wall {
        year: utc.year,
        month: utc.month,
        day: utc.day,
        hour: utc.hour,
        minute: utc.minute,
        second: utc.second,
        is_date: false,
    };
    if tzid != "UTC" {
        let offset = Coverage::default().offset(definition, &wall)?;
        wall.adjust(0, 0, 0, offset);
    }
    Ok(Time::new(wall, Tz::Floating).text().replace(['-', ':'], ""))
}

/// `ruleValue(rule)`: the stored RRULE text, its parts the editor sets written over it.
pub(super) fn rule_value(rule: &JsonValue) -> Result<String, String> {
    type Parts = Vec<(String, Option<String>)>;
    // `parts[key] = value`: a known key keeps its place.
    fn set(parts: &mut Parts, key: &str, value: Option<String>) {
        match parts.iter_mut().find(|(known, _)| known == key) {
            Some(part) => part.1 = value,
            None => parts.push((key.to_string(), value)),
        }
    }
    let mut parts: Parts = Vec::new();
    let text = rule.get("rrule").filter(|text| js::truthy(Some(text)));
    for part in js::text(Some(text.unwrap_or(&"".into()))).split(';') {
        if !part.is_empty() {
            let mut pieces = part.split('=');
            let key = pieces.next().unwrap_or_default();
            set(&mut parts, key, pieces.next().map(str::to_string));
        }
    }
    let truthy = |key: &str| rule.get(key).filter(|value| js::truthy(Some(value)));
    if let Some(freq) = truthy("freq") {
        let JsonValue::String(freq) = freq else {
            return Err("rule.freq.toUpperCase is not a function".into());
        };
        set(&mut parts, "FREQ", Some(freq.to_uppercase()));
    }
    if let Some(interval) = truthy("interval") {
        set(&mut parts, "INTERVAL", Some(js::text(Some(interval))));
    }
    match truthy("count") {
        Some(count) => set(&mut parts, "COUNT", Some(js::text(Some(count)))),
        None => parts.retain(|(key, _)| key != "COUNT"),
    }
    let part = |parts: &[(String, Option<String>)], key: &str| {
        parts
            .iter()
            .find(|(known, _)| known == key)
            .and_then(|(_, value)| value.clone())
    };
    match truthy("until") {
        Some(until) => {
            let written = part(&parts, "UNTIL").filter(|text| !text.is_empty());
            if written.is_none() || rule.get("until") != rule.get("until_original") {
                let date = written
                    .as_ref()
                    .filter(|text| text.encode_utf16().count() == 8);
                let reference = date.map(
                    |text| serde_json::json!({ "value": text, "params": { "VALUE": "DATE" } }),
                );
                let at = js_date::canonical(Some(until))?;
                let value = format_date(at, reference.as_ref(), date.is_some(), None)?;
                set(&mut parts, "UNTIL", Some(value));
            }
        }
        None => parts.retain(|(key, _)| key != "UNTIL"),
    }
    let days = truthy("byWeekday");
    let length = match days {
        Some(JsonValue::Array(days)) => !days.is_empty(),
        Some(JsonValue::String(text)) => !text.is_empty(),
        _ => false,
    };
    let numbered = part(&parts, "BYDAY")
        .filter(|text| !text.is_empty())
        .is_some_and(|text| text.bytes().any(|b| b.is_ascii_digit()));
    if length && !numbered {
        let Some(JsonValue::Array(days)) = days else {
            return Err("rule.byWeekday.map is not a function".into());
        };
        let names: Vec<String> = days
            .iter()
            .map(|day| {
                let key = js::text(Some(day));
                match key.parse::<usize>() {
                    Ok(at) if at < 7 && at.to_string() == key => WEEKDAYS[at].to_string(),
                    _ => key,
                }
            })
            .collect();
        set(&mut parts, "BYDAY", Some(names.join(",")));
    }
    let mut ordered: Vec<&(String, Option<String>)> = parts
        .iter()
        .filter(|(key, _)| index(key).is_some())
        .collect();
    ordered.sort_by_key(|(key, _)| index(key));
    ordered.extend(parts.iter().filter(|(key, _)| index(key).is_none()));
    let written: Vec<String> = ordered
        .iter()
        .map(|(key, value)| format!("{key}={}", value.as_deref().unwrap_or("undefined")))
        .collect();
    Ok(written.join(";"))
}
