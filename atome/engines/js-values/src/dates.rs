// The one owner of the clock and of the date texts the Rust side writes and reads: the instants
// stored in SQLite (events, particles, sync_queue, the money tables, the vault files), sent over
// /ws/api and /ws/sync, and the dates the ports from JavaScript read. Their texts are the ones
// chrono 0.4 wrote before jiff replaced it (18 Nov. 2026), byte for byte, and every text chrono
// read reads the same way (tests/atome_js_values/date_formats.rs holds chrono's own outputs).
// jiff gives the clock and the host's time zone; the calendar arithmetic is exact integer
// arithmetic over chrono's whole range (years -262143 to 262142), wider than jiff's.
#[cfg(not(target_arch = "wasm32"))]
mod local;
mod parse;

#[cfg(not(target_arch = "wasm32"))]
pub use local::{Local, local, local_offset, local_wall};
pub use parse::{Zoned, date, naive, rfc3339, zoned};

/// chrono's range, which every text written before was read and written within.
pub const MIN_YEAR: i64 = -262_143;
pub const MAX_YEAR: i64 = 262_142;
const DAY_SECONDS: i64 = 86_400;
const NANOS: u32 = 1_000_000_000;
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS: [&str; 7] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/// Days since 1970-01-01 of a proleptic Gregorian date (H. Hinnant's `days_from_civil`).
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let yoe = year - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The date of a day since 1970-01-01: (year, month from 1, day).
pub fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let doe = shifted - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(month <= 2), month, day)
}

pub fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        2 if year.rem_euclid(4) == 0
            && (year.rem_euclid(100) != 0 || year.rem_euclid(400) == 0) =>
        {
            29
        }
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// The days of a valid date of chrono's range.
pub fn date_days(year: i64, month: i64, day: i64) -> Option<i64> {
    ((MIN_YEAR..=MAX_YEAR).contains(&year)
        && (1..=12).contains(&month)
        && (1..=days_in_month(year, month)).contains(&day))
    .then(|| days_from_civil(year, month, day))
}

/// An instant as chrono's `DateTime<Utc>` held it, or a wall time read as UTC (`and_utc`):
/// whole seconds since the epoch and their nanoseconds, from 1e9 within a leap second.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Instant {
    pub seconds: i64,
    pub nanos: u32,
}

/// The fields of an instant in UTC (a leap second's `second` is 60).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fields {
    pub year: i64,
    pub month: i64,
    pub day: i64,
    pub hour: i64,
    pub minute: i64,
    pub second: i64,
    pub nanos: u32,
    /// 0 for Sunday.
    pub weekday: usize,
}

impl Instant {
    /// The system clock.
    pub fn now() -> Instant {
        let now = jiff::Timestamp::now();
        let nanos = now.as_nanosecond();
        Instant {
            seconds: nanos.div_euclid(1_000_000_000) as i64,
            nanos: nanos.rem_euclid(1_000_000_000) as u32,
        }
    }

    /// An instant of chrono's range from whole seconds and nanoseconds (a leap second only on a
    /// minute's 59th second).
    pub fn new(seconds: i64, nanos: u32) -> Option<Instant> {
        let instant = Instant { seconds, nanos };
        let in_range = (date_days(MIN_YEAR, 1, 1)? * DAY_SECONDS
            ..=date_days(MAX_YEAR, 12, 31)? * DAY_SECONDS + DAY_SECONDS - 1)
            .contains(&seconds);
        let leap_ok = nanos < NANOS || (nanos < 2 * NANOS && seconds.rem_euclid(60) == 59);
        (in_range && leap_ok).then_some(instant)
    }

    /// `DateTime::from_timestamp_millis`.
    pub fn from_millis(ms: i64) -> Option<Instant> {
        Instant::new(
            ms.div_euclid(1000),
            (ms.rem_euclid(1000) as u32) * 1_000_000,
        )
    }

    /// `timestamp_millis()`: a leap second's milliseconds run past 999.
    pub fn millis(self) -> i64 {
        self.seconds * 1000 + i64::from(self.nanos / 1_000_000)
    }

    /// `checked_add_signed(Duration::milliseconds(ms))` of an instant outside a leap second.
    pub fn plus_millis(self, ms: i64) -> Option<Instant> {
        let total = i128::from(self.seconds) * 1_000_000_000
            + i128::from(self.nanos)
            + i128::from(ms) * 1_000_000;
        Instant::new(
            i64::try_from(total.div_euclid(1_000_000_000)).ok()?,
            total.rem_euclid(1_000_000_000) as u32,
        )
    }

    pub fn fields(self) -> Fields {
        let days = self.seconds.div_euclid(DAY_SECONDS);
        let rest = self.seconds.rem_euclid(DAY_SECONDS);
        let (year, month, day) = civil_from_days(days);
        Fields {
            year,
            month,
            day,
            hour: rest / 3600,
            minute: rest / 60 % 60,
            second: rest % 60 + i64::from(self.nanos >= NANOS),
            nanos: self.nanos % NANOS,
            weekday: (days + 4).rem_euclid(7) as usize,
        }
    }

    /// `to_rfc3339()` of a `DateTime<Utc>`: the fewest of 0, 3, 6 or 9 fraction digits that hold
    /// it exactly, and `+00:00`.
    pub fn rfc3339(self) -> String {
        let f = self.fields();
        let fraction = match f.nanos {
            0 => String::new(),
            n if n % 1_000_000 == 0 => format!(".{:03}", n / 1_000_000),
            n if n % 1000 == 0 => format!(".{:06}", n / 1000),
            n => format!(".{n:09}"),
        };
        format!(
            "{}-{:02}-{:02}T{:02}:{:02}:{:02}{fraction}+00:00",
            chrono_year(f.year),
            f.month,
            f.day,
            f.hour,
            f.minute,
            f.second
        )
    }

    /// `format("%Y-%m-%d %H:%M:%S")`, SQLite's `datetime()` text.
    pub fn sql(self) -> String {
        let f = self.fields();
        format!(
            "{} {:02}:{:02}:{:02}",
            self.date_text(),
            f.hour,
            f.minute,
            f.second
        )
    }

    /// `format("%Y-%m-%d")`.
    pub fn date_text(self) -> String {
        let f = self.fields();
        format!("{}-{:02}-{:02}", chrono_year(f.year), f.month, f.day)
    }
}

/// chrono's `%Y`: four digits from 0 to 9999, else signed.
pub fn chrono_year(year: i64) -> String {
    match year {
        0..=9999 => format!("{year:04}"),
        ..0 => format!("-{:04}", year.unsigned_abs()),
        _ => format!("+{year}"),
    }
}

/// `Date.now()`.
pub fn now_ms() -> i64 {
    Instant::now().millis()
}

/// `Utc::now().to_rfc3339()`.
pub fn now_rfc3339() -> String {
    Instant::now().rfc3339()
}

/// The year of `toUTCString` and `toString`: a sign only before year 0.
pub fn js_year(year: i64) -> String {
    if year < 0 {
        format!("-{:04}", year.unsigned_abs())
    } else {
        format!("{year:04}")
    }
}

/// The year of `toISOString`: four digits from 0 to 9999, else six with their sign.
pub fn js_iso_year(year: i64) -> String {
    if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else {
        let sign = if year < 0 { '-' } else { '+' };
        format!("{sign}{:06}", year.unsigned_abs())
    }
}

pub fn month_name(month: i64) -> &'static str {
    MONTHS[(month - 1) as usize]
}

pub fn weekday_name(weekday: usize) -> &'static str {
    WEEKDAYS[weekday]
}
