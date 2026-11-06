// A wall time read in a time zone the calendar defines (atome/src/squirrel/calendar/icalendar.js
// `calendarDate`, its VTIMEZONE path, ported): the JS code rebuilds the VTIMEZONE and the DTSTART
// as content lines, has ICAL.js parse them (strict) and reads `toJSDate()`. This is what that does:
// the lines refused by `buildContentLine`, the values ICAL's parser refuses, the zone found by its
// TZID (`getTimeZoneByID`), its changes (`Timezone._ensureCoverage` / `_expandComponent`) and the
// offset at that wall time (`Timezone.utcOffset`), which the zones of an expanded event read too
// (zones.rs). What ICAL would read in a way this port does not follow (a PERIOD RDATE, a zone value
// of another type, a TZID inside a child that is neither STANDARD nor DAYLIGHT) is refused explicitly.
use super::content_lines::{Property, decode};
use super::ical::Component;
use super::ical_time::{
    Time, Tz, Wall, date_text, date_time_text, date_utc, from_string, slice, strict_int,
};
use super::recur::Rule;
use super::recur_iterator::Recurrence;
use super::zone;
use super::zones::Zones;
use std::cmp::Ordering;
use std::sync::OnceLock;

const UNSUPPORTED: &str = "ics_timezone_value_unsupported";

/// A parameter as ICAL reads it back from the rebuilt line (RFC 6868 round trip, then text decoding).
pub(super) fn parameter(property: &Property, key: &str) -> Option<String> {
    property
        .param(key)
        .map(|value| decode(&value.replace("\r\n", "\n")))
}

/// The value type ICAL's parser gives the property: RDATE's own detection, else VALUE, else the
/// iCalendar design's default (a grouped name is unknown to it).
pub(super) fn value_type(property: &Property) -> String {
    let name = if property.group.is_empty() {
        property.name.to_lowercase()
    } else {
        format!("{}.{}", property.group, property.name).to_lowercase()
    };
    if name == "rdate" && !property.value.is_empty() {
        let kind = if property.value.contains('/') {
            "period"
        } else if property.value.contains('T') {
            "date-time"
        } else {
            "date"
        };
        return kind.into();
    }
    if let Some(kind) = parameter(property, "VALUE") {
        return kind.to_lowercase();
    }
    let kind = match name.as_str() {
        "dtend" | "dtstart" | "due" | "recurrence-id" | "completed" | "created" | "dtstamp"
        | "last-modified" | "exdate" | "rdate" => "date-time",
        "exrule" | "rrule" => "recur",
        "freebusy" => "period",
        "tzoffsetfrom" | "tzoffsetto" => "utc-offset",
        _ => "other",
    };
    kind.into()
}

/// The values of a multi-valued or structured property, split where ICAL splits them (a separator
/// not right after a backslash).
pub(super) fn elements(property: &Property) -> Vec<&str> {
    let separator = match property.name.as_str() {
        _ if !property.group.is_empty() => return vec![property.value.as_str()],
        "EXDATE" | "RDATE" | "FREEBUSY" | "CATEGORIES" | "RESOURCES" => b',',
        "GEO" | "REQUEST-STATUS" => b';',
        _ => return vec![property.value.as_str()],
    };
    let (bytes, mut parts, mut start) = (property.value.as_bytes(), Vec::new(), 0);
    for (at, &byte) in bytes.iter().enumerate() {
        if byte == separator && !(at > 0 && bytes[at - 1] == b'\\') {
            parts.push(&property.value[start..at]);
            start = at + 1;
        }
    }
    parts.push(&property.value[start..]);
    parts
}

/// What `ICAL.parse` refuses of one rebuilt line: an invalid RRULE, a period without its `/`.
pub(super) fn parsed(property: &Property) -> Result<(), String> {
    property.buildable()?;
    match value_type(property).as_str() {
        "recur" => {
            for element in elements(property) {
                Rule::parse(element)?;
            }
        }
        // `t[1]` of `value.split('/')` read as a duration (`isValueString`).
        "period"
            if elements(property)
                .iter()
                .any(|element| !element.contains('/')) =>
        {
            return Err("Cannot read properties of undefined (reading '0')".into());
        }
        _ => {}
    }
    Ok(())
}

pub(super) fn tree(component: &Component) -> Result<(), String> {
    component.properties.iter().try_for_each(parsed)?;
    component.children.iter().try_for_each(tree)
}

/// The first property `name` of a component as ICAL finds it (a grouped one has another name).
pub(super) fn first<'a>(component: &'a Component, name: &str) -> Option<&'a Property> {
    component
        .properties
        .iter()
        .find(|property| property.name == name && property.group.is_empty())
}

