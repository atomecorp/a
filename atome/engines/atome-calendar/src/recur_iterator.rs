// `ICAL.RecurIterator` (vendored in atome/src/assets/vendor/ical), ported step for step: the
// occurrences of a rule from its DTSTART for every frequency and BY part, with ICAL's own walk
// (its `last` time moved through the normalizing getters and setters, its `by_data` working copy
// and `by_indices`, its errors and its stall counters). The expansion of a year and the checks of a
// day are recur_year.rs.
//
// One addition: ICAL's walk never ends on a rule no time satisfies, moving on forever
// (FREQ=DAILY;BYDAY=1MO) or in a circle (FREQ=HOURLY from a DATE, whose hour stays 0). The caller
// reads no occurrence past its last year, so the walk stops once it has left the years where one
// could still be read (`window`), as the caller would on the occurrence found past them; and it
// stops when it comes back to a state it was in, from which ICAL would only circle again.
use super::ical_time::{Field, Time, days_in_month};
use super::recur::{Freq, Part, Parts, Rule, rule_day};
use super::recur_steps::{month_days, weekday_name};
use super::zones::Zones;
use std::cmp::Ordering;

/// `_expandMap`: 1 when a BY part restricts the frequency's occurrences, 2 when it expands them,
/// 3 when it is illegal.
pub const EXPAND_MAP: [[u8; 8]; 7] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [2, 1, 1, 1, 1, 1, 1, 1],
    [2, 2, 1, 1, 1, 1, 1, 1],
    [2, 2, 2, 1, 1, 1, 1, 1],
    [2, 2, 2, 2, 3, 3, 1, 1],
    [2, 2, 2, 2, 2, 3, 3, 1],
    [2, 2, 2, 2, 2, 2, 2, 2],
];
pub const CONTRACT: u8 = 1;
// The most a step of ICAL's walk moves its year back (a week starting the year before, then
// BYWEEKNO=-53 from the first of January).
const YEARS_BACK: i64 = 3;

// What ICAL's walk depends on between two of its steps.
#[derive(Clone, PartialEq)]
struct Walk {
    last: Time,
    by_data: Parts,
    by_indices: [usize; 9],
    days: Vec<i64>,
    days_index: usize,
    stalled: i32,
}

pub struct Recurrence<'a> {
    pub rule: &'a Rule,
    // The zones its times are compared in.
    pub zones: &'a Zones,
    pub freq: Freq,
    pub until: Option<Time>,
    pub dtstart: Time,
    pub last: Time,
    pub by_data: Parts,
    pub by_indices: [usize; 9],
    pub days: Vec<i64>,
    pub days_index: usize,
    occurrence: i64,
    completed: bool,
    window: (i64, i64),
    left_window: bool,
}

impl<'a> Recurrence<'a> {
    /// `rule.iterator(dtstart)` with UNTIL as the caller set it, for a caller that reads no
    /// occurrence past `last_year`: `init()`, a rule without any occurrence completed at once.
    pub fn new(
        rule: &'a Rule,
        until: Option<Time>,
        mut dtstart: Time,
        last_year: i64,
        zones: &'a Zones,
    ) -> Result<Self, String> {
        if let Some(error) = &rule.iterator_error {
            return Err(error.clone());
        }
        let mut by_data = rule.parts.clone();
        if let Some(days) = by_data.days.as_mut() {
            // `sort_byday_rules`.
            for e in 0..days.len() {
                for i in 0..e {
                    if rule_day(&days[i], rule.wkst).1 > rule_day(&days[e], rule.wkst).1 {
                        days.swap(i, e);
                    }
                }
            }
        }
        let has = |part| rule.parts.has(part);
        if has(Part::YearDay) && (has(Part::Month) || has(Part::WeekNo) || has(Part::MonthDay)) {
            return Err("Invalid BYYEARDAY rule".into());
        }
        if has(Part::WeekNo) && has(Part::MonthDay) {
            return Err("BYWEEKNO does not fit to BYMONTHDAY".into());
        }
        if rule.freq == Some(Freq::Monthly) && (has(Part::YearDay) || has(Part::WeekNo)) {
            return Err("For MONTHLY recurrences neither BYYEARDAY nor BYWEEKNO may appear".into());
        }
        if rule.freq == Some(Freq::Weekly) && (has(Part::YearDay) || has(Part::MonthDay)) {
            return Err(
                "For WEEKLY recurrences neither BYMONTHDAY nor BYYEARDAY may appear".into(),
            );
        }
        if rule.freq != Some(Freq::Yearly) && has(Part::YearDay) {
            return Err("BYYEARDAY may only appear in YEARLY rules".into());
        }
        let Some(freq) = rule.freq else {
            return Err("Cannot read properties of undefined (reading '0')".into());
        };
        let first_year = dtstart.get(Field::Year);
        let mut iterator = Self {
            rule,
            zones,
            freq,
            until,
            last: dtstart.cloned(),
            dtstart,
            by_data,
            by_indices: [0; 9],
            days: Vec::new(),
            days_index: 0,
            occurrence: 0,
            completed: false,
            window: (first_year - YEARS_BACK, last_year + YEARS_BACK),
            left_window: false,
        };
        iterator.completed = !iterator.init()?;
        Ok(iterator)
    }

