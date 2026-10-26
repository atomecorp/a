// Public events (todo/evenements_publics_2026-10-26.md): the events users declared, shown to everyone
// in the Activité rubrics around their place. The truth is the author's `calendar_event` Atome in their
// vault (its `publication` property); this service only PROJECTS it into the shared base
// (server/public_events_store.js), after every commit that touches it (server/ws_api_commit_effects.js),
// and writes its word back on the Atome (`publication_status`: live, refused with a reason, hidden).
// The base can be rebuilt from the vaults; nothing a client sends is believed without reading the vault.
import { calendarRangeOccurrences } from '../atome/src/squirrel/calendar/icalendar.js';
import { PUBLIC_EVENT_HORIZON_DAYS, PUBLIC_EVENT_REPORT_REASONS, distanceKm, normalizePublication, normalizePublicationStatus,
    publicEventCell, publicEventCellsAround, publicationError } from '../atome/src/shared/public_event_contract.js';

const DAY_MS = 24 * 3600 * 1000;
const PAGE_SIZE = 25;
// A repeated series is projected again once less than this is left of its horizon.
const REFRESH_MARGIN_MS = 30 * DAY_MS;
const EVENT_TYPE = 'calendar_event';

const text = (value, max = 500) => String(value == null ? '' : value).trim().slice(0, max);
const parse = (value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
};
const list = value => (Array.isArray(parse(value)) ? parse(value) : []);

// The calendar event as the recurrence owner reads it (atome/src/squirrel/calendar/icalendar.js).
const eventOf = (id, properties) => ({
    id, title: text(properties.title, 200), start: properties.start, end: properties.end || null,
    allDay: properties.all_day === true || properties.all_day === 'true', timezone: properties.timezone ?? '',
    recurrence: parse(properties.recurrence) || null, rdates: list(properties.rdates), exdates: list(properties.exdates),
    icalendar: parse(properties.icalendar) || null, status: text(properties.status, 20) || 'open', alarms: []
});

