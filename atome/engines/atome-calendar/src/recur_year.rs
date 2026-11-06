// The days `ICAL.RecurIterator` (vendored in atome/src/assets/vendor/ical) finds in a month and in
// a year, and the checks it makes of a day: `next_month`, `_byDayAndMonthDay`, `next_year`,
// `_nextByYearDay`, `expand_year_days`, `expand_by_day`, `is_day_in_byday`, `check_set_position`
// and `check_contracting_rules`, ported step for step (the walk itself is recur_iterator.rs).
use super::ical_time::{Field, PASSED, Time, Tz, Wall, days_in_month, leap};
use super::recur::{Part, rule_day};
use super::recur_iterator::{CONTRACT, EXPAND_MAP, Recurrence};
use super::recur_steps::{month_days, weekday_name};
use std::collections::HashSet;

/// `is_day_in_byday(time)`: whether one of the BYDAY values names that day.
fn in_byday(days: Option<&[String]>, time: &mut Time) -> bool {
    for rule in days.unwrap_or_default() {
        let (position, weekday) = rule_day(rule, 1);
        let day_of_week = time.day_of_week(1);
        if (position == 0 && weekday == day_of_week)
            || time.nth_week_day(weekday, position) == time.get(Field::Day)
        {
            return true;
        }
    }
    false
}

