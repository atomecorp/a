// Coaches and their bookings (cahier FEAT-010 + FEAT-012, user validation of 28 Oct. 2026). A coach is an account whose
// own coaching agenda — a `calendar` Atome of its vault — carries `coaching`: the name it shows, the quality it DECLARES
// (never checked by eVe, always shown as declared), its specialties, its weekly hours, its unavailabilities, a session's
// length and its cancellation delay, in its own time zone. The server projects a public coaching agenda into the shared
// directory everyone searches (server/coach_directory.js) and books a slot on request (server/coach_bookings.js); the
// accepted session lands in both agendas. Instants are stored in UTC; the hours are the coach's wall time in its zone.
// One owner for these shapes and the slot arithmetic, client and server.

export const COACH_QUALITIES = Object.freeze(['coach', 'trainer', 'health']);
export const COACH_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const COACH_BOOKING_STATES = Object.freeze(['requested', 'accepted', 'refused', 'cancelled']);
// A booking still holding its slot.
export const COACH_HOLDING_STATES = Object.freeze(['requested', 'accepted']);
// AGENTS.md rule 19: a session of 45 min, a cancellation up to 24 h before, three weeks of slots offered.
export const COACH_DEFAULTS = Object.freeze({ slot_minutes: 45, cancel_hours: 24, horizon_days: 21 });
export const COACH_LIMITS = Object.freeze({ name: 60, specialties: 6, specialty: 30, place: 80, note: 600, title: 80, ranges: 21, off: 34,
    minMinutes: 15, maxMinutes: 240, maxCancelHours: 336, slots: 89 });

const MINUTE = 60000, DAY = 86400000;
const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
const whole = (value, min, max) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
};
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/;
export const coachClockMinutes = value => (CLOCK.test(String(value)) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null);
export const coachClockText = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const isCoachTimeZone = (zone) => {
    if (!zone || typeof zone !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
};
// A zone's one name on this engine: its aliases (Asia/Kolkata and Asia/Calcutta, Europe/Kyiv and Europe/Kiev) read as the name
// the engine lists, so a zone recorded under another of its names is the same zone, never a second one.
export const coachCanonicalZone = zone => new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;

// A weekly range: a day and its hours (« thu 18:00–21:00 »), the end after the start.
const normalizeRange = (range) => {
    const day = text(range?.day, 3).toLowerCase(), start = coachClockMinutes(range?.start), end = coachClockMinutes(range?.end);
    return COACH_DAYS.includes(day) && start !== null && end !== null && end > start ? { day, start: range.start, end: range.end } : null;
};
// An unavailability: whole days of the coach's calendar, from one to the other included.
const normalizeOff = (off) => {
    const start = text(off?.start, 10), end = text(off?.end || off?.start, 10);
    return DAY_TEXT.test(start) && DAY_TEXT.test(end) && end >= start ? { start, end } : null;
};
const unique = (items, key) => [...new Map(items.filter(Boolean).map(item => [key(item), item])).values()];

// What a coaching agenda carries; anything malformed is dropped, a missing value takes its default.
export const normalizeCoaching = (value) => {
    const source = parse(value);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    return {
        visibility: source.visibility === 'public' ? 'public' : 'private',
        name: text(source.name, COACH_LIMITS.name),
        quality: COACH_QUALITIES.includes(source.quality) ? source.quality : 'coach',
        specialties: unique((Array.isArray(source.specialties) ? source.specialties : []).map(item => text(item, COACH_LIMITS.specialty)).filter(Boolean),
            item => item.toLowerCase()).slice(0, COACH_LIMITS.specialties),
        place: text(source.place, COACH_LIMITS.place),
        timezone: isCoachTimeZone(source.timezone) ? coachCanonicalZone(source.timezone) : '',
        slot_minutes: whole(source.slot_minutes, COACH_LIMITS.minMinutes, COACH_LIMITS.maxMinutes) ?? COACH_DEFAULTS.slot_minutes,
        cancel_hours: whole(source.cancel_hours, 0, COACH_LIMITS.maxCancelHours) ?? COACH_DEFAULTS.cancel_hours,
        ranges: unique((Array.isArray(source.ranges) ? source.ranges : []).map(normalizeRange), item => `${item.day}${item.start}${item.end}`)
            .slice(0, COACH_LIMITS.ranges),
        off: unique((Array.isArray(source.off) ? source.off : []).map(normalizeOff), item => `${item.start}${item.end}`).slice(0, COACH_LIMITS.off)
    };
};
// Why a public coaching cannot be listed (null: it can).
export const coachingError = (coaching) => {
    if (!coaching) return 'coach_invalid';
    if (!coaching.name) return 'coach_name_required';
    if (!coaching.timezone) return 'coach_timezone_required';
    return null;
};

// The wall time of an instant in a zone, and the instant of a wall time (a change of hour resolved the second way).
const FORMATS = new Map();
const formatOf = zone => FORMATS.get(zone) || FORMATS.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })).get(zone);
export const coachWallOf = (ms, zone) => {
    const parts = Object.fromEntries(formatOf(zone).formatToParts(new Date(ms)).map(part => [part.type, Number(part.value)]));
    return { year: parts.year, month: parts.month, day: parts.day, minutes: parts.hour * 60 + parts.minute, second: parts.second };
};
const offsetAt = (ms, zone) => {
    const wall = coachWallOf(ms, zone);
    return Date.UTC(wall.year, wall.month - 1, wall.day, 0, wall.minutes, wall.second) - Math.floor(ms / 1000) * 1000;
};
export const coachWallToUtc = ({ year, month, day, minutes }, zone) => {
    const guess = Date.UTC(year, month - 1, day, 0, minutes);
    const first = guess - offsetAt(guess, zone), second = guess - offsetAt(first, zone);
    return second;
};
// An instant's offset from UTC in a zone, in minutes, on the same wall arithmetic.
export const coachZoneOffsetMinutes = (ms, zone) => Math.round(offsetAt(ms, zone) / MINUTE);
// The zones a coach chooses among (« Mon coaching › Séance › Fuseau »), west to east at `now`, then by their own name; the zones
// in `kept` (the device's, the one already chosen) are among them even when this engine does not list them, each zone once, by its one name.
export const coachTimeZones = (now = Date.now(), kept = []) => [...new Set([...Intl.supportedValuesOf('timeZone'), ...kept.filter(isCoachTimeZone)].map(coachCanonicalZone))]
    .map(zone => ({ zone, offset: coachZoneOffsetMinutes(now, zone) }))
    .sort((a, b) => a.offset - b.offset || a.zone.localeCompare(b.zone)).map(entry => entry.zone);
