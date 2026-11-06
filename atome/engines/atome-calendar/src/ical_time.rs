// The pieces of ICAL.js (atome/src/assets/vendor/ical/ical.bundle.js) the calendar engine relies on,
// with ICAL's own semantics: its calendar arithmetic (`Time.adjust`, Julian leap years up to 1752), its
// lazily normalized `Time` and the zone it is in, `Duration.fromString`, the `parseInt`-based integer
// reading, and JavaScript's `Date.UTC`. A time's instant in its zone is zones.rs.
use std::cmp::Ordering;

/// `Date.UTC(year, month, day, hour, minute, second)` in ms, NaN outside the Date range. A year
/// 0–99 is 1900–1999, as JavaScript reads it.
pub fn date_utc(year: i64, month: i64, day: i64, hour: i64, minute: i64, second: i64) -> f64 {
    let year = if (0..=99).contains(&year) {
        1900 + year
    } else {
        year
    };
    let (year, month) = (
        i128::from(year) + i128::from(month).div_euclid(12),
        i128::from(month).rem_euclid(12) + 1,
    );
    let shifted = if month <= 2 { year - 1 } else { year };
    let era = shifted.div_euclid(400);
    let yoe = shifted - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5;
    let days =
        era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468 + i128::from(day) - 1;
    let ms = days * 86_400_000
        + i128::from(hour) * 3_600_000
        + i128::from(minute) * 60_000
        + i128::from(second) * 1000;
    if ms.abs() > 8_640_000_000_000_000 {
        f64::NAN
    } else {
        ms as f64
    }
}

/// `parseInt(text, 10)`: leading white space, a sign, then decimal digits; NaN without a digit.
pub fn parse_int(text: &str) -> Option<f64> {
    let text =
        text.trim_start_matches(|c: char| (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}');
    let (negative, digits) = match text.as_bytes().first() {
        Some(b'-') => (true, &text[1..]),
        Some(b'+') => (false, &text[1..]),
        _ => (false, text),
    };
    let digits: String = digits.chars().take_while(char::is_ascii_digit).collect();
    let value: f64 = digits.parse().ok()?;
    Some(if negative { -value } else { value })
}

/// ICAL's `strictParseInt`: `parseInt` that throws on NaN.
pub fn strict_int(text: &str) -> Result<i64, String> {
    parse_int(text)
        .map(|value| value as i64)
        .ok_or_else(|| format!("Could not extract integer from \"{text}\""))
}

/// `text.slice(start, end)` in UTF-16 units.
pub fn slice(units: &[u16], start: usize, end: usize) -> String {
    let end = end.min(units.len());
    String::from_utf16_lossy(units.get(start.min(end)..end).unwrap_or_default())
}

/// The `date-time` value's `fromICAL` (strict): `YYYYMMDDTHHMMSS[Z]` → `YYYY-MM-DDTHH:MM:SS[Z]`.
pub fn date_time_text(value: &str) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    let part = |start, end| slice(&units, start, end);
    let zulu = if units.get(15) == Some(&u16::from(b'Z')) {
        "Z"
    } else {
        ""
    };
    format!(
        "{}-{}-{}T{}:{}:{}{zulu}",
        part(0, 4),
        part(4, 6),
        part(6, 8),
        part(9, 11),
        part(11, 13),
        part(13, 15)
    )
}

/// The `date` value's `fromICAL` (strict): `YYYYMMDD` → `YYYY-MM-DD`.
pub fn date_text(value: &str) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    format!(
        "{}-{}-{}",
        slice(&units, 0, 4),
        slice(&units, 4, 6),
        slice(&units, 6, 8)
    )
}

/// `ICAL.Time.fromString(text)` without a property: a date-time past ten characters (UTC with a
/// final `Z`, else floating), else a date.
pub fn from_string(text: &str) -> Result<Time, String> {
    let units: Vec<u16> = text.encode_utf16().collect();
    let field = |start, end| strict_int(&slice(&units, start, end));
    if units.len() > 10 {
        if units.len() < 19 {
            return Err(format!("invalid date-time value: \"{text}\""));
        }
        let wall = Wall {
            year: field(0, 4)?,
            month: field(5, 7)?,
            day: field(8, 10)?,
            hour: field(11, 13)?,
            minute: field(14, 16)?,
            second: field(17, 19)?,
            is_date: false,
        };
        let zone = if text.ends_with('Z') {
            Tz::Utc
        } else {
            Tz::Floating
        };
        return Ok(Time::new(wall, zone));
    }
    let wall = Wall {
        year: field(0, 4)?,
        month: field(5, 7)?,
        day: field(8, 10)?,
        is_date: true,
        ..Wall::default()
    };
    Ok(Time::new(wall, Tz::Floating))
}