export function createPublicEvents({ store, guard, vaultRouter, syncRuntime = null, relations = null, findUserName = async () => null,
    broadcast = () => {}, now = () => Date.now() }) {
    const writeStatus = async (ownerId, atomeId, properties, status, reason = null) => {
        const previous = normalizePublicationStatus(properties.publication_status);
        if (previous?.status === status && (previous.reason || null) === reason) return;
        const entry = await vaultRouter.commit(ownerId, { kind: 'set', atome_id: atomeId,
            payload: { props: { publication_status: JSON.stringify({ status, reason, at: new Date(now()).toISOString() }) } },
            actor: { type: 'user', id: ownerId } }, { source: 'public-events' });
        if (entry.inserted) await syncRuntime?.publish?.(entry.event);
    };
    const changed = (cells) => { if (cells.length) broadcast([...new Set(cells)]); };

    const leave = async (atomeId) => {
        const existing = await store.series(atomeId);
        if (!existing) return;
        const payload = parse(existing.payload_json) || {};
        await store.remove(atomeId);
        changed(payload.place ? [publicEventCell(payload.place.lat, payload.place.lon)] : []);
    };

    // After a commit touching `atomeId` (in `ownerId`'s vault): the base follows the Atome.
    const project = async (ownerId, atomeId) => {
        const state = await vaultRouter.getState(ownerId, atomeId).catch(() => null);
        const properties = state?.properties || {};
        const existing = await store.series(atomeId);
        if (!state || String(state.type || '').toLowerCase() !== EVENT_TYPE || properties.__deleted === true) return leave(atomeId);
        const publication = normalizePublication(properties.publication);
        if (!publication || publication.visibility !== 'public') return leave(atomeId);
        const event = eventOf(atomeId, properties);
        if (publicationError(publication, event) || event.status === 'cancelled') {
            await leave(atomeId);
            return writeStatus(ownerId, atomeId, properties, 'refused', 'invalid');
        }
        if (existing?.hidden_at) return writeStatus(ownerId, atomeId, properties, 'hidden', 'reported');
        if (!existing) {
            const refused = await guard.admit(ownerId);
            if (refused) return writeStatus(ownerId, atomeId, properties, 'refused', refused);
        }
        const at = now(), until = at + PUBLIC_EVENT_HORIZON_DAYS * DAY_MS;
        const recurring = !!(event.recurrence || event.rdates.length);
        const { lat, lon } = publication.place, cell = publicEventCell(lat, lon);
        const occurrences = calendarRangeOccurrences([event], { start: new Date(at), end: new Date(until) }, 200)
            .map(occurrence => ({ id: `${atomeId}@${occurrence.start.toISOString()}`, start: occurrence.start.toISOString(),
                end: (occurrence.end || occurrence.start).toISOString(), cell, lat, lon }));
        if (!occurrences.length) {
            await leave(atomeId);
            return writeStatus(ownerId, atomeId, properties, 'refused', 'past');
        }
        const payload = { title: event.title, summary: text(properties.description, 600), allDay: event.allDay, recurring,
            categories: publication.categories, place: publication.place, price: publication.price, poster: publication.poster,
            ticketUrl: publication.ticket_url, url: publication.url };
        await store.put({ eventId: atomeId, authorId: ownerId, authorName: text(await findUserName(ownerId), 80), payload, occurrences,
            projectedUntil: recurring ? new Date(until).toISOString() : null });
        const previous = parse(existing?.payload_json)?.place;
        changed([cell, ...(previous ? [publicEventCell(previous.lat, previous.lon)] : [])]);
        return writeStatus(ownerId, atomeId, properties, 'live', null);
    };

    // The commits of one request: each `calendar_event` with a publication, or already in the base.
    const afterCommit = async (events = []) => {
        for (const event of events) {
            const atomeId = text(event?.atome_id, 200);
            if (!atomeId) continue;
            const props = event?.payload?.props || event?.payload || {};
            const touches = Object.hasOwn(props, 'publication') || await store.series(atomeId);
            if (!touches) continue;
            const ownerId = await vaultRouter.vaultPrincipalForAtome(atomeId, null);
            if (ownerId) await project(String(ownerId), atomeId);
        }
    };

    // The time passing: the dates of repeated series beyond their horizon, the ended occurrences gone.
    const refresh = async () => {
        const at = now();
        await store.purge(at);
        for (const row of await store.stale(at + REFRESH_MARGIN_MS) || []) await project(String(row.author_id), String(row.event_id));
    };

    const priceLabel = (price, language) => (price?.amount
        ? new Intl.NumberFormat(language || 'fr', { style: 'currency', currency: price.currency || 'EUR' }).format(price.amount) : '');

    // `shows-nearby` kind `declared`: the occurrences of `categories` within `radiusKm`, soonest first, a page at a time.
    const nearby = async ({ lat, lon, radiusKm, categories = [], query = '', offset = 0, language = 'fr', viewerId = null }) => {
        await refresh();
        const at = now(), from = { lat, lon }, needle = text(query, 80).toLowerCase();
        const rows = await store.around(publicEventCellsAround(lat, lon, radiusKm), at, 2000) || [];
        const kept = [];
        for (const row of rows) {
            const payload = parse(row.payload_json) || {}, distance = distanceKm(from, Number(row.lat), Number(row.lon));
            if (distance == null || distance > radiusKm) continue;
            if (!categories.some(slug => String(row.categories).includes(`,${slug},`))) continue;
            if (needle && !`${payload.title} ${payload.place?.label} ${payload.place?.city} ${row.author_name}`.toLowerCase().includes(needle)) continue;
            if (viewerId && relations && String(viewerId) !== String(row.author_id) && await relations.blockedEitherWay(viewerId, row.author_id)) continue;
            kept.push({ id: `declared_${row.occurrence_id}`, kind: 'event', declared: true, eventId: row.event_id, authorId: String(row.author_id),
                organizer: text(row.author_name, 80), title: payload.title, summary: payload.summary || '', start: row.start_at, end: row.end_at,
                place: payload.place?.label || '', address: payload.place?.address || '', city: payload.place?.city || '',
                lat: Number(row.lat), lon: Number(row.lon), distanceKm: distance, free: row.free === 1,
                price: priceLabel(payload.price, language), categories: payload.categories || [], image: payload.poster || '',
                url: payload.url || '', ticketUrl: payload.ticketUrl || '' });
        }
        const page = kept.slice(offset, offset + PAGE_SIZE);
        return { entries: page, next: offset + PAGE_SIZE < kept.length ? String(offset + PAGE_SIZE) : '' };
    };

    // A report by an account (never on their own event); three distinct ones hide the event.
    const report = async (viewerId, eventId, reason) => {
        const existing = await store.series(text(eventId, 200));
        if (!existing) return { ok: false, error: 'events_not_found' };
        if (String(existing.author_id) === String(viewerId)) return { ok: false, error: 'events_own_event' };
        const total = await store.report(existing.event_id, String(viewerId), PUBLIC_EVENT_REPORT_REASONS.includes(reason) ? reason : 'other');
        if (total >= guard.limits.reportsToHide && !existing.hidden_at) {
            await store.hide(existing.event_id);
            const state = await vaultRouter.getState(String(existing.author_id), existing.event_id).catch(() => null);
            if (state) await writeStatus(String(existing.author_id), existing.event_id, state.properties || {}, 'hidden', 'reported');
            const place = parse(existing.payload_json)?.place;
            changed(place ? [publicEventCell(place.lat, place.lon)] : []);
        }
        return { ok: true };
    };

    // The `public-events` frame of /ws/api (an account only): `report`.
    const handle = async (message, viewerId) => {
        if (text(message.action, 40) === 'report') return report(viewerId, message.eventId || message.event_id, text(message.reason, 40));
        return { ok: false, error: 'events_action_invalid' };
    };

    return { project, afterCommit, nearby, report, handle, refresh };
}