const dayText = utcDay => new Date(utcDay).toISOString().slice(0, 10);

// The coach's open windows between `from` and `to` (ms): its weekly hours on each of its days, its unavailabilities taken out.
export const coachOpenWindows = (coaching, from, to) => {
    const zone = coaching.timezone, first = coachWallOf(from, zone), windows = [];
    for (let utcDay = Date.UTC(first.year, first.month - 1, first.day); utcDay <= to + DAY; utcDay += DAY) {
        const date = new Date(utcDay), today = dayText(utcDay);
        if (coaching.off.some(off => off.start <= today && today <= off.end)) continue;
        const weekday = COACH_DAYS[(date.getUTCDay() + 6) % 7];
        for (const range of coaching.ranges.filter(item => item.day === weekday)) {
            const wall = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
            const start = coachWallToUtc({ ...wall, minutes: coachClockMinutes(range.start) }, zone);
            const end = coachWallToUtc({ ...wall, minutes: coachClockMinutes(range.end) }, zone);
            if (end > from && start < to) windows.push({ start: Math.max(start, from), end: Math.min(end, to) });
        }
    }
    return windows.sort((a, b) => a.start - b.start);
};
const overlaps = (start, end, busy) => busy.some(item => item.start < end && start < item.end);

// The free slots offered: each window cut in sessions of the coach's length from its start, none overlapping what is busy
// (its own events, the bookings holding a slot), none begun. `busy`: [{ start, end }] in ms.
export const coachFreeSlots = ({ coaching, busy = [], now = Date.now(), days = COACH_DEFAULTS.horizon_days, limit = COACH_LIMITS.slots }) => {
    const length = coaching.slot_minutes * MINUTE, slots = [];
    // On the five minutes; a slot meeting something busy starts again where that ends.
    const aligned = ms => Math.ceil(ms / (MINUTE * 5)) * MINUTE * 5;
    for (const window of coachOpenWindows(coaching, now, now + days * DAY)) {
        let start = aligned(Math.max(window.start, now + 1));
        while (start + length <= window.end && slots.length < limit) {
            const met = busy.filter(item => item.start < start + length && start < item.end);
            if (met.length) { start = aligned(Math.max(...met.map(item => item.end))); continue; }
            slots.push({ start: new Date(start).toISOString(), minutes: coaching.slot_minutes });
            start += length;
        }
    }
    return slots;
};
// A requested session fits when it lies whole in one open window, begins later than now and overlaps nothing busy.
export const coachSessionFits = ({ coaching, busy = [], start, minutes, now = Date.now() }) => {
    const end = start + minutes * MINUTE;
    if (!(start > now) || minutes < COACH_LIMITS.minMinutes || minutes > COACH_LIMITS.maxMinutes) return false;
    return coachOpenWindows(coaching, start - DAY, end + DAY).some(window => window.start <= start && end <= window.end) && !overlaps(start, end, busy);
};

// Who may cancel a booking now: the client withdraws a request at any time and cancels an accepted session until its
// coach's delay before the start (the delay kept on the booking when it was asked); the coach cancels until the start.
export const coachCancelRefusal = ({ booking, role, now = Date.now() }) => {
    const start = new Date(booking.starts_at).getTime();
    if (!COACH_HOLDING_STATES.includes(booking.state)) return 'coach_booking_state_invalid';
    if (now >= start) return 'coach_booking_past';
    if (role === 'client' && booking.state === 'accepted' && now > start - Number(booking.cancel_hours) * 3600000) return 'coach_cancel_too_late';
    return null;
};
