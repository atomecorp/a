// The host's time zone (`TZ`, else the system's), through jiff, as chrono's `Local` read it: the
// offset at an instant, and the instants of a wall time. chrono kept both ends of each of the
// zone's periods, so a wall time that one offset reaches exactly at its change also holds with
// that offset; in a fold its first instant is the one of the smaller offset. Past jiff's years
// (-9999 to 9999) a date is moved by whole 400-year cycles, over which the calendar and a zone's
// rules repeat (before its first change and after its last a zone keeps one rule).
use super::Instant;
use jiff::tz::{AmbiguousOffset, TimeZone};
use jiff::{SignedDuration, Timestamp};

const CYCLE_SECONDS: i64 = 146_097 * 86_400;

/// The instants of a wall time: chrono's `LocalResult`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Local {
    None,
    Single(Instant),
    /// The instant of the smaller offset first.
    Ambiguous(Instant, Instant),
}

impl Local {
    /// chrono's `earliest()`: the only instant, or the first of a fold.
    pub fn first(self) -> Option<Instant> {
        match self {
            Local::None => None,
            Local::Single(instant) | Local::Ambiguous(instant, _) => Some(instant),
        }
    }

    /// chrono's `single()`.
    pub fn single(self) -> Option<Instant> {
        match self {
            Local::Single(instant) => Some(instant),
            _ => None,
        }
    }
}

// The 400-year cycles that bring an instant of `year` within jiff's years.
fn cycles(year: i64) -> i64 {
    if year > 9000 {
        (year - 9200).div_euclid(400)
    } else if year < -9000 {
        (year + 9599).div_euclid(400)
    } else {
        0
    }
}

/// The host's offset (seconds east of UTC) at `seconds` since the epoch, none past chrono's range.
pub fn local_offset(seconds: i64) -> Option<i32> {
    let instant = Instant::new(seconds, 0)?;
    let shifted = seconds - cycles(instant.fields().year) * CYCLE_SECONDS;
    let at = Timestamp::from_second(shifted).ok()?;
    Some(TimeZone::system().to_offset(at).seconds())
}

/// The host's wall clock at `utc` (read as UTC) and its offset, none past chrono's range.
pub fn local_wall(utc: Instant) -> Option<(Instant, i32)> {
    let offset = local_offset(utc.seconds)?;
    let wall = Instant {
        seconds: utc.seconds + i64::from(offset),
        nanos: utc.nanos,
    };
    Some((wall, offset))
}

/// The instants of `wall` (a wall time read as UTC) in the host's zone.
pub fn local(wall: Instant) -> Local {
    let shift = cycles(wall.fields().year) * CYCLE_SECONDS;
    let seconds = wall.seconds - shift;
    let f = Instant { seconds, nanos: 0 }.fields();
    let Ok(civil) = jiff::civil::DateTime::new(
        f.year as i16,
        f.month as i8,
        f.day as i8,
        f.hour as i8,
        f.minute as i8,
        f.second as i8,
        (wall.nanos % 1_000_000_000) as i32,
    ) else {
        return Local::None;
    };
    let zone = TimeZone::system();
    let mut offsets: Vec<i64> = match zone.to_ambiguous_timestamp(civil).offset() {
        AmbiguousOffset::Unambiguous { offset } => vec![offset.seconds().into()],
        AmbiguousOffset::Gap { .. } => Vec::new(),
        AmbiguousOffset::Fold { before, after } => {
            vec![before.seconds().into(), after.seconds().into()]
        }
    };
    // A change at `t` that the offset before it reaches from this wall time (wall − offset = t).
    if wall.nanos == 0
        && let Ok(from) = Timestamp::from_second(seconds - 27 * 3600)
    {
        for change in zone.following(from) {
            let at = change.timestamp();
            if at.as_second() > seconds + 27 * 3600 {
                break;
            }
            // Changes fall on whole seconds, and jiff reads a zone by the second toward zero.
            let Ok(just_before) = at.checked_sub(SignedDuration::from_secs(1)) else {
                continue;
            };
            let before = i64::from(zone.to_offset(just_before).seconds());
            if seconds - before == at.as_second() {
                offsets.push(before);
            }
        }
    }
    offsets.sort_unstable();
    offsets.dedup();
    let instant = |offset: i64| Instant::new(wall.seconds - offset, wall.nanos);
    match (offsets.first(), offsets.last()) {
        (Some(&only), Some(&last)) if only == last => {
            instant(only).map_or(Local::None, Local::Single)
        }
        (Some(&small), Some(&large)) => match (instant(small), instant(large)) {
            (Some(first), Some(second)) => Local::Ambiguous(first, second),
            _ => Local::None,
        },
        _ => Local::None,
    }
}
