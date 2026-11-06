// The zones the times of one expanded event are in (ICAL.js, vendored in atome/src/assets/vendor/ical,
// as the former atome/src/squirrel/calendar/icalendar.js had it read the event): a VTIMEZONE of the event's
// calendar, found by its TZID (`getTimeZoneByID`), its changes covered as ICAL's `Timezone` covers
// them (vtimezone.rs); a zone ICAL's `TimezoneService` holds for that calendar, whose offset is read
// as the former `installIanaZones` (icalendar_iana.js) read it, through `calendarDate`; UTC; floating. And an
// `ICAL.Time`'s instant in its zone: `toUnixTime`, `compare`, `toJSDate`.
//
// An offset ICAL would throw on (an IANA wall time whose year `calendarDate` refuses, a VTIMEZONE
// ICAL cannot expand) is recorded as the expansion's failure, which its reader returns at once, as
// ICAL's throw would end it: the walk goes on meanwhile with an offset of 0, and its result is not
// read.
use super::ical::Component;
use super::ical_time::{Time, Tz, Wall, date_utc};
use super::vtimezone::Coverage;
use super::zone;
use std::cell::RefCell;
use std::cmp::Ordering;

enum Entry {
    Defined {
        component: Component,
        coverage: RefCell<Coverage>,
    },
    Iana(zone::Zone),
}

/// The zones of one expansion, each a `Tz::Zone` index, and the first failure an offset met.
#[derive(Default)]
pub struct Zones {
    entries: Vec<Entry>,
    // The calendar's VTIMEZONEs in their order: their decoded TZID (none without one) and entry.
    defined: Vec<(Option<String>, usize)>,
    // The zones installed in ICAL's TimezoneService for the calendar.
    installed: Vec<(String, usize)>,
    failure: RefCell<Option<String>>,
}

impl Zones {
    /// A VTIMEZONE of the calendar, `tzid` its decoded TZID (none without one).
    pub fn define(&mut self, tzid: Option<String>, component: Component) -> Tz {
        self.entries.push(Entry::Defined {
            component,
            coverage: RefCell::new(Coverage::default()),
        });
        self.defined.push((tzid, self.entries.len() - 1));
        Tz::Zone(self.entries.len() - 1)
    }

    /// A zone `ICAL.TimezoneService.register` holds under `tzid`.
    pub fn install(&mut self, tzid: &str, zone: zone::Zone) {
        self.entries.push(Entry::Iana(zone));
        self.installed
            .push((tzid.to_string(), self.entries.len() - 1));
    }

    /// Whether the calendar defines a VTIMEZONE whose TZID is `tzid` (`installIanaZones`'
    /// `definitions`).
    pub fn defines(&self, tzid: &str) -> bool {
        self.defined
            .iter()
            .any(|(defined, _)| defined.as_deref() == Some(tzid))
    }

    /// The zone of a date-time whose TZID parameter is `tzid`: the calendar's VTIMEZONE
    /// (`getTimeZoneByID`, which reads each one's TZID until it finds it), else the service's zone
    /// (UTC under Z, UTC and GMT, which it holds once used), else floating.
    pub fn zone_of(&self, tzid: &str) -> Result<Tz, String> {
        for (defined, entry) in &self.defined {
            match defined {
                None => {
                    return Err("Cannot read properties of null (reading 'getFirstValue')".into());
                }
                Some(defined) if defined == tzid => return Ok(Tz::Zone(*entry)),
                Some(_) => {}
            }
        }
        if ["Z", "UTC", "GMT"].contains(&tzid) {
            return Ok(Tz::Utc);
        }
        Ok(self
            .installed
            .iter()
            .find(|(installed, _)| installed == tzid)
            .map_or(Tz::Floating, |(_, entry)| Tz::Zone(*entry)))
    }

    /// `zone.utcOffset(time)` in seconds: 0 when floating or UTC.
    pub fn offset(&self, zone: Tz, wall: &Wall) -> i64 {
        let Tz::Zone(index) = zone else {
            return 0;
        };
        let offset = match &self.entries[index] {
            Entry::Defined {
                component,
                coverage,
            } => coverage.borrow_mut().offset(component, wall),
            Entry::Iana(named) => iana_offset(named, wall),
        };
        offset.unwrap_or_else(|error| {
            self.failure.borrow_mut().get_or_insert(error);
            0
        })
    }

    /// The first offset ICAL would have thrown on.
    pub fn failure(&self) -> Option<String> {
        self.failure.borrow().clone()
    }
}

/// The offset `installIanaZones` gives ICAL: `(Date.UTC(wall) - calendarDate({ value, params: { TZID
/// } })) / 1000`, the value's year on four digits, which `calendarDate` reads only from 100 to 9999.
fn iana_offset(named: &zone::Zone, wall: &Wall) -> Result<i64, String> {
    if !(100..=9999).contains(&wall.year) {
        return Err("ics_date_invalid".into());
    }
    let target = date_utc(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second,
    );
    let instant = zone::resolve(target, |seconds| named.offset(seconds))?;
    Ok(((target - instant) / 1000.0) as i64)
}

impl Time {
    /// `toUnixTime() * 1000`: the wall time less the zone's offset.
    pub fn instant(&mut self, zones: &Zones) -> f64 {
        let wall = self.wall();
        let offset = zones.offset(self.zone, &wall);
        date_utc(
            wall.year,
            wall.month - 1,
            wall.day,
            wall.hour,
            wall.minute,
            wall.second - offset,
        )
    }

    /// `compare(other)`: by their instants (equal when either is NaN).
    pub fn compare(&mut self, other: &mut Time, zones: &Zones) -> Ordering {
        let (a, b) = (self.instant(zones), other.instant(zones));
        if a > b {
            Ordering::Greater
        } else if b > a {
            Ordering::Less
        } else {
            Ordering::Equal
        }
    }

    /// `toJSDate().getTime()`: a floating time is read in the server's local time.
    pub fn js_date(&mut self, zones: &Zones) -> Result<f64, String> {
        let wall = self.wall();
        if self.zone != Tz::Floating {
            return Ok(self.instant(zones));
        }
        let (hour, minute, second) = if wall.is_date {
            (0, 0, 0)
        } else {
            (wall.hour, wall.minute, wall.second)
        };
        zone::local(wall.year, wall.month - 1, wall.day, hour, minute, second)
    }
}
