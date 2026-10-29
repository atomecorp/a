// The coaches' shared directory (cahier FEAT-010, user validation of 28 Oct. 2026): everyone searches it, visitor and
// guest included. The truth is the coach's own coaching agenda — a `calendar` Atome of its vault carrying `coaching`
// (atome/src/shared/coach_contract.js); this service only PROJECTS a public one into `coach_directory` after every
// commit that touches it (server/ws_api_commit_effects.js). The free slots are read at once from the coach's vault:
// its weekly hours and unavailabilities, less its own timed events (any agenda: their titles never leave the vault)
// and the bookings holding a slot (server/coach_bookings.js).
import { COACH_DEFAULTS, COACH_HOLDING_STATES, coachFreeSlots, coachingError, normalizeCoaching } from '../atome/src/shared/coach_contract.js';
import { calendarRangeOccurrences } from '../atome/src/squirrel/calendar/icalendar.js';

const CALENDAR_TYPE = 'calendar', EVENT_TYPE = 'calendar_event';
const PAGE_SIZE = 34, DAY = 86400000;
const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
const deleted = properties => properties?.__deleted === true || properties?.deleted === true;

// A stored event as the occurrence reader needs it (no title: a coach's own events only say « busy »).
const eventOf = (state) => {
    const p = state.properties || {};
    return { id: String(state.atome_id || state.id), exchange_uid: p.exchange_uid || null, calendarId: p.calendar_id || '', start: p.start, end: p.end,
        allDay: p.all_day === true, kind: p.kind === 'todo' ? 'todo' : 'event', status: p.status || 'open', recurrence: parse(p.recurrence) || null,
        recurrence_id: p.recurrence_id || '', exdates: parse(p.exdates) || [], rdates: parse(p.rdates) || [], icalendar: parse(p.icalendar) || null,
        timezone: p.timezone || '' };
};

