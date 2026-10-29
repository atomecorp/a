// Booking a coach (cahier FEAT-012, user validation of 28 Oct. 2026). A client asks for a session in a coach's free
// time; the request carries only what the client chose to send (the session's title, its time, a note) and the name of
// its public card. The coach alone sees the requests addressed to it, and accepts or refuses; once accepted, the session
// lands in both agendas — the coach's coaching agenda, the agenda the client chose — as an event of each one's own vault.
// A cancellation follows the coach's delay (atome/src/shared/coach_contract.js#coachCancelRefusal) and cancels both events.
// One coach's bookings move one at a time (`serial`): two requests for the same slot never both hold it.
import crypto from 'node:crypto';
import { COACH_LIMITS, coachCancelRefusal, coachSessionFits } from '../atome/src/shared/coach_contract.js';

const EVENT_TYPE = 'calendar_event', MINUTE = 60000;
const text = (value, max = 200) => String(value == null ? '' : value).trim().slice(0, max);
const fail = error => ({ ok: false, error });

export function createCoachBookings({ query, directory, vaultRouter, syncRuntime = null, relations = null, findUserName = async () => '',
    notify = async () => {}, tell = () => {}, now = () => Date.now() }) {
    const chains = new Map();
    const serial = (coachId, work) => {
        const next = (chains.get(coachId) || Promise.resolve()).then(work, work);
        chains.set(coachId, next.catch(() => {}));
        return next;
    };
    const booking = id => query('get', 'SELECT * FROM coach_bookings WHERE booking_id = ?', [text(id, 80)]);
    const step = async (row, action, role, actorId, to, fields = {}) => {
        await query('run', 'INSERT INTO coach_booking_steps (booking_id, action, role, actor_id, from_state, to_state) VALUES (?, ?, ?, ?, ?, ?)',
            [row.booking_id, action, role, actorId, row.state, to]);
        const columns = Object.keys(fields);
        await query('run', `UPDATE coach_bookings SET state = ?, ${columns.map(column => `${column} = ?, `).join('')}updated_at = datetime('now')
            WHERE booking_id = ?`, [to, ...columns.map(column => fields[column]), row.booking_id]);
        return booking(row.booking_id);
    };
    // What each side reads of a booking: the other's name, never the other's agenda.
    const entryOf = (row, side) => ({ id: row.booking_id, side, state: row.state, coachId: row.coach_id, clientId: row.client_id,
        peer: side === 'client' ? row.coach_name : row.client_name, title: row.title, note: row.note, startsAt: row.starts_at, endsAt: row.ends_at,
        minutes: row.minutes, cancelHours: row.cancel_hours, updatedAt: row.updated_at });
    // Both screens read again; the other side hears it in its notifications.
    const told = async (row, actorId, action) => {
        tell(row.coach_id, { bookingId: row.booking_id }); tell(row.client_id, { bookingId: row.booking_id });
        const targetId = String(actorId) === String(row.coach_id) ? row.client_id : row.coach_id;
        await notify(String(targetId), String(actorId), { kind: 'coach-booking', subject: text(row.title, 80), message: action,
            id: `coach_booking_${row.booking_id}_${row.state}`,
            extra: { action: { kind: 'command', toolId: 'coaches.open', input: { booking_id: row.booking_id } }, booking_state: row.state } });
    };
    // A session as an event of `ownerId`'s own vault (its agenda `calendarId`), or its cancellation.
    const writeEvent = async (ownerId, eventId, props) => {
        const entry = await vaultRouter.commit(String(ownerId), { kind: 'set', atome_id: eventId, payload: { props },
            actor: { type: 'user', id: String(ownerId) } }, { source: 'coaches' });
        if (entry.inserted) await syncRuntime?.publish?.(entry.event);
    };
    const sessionProps = (row, { title, calendarId, timezone, role, place = '' }) => {
        const at = new Date(now()).toISOString();
        return { type: EVENT_TYPE, title, description: row.note, location: place, start: row.starts_at, end: row.ends_at, all_day: false,
            calendar_id: calendarId, timezone, kind: 'event', status: 'open', recurrence_id: '', sequence: 0, calendar_scope: 'personal',
            access: 'private', visibility: 'private', created_iso: at, updated_iso: at,
            booking: JSON.stringify({ booking_id: row.booking_id, role, state: 'accepted' }) };
    };

    // The client asks (`input`: coach_id, starts_at, minutes, title, note, calendar_id, timezone).
    const request = async (clientId, input = {}) => {
        const coachId = text(input.coach_id, 200), start = Date.parse(text(input.starts_at, 40));
        if (!coachId || !Number.isFinite(start)) return fail('coach_booking_invalid');
        if (coachId === String(clientId)) return fail('coach_own');
        if (relations && await relations.blockedEitherWay(clientId, coachId)) return fail('coach_not_found');
        const title = text(input.title, COACH_LIMITS.title);
        if (!title) return fail('coach_title_required');
        return serial(coachId, async () => {
            const offered = await directory.availability(coachId);
            if (!offered) return fail('coach_not_found');
            const minutes = Math.round(Number(input.minutes) || offered.coaching.slot_minutes);
            if (!coachSessionFits({ coaching: offered.coaching, busy: offered.busy, start, minutes, now: now() })) return fail('coach_slot_taken');
            const row = { booking_id: crypto.randomUUID(), coach_id: coachId, client_id: String(clientId), coach_name: offered.name,
                client_name: text(await findUserName(clientId), 80), state: 'requested', starts_at: new Date(start).toISOString(),
                ends_at: new Date(start + minutes * MINUTE).toISOString(), minutes, cancel_hours: offered.coaching.cancel_hours, title,
                note: text(input.note, COACH_LIMITS.note), client_calendar_id: text(input.calendar_id, 200) || 'default',
                client_timezone: text(input.timezone, 60) || offered.coaching.timezone };
            const columns = Object.keys(row);
            await query('run', `INSERT INTO coach_bookings (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map(key => row[key]));
            await query('run', `INSERT INTO coach_booking_steps (booking_id, action, role, actor_id, from_state, to_state) VALUES (?, 'request', 'client', ?, '', 'requested')`,
                [row.booking_id, String(clientId)]);
            const stored = await booking(row.booking_id);
            await told(stored, clientId, 'requested');
            return { ok: true, booking: entryOf(stored, 'client') };
        });
    };

    // The coach answers a request: accepted (both events written), or refused. `title`: the coach's own event's title.
    const answer = async (coachId, { bookingId, accept, title = '' }) => {
        const row = await booking(bookingId);
        if (!row || row.coach_id !== String(coachId)) return fail('coach_booking_not_found');
        if (accept && !text(title, COACH_LIMITS.title)) return fail('coach_title_required');
        return serial(row.coach_id, async () => {
            const current = await booking(bookingId);
            if (current.state !== 'requested') return fail('coach_booking_state_invalid');
            if (!accept) {
                const refused = await step(current, 'refuse', 'coach', coachId, 'refused');
                await told(refused, coachId, 'refused');
                return { ok: true, booking: entryOf(refused, 'coach') };
            }
            if (Date.parse(current.starts_at) <= now()) return fail('coach_booking_past');
            const offered = await directory.availability(row.coach_id);
            if (!offered) return fail('coach_not_found');
            const coachEventId = crypto.randomUUID(), clientEventId = crypto.randomUUID();
            await writeEvent(row.coach_id, coachEventId, sessionProps(current, { title: text(title, COACH_LIMITS.title),
                calendarId: offered.calendarId, timezone: offered.coaching.timezone, role: 'coach', place: offered.coaching.place }));
            await writeEvent(row.client_id, clientEventId, sessionProps(current, { title: current.title, calendarId: current.client_calendar_id,
                timezone: current.client_timezone, role: 'client', place: offered.coaching.place }));
            const accepted = await step(current, 'accept', 'coach', coachId, 'accepted', { coach_event_id: coachEventId, client_event_id: clientEventId });
            await told(accepted, coachId, 'accepted');
            return { ok: true, booking: entryOf(accepted, 'coach') };
        });
    };

    // Either side cancels, within the coach's rules; an accepted session's two events are cancelled with it.
    const cancel = async (userId, { bookingId }) => {
        const row = await booking(bookingId);
        const role = row?.coach_id === String(userId) ? 'coach' : row?.client_id === String(userId) ? 'client' : '';
        if (!role) return fail('coach_booking_not_found');
        return serial(row.coach_id, async () => {
            const current = await booking(bookingId);
            const refusal = coachCancelRefusal({ booking: current, role, now: now() });
            if (refusal) return fail(refusal);
            for (const [ownerId, eventId, side] of [[current.coach_id, current.coach_event_id, 'coach'], [current.client_id, current.client_event_id, 'client']]) {
                if (eventId) await writeEvent(ownerId, eventId, { status: 'cancelled', updated_iso: new Date(now()).toISOString(),
                    booking: JSON.stringify({ booking_id: current.booking_id, role: side, state: 'cancelled' }) });
            }
            const cancelled = await step(current, 'cancel', role, userId, 'cancelled');
            await told(cancelled, userId, 'cancelled');
            return { ok: true, booking: entryOf(cancelled, role) };
        });
    };

    // The bookings of one side: a coach's requests and sessions (`coach`), a client's own (`client`), the coming ones first.
    const list = async (userId, { side = 'client' } = {}) => {
        const column = side === 'coach' ? 'coach_id' : 'client_id';
        const rows = await query('all', `SELECT * FROM coach_bookings WHERE ${column} = ? ORDER BY (ends_at < ?), starts_at LIMIT 200`,
            [String(userId), new Date(now()).toISOString()]) || [];
        return { ok: true, items: rows.map(row => entryOf(row, side === 'coach' ? 'coach' : 'client')) };
    };
    return { request, answer, cancel, list };
}
