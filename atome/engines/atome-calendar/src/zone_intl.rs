// The zones of the browser (zone.rs): an IANA zone is the browser's own `Intl.DateTimeFormat`,
// read as the former JavaScript engine read it (atome/src/squirrel/calendar/icalendar.js#calendarDate
// `wallAt`): the wall clock Intl shows at an instant, less the instant. The constructor and
// `formatToParts` are reached through `Reflect`, so a zone Intl refuses and a date it cannot show
// come back as errors instead of exceptions thrown through the module. The local zone is `Date`'s
// own wall clock (its getters), exact to the second where an old zone's offset is not whole
// minutes (a local mean time), which `getTimezoneOffset` and chrono round.
use crate::ical_time::date_utc;
use js_sys::{Array, Date, Function, Object, Reflect};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::{JsCast, JsValue};

/// ECMAScript's time range, in ms either side of the epoch.
const MAX_TIME_MS: f64 = 8.64e15;

/// One IANA zone of the page: its formatter, made once per zone, and each instant's offset once read.
/// Measured: 40 series in Europe/Paris over three weeks asked `formatToParts` 116 660 times for 1 488
/// instants, and built 120 formatters (3 s; temp/final_r118/calendar/tzid_count.probe.mjs). Intl's
/// data does not change while the page runs, so neither does an instant's offset.
pub struct NamedZone(Rc<IntlZone>);

struct IntlZone {
    format: Object,
    format_to_parts: Function,
    offsets: RefCell<HashMap<i64, i64>>,
}

thread_local! {
    static ZONES: RefCell<HashMap<String, Rc<IntlZone>>> = RefCell::default();
}

fn get(target: &JsValue, key: &str) -> Option<JsValue> {
    Reflect::get(target, &JsValue::from_str(key)).ok()
}

impl NamedZone {
    /// The page's zone `tzid`; none when Intl refuses it.
    pub fn read(tzid: &str) -> Option<NamedZone> {
        if let Some(zone) = ZONES.with(|zones| zones.borrow().get(tzid).cloned()) {
            return Some(NamedZone(zone));
        }
        let zone = Rc::new(IntlZone::read(tzid)?);
        ZONES.with(|zones| zones.borrow_mut().insert(tzid.to_string(), zone.clone()));
        Some(NamedZone(zone))
    }

    /// The offset (seconds east of UTC) at `seconds` since the epoch: Intl's wall clock there, read
    /// as UTC, less the instant.
    pub fn offset(&self, seconds: i64) -> Result<i64, String> {
        let zone = &self.0;
        if let Some(&offset) = zone.offsets.borrow().get(&seconds) {
            return Ok(offset);
        }
        let offset = zone.read_offset(seconds)?;
        zone.offsets.borrow_mut().insert(seconds, offset);
        Ok(offset)
    }
}

impl IntlZone {
    /// `new Intl.DateTimeFormat('en-US', { timeZone: tzid, hourCycle: 'h23', … })`; none when Intl
    /// refuses the zone.
    fn read(tzid: &str) -> Option<IntlZone> {
        let options = Object::new();
        let fields = [
            ("timeZone", tzid),
            ("hourCycle", "h23"),
            ("year", "numeric"),
            ("month", "2-digit"),
            ("day", "2-digit"),
            ("hour", "2-digit"),
            ("minute", "2-digit"),
            ("second", "2-digit"),
        ];
        for (key, value) in fields {
            Reflect::set(&options, &key.into(), &value.into()).ok()?;
        }
        let intl = get(&js_sys::global(), "Intl")?;
        let constructor: Function = get(&intl, "DateTimeFormat")?.dyn_into().ok()?;
        let arguments = Array::of2(&"en-US".into(), &options);
        let format: Object = Reflect::construct(&constructor, &arguments)
            .ok()?
            .dyn_into()
            .ok()?;
        let format_to_parts: Function = get(&format, "formatToParts")?.dyn_into().ok()?;
        Some(IntlZone {
            format,
            format_to_parts,
            offsets: RefCell::default(),
        })
    }

    /// Intl's wall clock at `seconds`, read as UTC, less the instant.
    fn read_offset(&self, seconds: i64) -> Result<i64, String> {
        let instant = seconds as f64 * 1000.0;
        if !instant.is_finite() || instant.abs() > MAX_TIME_MS {
            return Err("Invalid time value".into());
        }
        let date = Date::new(&JsValue::from_f64(instant));
        let parts: Array = self
            .format_to_parts
            .call1(&self.format, &date)
            .map_err(|_| "Invalid time value".to_string())?
            .dyn_into()
            .map_err(|_| "Invalid time value".to_string())?;
        // year, month, day, hour, minute, second (`+parts.year`…).
        let mut wall = [0_i64; 6];
        let names = ["year", "month", "day", "hour", "minute", "second"];
        for part in parts.iter() {
            let kind = get(&part, "type").and_then(|kind| kind.as_string());
            let Some(at) = kind.and_then(|kind| names.iter().position(|name| *name == kind)) else {
                continue;
            };
            let value = get(&part, "value").and_then(|value| value.as_string());
            wall[at] = value
                .and_then(|value| value.parse().ok())
                .ok_or("Invalid time value")?;
        }
        let [year, month, day, hour, minute, second] = wall;
        let shown = date_utc(year, month - 1, day, hour, minute, second);
        Ok(((shown - instant) / 1000.0) as i64)
    }
}

/// The browser's local offset at `seconds`: `new Date(ms)`'s local wall clock, read as UTC, less
/// the instant.
pub fn local_offset(seconds: i64) -> Result<i64, String> {
    let instant = seconds as f64 * 1000.0;
    if !instant.is_finite() || instant.abs() > MAX_TIME_MS {
        return Err("instant_out_of_range".into());
    }
    let date = Date::new(&JsValue::from_f64(instant));
    let shown = date_utc(
        // A year before 1 BC comes back through ToUint32.
        i64::from(date.get_full_year() as i32),
        i64::from(date.get_month()),
        i64::from(date.get_date()),
        i64::from(date.get_hours()),
        i64::from(date.get_minutes()),
        i64::from(date.get_seconds()),
    );
    Ok(((shown - instant) / 1000.0) as i64)
}
