// A CalDAV calendar object read into its canonical events (atome/src/squirrel/calendar/icalendar.js
// `parseCalendarData`, ported): the component tree, each VEVENT's fields, its dates resolved as
// `calendarDate` resolves them (UTC, the server's local time, a VTIMEZONE of the calendar through
// vtimezone.rs, else an IANA zone), its rule, its date lists, its alarms (inert) and the RFC
// properties kept as they were read. A date is written as `Date.prototype.toJSON` writes it.
use super::content_lines::{self, Property, decode, split};
use super::ical_time::{Duration, date_utc, from_string};
use super::{js_date, vtimezone, zone};
use atome_js_values as js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const WEEKDAYS: [&str; 7] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
pub const MANAGED: [&str; 15] = [
    "UID",
    "DTSTART",
    "DTEND",
    "SUMMARY",
    "DESCRIPTION",
    "LOCATION",
    "DTSTAMP",
    "LAST-MODIFIED",
    "SEQUENCE",
    "STATUS",
    "RRULE",
    "RECURRENCE-ID",
    "EXDATE",
    "RDATE",
    "DURATION",
];
/// The parts of an iCalendar date or date-time (`/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/`):
/// year, month, day, then the hour, minute, second and `Z` of a date-time.
struct DateParts<'a> {
    date: [&'a str; 3],
    time: Option<([&'a str; 3], &'a str)>,
}

fn date_parts(value: &str) -> Option<DateParts<'_>> {
    let bytes = value.as_bytes();
    let digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    let timed = match bytes.len() {
        8 => false,
        15 => bytes[8] == b'T',
        16 => bytes[8] == b'T' && bytes[15] == b'Z',
        _ => return None,
    };
    if !digits(0..8) || (timed && !digits(9..15)) {
        return None;
    }
    Some(DateParts {
        date: [&value[0..4], &value[4..6], &value[6..8]],
        time: timed.then(|| {
            (
                [&value[9..11], &value[11..13], &value[13..15]],
                &value[15..],
            )
        }),
    })
}

/// One component as `parseTree` builds it: `{ name, properties, children }`.
pub struct Component {
    pub name: String,
    pub properties: Vec<Property>,
    pub children: Vec<Component>,
}

impl Component {
    fn json(&self) -> JsonValue {
        let properties: Vec<JsonValue> = self.properties.iter().map(Property::json).collect();
        let children: Vec<JsonValue> = self.children.iter().map(Component::json).collect();
        json!({ "name": self.name, "properties": properties, "children": children })
    }
}

// `property(properties, name)`: the first of that name, whatever its group.
fn property<'a>(properties: &'a [Property], name: &str) -> Option<&'a Property> {
    properties.iter().find(|property| property.name == name)
}

// `text(properties, name)`: its decoded value, `''` without it.
pub fn text(properties: &[Property], name: &str) -> String {
    property(properties, name).map_or_else(String::new, |property| decode(&property.value))
}

/// A `Date` as JSON writes it (`toISOString`), `null` when invalid.
fn date_json(ms: f64) -> JsonValue {
    js_date::iso(ms).map_or(JsonValue::Null, JsonValue::String)
}

/// `calendarDate(p, timezones)`: the instant (ms) of a date property, none without one.
pub fn calendar_date(
    p: Option<&Property>,
    timezones: &[&Component],
) -> Result<Option<f64>, String> {
    let Some(p) = p else {
        return Ok(None);
    };
    let found = date_parts(&p.value).ok_or("ics_date_invalid")?;
    let number = |part: &str| part.parse::<i64>().unwrap_or_default();
    let [y, m, d] = found.date.map(number);
    let ([hh, mm, ss], z) = found.time.map_or(([0, 0, 0], false), |(time, z)| {
        (time.map(number), !z.is_empty())
    });
    let target = date_utc(y, m - 1, d, hh, mm, ss);
    let validated =
        chrono::DateTime::from_timestamp_millis(target as i64).ok_or("ics_date_invalid")?;
    {
        use chrono::Datelike;
        let same = i64::from(validated.year()) == y
            && i64::from(validated.month0()) == m - 1
            && i64::from(validated.day()) == d;
        if !same || hh > 23 || mm > 59 || ss > 59 {
            return Err("ics_date_invalid".into());
        }
    }
    if !p.value.contains('T') {
        return zone::local(y, m - 1, d, 0, 0, 0).map(Some);
    }
    let tzid = p.param("TZID").unwrap_or_default();
    if tzid.is_empty() || z {
        return if z {
            Ok(Some(target))
        } else {
            zone::local(y, m - 1, d, hh, mm, ss).map(Some)
        };
    }
    if let Some(defined) = timezones
        .iter()
        .find(|zone| text(&zone.properties, "TZID") == tzid)
    {
        return vtimezone::instant(defined, p).map(Some);
    }
    let named = zone::Zone::named(tzid)?;
    zone::resolve(target, |seconds| named.offset(seconds)).map(Some)
}

