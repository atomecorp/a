// The date texts read as chrono 0.4 read them: `DateTime::parse_from_rfc3339` and the
// `parse_from_str` of the few formats the ports name (%Y %m %d %H %M %S %.f %z, a space matching
// any run of whitespace, other characters themselves), with chrono's own leniency: a number takes
// one digit or more and leading whitespace, a year a sign, a fraction any number of digits (the
// first nine counted), a leap second on second 60.
use super::{Instant, date_days};

const DAY_SECONDS: i64 = 86_400;

/// An instant and the offset (seconds east of UTC) its text carried.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Zoned {
    pub utc: Instant,
    pub offset: i32,
}

/// `DateTime::parse_from_rfc3339`.
pub fn rfc3339(text: &str) -> Option<Zoned> {
    let bytes = text.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let digit = |at: usize| {
        bytes[at]
            .is_ascii_digit()
            .then(|| i64::from(bytes[at] - b'0'))
    };
    let pair = |at: usize| Some(digit(at)? * 10 + digit(at + 1)?);
    let year = pair(0)? * 100 + pair(2)?;
    let separated = bytes[4] == b'-'
        && bytes[7] == b'-'
        && matches!(bytes[10], b't' | b'T' | b' ')
        && bytes[13] == b':'
        && bytes[16] == b':';
    if !separated {
        return None;
    }
    let days = date_days(year, pair(5)?, pair(8)?)?;
    let (hour, minute, second) = (pair(11)?, pair(14)?, pair(17)?);
    let leap = second == 60;
    let mut rest = &text[19..];
    let mut nanos = 0;
    if let Some(after) = rest.strip_prefix('.') {
        (rest, nanos) = fraction(after)?;
    }
    if hour > 23 || minute > 59 || (second > 59 && !leap) {
        return None;
    }
    let (rest, offset) = offset(rest, true, |s| s.strip_prefix(':'))?;
    if !rest.is_empty() || offset.abs() >= DAY_SECONDS {
        return None;
    }
    let wall = days * DAY_SECONDS + hour * 3600 + minute * 60 + second - i64::from(leap);
    Some(Zoned {
        utc: Instant {
            seconds: wall - offset,
            nanos: nanos + if leap { 1_000_000_000 } else { 0 },
        },
        offset: offset as i32,
    })
}

/// `NaiveDateTime::parse_from_str(text, format).and_utc()`.
pub fn naive(text: &str, format: &str) -> Option<Instant> {
    items(text, format)?.wall(true)
}

/// `NaiveDate::parse_from_str(text, format)` at midnight, read as UTC.
pub fn date(text: &str, format: &str) -> Option<Instant> {
    items(text, format)?.wall(false)
}

/// `DateTime::parse_from_str(text, format)`: a wall time and its `%z` offset.
pub fn zoned(text: &str, format: &str) -> Option<Zoned> {
    let parsed = items(text, format)?;
    let offset = parsed.offset?;
    let wall = parsed.wall(true)?;
    let utc = Instant::new(wall.seconds - offset, wall.nanos)?;
    Some(Zoned {
        utc,
        offset: offset as i32,
    })
}

#[derive(Default)]
struct Parsed {
    year: Option<i64>,
    month: Option<i64>,
    day: Option<i64>,
    hour: Option<i64>,
    minute: Option<i64>,
    second: Option<i64>,
    nanos: Option<u32>,
    offset: Option<i64>,
}

impl Parsed {
    // chrono's `to_naive_date` and `to_naive_time`; `time` asks for the hour and the minute.
    fn wall(&self, time: bool) -> Option<Instant> {
        let days = date_days(self.year?, self.month?, self.day?)?;
        let (hour, minute) = if time {
            (self.hour?, self.minute?)
        } else {
            (0, 0)
        };
        let second = if time { self.second.unwrap_or(0) } else { 0 };
        let leap = second == 60;
        let nanos = if time { self.nanos.unwrap_or(0) } else { 0 };
        Instant::new(
            days * DAY_SECONDS + hour * 3600 + minute * 60 + second - i64::from(leap),
            nanos + if leap { 1_000_000_000 } else { 0 },
        )
    }
}

