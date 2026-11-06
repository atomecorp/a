// The RRULE of a VTIMEZONE's STANDARD and DAYLIGHT rules as ICAL.js reads it (`ICAL.Recur`, vendored
// in atome/src/assets/vendor/ical): `_stringToData` when the calendar is parsed, every part checked
// as ICAL checks it, then `fromData` when the zone is expanded. Its expansion, `ICAL.RecurIterator`,
// is recur_iterator.rs and recur_year.rs.
use super::ical_time::{Time, date_text, date_time_text, from_string, strict_int};
use serde_json::json;

pub const WEEKDAYS: [&str; 7] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/// The weekday (0 = Sunday) named by the two bytes at the start of `bytes`.
fn weekday_at(bytes: &[u8]) -> Option<usize> {
    let name = bytes.get(..2)?;
    WEEKDAYS.iter().position(|day| day.as_bytes() == name)
}

/// ICAL's `/^([+-])?(5[0-3]|[1-4][0-9]|[1-9])?(SU|MO|TU|WE|TH|FR|SA)$/`: a BYDAY value.
fn byday_valid(day: &str) -> bool {
    let bytes = day.as_bytes();
    let unsigned = match bytes.first() {
        Some(b'+' | b'-') => &bytes[1..],
        _ => bytes,
    };
    let Some(split) = unsigned.len().checked_sub(2) else {
        return false;
    };
    let (number, name) = unsigned.split_at(split);
    weekday_at(name).is_some()
        && matches!(
            number,
            [] | [b'1'..=b'9'] | [b'1'..=b'4', b'0'..=b'9'] | [b'5', b'0'..=b'3']
        )
}

/// A rule's frequency, in ICAL's order.
#[derive(Clone, Copy, PartialEq)]
pub enum Freq {
    Secondly,
    Minutely,
    Hourly,
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

const FREQUENCIES: [(&str, Freq); 7] = [
    ("SECONDLY", Freq::Secondly),
    ("MINUTELY", Freq::Minutely),
    ("HOURLY", Freq::Hourly),
    ("DAILY", Freq::Daily),
    ("WEEKLY", Freq::Weekly),
    ("MONTHLY", Freq::Monthly),
    ("YEARLY", Freq::Yearly),
];

/// The BY parts, in ICAL's `_indexMap` order.
#[derive(Clone, Copy, PartialEq)]
pub enum Part {
    Second,
    Minute,
    Hour,
    Day,
    MonthDay,
    YearDay,
    WeekNo,
    Month,
    SetPos,
}

// The numeric BY parts and the range ICAL's validator accepts.
const NUMERIC: [(&str, Part, f64, f64); 8] = [
    ("BYSECOND", Part::Second, 0.0, 60.0),
    ("BYMINUTE", Part::Minute, 0.0, 59.0),
    ("BYHOUR", Part::Hour, 0.0, 23.0),
    ("BYMONTHDAY", Part::MonthDay, -31.0, 31.0),
    ("BYYEARDAY", Part::YearDay, -366.0, 366.0),
    ("BYWEEKNO", Part::WeekNo, -53.0, 53.0),
    ("BYMONTH", Part::Month, 1.0, 12.0),
    ("BYSETPOS", Part::SetPos, -366.0, 366.0),
];

/// A rule's BY parts (`rule.parts`, and the iterator's working copy `by_data`): the numbers of each
/// numeric part, the texts of BYDAY.
#[derive(Clone, Default, PartialEq)]
pub struct Parts {
    numbers: [Option<Vec<i64>>; 9],
    pub days: Option<Vec<String>>,
}

impl Parts {
    /// `part in parts`.
    pub fn has(&self, part: Part) -> bool {
        match part {
            Part::Day => self.days.is_some(),
            _ => self.numbers[part as usize].is_some(),
        }
    }

    /// A numeric part's values (none when it is absent).
    pub fn list(&self, part: Part) -> &[i64] {
        self.numbers[part as usize].as_deref().unwrap_or_default()
    }