/// `parseRule(p)`: the RRULE's canonical reading (any value: the rule is not validated here).
fn parse_rule(p: Option<&Property>) -> Result<JsonValue, String> {
    let Some(p) = p else {
        return Ok(JsonValue::Null);
    };
    // `Object.fromEntries(value.split(';').map(part => part.split('=')))`: the last of a key wins.
    let part = |key: &str| -> Option<&str> {
        p.value
            .split(';')
            .filter_map(|part| {
                let mut pieces = part.split('=');
                (pieces.next() == Some(key)).then(|| pieces.next())
            })
            .next_back()
            .flatten()
    };
    let truthy = |key: &str| part(key).filter(|value| !value.is_empty());
    let mut rule = JsonMap::new();
    rule.insert(
        "freq".into(),
        json!(truthy("FREQ").unwrap_or_default().to_lowercase()),
    );
    let interval = truthy("INTERVAL").map_or(1.0, |interval| js::number(Some(&json!(interval))));
    rule.insert("interval".into(), js::number_json(interval));
    if let Some(count) = truthy("COUNT") {
        rule.insert(
            "count".into(),
            js::number_json(js::number(Some(&json!(count)))),
        );
    }
    if let Some(until) = truthy("UNTIL") {
        let until = Property {
            name: String::new(),
            group: String::new(),
            params: Vec::new(),
            value: until.to_string(),
        };
        let at = date_json(calendar_date(Some(&until), &[])?.ok_or("ics_date_invalid")?);
        rule.insert("until".into(), at.clone());
        rule.insert("until_original".into(), at);
    }
    if let Some(days) = truthy("BYDAY").filter(|days| !days.starts_with(',')) {
        let days: Vec<usize> = days
            .split(',')
            .filter_map(|day| WEEKDAYS.iter().position(|name| *name == day))
            .collect();
        rule.insert("byWeekday".into(), json!(days));
    }
    rule.insert("rrule".into(), json!(p.value));
    Ok(JsonValue::Object(rule))
}

/// `durationEnd(start, duration, timezones)`.
pub fn duration_end(
    start: Option<&Property>,
    duration: &Property,
    timezones: &[&Component],
) -> Result<f64, String> {
    let start = start.ok_or("ics_duration_start_required")?;
    // `YYYY-MM-DD[THH:MM:SS[Z]]`, a value of another shape as it is.
    let value = match date_parts(&start.value) {
        Some(found) => {
            let [year, month, day] = found.date;
            let mut value = format!("{year}-{month}-{day}");
            if let Some(([hour, minute, second], z)) = found.time {
                value.push_str(&format!("T{hour}:{minute}:{second}{z}"));
            }
            value
        }
        None => start.value.clone(),
    };
    let mut time = from_string(&value)?;
    let offset = Duration::parse(&duration.value)?;
    if offset.seconds_total() <= 0.0 {
        return Err("ics_duration_invalid".into());
    }
    let days = offset.weeks * 7.0 + offset.days;
    // Past ±3.7 million days no end year can be written on four digits (`ics_date_invalid`); ICAL
    // would walk such a span one month at a time.
    if days.abs() > 3.7e6 {
        return Err("ics_date_invalid".into());
    }
    time.adjust(days as i64, 0, 0, 0);
    // `{ value, params: start.params }`: no name, no group.
    let day_end = Property {
        name: String::new(),
        group: String::new(),
        params: start.params.clone(),
        value: time.text().replace(['-', ':'], ""),
    };
    let day_end = calendar_date(Some(&day_end), timezones)?.ok_or("ics_date_invalid")?;
    Ok(day_end + (offset.hours * 3600.0 + offset.minutes * 60.0 + offset.seconds) * 1000.0)
}

/// `parseTree(input)`: the one VCALENDAR, version 2.0.
fn parse_tree(input: &str) -> Result<Component, String> {
    if content_lines::too_long(input) {
        return Err("ics_size_invalid".into());
    }
    let (mut roots, mut stack): (Vec<Component>, Vec<Component>) = (Vec::new(), Vec::new());
    for line in content_lines::unfold(input) {
        if line.is_empty() {
            continue;
        }
        let property = content_lines::parse_line(&line)?;
        match property.name.as_str() {
            "BEGIN" => {
                stack.push(Component {
                    name: property.value.to_uppercase(),
                    properties: Vec::new(),
                    children: Vec::new(),
                });
                if stack.len() > 8 {
                    return Err("ics_nesting_invalid".into());
                }
            }
            "END" => {
                let component = stack
                    .pop()
                    .filter(|component| component.name == property.value.to_uppercase());
                let component = component.ok_or("ics_component_unmatched")?;
                match stack.last_mut() {
                    Some(parent) => parent.children.push(component),
                    None => roots.push(component),
                }
            }
            _ => stack
                .last_mut()
                .ok_or("ics_calendar_required")?
                .properties
                .push(property),
        }
    }
    if !stack.is_empty() || roots.len() != 1 || roots[0].name != "VCALENDAR" {
        return Err("ics_calendar_incomplete".into());
    }
    let root = roots.remove(0);
    if text(&root.properties, "VERSION") != "2.0" {
        return Err("ics_version_unsupported".into());
    }
    Ok(root)
}