// chrono's `parse_internal` over the items of `format`, every field checked as its setter does.
fn items(text: &str, format: &str) -> Option<Parsed> {
    let mut parsed = Parsed::default();
    let mut s = text;
    let mut spec = format;
    while let Some(c) = spec.chars().next() {
        if c.is_whitespace() {
            spec = spec.trim_start();
            s = s.trim_start();
            continue;
        }
        if let Some(after) = spec.strip_prefix("%.f") {
            spec = after;
            if let Some(digits) = s.strip_prefix('.') {
                let nanos;
                (s, nanos) = fraction(digits)?;
                parsed.nanos = Some(nanos);
            }
            continue;
        }
        if let Some(after) = spec.strip_prefix('%') {
            let mut letters = after.chars();
            let letter = letters.next()?;
            spec = letters.as_str();
            if letter == 'z' {
                let offset;
                (s, offset) = self::offset(s.trim_start(), false, |s| {
                    Some(s.trim_start_matches(|c: char| c == ':' || c.is_whitespace()))
                })?;
                (offset.abs() < DAY_SECONDS).then_some(())?;
                parsed.offset = Some(offset);
                continue;
            }
            s = s.trim_start();
            let (field, max, low, high) = match letter {
                'Y' => (
                    &mut parsed.year,
                    4,
                    i64::from(i32::MIN),
                    i64::from(i32::MAX),
                ),
                'm' => (&mut parsed.month, 2, 1, 12),
                'd' => (&mut parsed.day, 2, 1, 31),
                'H' => (&mut parsed.hour, 2, 0, 23),
                'M' => (&mut parsed.minute, 2, 0, 59),
                'S' => (&mut parsed.second, 2, 0, 60),
                _ => return None,
            };
            let value;
            if letter == 'Y' && (s.starts_with('-') || s.starts_with('+')) {
                let negative = s.starts_with('-');
                (s, value) = number(&s[1..], usize::MAX)?;
                *field = Some(if negative { -value } else { value });
            } else {
                (s, value) = number(s, max)?;
                *field = Some(value);
            }
            (low..=high)
                .contains(&field.unwrap_or_default())
                .then_some(())?;
            continue;
        }
        let length = c.len_utf8();
        s = s.strip_prefix(&spec[..length])?;
        spec = &spec[length..];
    }
    s.is_empty().then_some(parsed)
}

// `scan::number(s, 1, max)`.
fn number(s: &str, max: usize) -> Option<(&str, i64)> {
    let count = s.bytes().take(max).take_while(u8::is_ascii_digit).count();
    if count == 0 {
        return None;
    }
    let mut value = 0_i64;
    for b in s[..count].bytes() {
        value = value.checked_mul(10)?.checked_add(i64::from(b - b'0'))?;
    }
    Some((&s[count..], value))
}

// `scan::nanosecond`: one digit or more, the first nine counted, the others skipped.
fn fraction(s: &str) -> Option<(&str, u32)> {
    let (rest, value) = number(s, 9)?;
    let consumed = s.len() - rest.len();
    let nanos = value as u32 * 10_u32.pow(9 - consumed as u32);
    Some((rest.trim_start_matches(|c: char| c.is_ascii_digit()), nanos))
}

// `scan::timezone_offset` with the minus sign U+2212 allowed and the minutes required.
fn offset(mut s: &str, zulu: bool, colon: impl Fn(&str) -> Option<&str>) -> Option<(&str, i64)> {
    if zulu && let Some(rest) = s.strip_prefix(['Z', 'z']) {
        return Some((rest, 0));
    }
    let negative = if let Some(rest) = s.strip_prefix('+') {
        s = rest;
        false
    } else if let Some(rest) = s.strip_prefix(['-', '\u{2212}']) {
        s = rest;
        true
    } else {
        return None;
    };
    let two = |s: &str| {
        let b = s.as_bytes();
        (b.len() >= 2 && b[0].is_ascii_digit() && b[1].is_ascii_digit())
            .then(|| i64::from((b[0] - b'0') * 10 + (b[1] - b'0')))
    };
    let hours = two(s)?;
    s = colon(&s[2..])?;
    let minutes = two(s).filter(|m| *m < 60)?;
    let seconds = hours * 3600 + minutes * 60;
    Some((&s[2..], if negative { -seconds } else { seconds }))
}