impl Recurrence<'_> {
    fn check_set_position(&self, position: i64) -> bool {
        self.rule.parts.has(Part::SetPos) && self.by_data.list(Part::SetPos).contains(&position)
    }

    // `check_contract_restriction(part, value)`.
    fn allows(&self, part: Part, value: i64) -> bool {
        !(self.by_data.has(part) && EXPAND_MAP[self.freq as usize][part as usize] == CONTRACT)
            || self.by_data.list(part).contains(&value)
    }

    /// `check_contracting_rules()`.
    pub fn check_contracting_rules(&mut self) -> bool {
        let day_of_week = self.last.day_of_week(1);
        let week = self.last.week_number(self.rule.wkst, self.zones);
        let day_of_year = self.last.day_of_year();
        let name = weekday_name(day_of_week);
        let restricted_day = self.by_data.has(Part::Day)
            && EXPAND_MAP[self.freq as usize][Part::Day as usize] == CONTRACT;
        let day_allowed = !restricted_day
            || self
                .by_data
                .days
                .iter()
                .flatten()
                .any(|day| day.as_str() == name);
        let wall = self.last.wall();
        self.allows(Part::Second, wall.second)
            && self.allows(Part::Minute, wall.minute)
            && self.allows(Part::Hour, wall.hour)
            && day_allowed
            && self.allows(Part::WeekNo, week)
            && self.allows(Part::MonthDay, wall.day)
            && self.allows(Part::Month, wall.month)
            && self.allows(Part::YearDay, day_of_year)
    }

    /// `next_month()`: false when the month holds no further day.
    pub fn next_month(&mut self) -> Result<bool, String> {
        if self.next_hour() == 0 {
            return Ok(true);
        }
        let rule = self.rule;
        let parts = &rule.parts;
        let mut found = true;
        if parts.has(Part::Day) && parts.has(Part::MonthDay) {
            found = self.by_day_and_month_day(false)?;
        } else if parts.has(Part::Day) {
            let length = days_in_month(self.last.get(Field::Month), self.last.get(Field::Year));
            let (mut before, mut total) = (0, 0);
            let set_pos = parts.has(Part::SetPos);
            if set_pos {
                let at = self.last.get(Field::Day);
                for day in 1..=length {
                    self.last.set(Field::Day, day);
                    if in_byday(self.by_data.days.as_deref(), &mut self.last) {
                        total += 1;
                        if day <= at {
                            before += 1;
                        }
                    }
                }
                self.last.set(Field::Day, at);
            }
            found = false;
            let mut day = self.last.get(Field::Day) + 1;
            while day <= length {
                self.last.set(Field::Day, day);
                if in_byday(self.by_data.days.as_deref(), &mut self.last)
                    && (!set_pos || {
                        before += 1;
                        self.check_set_position(before)
                            || self.check_set_position(before - total - 1)
                    })
                {
                    found = true;
                    break;
                }
                day += 1;
            }
            if day > length {
                self.last.set(Field::Day, 1);
                self.increment_month();
                found = in_byday(self.by_data.days.as_deref(), &mut self.last)
                    && (!set_pos || self.check_set_position(1));
            }
        } else if parts.has(Part::MonthDay) {
            let index = &mut self.by_indices[Part::MonthDay as usize];
            *index += 1;
            if *index >= self.by_data.list(Part::MonthDay).len() {
                *index = 0;
                self.increment_month();
                if self.by_indices[Part::MonthDay as usize]
                    >= self.by_data.list(Part::MonthDay).len()
                {
                    return Ok(false);
                }
            }
            let length = days_in_month(self.last.get(Field::Month), self.last.get(Field::Year));
            let index = self.by_indices[Part::MonthDay as usize];
            let mut day = self.by_data.list(Part::MonthDay)[index];
            if day < 0 {
                day += length + 1;
            }
            if day > length {
                self.last.set(Field::Day, 1);
                found = in_byday(self.by_data.days.as_deref(), &mut self.last);
            } else {
                self.last.set(Field::Day, day);
            }
        } else {
            self.increment_month();
            let length = days_in_month(self.last.get(Field::Month), self.last.get(Field::Year));
            let day = self.by_data.list(Part::MonthDay)[0];
            if day > length {
                found = false;
            } else {
                self.last.set(Field::Day, day);
            }
        }
        Ok(found)
    }

    /// `_byDayAndMonthDay(first)`: the next day of the month both BYDAY and BYMONTHDAY name.
    pub fn by_day_and_month_day(&mut self, first: bool) -> Result<bool, String> {
        let rules = self.by_data.days.clone().unwrap_or_default();
        // `d()`: the month's length and its days, `index` moved past the days already behind.
        let month = |this: &mut Self, day: i64, index: &mut usize| {
            let (year, month) = (this.last.get(Field::Year), this.last.get(Field::Month));
            let days = month_days(year, month, this.by_data.list(Part::MonthDay));
            while days
                .get(*index)
                .is_some_and(|&at| at <= day && !(first && at == day))
                && *index + 1 < days.len()
            {
                *index += 1;
            }
            (days_in_month(month, year), days)
        };
        let (mut day, mut index, mut found) = (self.last.get(Field::Day), 0, false);
        let (mut length, mut days) = month(self, day, &mut index);
        if first {
            day -= 1;
        }
        let mut tries = 48;
        while !found && tries > 0 {
            tries -= 1;
            let next = day + 1;
            let at = if next > length {
                None
            } else {
                index += 1;
                days.get(index - 1).copied().filter(|&at| at >= next)
            };
            if let Some(at) = at {
                day = at;
                for rule in &rules {
                    let (position, weekday) = rule_day(rule, 1);
                    self.last.set(Field::Day, day);
                    if self.last.is_nth_week_day(weekday, position) {
                        found = true;
                        break;
                    }
                }
            }
            if at.is_none() || (!found && index == days.len()) {
                // `y()`: the next month, from its start.
                (day, index) = (0, 0);
                self.increment_month();
                (length, days) = month(self, day, &mut index);
            }
        }
        if tries <= 0 {
            return Err("Malformed values in BYDAY combined with BYMONTHDAY parts".into());
        }
        Ok(found)
    }

    /// `next_year()`: false when that day is not in the year.
    pub fn next_year(&mut self) -> bool {
        if self.next_hour() == 0 {
            return false;
        }
        let rolled = self.days.is_empty() || {
            self.days_index += 1;
            self.days_index == self.days.len()
        };
        if rolled {
            self.days_index = 0;
            self.increment_year(self.rule.interval);
            if self.rule.parts.has(Part::MonthDay) {
                let (year, month) = (self.last.get(Field::Year), self.last.get(Field::Month));
                let days = month_days(year, month, self.rule.parts.list(Part::MonthDay));
                self.by_data.put(Part::MonthDay, days);
            }
            let year = self.last.get(Field::Year);
            self.expand_year_days(year);
            if self.days.is_empty() {
                return false;
            }
        }
        self.next_by_year_day()
    }

    /// `_nextByYearDay()`.
    pub fn next_by_year_day(&mut self) -> bool {
        let mut day = self.days[self.days_index];
        let mut year = self.last.get(Field::Year);
        if day.abs() == 366 && !leap(year) {
            return false;
        }
        if day < 1 {
            day += 1;
            year += 1;
        }
        let (_, month, day) = Time::from_day_of_year(day, year);
        self.last.set(Field::Day, day);
        self.last.set(Field::Month, month);
        true
    }

    // `expand_by_day(year)`: the days of the year each BYDAY value names.
    fn expand_by_day(&mut self, year: i64) -> Vec<i64> {
        let mut day = self.last.cloned();
        day.set(Field::Year, year);
        day.set(Field::Month, 1);
        day.set(Field::Day, 1);
        day.set_is_date(true);
        let first = day.day_of_week(1);
        day.set(Field::Month, 12);
        day.set(Field::Day, 31);
        day.set_is_date(true);
        let (last, length) = (day.day_of_week(1), day.day_of_year());
        let mut days = Vec::new();
        for rule in self.by_data.days.iter().flatten() {
            let (position, weekday) = rule_day(rule, 1);
            if position == 0 {
                let mut at = (weekday + 7 - first) % 7 + 1;
                while at <= length {
                    days.push(at);
                    at += 7;
                }
            } else if position > 0 {
                let at = if weekday >= first {
                    weekday - first + 1
                } else {
                    weekday - first + 8
                };
                days.push(at + (position - 1) * 7);
            } else {
                let at = if weekday <= last {
                    length - last + weekday
                } else {
                    length - last + weekday - 7
                };
                days.push(at - (-position - 1) * 7);
            }
        }
        days
    }

    /// `expand_year_days(year)`: the days of the year the BY parts name.
    pub fn expand_year_days(&mut self, year: i64) {
        let mut time = Time::blank();
        self.days.clear();
        let rule = self.rule;
        let parts = &rule.parts;
        let (by_day, mut by_week, by_month_day) = (
            parts.has(Part::Day),
            parts.has(Part::WeekNo),
            parts.has(Part::MonthDay),
        );
        let (by_month, by_year_day) = (parts.has(Part::Month), parts.has(Part::YearDay));
        // With BYMONTH, ICAL drops BYWEEKNO: its check reads the weeks it marks by the position of
        // each BYWEEKNO value, and no week 0 is ever marked.
        if by_month && by_week {
            by_week = false;
        }
        let keys = [by_day, by_week, by_month_day, by_month, by_year_day];
        let count = keys.iter().filter(|key| **key).count();
        let months = self.by_data.list(Part::Month).to_vec();
        let month_days_listed = self.by_data.list(Part::MonthDay).to_vec();
        match (count, keys) {
            (0, _) => {
                let mut day = self.dtstart.cloned();
                day.set(Field::Year, self.last.get(Field::Year));
                self.days.push(day.day_of_year());
            }
            (1, [_, _, _, true, _]) => {
                for month in months {
                    let mut day = self.dtstart.cloned();
                    day.set(Field::Year, year);
                    day.set(Field::Month, month);
                    day.set_is_date(true);
                    self.days.push(day.day_of_year());
                }
            }
            (1, [_, _, true, _, _]) => {
                for mut at in month_days_listed {
                    let mut day = self.dtstart.cloned();
                    if at < 0 {
                        at += days_in_month(day.get(Field::Month), year) + 1;
                    }
                    day.set(Field::Day, at);
                    day.set(Field::Year, year);
                    day.set_is_date(true);
                    self.days.push(day.day_of_year());
                }
            }
            (2, [_, _, true, true, _]) => {
                for month in months {
                    let length = days_in_month(month, year);
                    for &at in &month_days_listed {
                        time.set(Field::Day, if at < 0 { at + length + 1 } else { at });
                        time.set(Field::Month, month);
                        time.set(Field::Year, year);
                        time.set_is_date(true);
                        self.days.push(time.day_of_year());
                    }
                }
            }
            (1, [_, true, _, _, _])
            | (2, [_, true, true, _, _])
            | (3, [true, true, true, _, _]) => {}
            (1, [true, _, _, _, _]) => {
                let days = self.expand_by_day(year);
                self.days.extend(days);
            }
            (2, [true, _, _, true, _]) => self.expand_by_day_and_month(&mut time, year, &months),
            (2, [true, _, true, _, _]) | (3, [true, _, true, true, _]) => {
                for at in self.expand_by_day(year) {
                    let (_, month, day) = Time::from_day_of_year(at, year);
                    if (count == 2 || months.contains(&month)) && month_days_listed.contains(&day) {
                        self.days.push(at);
                    }
                }
            }
            (2, [true, true, _, _, _]) => {
                let start = self.rule.wkst;
                for at in self.expand_by_day(year) {
                    let (year, month, day) = Time::from_day_of_year(at, year);
                    let wall = Wall {
                        year,
                        month,
                        day,
                        is_date: true,
                        ..Default::default()
                    };
                    let week = Time::new(wall, Tz::Floating).week_number(start, self.zones);
                    // `indexOf(week) &&`: kept unless it is the first value.
                    if self.by_data.list(Part::WeekNo).first() != Some(&week) {
                        self.days.push(at);
                    }
                }
            }
            (1, [_, _, _, _, true]) => {
                let days = self.by_data.list(Part::YearDay).to_vec();
                self.days.extend(days);
            }
            (2, [true, _, _, _, true]) => {
                let length = if leap(year) { 366 } else { 365 };
                let named: HashSet<i64> = self.expand_by_day(year).into_iter().collect();
                for &at in self.by_data.list(Part::YearDay) {
                    let at = if at < 0 { at + length + 1 } else { at };
                    if named.contains(&at) {
                        self.days.push(at);
                    }
                }
            }
            _ => self.days.clear(),
        }
        let length = PASSED[usize::from(leap(year))][12];
        let key = |day: i64| if day < 0 { day + length + 1 } else { day };
        self.days.sort_by_key(|&day| key(day));
    }

    // `expand_year_days` with BYDAY and BYMONTH: each month's days, the BYSETPOS positions among
    // them when there are some.
    fn expand_by_day_and_month(&mut self, time: &mut Time, year: i64, months: &[i64]) {
        for &month in months {
            let length = days_in_month(month, year);
            time.set(Field::Year, year);
            time.set(Field::Month, month);
            time.set(Field::Day, 1);
            time.set_is_date(true);
            let (first, offset) = (time.day_of_week(1), time.day_of_year() - 1);
            time.set(Field::Day, length);
            let last = time.day_of_week(1);
            if self.rule.parts.has(Part::SetPos) {
                let mut named = Vec::new();
                for day in 1..=length {
                    time.set(Field::Day, day);
                    if in_byday(self.by_data.days.as_deref(), time) {
                        named.push(day);
                    }
                }
                let total = named.len() as i64;
                for (at, day) in (0_i64..).zip(&named) {
                    if self.check_set_position(at + 1) || self.check_set_position(at - total) {
                        self.days.push(offset + day);
                    }
                }
                continue;
            }
            for rule in self.by_data.days.iter().flatten() {
                let (position, weekday) = rule_day(rule, 1);
                let first_match = (weekday + 7 - first) % 7 + 1;
                let last_match = length - (last + 7 - weekday) % 7;
                if position == 0 {
                    let mut at = first_match;
                    while at <= length {
                        self.days.push(offset + at);
                        at += 7;
                    }
                } else if position > 0 {
                    let at = first_match + (position - 1) * 7;
                    if at <= length {
                        self.days.push(offset + at);
                    }
                } else {
                    let at = last_match + (position + 1) * 7;
                    if at > 0 {
                        self.days.push(offset + at);
                    }
                }
            }
        }
        self.days.sort_unstable();
    }
}
