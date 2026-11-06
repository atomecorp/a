// The starts of one recurring event in a range (atome/src/squirrel/calendar/icalendar.js
// `expandCalendarOccurrences`, ported): the event written and read back (event_ics.rs), the zones
// its dates are in (`installIanaZones`, zones.rs), then ICAL.js's `RecurExpansion` step for step:
// its RDATEs (times or periods) and EXDATEs sorted as ICAL inserts them, its RRULE walked by
// `RecurIterator` (recur_iterator.rs), its 500 tries per step, and the reader's 100 000 steps.
//
// The RRULE's walk reads no year past the range's end (its `window`): where ICAL would walk on, the
// occurrence it would find there lies past the end, where the reader stops.
use super::content_lines::Property;
use super::event_ics::{self, INVALID};
use super::ical_time::{Duration, Field, Time, Tz, Wall, date_text, date_time_text, from_string};
use super::js_date;
use super::recur::Rule;
use super::recur_iterator::Recurrence;
use super::vtimezone::{elements, parameter, parsed, tree, value_type};
use super::zone;
use super::zones::Zones;
use serde_json::Value as JsonValue;
use std::cmp::Ordering;

const MAX_TRIES: usize = 500;
const MAX_STEPS: usize = 100_000;
// A year past every Date: the walk of a range without an end is not bounded.
const NO_LAST_YEAR: i64 = 300_000;

/// A start ICAL hands out: a time, or an RDATE's period (its end, or its duration's fields).
#[derive(Clone, Copy)]
enum Item {
    Time(Time),
    Period {
        start: Time,
        end: Option<Time>,
        shift: [i64; 4],
    },
}

fn sign(order: Ordering) -> i32 {
    match order {
        Ordering::Less => -1,
        Ordering::Equal => 0,
        Ordering::Greater => 1,
    }
}

impl Item {
    /// `getEnd()`: the end, else the start moved by the duration (`addDuration`).
    fn end(start: Time, end: Option<Time>, shift: [i64; 4]) -> Time {
        if let Some(end) = end {
            return end;
        }
        let mut moved = start.cloned();
        let fields = [Field::Second, Field::Minute, Field::Hour, Field::Day];
        let values = fields.map(|field| moved.get(field));
        for ((field, value), by) in fields.into_iter().zip(values).zip(shift) {
            moved.set(field, value + by);
        }
        moved
    }
}

/// `a.compare(b)`: a time by its instant, a period holding a time between its start and its end.
fn compare(a: Item, b: Item, zones: &Zones) -> i32 {
    match (a, b) {
        (Item::Time(mut a), Item::Time(mut b)) => sign(a.compare(&mut b, zones)),
        (Item::Time(_), Item::Period { .. }) => -compare(b, a, zones),
        (Item::Period { start, end, shift }, other) => {
            if compare(other, Item::Time(start), zones) < 0 {
                1
            } else if compare(other, Item::Time(Item::end(start, end, shift)), zones) > 0 {
                -1
            } else {
                0
            }
        }
    }
}

/// `_compare_special(a, b)`: a date-time against a date by its own date (a period has none: NaN).
fn special(a: Item, b: Item, zones: &Zones) -> i32 {
    let a_timed = match a {
        Item::Time(mut time) => !time.wall().is_date,
        Item::Period { .. } => true,
    };
    let b_date = match b {
        Item::Time(mut time) => time.wall().is_date,
        Item::Period { .. } => false,
    };
    if !(a_timed && b_date) {
        return compare(a, b, zones);
    }
    let Item::Time(mut time) = a else {
        return 0;
    };
    let wall = time.wall();
    let day = Wall {
        year: wall.year,
        month: wall.month,
        day: wall.day,
        is_date: true,
        ..Wall::default()
    };
    compare(Item::Time(Time::new(day, Tz::Floating)), b, zones)
}

/// ICAL's binary search: where `value` goes in the sorted `list`.
fn search(list: &[Item], value: Item, order: impl Fn(Item, Item) -> i32) -> usize {
    if list.is_empty() {
        return 0;
    }
    let (mut low, mut high, mut middle, mut found) = (0_i64, list.len() as i64 - 1, 0_i64, 0);
    while low <= high {
        middle = low + (high - low) / 2;
        found = order(value, list[middle as usize]);
        if found < 0 {
            high = middle - 1;
        } else if found > 0 {
            low = middle + 1;
        } else {
            break;
        }
    }
    (if found > 0 { middle + 1 } else { middle }) as usize
}