/// A date or date-time value as ICAL decorates it, UTC when it ends in `Z` (other zones refused).
fn time(property: &Property, element: &str, kind: &str, floating: bool) -> Result<Time, String> {
    match kind {
        "date" => from_string(&date_text(element)),
        "date-time" => {
            // ICAL's `fromDateTimeString` (every rebuilt text past ten characters is one).
            let time = from_string(&date_time_text(element))?;
            if time.zone != Tz::Utc
                && !floating
                && parameter(property, "TZID").is_some_and(|tzid| !tzid.is_empty())
            {
                return Err(UNSUPPORTED.into());
            }
            Ok(time)
        }
        _ => Err(UNSUPPORTED.into()),
    }
}

/// A TZOFFSETTO / TZOFFSETFROM in seconds (`UtcOffset.fromString` then `_normalize`).
fn offset(property: &Property) -> Result<i64, String> {
    if value_type(property) != "utc-offset" {
        return Err(UNSUPPORTED.into());
    }
    let units: Vec<u16> = property.value.encode_utf16().collect();
    let text = if units.len() < 6 {
        format!("{}:{}", slice(&units, 0, 3), slice(&units, 3, 5))
    } else {
        format!(
            "{}:{}:{}",
            slice(&units, 0, 3),
            slice(&units, 3, 5),
            slice(&units, 5, 7)
        )
    };
    let units: Vec<u16> = text.encode_utf16().collect();
    let factor = if units.first() == Some(&u16::from(b'+')) {
        1
    } else {
        -1
    };
    let (hours, minutes) = (
        strict_int(&slice(&units, 1, 3))?,
        strict_int(&slice(&units, 4, 6))?,
    );
    let mut seconds = factor * (60 * minutes + 3600 * hours);
    while seconds < -43_200 {
        seconds += 97_200;
    }
    while seconds > 50_400 {
        seconds -= 97_200;
    }
    Ok(seconds)
}

/// One change of a zone: the wall time it happens at (in UTC once expanded), its offsets.
#[derive(Clone, Copy)]
struct Change {
    wall: Wall,
    utc_offset: i64,
    prev_utc_offset: i64,
    daylight: bool,
}

/// `_expandComponent(component, untilYear, changes)`.
fn expand(child: &Component, limit: i64, changes: &mut Vec<Change>) -> Result<(), String> {
    let (Some(start), Some(to), Some(from)) = (
        first(child, "DTSTART"),
        first(child, "TZOFFSETTO"),
        first(child, "TZOFFSETFROM"),
    ) else {
        return Ok(());
    };
    let floating = matches!(child.name.to_lowercase().as_str(), "standard" | "daylight");
    let mut dtstart = time(start, &start.value, &value_type(start), floating)?;
    let change = |wall: Wall| -> Result<Change, String> {
        Ok(Change {
            wall,
            utc_offset: offset(to)?,
            prev_utc_offset: offset(from)?,
            daylight: child.name.to_lowercase() == "daylight",
        })
    };
    let rrule = first(child, "RRULE");
    let rdates: Vec<&Property> = child
        .properties
        .iter()
        .filter(|p| p.name == "RDATE" && p.group.is_empty())
        .collect();
    if rrule.is_none() && rdates.is_empty() {
        let mut found = change(Wall {
            is_date: false,
            ..dtstart.wall()
        })?;
        found.wall.adjust(0, 0, 0, -found.prev_utc_offset);
        changes.push(found);
        return Ok(());
    }
    for rdate in rdates {
        let element = elements(rdate)[0];
        let mut date = time(rdate, element, &value_type(rdate), floating)?;
        let (at, start_wall) = (date.wall(), dtstart.wall());
        let mut found = change(Wall {
            is_date: false,
            ..at
        })?;
        if at.is_date {
            (found.wall.hour, found.wall.minute, found.wall.second) =
                (start_wall.hour, start_wall.minute, start_wall.second);
        }
        if (if at.is_date { dtstart.zone } else { date.zone }) != Tz::Utc {
            found.wall.adjust(0, 0, 0, -found.prev_utc_offset);
        }
        changes.push(found);
    }
    if let Some(rrule) = rrule {
        if value_type(rrule) != "recur" {
            return Err(UNSUPPORTED.into());
        }
        let rule = Rule::parse(&rrule.value)?;
        let mut until = rule.until()?;
        if let Some(until) = until.as_mut().filter(|until| until.zone == Tz::Utc) {
            until.adjust(0, 0, 0, offset(from)?);
            until.zone = Tz::Floating;
        }
        // Every time of a zone's rule is floating.
        let zones = Zones::default();
        let mut occurrences = Recurrence::new(&rule, until, dtstart, limit, &zones)?;
        while let Some(mut occurrence) = occurrences.next(false)? {
            let wall = occurrence.wall();
            if wall.year > limit {
                break;
            }
            let mut found = change(wall)?;
            found.wall.adjust(0, 0, 0, -found.prev_utc_offset);
            changes.push(found);
        }
    }
    Ok(())
}

/// `Timezone._minimumExpansionYear`: the local year of ICAL's first use in the process.
fn minimum_year() -> i64 {
    static YEAR: OnceLock<i64> = OnceLock::new();
    *YEAR.get_or_init(|| {
        use chrono::Datelike;
        i64::from(chrono::Local::now().year())
    })
}

