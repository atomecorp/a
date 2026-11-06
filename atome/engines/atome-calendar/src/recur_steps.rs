// The steps `ICAL.RecurIterator` (vendored in atome/src/assets/vendor/ical) walks by, ported step
// for step: `next_generic` and its second, minute and hour steps, `increment_generic`, `next_day`,
// `next_week`, `next_weekday_by_week` and the day, month and year increments, through ICAL's
// normalizing getters and setters (the walk itself is recur_iterator.rs).
use super::ical_time::{Field, Time, days_in_month};
use super::recur::{Freq, Part, WEEKDAYS, rule_day};
use super::recur_iterator::Recurrence;

impl Recurrence<'_> {
    // `next_generic(part, freq, field, carry, previous)`.
    fn next_generic(
        &mut self,
        (part, freq, field): (Part, Freq, Field),
        (increment, carry): (fn(&mut Self, i64), fn(&mut Self, i64)),
        previous: Option<fn(&mut Self) -> i64>,
    ) -> i64 {
        let (listed, own) = (self.by_data.has(part), self.freq == freq);
        let mut wrapped = 0;
        if let Some(previous) = previous
            && previous(self) == 0
        {
            return 0;
        }
        if listed {
            let index = &mut self.by_indices[part as usize];
            *index += 1;
            if *index == self.by_data.list(part).len() {
                *index = 0;
                wrapped = 1;
            }
            let value = self.by_data.list(part)[*index];
            self.last.set(field, value);
        } else if own {
            increment(self, self.rule.interval);
        }
        if listed && wrapped == 1 && own {
            carry(self, 1);
        }
        wrapped
    }

    pub fn next_second(&mut self) -> i64 {
        let part = (Part::Second, Freq::Secondly, Field::Second);
        self.next_generic(part, (Self::increment_second, Self::increment_minute), None)
    }

    pub fn next_minute(&mut self) -> i64 {
        let part = (Part::Minute, Freq::Minutely, Field::Minute);
        let steps = (Self::increment_minute, Self::increment_hour);
        self.next_generic(part, (steps.0, steps.1), Some(Self::next_second))
    }

    pub fn next_hour(&mut self) -> i64 {
        let part = (Part::Hour, Freq::Hourly, Field::Hour);
        let steps = (Self::increment_hour, Self::increment_monthday);
        self.next_generic(part, (steps.0, steps.1), Some(Self::next_minute))
    }

    // `increment_generic(by, field, modulo, carry)`.
    fn increment_generic(&mut self, by: i64, field: Field, modulo: i64, carry: fn(&mut Self, i64)) {
        self.last.add(field, by);
        let overflow = self.last.get(field) / modulo;
        let value = self.last.get(field);
        self.last.set(field, value % modulo);
        if overflow != 0 {
            carry(self, overflow);
        }
    }

    fn increment_second(&mut self, by: i64) {
        self.increment_generic(by, Field::Second, 60, Self::increment_minute);
    }

    fn increment_minute(&mut self, by: i64) {
        self.increment_generic(by, Field::Minute, 60, Self::increment_hour);
    }

    fn increment_hour(&mut self, by: i64) {
        self.increment_generic(by, Field::Hour, 24, Self::increment_monthday);
    }

    pub fn next_day(&mut self) {
        let days = if self.freq == Freq::Daily {
            self.rule.interval
        } else {
            1
        };
        if self.next_hour() != 0 {
            self.increment_monthday(days);
        }
    }

    pub fn next_week(&mut self) {
        if self.next_weekday_by_week() == 0 {
            return;
        }
        if self.rule.parts.has(Part::WeekNo) {
            let index = &mut self.by_indices[Part::WeekNo as usize];
            *index += 1;
            let wrapped = *index == self.by_data.list(Part::WeekNo).len();
            if wrapped {
                *index = 0;
            }
            self.last.set(Field::Month, 1);
            self.last.set(Field::Day, 1);
            let week = self.by_data.list(Part::WeekNo)[self.by_indices[Part::WeekNo as usize]];
            self.last.add(Field::Day, 7 * week);
            if wrapped {
                self.increment_year(1);
            }
        } else {
            self.increment_monthday(7 * self.rule.interval);
        }
    }

    fn next_weekday_by_week(&mut self) -> i64 {
        if self.next_hour() == 0 {
            return 0;
        }
        let Some(days) = self
            .by_data
            .days
            .clone()
            .filter(|_| self.rule.parts.has(Part::Day))
        else {
            return 1;
        };
        let mut wrapped = 0;
        loop {
            let mut day = Time::blank();
            let index = &mut self.by_indices[Part::Day as usize];
            *index += 1;
            if *index == days.len() {
                *index = 0;
                wrapped = 1;
            }
            let mut weekday = rule_day(&days[*index], 1).1 - self.rule.wkst;
            if weekday < 0 {
                weekday += 7;
            }
            for field in [Field::Year, Field::Month, Field::Day] {
                day.set(field, self.last.get(field));
            }
            let start = day.start_doy_week(self.rule.wkst);
            if weekday + start < 1 && wrapped == 0 {
                continue;
            }
            let (year, month, at) =
                Time::from_day_of_year(start + weekday, self.last.get(Field::Year));
            self.last.set(Field::Year, year);
            self.last.set(Field::Month, month);
            self.last.set(Field::Day, at);
            return wrapped;
        }
    }

    pub fn increment_monthday(&mut self, days: i64) {
        for _ in 0..days {
            let length = days_in_month(self.last.get(Field::Month), self.last.get(Field::Year));
            self.last.add(Field::Day, 1);
            if self.last.get(Field::Day) > length {
                self.last.add(Field::Day, -length);
                self.increment_month();
            }
        }
    }

    pub fn increment_month(&mut self) {
        self.last.set(Field::Day, 1);
        if self.rule.parts.has(Part::Month) {
            let index = &mut self.by_indices[Part::Month as usize];
            *index += 1;
            let wrapped = *index == self.by_data.list(Part::Month).len();
            if wrapped {
                *index = 0;
                self.increment_year(1);
            }
            let month = self.by_data.list(Part::Month)[self.by_indices[Part::Month as usize]];
            self.last.set(Field::Month, month);
        } else {
            let months = if self.freq == Freq::Monthly {
                self.rule.interval
            } else {
                1
            };
            self.last.add(Field::Month, months);
            self.last.add(Field::Month, -1);
            let years = self.last.get(Field::Month) / 12;
            let month = self.last.get(Field::Month);
            self.last.set(Field::Month, month % 12);
            self.last.add(Field::Month, 1);
            if years != 0 {
                self.increment_year(years);
            }
        }
        if self.rule.parts.has(Part::MonthDay) {
            let (year, month) = (self.last.get(Field::Year), self.last.get(Field::Month));
            let days = month_days(year, month, self.rule.parts.list(Part::MonthDay));
            self.by_data.put(Part::MonthDay, days);
        }
    }

    pub fn increment_year(&mut self, years: i64) {
        self.last.set(Field::Day, 1);
        self.last.add(Field::Year, years);
    }
}

/// `numericDayToIcalDay(weekday)` (1 for Sunday); an out of range weekday has no name.
pub fn weekday_name(weekday: i64) -> &'static str {
    usize::try_from(weekday - 1)
        .ok()
        .and_then(|index| WEEKDAYS.get(index))
        .copied()
        .unwrap_or("undefined")
}

/// `normalizeByMonthDayRules(year, month, rules)`: the days of that month the rules name, negative
/// ones counted from its end, sorted.
pub fn month_days(year: i64, month: i64, rules: &[i64]) -> Vec<i64> {
    let length = days_in_month(month, year);
    let mut days: Vec<i64> = Vec::new();
    for &rule in rules {
        if rule.abs() > length || rule == 0 {
            continue;
        }
        let day = if rule < 0 { length + rule + 1 } else { rule };
        if !days.contains(&day) {
            days.push(day);
        }
    }
    days.sort_unstable();
    days
}