/// `parseCalendarData(input)`: one canonical event per VEVENT.
pub fn parse(input: &str) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    let root = parse_tree(input)?;
    let timezones: Vec<&Component> = root
        .children
        .iter()
        .filter(|child| child.name == "VTIMEZONE")
        .collect();
    let zones: Vec<JsonValue> = timezones.iter().map(|zone| zone.json()).collect();
    let mut events = Vec::new();
    for event in root.children.iter().filter(|child| child.name == "VEVENT") {
        let props = &event.properties;
        let start_property = property(props, "DTSTART");
        let uid = text(props, "UID");
        if uid.is_empty() {
            return Err("ics_uid_required".into());
        }
        let status = text(props, "STATUS").to_uppercase();
        let (duration, end_property) = (property(props, "DURATION"), property(props, "DTEND"));
        if duration.is_some() && end_property.is_some() {
            return Err("ics_end_duration_conflict".into());
        }
        let start = calendar_date(start_property, &timezones)?;
        let end = match duration {
            Some(duration) => Some(duration_end(start_property, duration, &timezones)?),
            None => calendar_date(end_property, &timezones)?,
        };
        if start.is_none() && status != "CANCELLED" {
            return Err("ics_start_required".into());
        }
        let dates = |name: &str| -> Vec<JsonValue> {
            props
                .iter()
                .filter(|p| p.name == name)
                .flat_map(|p| {
                    split(&p.value, ',')
                        .into_iter()
                        .map(|value| p.json_with_value(&value))
                })
                .collect()
        };
        let reference = |p: Option<&Property>| p.map_or(JsonValue::Null, Property::json);
        let start_value = start_property.map(|p| p.value.as_str()).unwrap_or_default();
        let all_day = start_property.and_then(|p| p.param("VALUE")) == Some("DATE")
            || (start_value.len() == 8 && start_value.bytes().all(|b| b.is_ascii_digit()));
        let timezone = match start_property
            .and_then(|p| p.param("TZID"))
            .filter(|tzid| !tzid.is_empty())
        {
            Some(tzid) => tzid.to_string(),
            None if start_value.ends_with('Z') => "UTC".into(),
            None => String::new(),
        };
        let sequence = text(props, "SEQUENCE");
        let sequence = if sequence.is_empty() {
            0.0
        } else {
            js::number(Some(&json!(sequence)))
        };
        let recurrence = parse_rule(property(props, "RRULE"))?;
        let alarms: Vec<JsonValue> = event
            .children
            .iter()
            .filter(|child| child.name == "VALARM")
            .map(|alarm| {
                let properties: Vec<JsonValue> = alarm.properties.iter().map(Property::json).collect();
                json!({ "enabled": false, "message": text(&alarm.properties, "DESCRIPTION"), "ical_properties": properties })
            })
            .collect();
        let extra: Vec<JsonValue> = props
            .iter()
            .filter(|p| {
                !MANAGED.contains(&p.name.as_str()) && !content_lines::private_name(&p.name)
            })
            .map(Property::json)
            .collect();
        let updated = calendar_date(
            property(props, "LAST-MODIFIED").or_else(|| property(props, "DTSTAMP")),
            &[],
        )?;
        let mut item = JsonMap::new();
        for key in ["id", "uid", "exchange_uid"] {
            item.insert(key.into(), json!(uid));
        }
        item.insert("title".into(), json!(text(props, "SUMMARY")));
        item.insert("description".into(), json!(text(props, "DESCRIPTION")));
        item.insert("location".into(), json!(text(props, "LOCATION")));
        item.insert("start".into(), start.map_or(JsonValue::Null, date_json));
        item.insert("end".into(), end.map_or(JsonValue::Null, date_json));
        item.insert("allDay".into(), json!(all_day));
        item.insert("timezone".into(), json!(timezone));
        item.insert("sequence".into(), js::number_json(sequence));
        item.insert(
            "status".into(),
            json!(if status == "CANCELLED" {
                "cancelled"
            } else {
                "open"
            }),
        );
        item.insert(
            "ical_status".into(),
            json!(if status.is_empty() {
                "CONFIRMED"
            } else {
                status.as_str()
            }),
        );
        let recurrence_id = property(props, "RECURRENCE-ID");
        item.insert(
            "recurrence_id".into(),
            json!(recurrence_id.map(|p| p.value.as_str()).unwrap_or_default()),
        );
        item.insert("recurrence".into(), recurrence);
        item.insert("exdates".into(), json!(dates("EXDATE")));
        item.insert("rdates".into(), json!(dates("RDATE")));
        item.insert("alarms".into(), json!(alarms));
        item.insert(
            "icalendar".into(),
            json!({
                "start": reference(start_property),
                "end": reference(end_property),
                "duration": reference(duration),
                "recurrence_id": reference(recurrence_id),
                "timezones": zones.clone(),
                "extra_properties": extra,
            }),
        );
        item.insert(
            "updatedAt".into(),
            updated.map_or(JsonValue::Null, date_json),
        );
        events.push(item);
    }
    Ok(events)
}