/// ICAL's `isLeapYear`: Julian up to 1752.
pub fn leap(year: i64) -> bool {
    if year <= 1752 {
        year % 4 == 0
    } else {
        (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
    }
}

/// ICAL's `daysInMonth`: 30 for a month out of range.
pub fn days_in_month(month: i64, year: i64) -> i64 {
    const DAYS: [i64; 13] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if !(1..=12).contains(&month) {
        return 30;
    }
    DAYS[month as usize] + i64::from(month == 2 && leap(year))
}

/// ICAL's `daysInYearPassedMonth`.
pub const PASSED: [[i64; 13]; 2] = [
    [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365],
    [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366],
];

/// A field of an `ICAL.Time` its getters and setters name.
#[derive(Clone, Copy)]
pub enum Field {
    Year,
    Month,
    Day,
    Hour,
    Minute,
    Second,
}

/// The fields ICAL's `adjust` works on (a `Time`'s `_time`, a time zone change).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Wall {
    pub year: i64,
    pub month: i64,
    pub day: i64,
    pub hour: i64,
    pub minute: i64,
    pub second: i64,
    pub is_date: bool,
}

impl Wall {
    fn field(&mut self, field: Field) -> &mut i64 {
        match field {
            Field::Year => &mut self.year,
            Field::Month => &mut self.month,
            Field::Day => &mut self.day,
            Field::Hour => &mut self.hour,
            Field::Minute => &mut self.minute,
            Field::Second => &mut self.second,
        }
    }

    /// ICAL's `Time.prototype.adjust`.
    pub fn adjust(&mut self, days: i64, hours: i64, minutes: i64, seconds: i64) {
        let mut day_overflow = 0;
        if !self.is_date {
            let second = self.second + seconds;
            self.second = second % 60;
            let mut minute_overflow = second / 60;
            if self.second < 0 {
                self.second += 60;
                minute_overflow -= 1;
            }
            let minute = self.minute + minutes + minute_overflow;
            self.minute = minute % 60;
            let mut hour_overflow = minute / 60;
            if self.minute < 0 {
                self.minute += 60;
                hour_overflow -= 1;
            }
            let hour = self.hour + hours + hour_overflow;
            self.hour = hour % 24;
            day_overflow = hour / 24;
            if self.hour < 0 {
                self.hour += 24;
                day_overflow -= 1;
            }
        }
        let years = if self.month > 12 {
            (self.month - 1) / 12
        } else if self.month < 1 {
            self.month / 12 - 1
        } else {
            0
        };
        self.year += years;
        self.month -= 12 * years;
        let mut day = self.day + days + day_overflow;
        if day > 0 {
            loop {
                let length = days_in_month(self.month, self.year);
                if day <= length {
                    break;
                }
                self.month += 1;
                if self.month > 12 {
                    self.year += 1;
                    self.month = 1;
                }
                day -= length;
            }
        } else {
            while day <= 0 {
                if self.month == 1 {
                    self.year -= 1;
                    self.month = 12;
                } else {
                    self.month -= 1;
                }
                day += days_in_month(self.month, self.year);
            }
        }
        self.day = day;
    }

    /// `Timezone._compare_change_fn`.
    pub fn order(&self, other: &Wall) -> Ordering {
        (
            self.year,
            self.month,
            self.day,
            self.hour,
            self.minute,
            self.second,
        )
            .cmp(&(
                other.year,
                other.month,
                other.day,
                other.hour,
                other.minute,
                other.second,
            ))
    }
}

/// The zone of an `ICAL.Time`: floating (`localTimezone`), UTC, or a zone of the calendar being read
/// (zones.rs, by its index there).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Tz {
    Floating,
    Utc,
    Zone(usize),
}

/// An `ICAL.Time`: its fields are normalized when first read after a write, as ICAL's getters do.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Time {
    raw: Wall,
    pending: bool,
    pub zone: Tz,
}

impl Time {
    /// `new ICAL.Time(data, zone)` (and `clone()`): a date normalizes its fields before it is marked one.
    pub fn new(wall: Wall, zone: Tz) -> Self {
        let mut raw = wall;
        if raw.is_date {
            raw.is_date = false;
            raw.adjust(0, 0, 0, 0);
            raw.is_date = true;
        }
        Self {
            raw,
            pending: true,
            zone,
        }
    }

    /// `new ICAL.Time()`: 0000-01-01T00:00:00, floating, already normal.
    pub fn blank() -> Self {
        Self {
            raw: Wall {
                month: 1,
                day: 1,
                ..Wall::default()
            },
            pending: false,
            zone: Tz::Floating,
        }
    }

    /// `clone()`: a new time from the raw fields.
    pub fn cloned(&self) -> Self {
        Self::new(self.raw, self.zone)
    }

    /// The normalized fields (`_normalize` on a pending write).
    pub fn wall(&mut self) -> Wall {
        if self.pending {
            if self.raw.is_date {
                (self.raw.hour, self.raw.minute, self.raw.second) = (0, 0, 0);
            }
            self.raw.adjust(0, 0, 0, 0);
            self.pending = false;
        }
        self.raw
    }