    pub fn put(&mut self, part: Part, values: Vec<i64>) {
        self.numbers[part as usize] = Some(values);
    }
}

/// A parsed RRULE (`ICAL.Recur`).
pub struct Rule {
    pub freq: Option<Freq>,
    pub interval: i64,
    pub count: i64,
    pub wkst: i64,
    pub parts: Parts,
    until: Option<String>,
    // An unknown part lands on the `ICAL.Recur` itself: PARTS replaces its parts (`fromData` then
    // throws on a BY part that follows it, the iterator throws otherwise), ITERATOR its iterator.
    decorate_error: Option<String>,
    pub iterator_error: Option<String>,
}

// A numeric BY value: `parseInt` after a leading `+`, refused when `Number(text)` leaves its range.
fn bounded(name: &str, min: f64, max: f64, text: &str) -> Result<i64, String> {
    let value = strict_int(text.strip_prefix('+').unwrap_or(text))?;
    let number = atome_js_values::number(Some(&json!(text)));
    if number < min || number > max {
        return Err(format!("{name}: invalid value \"{text}\""));
    }
    Ok(value)
}

fn distinct<T: PartialEq>(values: Vec<T>) -> Vec<T> {
    let mut kept = Vec::with_capacity(values.len());
    for value in values {
        if !kept.contains(&value) {
            kept.push(value);
        }
    }
    kept
}

impl Rule {
    /// The `recur` value's `fromICAL` (`_stringToData`).
    pub fn parse(value: &str) -> Result<Rule, String> {
        let mut rule = Rule {
            freq: None,
            interval: 1,
            count: 0,
            wkst: 2,
            parts: Parts::default(),
            until: None,
            decorate_error: None,
            iterator_error: None,
        };
        // PARTS' value once it is read: a BY part read for the first time after it cannot be set.
        let mut replaced: Option<String> = None;
        for part in value.split(';') {
            let mut pieces = part.split('=');
            let name = pieces.next().unwrap_or_default();
            let key = name.to_uppercase();
            let text = pieces.next();
            let list = || {
                text.map(|text| text.split(','))
                    .ok_or("Cannot read properties of undefined (reading 'split')")
            };
            let numeric = NUMERIC.iter().find(|(known, ..)| *known == key);
            let by = numeric
                .map(|(_, part, ..)| *part)
                .or((key == "BYDAY").then_some(Part::Day));
            if let (Some(by), Some(parts)) = (by, &replaced)
                && !rule.parts.has(by)
                && rule.decorate_error.is_none()
            {
                rule.decorate_error = Some(format!(
                    "Cannot create property '{key}' on string '{parts}'"
                ));
            }
            if let Some((_, part, min, max)) = numeric {
                let values = list()?
                    .map(|value| bounded(&key, *min, *max, value))
                    .collect::<Result<Vec<_>, _>>()?;
                rule.parts.put(*part, distinct(values));
                continue;
            }
            match key.as_str() {
                "BYDAY" => {
                    let mut days = Vec::new();
                    for day in list()? {
                        if !byday_valid(day) {
                            return Err(format!("invalid BYDAY value \"{day}\""));
                        }
                        days.push(day.to_string());
                    }
                    rule.parts.days = Some(distinct(days));
                }
                "FREQ" => {
                    let found = FREQUENCIES.iter().find(|(known, _)| Some(*known) == text);
                    let names = FREQUENCIES.map(|(known, _)| known).join(", ");
                    let shown = text.unwrap_or("undefined");
                    let error = || format!("invalid frequency \"{shown}\" expected: \"{names}\"");
                    rule.freq = Some(found.ok_or_else(error)?.1);
                }
                "COUNT" => rule.count = strict_int(text.unwrap_or("undefined"))?,
                "INTERVAL" => rule.interval = strict_int(text.unwrap_or("undefined"))?.max(1),
                "UNTIL" => {
                    let text =
                        text.ok_or("Cannot read properties of undefined (reading 'length')")?;
                    rule.until = Some(if text.encode_utf16().count() > 10 {
                        date_time_text(text)
                    } else {
                        date_text(text)
                    });
                }
                "WKST" => {
                    let day = WEEKDAYS
                        .iter()
                        .position(|day| Some(*day) == text)
                        .ok_or_else(|| {
                            format!("invalid WKST value \"{}\"", text.unwrap_or("undefined"))
                        })?;
                    rule.wkst = day as i64 + 1;
                }
                _ => match name.to_lowercase().as_str() {
                    "iterator" => {
                        rule.iterator_error = Some("h.iterator is not a function".into());
                    }
                    "parts" => {
                        let parts = text.unwrap_or("undefined");
                        if rule.iterator_error.is_none() {
                            rule.iterator_error = Some(format!(
                                "Cannot use 'in' operator to search for 'BYDAY' in {parts}"
                            ));
                        }
                        replaced.get_or_insert_with(|| parts.to_string());
                    }
                    _ => {}
                },
            }
        }
        Ok(rule)
    }

    /// `fromData` when the zone reads its RRULE: the parts set on the `ICAL.Recur`, UNTIL read as a
    /// time.
    pub fn until(&self) -> Result<Option<Time>, String> {
        if let Some(error) = &self.decorate_error {
            return Err(error.clone());
        }
        self.until.as_deref().map(from_string).transpose()
    }
}

/// `ruleDayOfWeek(day, start)`: a BYDAY value's position (0 for every) and its weekday, 1 for the
/// week's first day `start`.
///
/// The value is searched as ICAL's `/([+-]?[0-9])?(MO|TU|WE|TH|FR|SA|SU)/` searches it: the
/// leftmost weekday, with the signed digit or the digit right before it.
pub fn rule_day(day: &str, start: i64) -> (i64, i64) {
    let bytes = day.as_bytes();
    let found = (0..bytes.len()).find_map(|at| {
        let signed =
            matches!(bytes[at], b'+' | b'-') && bytes.get(at + 1).is_some_and(u8::is_ascii_digit);
        let digits = if signed {
            2
        } else {
            usize::from(bytes[at].is_ascii_digit())
        };
        let with_position = (digits > 0)
            .then(|| weekday_at(&bytes[at + digits..]))
            .flatten()
            .map(|weekday| (&day[at..at + digits], weekday));
        with_position.or_else(|| weekday_at(&bytes[at..]).map(|weekday| ("", weekday)))
    });
    let Some((position, weekday)) = found else {
        return (0, 0);
    };
    let position = position.parse().unwrap_or(0);
    let weekday = weekday as i64 + 1;
    (position, (weekday - start + 7) % 7 + 1)
}