/// A date-time value (`fromDateTimeString(text, property)`): UTC with a final `Z`, else the zone of
/// its TZID.
fn date_time(property: &Property, text: &str, zones: &Zones) -> Result<Time, String> {
    if text.encode_utf16().count() < 19 {
        return Err(format!("invalid date-time value: \"{text}\""));
    }
    let zone = match parameter(property, "TZID").filter(|tzid| !tzid.is_empty()) {
        _ if text.ends_with('Z') => Tz::Utc,
        Some(tzid) => zones.zone_of(&tzid)?,
        None => Tz::Floating,
    };
    let mut time = from_string(text)?;
    time.zone = zone;
    Ok(time)
}

/// One value of a property decorated as ICAL decorates its type.
fn decorate(property: &Property, element: &str, kind: &str, zones: &Zones) -> Result<Item, String> {
    match kind {
        "date" => Ok(Item::Time(from_string(&date_text(element))?)),
        "date-time" => Ok(Item::Time(date_time(
            property,
            &date_time_text(element),
            zones,
        )?)),
        "period" => {
            let mut pieces = element.split('/');
            let first = pieces.next().unwrap_or_default();
            let second = pieces
                .next()
                .ok_or("Cannot read properties of undefined (reading '0')")?;
            let start = date_time(property, &date_time_text(first), zones)?;
            let units: Vec<u16> = second.encode_utf16().take(2).collect();
            if units.contains(&u16::from(b'P')) {
                let d = Duration::parse(second)?;
                let by = if d.negative { -1 } else { 1 };
                let shift =
                    [d.seconds, d.minutes, d.hours, d.days + 7.0 * d.weeks].map(|v| by * v as i64);
                return Ok(Item::Period {
                    start,
                    end: None,
                    shift,
                });
            }
            let end = date_time(property, &date_time_text(second), zones)?;
            Ok(Item::Period {
                start,
                end: Some(end),
                shift: [0; 4],
            })
        }
        _ => Err("ics_date_list_unsupported".into()),
    }
}

fn named<'a>(event: &'a [Property], name: &'a str) -> impl Iterator<Item = &'a Property> {
    event
        .iter()
        .filter(move |p| p.name == name && p.group.is_empty())
}

/// `_extractDates(component, name)`: every value of every such property, each inserted in order.
fn extract(event: &[Property], name: &str, zones: &Zones) -> Result<Vec<Item>, String> {
    let mut dates: Vec<Item> = Vec::new();
    for property in named(event, name) {
        let kind = value_type(property);
        for element in elements(property) {
            let value = decorate(property, element, &kind, zones)?;
            let at = search(&dates, value, |a, b| compare(a, b, zones));
            dates.insert(at, value);
        }
    }
    Ok(dates)
}

/// `RecurExpansion` once `_init` has read the event.
struct Expansion<'a> {
    zones: &'a Zones,
    rule: Option<Recurrence<'a>>,
    rule_dates: Vec<Item>,
    rule_index: usize,
    ex_dates: Vec<Item>,
    ex_index: usize,
}

impl Expansion<'_> {
    /// `next()`: none once complete.
    fn next(&mut self) -> Result<Option<Item>, String> {
        let zones = self.zones;
        for tries in 0.. {
            if tries > MAX_TRIES {
                return Err("max tries have occurred, rule may be impossible to fulfill.".into());
            }
            let rule_date = self.rule_dates.get(self.rule_index).copied();
            let from_rule = match (rule_date, self.rule.as_ref()) {
                (None, None) => return Ok(None),
                (Some(date), Some(rule)) => compare(date, Item::Time(rule.last), zones) <= 0,
                (date, _) => date.is_some(),
            };
            let last = match (from_rule, rule_date, self.rule.as_mut()) {
                (true, Some(date), _) => {
                    self.rule_index += 1;
                    date
                }
                (_, _, Some(rule)) => {
                    let last = Item::Time(rule.last.cloned());
                    if rule.next(false)?.is_none() {
                        self.rule = None;
                    }
                    last
                }
                _ => return Err(INVALID.into()),
            };
            if let Some(&ex_date) = self.ex_dates.get(self.ex_index) {
                let order = special(last, ex_date, zones);
                if order >= 0 {
                    self.ex_index += 1;
                }
                if order == 0 {
                    continue;
                }
            }
            return Ok(Some(last));
        }
        unreachable!("the tries are bounded")
    }
}

/// The first failure an offset met, else the result.
fn checked<T>(zones: &Zones, result: Result<T, String>) -> Result<T, String> {
    match zones.failure() {
        Some(failure) => Err(failure),
        None => result,
    }
}