    // `setup_defaults(part, freq, value)`.
    fn setup_defaults(&mut self, part: Part, freq: Freq, value: i64) -> i64 {
        if EXPAND_MAP[self.freq as usize][part as usize] != CONTRACT {
            if !self.by_data.has(part) {
                self.by_data.put(part, vec![value]);
            }
            if self.freq != freq {
                return self.by_data.list(part)[0];
            }
        }
        value
    }

    // The rest of `init()`: false where ICAL throws its "no valid occurrences" error.
    fn init(&mut self) -> Result<bool, String> {
        let defaults = [
            (Part::Second, Freq::Secondly, Field::Second),
            (Part::Minute, Freq::Minutely, Field::Minute),
            (Part::Hour, Freq::Hourly, Field::Hour),
            (Part::MonthDay, Freq::Daily, Field::Day),
            (Part::Month, Freq::Monthly, Field::Month),
        ];
        for (part, freq, field) in defaults {
            let start = self.dtstart.get(field);
            let value = self.setup_defaults(part, freq, start);
            self.last.set(field, value);
        }
        let wkst = self.rule.wkst;
        if self.freq == Freq::Weekly {
            if let Some(first) = self.by_data.days.as_ref().map(|days| days[0].clone()) {
                let (_, weekday) = rule_day(&first, wkst);
                let shift = weekday - self.last.day_of_week(wkst);
                if self.last.day_of_week(wkst) < weekday || shift < 0 {
                    self.last.add(Field::Day, shift);
                }
            } else {
                let weekday = self.dtstart.day_of_week(1);
                self.by_data.days = Some(vec![weekday_name(weekday).to_string()]);
            }
        }
        if self.freq == Freq::Yearly {
            let limit = self
                .until
                .as_mut()
                .map_or(20_000, |until| until.get(Field::Year));
            while self.last.get(Field::Year) <= limit {
                let year = self.last.get(Field::Year);
                self.expand_year_days(year);
                if !self.days.is_empty() {
                    break;
                }
                self.increment_year(self.rule.interval);
            }
            if self.days.is_empty() {
                return Ok(false);
            }
            if !self.next_by_year_day()
                && !self.next_year()
                && !self.next_year()
                && !self.next_year()
            {
                return Ok(false);
            }
        }
        if self.freq == Freq::Monthly {
            if self.rule.parts.has(Part::Day) {
                let (mut best, mut start): (Option<Time>, Time) = (None, self.last.cloned());
                let mut length =
                    days_in_month(self.last.get(Field::Month), self.last.get(Field::Year));
                for rule in self.by_data.days.clone().unwrap_or_default() {
                    self.last = start.cloned();
                    let (position, weekday) = rule_day(&rule, 1);
                    let mut at = self.last.nth_week_day(weekday, position);
                    if !(-6 < position && position < 6) {
                        return Err("Malformed values in BYDAY part".into());
                    }
                    if at > length || at <= 0 {
                        if let Some(best) = best.as_mut()
                            && best.get(Field::Month) == start.get(Field::Month)
                        {
                            continue;
                        }
                        while at > length || at <= 0 {
                            self.increment_month();
                            length = days_in_month(
                                self.last.get(Field::Month),
                                self.last.get(Field::Year),
                            );
                            at = self.last.nth_week_day(weekday, position);
                        }
                    }
                    self.last.set(Field::Day, at);
                    let earlier = match best.as_mut() {
                        Some(best) => self.last.compare(best, self.zones) == Ordering::Less,
                        None => true,
                    };
                    if earlier {
                        best = Some(self.last.cloned());
                    }
                }
                if let Some(best) = best {
                    self.last = best.cloned();
                }
                if self.rule.parts.has(Part::MonthDay) {
                    self.by_day_and_month_day(true)?;
                }
                let day = self.last.get(Field::Day);
                if day > length || day == 0 {
                    return Err("Malformed values in BYDAY part".into());
                }
            } else if self.rule.parts.has(Part::MonthDay) {
                self.last.set(Field::Day, 1);
                let (year, month) = (self.last.get(Field::Year), self.last.get(Field::Month));
                let first = self.last.get(Field::Day);
                let days: Vec<i64> = month_days(year, month, self.rule.parts.list(Part::MonthDay))
                    .into_iter()
                    .filter(|day| *day >= first)
                    .collect();
                if let Some(&day) = days.first() {
                    self.last.set(Field::Day, day);
                    self.by_data.put(Part::MonthDay, days);
                } else if !self.next_month()? && !self.next_month()? && !self.next_month()? {
                    return Ok(false);
                }
            }
        }
        Ok(true)
    }