export function createCoachDirectory({ query, vaultRouter, relations = null, broadcast = () => {}, now = () => Date.now() }) {
    const row = coachId => query('get', 'SELECT * FROM coach_directory WHERE coach_id = ?', [coachId]);
    const leave = async (coachId, calendarId) => {
        const existing = await row(coachId);
        if (!existing || (calendarId && existing.calendar_id !== calendarId)) return;
        await query('run', 'DELETE FROM coach_directory WHERE coach_id = ?', [coachId]);
        broadcast({ coachId });
    };
    // After a commit touching `calendarId` (in `coachId`'s vault): the directory follows the agenda. One coaching per
    // account: the last one made public is the account's.
    const project = async (coachId, calendarId) => {
        const state = await vaultRouter.getState(coachId, calendarId);
        const properties = state?.properties || {};
        const coaching = normalizeCoaching(properties.coaching);
        if (!state || String(state.type || '').toLowerCase() !== CALENDAR_TYPE || deleted(properties)
            || coaching?.visibility !== 'public' || coachingError(coaching)) return leave(coachId, calendarId);
        const words = [coaching.name, ...coaching.specialties, coaching.place].join(' ').toLowerCase();
        await query('run', `INSERT INTO coach_directory (coach_id, calendar_id, name, quality, words, payload_json) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(coach_id) DO UPDATE SET calendar_id = excluded.calendar_id, name = excluded.name, quality = excluded.quality,
            words = excluded.words, payload_json = excluded.payload_json, updated_at = datetime('now')`,
        [coachId, calendarId, coaching.name, coaching.quality, words, JSON.stringify(coaching)]);
        return broadcast({ coachId });
    };
    // The commits of one request: each one carrying `coaching`, or an agenda already listed.
    const afterCommit = async (events = []) => {
        for (const event of events) {
            const atomeId = text(event?.atome_id, 200);
            if (!atomeId) continue;
            const props = event?.payload?.props || event?.payload || {};
            const listed = !Object.hasOwn(props, 'coaching') && await query('get', 'SELECT coach_id FROM coach_directory WHERE calendar_id = ?', [atomeId]);
            if (!Object.hasOwn(props, 'coaching') && !listed) continue;
            const ownerId = await vaultRouter.vaultPrincipalForAtome(atomeId, null);
            if (ownerId) await project(String(ownerId), atomeId);
        }
    };

    // A coach as the reader receives it: what the coach chose to show, the quality said as declared.
    const entryOf = (found) => {
        const coaching = parse(found.payload_json) || {};
        return { coachId: String(found.coach_id), name: found.name, quality: found.quality, declared: true, specialties: coaching.specialties || [],
            place: coaching.place || '', timezone: coaching.timezone, slotMinutes: coaching.slot_minutes, cancelHours: coaching.cancel_hours };
    };
    const visible = async (rows, viewerId) => {
        const kept = [];
        for (const found of rows) {
            if (viewerId && relations && String(viewerId) !== String(found.coach_id) && await relations.blockedEitherWay(viewerId, found.coach_id)) continue;
            kept.push(entryOf(found));
        }
        return kept;
    };
    // Searching: by a name, a specialty or a place (« yoga »), in the order of the names; a page at a time.
    const browse = async ({ query: words = '', offset = 0, viewerId = null } = {}) => {
        const params = [], where = [];
        for (const word of text(words, 80).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
            where.push('words LIKE ?'); params.push(`%${word.replace(/[%_]/g, '')}%`);
        }
        const start = Math.max(0, Math.round(Number(offset)) || 0);
        const rows = await query('all', `SELECT * FROM coach_directory ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY name COLLATE NOCASE, coach_id LIMIT ? OFFSET ?`, [...params, PAGE_SIZE + 1, start]) || [];
        return { entries: await visible(rows.slice(0, PAGE_SIZE), viewerId), next: rows.length > PAGE_SIZE ? String(start + PAGE_SIZE) : '' };
    };
    const one = async ({ coachId, viewerId = null }) => {
        const found = await row(text(coachId, 200));
        return { entries: found ? await visible([found], viewerId) : [], next: '' };
    };

    // What a listed coach offers now: its coaching (read again from its vault) and what keeps it busy until `until`.
    const availability = async (coachId, until = now() + COACH_DEFAULTS.horizon_days * DAY) => {
        const found = await row(text(coachId, 200));
        if (!found) return null;
        const state = await vaultRouter.getState(String(found.coach_id), found.calendar_id);
        const coaching = normalizeCoaching(state?.properties?.coaching);
        if (!coaching || coaching.visibility !== 'public' || coachingError(coaching)) return null;
        const from = now() - DAY;
        const states = await vaultRouter.listStates(String(found.coach_id), { atomeType: EVENT_TYPE, limit: 5000 });
        const events = (states || []).filter(item => !deleted(item.properties)).map(eventOf)
            .filter(event => event.kind === 'event' && !event.allDay);
        const busy = calendarRangeOccurrences(events, { start: new Date(from), end: new Date(until) }, 2000)
            .map(occurrence => ({ start: new Date(occurrence.start).getTime(), end: new Date(occurrence.end || occurrence.start).getTime() }));
        const held = await query('all', `SELECT starts_at, ends_at FROM coach_bookings WHERE coach_id = ? AND state IN (${COACH_HOLDING_STATES.map(() => '?').join(', ')})
            AND ends_at > ?`, [String(found.coach_id), ...COACH_HOLDING_STATES, new Date(from).toISOString()]) || [];
        busy.push(...held.map(item => ({ start: Date.parse(item.starts_at), end: Date.parse(item.ends_at) })));
        return { coachId: String(found.coach_id), calendarId: found.calendar_id, name: found.name, coaching, busy };
    };
    const slots = async ({ coachId, viewerId = null }) => {
        const [entry] = (await one({ coachId, viewerId })).entries;
        const offered = entry ? await availability(entry.coachId) : null;
        if (!offered) return { ok: false, error: 'coach_not_found' };
        return { ok: true, coach: entry, slots: coachFreeSlots({ coaching: offered.coaching, busy: offered.busy, now: now() }) };
    };

    return { project, afterCommit, browse, one, slots, availability };
}