    /// A field's getter: read once the pending write is normalized.
    pub fn get(&mut self, field: Field) -> i64 {
        let mut wall = self.wall();
        *wall.field(field)
    }

    /// A field's setter: the raw field, normalized when next read.
    pub fn set(&mut self, field: Field, value: i64) {
        self.pending = true;
        *self.raw.field(field) = value;
    }

    /// `time[field] += by`: the getter, then the setter.
    pub fn add(&mut self, field: Field, by: i64) {
        let value = self.get(field);
        self.set(field, value + by);
    }

    /// The `isDate` setter: becoming a date first adjusts the raw fields.
    pub fn set_is_date(&mut self, is_date: bool) {
        if is_date && !self.raw.is_date {
            self.raw.adjust(0, 0, 0, 0);
        }
        self.pending = true;
        self.raw.is_date = is_date;
    }

    /// `adjust(days, hours, minutes, seconds)` on the raw fields.
    pub fn adjust(&mut self, days: i64, hours: i64, minutes: i64, seconds: i64) {
        self.raw.adjust(days, hours, minutes, seconds);
    }

    /// `dayOfWeek(start)`: 1 for the week's first day `start` (1 Sunday … 7 Saturday).
    pub fn day_of_week(&mut self, start: i64) -> i64 {
        let wall = self.wall();
        let (month, year) = if wall.month < 3 {
            (wall.month + 12, wall.year - 1)
        } else {
            (wall.month, wall.year)
        };
        let mut sum = wall.day + year + (month + 1) * 26 / 10 + year / 4;
        sum += (year / 100) * 6 + year / 400;
        (sum + 7 - start) % 7 + 1
    }

    /// `dayOfYear()`.
    pub fn day_of_year(&mut self) -> i64 {
        let wall = self.wall();
        PASSED[usize::from(leap(wall.year))][(wall.month - 1) as usize] + wall.day
    }

    /// `(toUnixTime() + utcOffset()) * 1000`: the wall time read in UTC, which `subtractDate` subtracts.
    pub fn unix_ms(&mut self) -> f64 {
        let wall = self.wall();
        date_utc(
            wall.year,
            wall.month - 1,
            wall.day,
            wall.hour,
            wall.minute,
            wall.second,
        )
    }

    /// `toString()`: the year as it is, the other fields on two digits, `Z` in UTC.
    pub fn text(&mut self) -> String {
        let wall = self.wall();
        let pad = |n: i64| {
            if (0..10).contains(&n) {
                format!("0{n}")
            } else {
                n.to_string()
            }
        };
        let mut text = format!("{}-{}-{}", wall.year, pad(wall.month), pad(wall.day));
        if !wall.is_date {
            text.push_str(&format!(
                "T{}:{}:{}",
                pad(wall.hour),
                pad(wall.minute),
                pad(wall.second)
            ));
            if self.zone == Tz::Utc {
                text.push('Z');
            }
        }
        text
    }
}

/// `ICAL.Duration.fromString(text)`, its fields as `parseInt` reads them.
#[derive(Default)]
pub struct Duration {
    pub weeks: f64,
    pub days: f64,
    pub hours: f64,
    pub minutes: f64,
    pub seconds: f64,
    pub negative: bool,
}

impl Duration {
    pub fn parse(text: &str) -> Result<Self, String> {
        let mut duration = Self::default();
        let (mut rest, mut chunks) = (text, 0);
        while let Some(at) = rest.find(['P', 'D', 'W', 'H', 'M', 'T', 'S']) {
            let (letter, number) = (rest.as_bytes()[at], &rest[..at]);
            rest = &rest[at + 1..];
            let field = match letter {
                b'P' => {
                    duration.negative = number == "-";
                    chunks += 1;
                    continue;
                }
                b'D' => &mut duration.days,
                b'W' => &mut duration.weeks,
                b'H' => &mut duration.hours,
                b'M' => &mut duration.minutes,
                b'S' => &mut duration.seconds,
                _ => continue,
            };
            if number.is_empty() {
                return Err(format!(
                    "invalid duration value: Missing number before \"{}\"",
                    letter as char
                ));
            }
            *field = parse_int(number).ok_or_else(|| {
                format!(
                    "invalid duration value: Invalid number \"{number}\" before \"{}\"",
                    letter as char
                )
            })?;
            chunks += 1;
        }
        if chunks < 2 {
            return Err(format!(
                "invalid duration value: Not enough duration components in \"{rest}\""
            ));
        }
        Ok(duration)
    }

    /// `toSeconds()`.
    pub fn seconds_total(&self) -> f64 {
        let total = self.seconds
            + 60.0 * self.minutes
            + 3600.0 * self.hours
            + 86_400.0 * self.days
            + 604_800.0 * self.weeks;
        if self.negative { -total } else { total }
    }
}