    /// `next()`: the next occurrence, none once completed.
    pub fn next(&mut self, again: bool) -> Result<Option<Time>, String> {
        let mut before = self.last.cloned();
        let past_until = match self.until.as_mut() {
            Some(until) => self.last.compare(until, self.zones) == Ordering::Greater,
            None => false,
        };
        if (self.rule.count != 0 && self.occurrence >= self.rule.count) || past_until {
            self.completed = true;
        }
        if self.completed || self.left_window {
            return Ok(None);
        }
        if self.occurrence == 0
            && self.last.compare(&mut self.dtstart, self.zones) != Ordering::Less
        {
            self.occurrence += 1;
            return Ok(Some(self.read()));
        }
        let mut stalled = 0;
        // Brent's cycle detection: a state kept, compared with each next one, renewed every power
        // of two steps.
        let (mut kept, mut steps, mut power) = (self.walk(0), 0, 1);
        loop {
            let mut valid = true;
            match self.freq {
                Freq::Secondly => _ = self.next_second(),
                Freq::Minutely => _ = self.next_minute(),
                Freq::Hourly => _ = self.next_hour(),
                Freq::Daily => self.next_day(),
                Freq::Weekly => self.next_week(),
                Freq::Monthly | Freq::Yearly => {
                    let (found, most) = if self.freq == Freq::Monthly {
                        (self.next_month()?, 336)
                    } else {
                        (self.next_year(), 28)
                    };
                    valid = found;
                    stalled = if found { 0 } else { stalled + 1 };
                    if stalled == most {
                        self.completed = true;
                        return Ok(None);
                    }
                }
            }
            let year = self.last.get(Field::Year);
            if year < self.window.0 || year > self.window.1 {
                self.left_window = true;
                return Ok(None);
            }
            if self.check_contracting_rules()
                && self.last.compare(&mut self.dtstart, self.zones) != Ordering::Less
                && valid
            {
                break;
            }
            if self.same_walk(&kept, stalled) {
                self.left_window = true;
                return Ok(None);
            }
            steps += 1;
            if steps == power {
                (kept, steps, power) = (self.walk(stalled), 0, power * 2);
            }
        }
        if self.last.compare(&mut before, self.zones) == Ordering::Equal {
            if again {
                return Err(
                    "Same occurrence found twice, protecting you from death by recursion".into(),
                );
            }
            self.next(true)?;
            if self.left_window {
                return Ok(None);
            }
        }
        if let Some(until) = self.until.as_mut()
            && self.last.compare(until, self.zones) == Ordering::Greater
        {
            self.completed = true;
            return Ok(None);
        }
        self.occurrence += 1;
        Ok(Some(self.read()))
    }

    fn walk(&self, stalled: i32) -> Walk {
        Walk {
            last: self.last,
            by_data: self.by_data.clone(),
            by_indices: self.by_indices,
            days: self.days.clone(),
            days_index: self.days_index,
            stalled,
        }
    }

    fn same_walk(&self, walk: &Walk, stalled: i32) -> bool {
        walk.last == self.last
            && walk.stalled == stalled
            && walk.by_indices == self.by_indices
            && walk.days_index == self.days_index
            && walk.days == self.days
            && walk.by_data == self.by_data
    }

    // The occurrence handed out: ICAL hands out `last` itself, which its caller reads (normalizes)
    // at once.
    fn read(&mut self) -> Time {
        self.last.wall();
        self.last
    }
}
