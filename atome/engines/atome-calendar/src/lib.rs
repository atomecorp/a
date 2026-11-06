// The one calendar engine (atome/src/squirrel/calendar/icalendar.js and the ICAL.js it relied on,
// atome/src/assets/vendor/ical, ported step for step): the RFC content lines, a calendar object read
// into its canonical events (ical.rs, for the personal import), ICAL's time, recurrence and time
// zone arithmetic, and the occurrences of canonical events in a range (occurrences.rs). Its readers:
// atome-server (the public events, the coaches' agendas, the personal import) and the browser,
// through squirrel_audio_wasm (platforms/web/audio-wasm/src/calendar.rs). The local time is the
// host's: the server's `TZ`, the browser's own zone (read from `Date`'s own getters on wasm32,
// exact to the second, zone_intl.rs and atome-js-values `local_instant`).
pub mod content_lines;
mod event_dates;
mod event_ics;
mod expansion;
pub mod ical;
mod ical_time;
mod ical_week;
pub mod js_date;
mod occurrences;
mod recur;
mod recur_iterator;
mod recur_steps;
mod recur_year;
mod vtimezone;
pub mod zone;
// The IANA zones: the system's TZif files on a native host, the browser's Intl in WASM.
#[cfg(not(target_arch = "wasm32"))]
#[path = "zone_tzif.rs"]
mod zone_named;
#[cfg(target_arch = "wasm32")]
#[path = "zone_intl.rs"]
mod zone_named;
mod zones;

pub use ical_time::date_utc;
pub use occurrences::{Occurrence, Range, expand_event, occurrence_end, range_occurrences};
