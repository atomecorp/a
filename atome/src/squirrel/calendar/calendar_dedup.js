// One calendar imported again from another device, or after a reinstall, came back
// as a new calendar holding a copy of every event (an iPhone account held 26 000
// events, half of them copies, and twelve « Sylvain » calendars). The copies are
// merged into one: per calendar name (the birthdays calendars whatever their
// language), the calendar holding the most events is kept; per kept calendar, one
// event per title and time. The import correspondences are pointed at what is
// kept, so the next import updates it instead of bringing a copy back.
import { IMPORT_ORIGIN_TYPE, importRecordDeleted, importRecordId, importRecordProps } from '../shared/canonical_import.js';

const text = value => String(value ?? '').trim();
const BIRTHDAY = 'birthday';

// The device's birthdays calendar, named in its language (a calendar record has no kind of its own).
const BIRTHDAY_NAMES = new Set(['birthdays', 'anniversaires', 'geburtstage', 'cumpleaños', 'compleanni', 'aniversários', 'verjaardagen']);

// The identity under which a calendar is merged; also the import's identity key.
export const calendarIdentity = (props) => {
    const name = text(props.name || props.title).toLowerCase();
    return text(props.calendar_source_type) === BIRTHDAY || BIRTHDAY_NAMES.has(name) ? 'calendar:birthday' : `calendar:name:${name}`;
};

// A birthday is told in the device's language (« Léa (35 ans) », « Léa’s 35th Birthday »): its person names it.
const birthdayPerson = title => text(title).replace(/\s*\(\d+\s*ans?\)$/i, '')
    .replace(/[’']s(\s+\d+(st|nd|rd|th))?\s+birthday$/i, '').trim().toLowerCase();

export const calendarEventIdentity = props => {
    if (!props.calendar_id || !props.start) return '';
    if (text(props.calendar_source_type) === BIRTHDAY) return `event:${props.calendar_id}|birthday:${birthdayPerson(props.title)}|${props.start}`;
    return `event:${props.calendar_id}|${text(props.title)}|${props.start}|${props.end || ''}|${props.all_day === true}`;
};

const live = rows => rows.filter(row => !importRecordDeleted(row));
const byIdOrder = (a, b) => String(importRecordId(a)).localeCompare(String(importRecordId(b)));

export function planCalendarDedup({ calendars = [], events = [], origins = [] } = {}) {
    const keptCalendars = live(calendars), keptEvents = live(events);
    const eventsOf = new Map();
    for (const row of keptEvents) {
        const id = text(importRecordProps(row).calendar_id);
        eventsOf.set(id, [...(eventsOf.get(id) || []), row]);
    }
    // A calendar's kind is told by its own record, else by those of its events that tell one
    // (older imports did not).
    const kindOf = row => {
        const own = text(importRecordProps(row).calendar_source_type);
        if (own) return own;
        if (calendarIdentity(importRecordProps(row)) === 'calendar:birthday') return BIRTHDAY;
        const told = (eventsOf.get(importRecordId(row)) || []).map(event => text(importRecordProps(event).calendar_source_type)).filter(Boolean);
        return told.length && told.filter(kind => kind === BIRTHDAY).length * 2 > told.length ? BIRTHDAY : '';
    };
    const groups = new Map();
    const kinds = new Map(keptCalendars.map(row => [importRecordId(row), kindOf(row)]));
    for (const row of keptCalendars) {
        const key = calendarIdentity({ ...importRecordProps(row), calendar_source_type: kinds.get(importRecordId(row)) });
        groups.set(key, [...(groups.get(key) || []), row]);
    }
    const calendarInto = new Map();
    for (const rows of groups.values()) {
        const [kept, ...copies] = rows.slice().sort((a, b) => (eventsOf.get(importRecordId(b))?.length || 0)
            - (eventsOf.get(importRecordId(a))?.length || 0) || byIdOrder(a, b));
        for (const copy of copies) calendarInto.set(importRecordId(copy), importRecordId(kept));
    }
    const calendarOf = id => calendarInto.get(id) || id;
    const kept = new Map(), eventInto = new Map(), move = [];
    // The event already in the kept calendar is kept first: fewer moves.
    const ordered = keptEvents.slice().sort((a, b) => Number(calendarInto.has(text(importRecordProps(a).calendar_id)))
        - Number(calendarInto.has(text(importRecordProps(b).calendar_id))) || byIdOrder(a, b));
    for (const row of ordered) {
        const props = importRecordProps(row), id = importRecordId(row), calendar = calendarOf(text(props.calendar_id));
        const key = calendarEventIdentity({ ...props, calendar_id: calendar, calendar_source_type: kinds.get(calendar) || props.calendar_source_type });
        const into = key && kept.get(key);
        if (into) { eventInto.set(id, into); continue; }
        if (key) kept.set(key, id);
        if (calendar !== text(props.calendar_id)) move.push({ atome_id: id, props: { calendar_id: calendar } });
    }
    const into = id => eventInto.get(id) || calendarInto.get(id);
    const repoint = live(origins).filter(row => into(text(importRecordProps(row).canonical_id)))
        .map(row => ({ atome_id: importRecordId(row), props: { canonical_id: into(text(importRecordProps(row).canonical_id)) } }));
    return { deleteEvents: [...eventInto.keys()], deleteCalendars: [...calendarInto.keys()], move, repoint };
}

const readAll = async (api, atomeType, owner) => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
        const page = await api.listStateCurrent(null, { atomeType, limit: 1000, pageSize: 1000, offset });
        if (!Array.isArray(page)) throw new Error('calendar_dedup_read_invalid');
        rows.push(...page.filter(row => !owner || !row.owner_id || String(row.owner_id) === owner));
        if (page.length < 1000) break;
    }
    return rows;
};

// `dryRun`: the plan's counts, nothing written. `onProgress(done, total)`.
export async function runCalendarDedup({ api = globalThis.window?.Atome || globalThis.Atome, owner = '',
    dryRun = false, batchSize = 200, onProgress = null } = {}) {
    if (!api?.listStateCurrent || !api?.commitBatch) throw new Error('calendar_dedup_api_unavailable');
    const [calendars, events, origins] = await Promise.all(['calendar', 'calendar_event', IMPORT_ORIGIN_TYPE]
        .map(type => readAll(api, type, owner)));
    const plan = planCalendarDedup({ calendars, events, origins });
    const counts = { events: events.length, calendars: calendars.length, delete_events: plan.deleteEvents.length,
        delete_calendars: plan.deleteCalendars.length, moved: plan.move.length, repointed: plan.repoint.length };
    if (dryRun) return { ok: true, dry_run: true, ...counts };
    // Correspondences first: an interrupted pass never leaves one pointing at a deleted copy.
    const write = (kind, type) => entry => ({ kind, type, scope: 'global', ...(owner ? { actor: owner } : {}),
        ...(typeof entry === 'string' ? { atome_id: entry, props: {} } : entry) });
    const writes = [...plan.repoint.map(write('set', IMPORT_ORIGIN_TYPE)),
        ...plan.move.map(write('set', 'calendar_event')), ...plan.deleteEvents.map(write('delete', 'calendar_event')),
        ...plan.deleteCalendars.map(write('delete', 'calendar'))];
    for (let at = 0; at < writes.length; at += batchSize) {
        const result = await api.commitBatch(writes.slice(at, at + batchSize), { refreshState: false });
        if (result?.ok !== true) throw new Error(result?.error || 'calendar_dedup_write_failed');
        onProgress?.(Math.min(at + batchSize, writes.length), writes.length);
    }
    return { ok: true, ...counts };
}