/// A zone's changes as one ICAL `Timezone` covers them (`_ensureCoverage`): all expanded again, and
/// kept beside the former ones, each time a later year than covered is asked for.
#[derive(Default)]
pub(super) struct Coverage {
    changes: Vec<Change>,
    until: i64,
}

impl Coverage {
    /// `utcOffset(time)` of the zone `component` at `wall`, in seconds.
    pub(super) fn offset(&mut self, component: &Component, wall: &Wall) -> Result<i64, String> {
        if self.changes.is_empty() || self.until < wall.year {
            let limit = wall.year.max(minimum_year()) + 5;
            for child in &component.children {
                expand(child, limit, &mut self.changes)?;
            }
            self.changes.sort_by(|a, b| a.wall.order(&b.wall));
            self.until = limit;
        }
        Ok(utc_offset(&self.changes, wall))
    }
}

/// `Timezone.prototype.utcOffset(time)` once the changes are expanded and sorted.
fn utc_offset(changes: &[Change], wall: &Wall) -> i64 {
    if changes.is_empty() {
        return 0;
    }
    // `_findNearbyChange`: ICAL's binary search.
    let (mut low, mut high, mut middle, mut order) =
        (0_i64, changes.len() as i64 - 1, 0_i64, Ordering::Equal);
    while low <= high {
        middle = low + (high - low) / 2;
        order = wall.order(&changes[middle as usize].wall);
        match order {
            Ordering::Less => high = middle - 1,
            Ordering::Greater => low = middle + 1,
            Ordering::Equal => break,
        }
    }
    let mut index = if order == Ordering::Greater {
        middle + 1
    } else {
        middle
    };
    if index >= changes.len() as i64 {
        index = changes.len() as i64 - 1;
    }
    let (mut found, mut step) = (-1_i64, 1_i64);
    loop {
        let change = changes[index as usize];
        let mut at = change.wall;
        at.adjust(0, 0, 0, change.utc_offset.min(change.prev_utc_offset));
        if wall.order(&at) != Ordering::Less {
            found = index;
        } else {
            step = -1;
        }
        if step == -1 && found != -1 {
            break;
        }
        index += step;
        if index < 0 {
            return 0;
        }
        if index >= changes.len() as i64 {
            break;
        }
    }
    let mut change = changes[found as usize];
    if change.utc_offset - change.prev_utc_offset < 0 && found > 0 {
        let mut at = change.wall;
        at.adjust(0, 0, 0, change.prev_utc_offset);
        if wall.order(&at) == Ordering::Less {
            let previous = changes[found as usize - 1];
            if change.daylight && !previous.daylight {
                change = previous;
            }
        }
    }
    change.utc_offset
}

/// The instant (ms) of `start` (a `YYYYMMDDTHHMMSS` value with a TZID, rebuilt as a DTSTART) for
/// the calendar's `zone`, the VTIMEZONE whose decoded TZID equals that parameter.
pub fn instant(zone: &Component, start: &Property) -> Result<f64, String> {
    let start = Property {
        name: "DTSTART".into(),
        ..start.clone()
    };
    tree(zone)?;
    parsed(&start)?;
    // `getFirstPropertyValue('dtstart')` finds no grouped DTSTART.
    if !start.group.is_empty() {
        return Err("ics_start_unreadable".into());
    }
    let kind = match parameter(&start, "VALUE") {
        Some(kind) => kind.to_lowercase(),
        None => "date-time".into(),
    };
    let mut time = match kind.as_str() {
        "date" => from_string(&date_text(&start.value))?,
        "date-time" => from_string(&date_time_text(&start.value))?,
        _ => return Err(UNSUPPORTED.into()),
    };
    let wall = time.wall();
    if wall.is_date {
        return zone::local(wall.year, wall.month - 1, wall.day, 0, 0, 0);
    }
    // `getTimeZoneByID(tzid)`: the calendar's one VTIMEZONE, by its first TZID.
    let tzid = parameter(&start, "TZID").unwrap_or_default();
    let defined = first(zone, "TZID").ok_or("ics_timezone_tzid_missing")?;
    if !matches!(value_type(defined).as_str(), "other" | "text") {
        return Err(UNSUPPORTED.into());
    }
    if decode(&defined.value) != tzid {
        // No such zone in ICAL's calendar: its TimezoneService knows Z, UTC and GMT, else floating.
        if ["Z", "UTC", "GMT"].contains(&tzid.as_str()) {
            return Ok(date_utc(
                wall.year,
                wall.month - 1,
                wall.day,
                wall.hour,
                wall.minute,
                wall.second,
            ));
        }
        return zone::local(
            wall.year,
            wall.month - 1,
            wall.day,
            wall.hour,
            wall.minute,
            wall.second,
        );
    }
    // A new `Timezone`, its coverage from that year.
    let offset = Coverage::default().offset(zone, &wall)?;
    Ok(date_utc(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second - offset,
    ))
}
