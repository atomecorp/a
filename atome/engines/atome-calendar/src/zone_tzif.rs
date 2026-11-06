// The zones of a native host (zone.rs): an IANA zone read from the system's TZif files (v2+ 64-bit
// data, the POSIX TZ footer past the table), as `Intl.DateTimeFormat({ timeZone })` reads it in
// Node, and the local zone (`TZ`) through chrono.
use crate::ical_time::date_utc;
use std::path::{Path, PathBuf};

const ZONEINFO: &str = "/usr/share/zoneinfo";

// A day of the year in a POSIX rule.
#[derive(Clone, Copy)]
enum RuleDay {
    // `Jn`: 1–365, February 29 never counted.
    Julian(i64),
    // `n`: 0–365.
    Zero(i64),
    // `Mm.w.d`: the w-th (5 = last) weekday d (0 = Sunday) of month m.
    Month(i64, i64, i64),
}

#[derive(Clone, Copy)]
struct Daylight {
    offset: i64,
    start: (RuleDay, i64),
    end: (RuleDay, i64),
}

// A POSIX TZ rule: the standard offset (seconds east of UTC) and its daylight time.
#[derive(Clone, Copy)]
struct Posix {
    standard: i64,
    daylight: Option<Daylight>,
}

/// A zone's table: its transitions, the offset after each, the offset before the first, and the
/// rule past the last.
pub struct NamedZone {
    times: Vec<i64>,
    offsets: Vec<i64>,
    first: i64,
    footer: Option<Posix>,
}

fn days(year: i64, month: i64, day: i64) -> i64 {
    (date_utc(year, month - 1, day, 0, 0, 0) / 86_400_000.0) as i64
}

impl RuleDay {
    // Days since the epoch of this day in `year` (proleptic Gregorian).
    fn day(self, year: i64) -> i64 {
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        match self {
            RuleDay::Julian(n) => days(year, 1, 1) + n - 1 + i64::from(leap && n >= 60),
            RuleDay::Zero(n) => days(year, 1, 1) + n,
            RuleDay::Month(month, week, weekday) => {
                let first = days(year, month, 1);
                let length = days(year + month / 12, month % 12 + 1, 1) - first;
                let mut day = (weekday - (first + 4).rem_euclid(7)).rem_euclid(7) + (week - 1) * 7;
                while day >= length {
                    day -= 7;
                }
                first + day
            }
        }
    }
}

impl Posix {
    fn offset(&self, seconds: i64) -> i64 {
        let Some(daylight) = self.daylight else {
            return self.standard;
        };
        // The year of the standard wall clock.
        let day = (seconds + self.standard).div_euclid(86_400);
        let mut year = 1970 + day.div_euclid(365);
        while days(year, 1, 1) > day {
            year -= 1;
        }
        while days(year + 1, 1, 1) <= day {
            year += 1;
        }
        let start = daylight.start.0.day(year) * 86_400 + daylight.start.1 - self.standard;
        let end = daylight.end.0.day(year) * 86_400 + daylight.end.1 - daylight.offset;
        let inside = if start < end {
            start <= seconds && seconds < end
        } else {
            !(end <= seconds && seconds < start)
        };
        if inside {
            daylight.offset
        } else {
            self.standard
        }
    }

    // `std offset [dst [offset] [,start[/time],end[/time]]]`.
    fn parse(text: &str) -> Option<Posix> {
        let mut rest = text;
        let name = |rest: &mut &str| -> Option<()> {
            if let Some(after) = rest.strip_prefix('<') {
                let close = after.find('>')?;
                *rest = &after[close + 1..];
            } else {
                let count = rest.bytes().take_while(u8::is_ascii_alphabetic).count();
                if count < 3 {
                    return None;
                }
                *rest = &rest[count..];
            }
            Some(())
        };
        let clock = |rest: &mut &str| -> Option<i64> {
            let (sign, body) = match rest.as_bytes().first() {
                Some(b'-') => (-1, &rest[1..]),
                Some(b'+') => (1, &rest[1..]),
                _ => (1, *rest),
            };
            let length = body
                .bytes()
                .take_while(|b| b.is_ascii_digit() || *b == b':')
                .count();
            if length == 0 {
                return None;
            }
            let mut total = 0;
            for (index, part) in body[..length].split(':').enumerate() {
                let unit = [3600, 60, 1].get(index)?;
                total += part.parse::<i64>().ok()? * unit;
            }
            *rest = &body[length..];
            Some(sign * total)
        };
        name(&mut rest)?;
        let standard = -clock(&mut rest)?;
        if rest.is_empty() {
            return Some(Posix {
                standard,
                daylight: None,
            });
        }
        name(&mut rest)?;
        let offset = if rest.is_empty() || rest.starts_with(',') {
            standard + 3600
        } else {
            -clock(&mut rest)?
        };
        let rule = |rest: &mut &str| -> Option<(RuleDay, i64)> {
            *rest = rest.strip_prefix(',')?;
            let day = if let Some(after) = rest.strip_prefix('M') {
                let length = after
                    .bytes()
                    .take_while(|b| b.is_ascii_digit() || *b == b'.')
                    .count();
                let fields: Vec<i64> = after[..length]
                    .split('.')
                    .map(|part| part.parse().ok())
                    .collect::<Option<_>>()?;
                *rest = &after[length..];
                match fields[..] {
                    [month, week, weekday] => RuleDay::Month(month, week, weekday),
                    _ => return None,
                }
            } else {
                let julian = rest.starts_with('J');
                let after: &str = if julian { &rest[1..] } else { rest };
                let length = after.bytes().take_while(u8::is_ascii_digit).count();
                let n = after[..length].parse().ok()?;
                *rest = &after[length..];
                if julian {
                    RuleDay::Julian(n)
                } else {
                    RuleDay::Zero(n)
                }
            };
            let time = match rest.strip_prefix('/') {
                Some(after) => {
                    *rest = after;
                    clock(rest)?
                }
                None => 7200,
            };
            Some((day, time))
        };
        let (start, end) = if rest.is_empty() {
            (
                (RuleDay::Month(3, 2, 0), 7200),
                (RuleDay::Month(11, 1, 0), 7200),
            )
        } else {
            (rule(&mut rest)?, rule(&mut rest)?)
        };
        rest.is_empty().then_some(Posix {
            standard,
            daylight: Some(Daylight { offset, start, end }),
        })
    }
}

