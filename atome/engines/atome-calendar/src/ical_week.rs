// The weeks and the days of the year of an `ICAL.Time` (atome/src/assets/vendor/ical/ical.bundle.js)
// a recurrence walks by: `fromDayOfYear`, `weekOneStarts`, `startDoyWeek`, `nthWeekDay`,
// `isNthWeekDay` and `weekNumber`, each read through ICAL's normalizing getters and setters.
use super::ical_time::{Field, PASSED, Time, Tz, Wall, days_in_month, leap};
use super::zones::Zones;
use std::cmp::Ordering;

const THURSDAY: i64 = 5;

impl Time {
    /// `Time.fromDayOfYear(day, year)`: (year, month, day).
    pub fn from_day_of_year(day: i64, year: i64) -> (i64, i64, i64) {
        let (mut day, mut year) = (day, year);
        loop {
            if day < 1 {
                year -= 1;
                day += PASSED[usize::from(leap(year))][12];
            } else if day > PASSED[usize::from(leap(year))][12] {
                day -= PASSED[usize::from(leap(year))][12];
                year += 1;
            } else {
                let table = &PASSED[usize::from(leap(year))];
                let month = (0..12).rev().find(|&month| day > table[month]).unwrap_or(0);
                return (year, month as i64 + 1, day - table[month]);
            }
        }
    }

    /// `Time.weekOneStarts(year, start)`: the date the year's first week starts on.
    pub fn week_one_starts(year: i64, start: i64) -> Time {
        let wall = Wall {
            year,
            month: 1,
            day: 1,
            is_date: true,
            ..Wall::default()
        };
        let mut first = Time::new(wall, Tz::Floating);
        let weekday = first.day_of_week(1);
        if weekday > THURSDAY {
            first.add(Field::Day, 7);
        }
        if start > THURSDAY {
            first.add(Field::Day, -7);
        }
        first.add(Field::Day, -(weekday - start));
        first
    }

    /// `startDoyWeek(start)`: the day of the year the week holding this day starts on.
    pub fn start_doy_week(&mut self, start: i64) -> i64 {
        let mut shift = self.day_of_week(1) - start;
        if shift < 0 {
            shift += 7;
        }
        self.day_of_year() - shift
    }

    /// `nthWeekDay(weekday, position)`: the day of this month that is its `position`-th `weekday`
    /// (counted from its end when negative).
    pub fn nth_week_day(&mut self, weekday: i64, position: i64) -> i64 {
        let length = days_in_month(self.get(Field::Month), self.get(Field::Year));
        let (mut position, mut other) = (position, self.cloned());
        let (start, mut at) = if position >= 0 {
            other.set(Field::Day, 1);
            if position != 0 {
                position -= 1;
            }
            let first = other.get(Field::Day);
            let mut shift = weekday - other.day_of_week(1);
            if shift < 0 {
                shift += 7;
            }
            (first + shift - weekday, weekday)
        } else {
            other.set(Field::Day, length);
            let last = other.day_of_week(1);
            position += 1;
            let mut back = last - weekday;
            if back < 0 {
                back += 7;
            }
            (0, length - back)
        };
        at += position * 7;
        start + at
    }

    /// `isNthWeekDay(weekday, position)`.
    pub fn is_nth_week_day(&mut self, weekday: i64, position: i64) -> bool {
        let day_of_week = self.day_of_week(1);
        (position == 0 && day_of_week == weekday)
            || self.nth_week_day(weekday, position) == self.get(Field::Day)
    }

    /// `weekNumber(start)`: the week of the year (weeks starting on `start`) this day lies in, the
    /// day compared in its own zone with the floating start of a week one (ICAL's memo of the week
    /// numbers, kept for the whole process and keyed by the date alone, is not kept: each is read
    /// afresh, as its first reading of that date in that zone is).
    pub fn week_number(&mut self, start: i64, zones: &Zones) -> i64 {
        let mut day = self.cloned();
        day.set_is_date(true);
        let year = self.get(Field::Year);
        let mut first;
        if day.get(Field::Month) == 12 && day.get(Field::Day) > 25 {
            first = Time::week_one_starts(year + 1, start);
            if day.compare(&mut first, zones) == Ordering::Less {
                first = Time::week_one_starts(year, start);
            }
        } else {
            first = Time::week_one_starts(year, start);
            if day.compare(&mut first, zones) == Ordering::Less {
                first = Time::week_one_starts(year - 1, start);
            }
        }
        let days = (day.unix_ms() - first.unix_ms()) / 86_400_000.0;
        (days / 7.0).trunc() as i64 + 1
    }
}