/// `expandCalendarOccurrences(event, from, until, limit)`: the starts (ms) from `from` up to `until`.
pub(crate) fn expand(
    event: &JsonValue,
    from: f64,
    until: f64,
    limit: usize,
) -> Result<Vec<f64>, String> {
    let ics = event_ics::build(event)?;
    // `ICAL.parse`: what it refuses of the lines, in their order.
    for zone in &ics.zones {
        if ["vevent", "vcalendar"].contains(&zone.name.to_lowercase().as_str()) {
            return Err(INVALID.into());
        }
        tree(zone)?;
    }
    ics.event.iter().try_for_each(parsed)?;
    ics.alarms.iter().try_for_each(tree)?;
    // `installIanaZones`.
    let mut zones = Zones::default();
    for zone in ics.zones {
        if zone.name.eq_ignore_ascii_case("vtimezone") {
            let tzid = event_ics::zone_tzid(&zone)?;
            zones.define(tzid, zone);
        }
    }
    let mut ids: Vec<String> = Vec::new();
    for tzid in ics.event.iter().filter_map(|p| parameter(p, "TZID")) {
        if !tzid.is_empty() && !ids.contains(&tzid) {
            ids.push(tzid);
        }
    }
    for id in ids {
        if !zones.defines(&id) && !["Z", "UTC", "GMT"].contains(&id.as_str()) {
            zones.install(&id, zone::Zone::named(&id)?);
        }
    }
    let event = &ics.event;
    let dtstart = match named(event, "DTSTART").next() {
        // A cancelled event written without a start: `new ICAL.Time(null)`, ICAL's default time.
        None => Time::new(
            Wall {
                year: 1970,
                month: 1,
                day: 1,
                hour: 0,
                minute: 0,
                second: 0,
                is_date: false,
            },
            Tz::Floating,
        ),
        Some(start) => {
            let kind = parameter(start, "VALUE")
                .map_or_else(|| "date-time".into(), |kind| kind.to_lowercase());
            if !matches!(kind.as_str(), "date" | "date-time") {
                return Err("ics_start_unreadable".into());
            }
            let Item::Time(dtstart) = decorate(start, &start.value, &kind, &zones)? else {
                return Err("ics_start_unreadable".into());
            };
            dtstart
        }
    };
    let rule = match named(event, "RRULE").next() {
        Some(p) if value_type(p) != "recur" => return Err("n.iterator is not a function".into()),
        Some(p) => Some(Rule::parse(&p.value)?),
        None => None,
    };
    let last_year = if until.is_finite() {
        js_date::utc_fields(until.clamp(-js_date::MAX_TIME_MS, js_date::MAX_TIME_MS)).year + 1
    } else {
        NO_LAST_YEAR
    };
    let mut expansion = checked(
        &zones,
        init(event, dtstart, rule.as_ref(), last_year, &zones),
    )?;
    let mut output = Vec::new();
    let mut steps = 0;
    while let Some(item) = checked(&zones, expansion.next())? {
        if steps >= MAX_STEPS {
            break;
        }
        steps += 1;
        let Item::Time(mut time) = item else {
            return Err("time.toJSDate is not a function".into());
        };
        let date = checked(&zones, time.js_date(&zones))?;
        if date > until {
            break;
        }
        if date >= from {
            output.push(date);
        }
        if output.len() >= limit {
            break;
        }
    }
    Ok(output)
}

/// `RecurExpansion._init(component)`.
fn init<'a>(
    event: &[Property],
    dtstart: Time,
    rule: Option<&'a Rule>,
    last_year: i64,
    zones: &'a Zones,
) -> Result<Expansion<'a>, String> {
    let mut expansion = Expansion {
        zones,
        rule: None,
        rule_dates: Vec::new(),
        rule_index: 0,
        ex_dates: Vec::new(),
        ex_index: 0,
    };
    let has = |name| named(event, name).next().is_some();
    if !has("RDATE") && rule.is_none() && !has("RECURRENCE-ID") {
        expansion.rule_dates.push(Item::Time(dtstart));
        return Ok(expansion);
    }
    let mut last = Item::Time(dtstart.cloned());
    if has("RDATE") {
        expansion.rule_dates = extract(event, "RDATE", zones)?;
        match expansion.rule_dates.first() {
            Some(&first) if compare(first, Item::Time(dtstart), zones) < 0 => last = first,
            _ => {
                expansion.rule_index =
                    search(&expansion.rule_dates, last, |a, b| compare(a, b, zones));
            }
        }
    }
    if let Some(rule) = rule {
        let mut iterator = Recurrence::new(rule, rule.until()?, dtstart, last_year, zones)?;
        if iterator.next(false)?.is_some() {
            expansion.rule = Some(iterator);
        }
    }
    if has("EXDATE") {
        expansion.ex_dates = extract(event, "EXDATE", zones)?;
        expansion.ex_index = search(&expansion.ex_dates, last, |a, b| special(a, b, zones));
    }
    Ok(expansion)
}