// RFC 8536: the version 2+ block when there is one, else the version 1 block.
fn tzif(bytes: &[u8]) -> Option<NamedZone> {
    let count = |at: usize| -> Option<usize> {
        Some(u32::from_be_bytes(bytes.get(at..at + 4)?.try_into().ok()?) as usize)
    };
    if bytes.get(..4)? != b"TZif" {
        return None;
    }
    let header = |at: usize| -> Option<[usize; 6]> {
        Some([
            count(at + 20)?,
            count(at + 24)?,
            count(at + 28)?,
            count(at + 32)?,
            count(at + 36)?,
            count(at + 40)?,
        ])
    };
    let [isut, isstd, leap, time, kind, chars] = header(0)?;
    let (start, wide) = if *bytes.get(4)? >= b'2' {
        (
            44 + time * 5 + kind * 6 + chars + leap * 8 + isstd + isut,
            true,
        )
    } else {
        (0, false)
    };
    let [isut, isstd, leap, time, kind, chars] = header(start)?;
    let size = if wide { 8 } else { 4 };
    let mut at = start + 44;
    let mut times = Vec::with_capacity(time);
    for index in 0..time {
        let raw = bytes.get(at + index * size..at + (index + 1) * size)?;
        times.push(if wide {
            i64::from_be_bytes(raw.try_into().ok()?)
        } else {
            i64::from(i32::from_be_bytes(raw.try_into().ok()?))
        });
    }
    at += time * size;
    let indices = bytes.get(at..at + time)?.to_vec();
    at += time;
    let mut types = Vec::with_capacity(kind);
    for index in 0..kind {
        let raw = bytes.get(at + index * 6..at + index * 6 + 4)?;
        types.push(i64::from(i32::from_be_bytes(raw.try_into().ok()?)));
    }
    at += kind * 6 + chars + leap * (size + 4) + isstd + isut;
    let footer = if wide {
        let text = std::str::from_utf8(bytes.get(at..)?).ok()?;
        let text = text.strip_prefix('\n')?.split('\n').next()?;
        if text.is_empty() {
            None
        } else {
            Some(Posix::parse(text)?)
        }
    } else {
        None
    };
    let offsets = indices
        .iter()
        .map(|&index| types.get(usize::from(index)).copied())
        .collect::<Option<Vec<_>>>()?;
    Some(NamedZone {
        times,
        offsets,
        first: *types.first()?,
        footer,
    })
}

// The zone file of `name`, its components matched without regard to case as Intl matches them.
fn zone_file(name: &str) -> Option<PathBuf> {
    let mut path = PathBuf::from(ZONEINFO);
    for component in name.split('/') {
        let exact = path.join(component);
        path = if exact.exists() {
            exact
        } else {
            let entries = std::fs::read_dir(&path).ok()?;
            entries
                .filter_map(Result::ok)
                .find(|entry| {
                    entry
                        .file_name()
                        .to_str()
                        .is_some_and(|found| found.eq_ignore_ascii_case(component))
                })?
                .path()
        };
    }
    path.is_file().then_some(path)
}

impl NamedZone {
    /// The zone file Intl would accept as `tzid` (not an offset), read; none for any other name.
    pub fn read(tzid: &str) -> Option<NamedZone> {
        let component = |part: &str| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_+-".contains(&b))
        };
        let first = tzid.split('/').next().unwrap_or_default();
        let excluded = ["posixrules", "factory", "localtime"]
            .iter()
            .any(|name| tzid.eq_ignore_ascii_case(name))
            || first.eq_ignore_ascii_case("posix")
            || first.eq_ignore_ascii_case("right");
        if excluded || !tzid.split('/').all(component) {
            return None;
        }
        let path = zone_file(tzid)?;
        let bytes = std::fs::read(Path::new(&path)).ok()?;
        tzif(&bytes)
    }

    /// The offset (seconds east of UTC) at `seconds` since the epoch.
    pub fn offset(&self, seconds: i64) -> Result<i64, String> {
        let passed = self.times.partition_point(|&time| time <= seconds);
        Ok(match (passed, &self.footer) {
            (0, Some(rule)) if self.times.is_empty() => rule.offset(seconds),
            (0, _) => self.first,
            (passed, Some(rule)) if passed == self.times.len() => rule.offset(seconds),
            (passed, _) => self.offsets[passed - 1],
        })
    }
}

/// The server's local offset at `seconds` (as `new Date(…)` reads it, through `TZ`).
pub fn local_offset(seconds: i64) -> Result<i64, String> {
    use chrono::{Offset, TimeZone};
    let utc = chrono::DateTime::from_timestamp(seconds, 0).ok_or("instant_out_of_range")?;
    Ok(i64::from(
        chrono::Local
            .offset_from_utc_datetime(&utc.naive_utc())
            .fix()
            .local_minus_utc(),
    ))
}
