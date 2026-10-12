import { test, expect, vi, afterEach } from 'vitest';
import { createCalendarService } from '../../atome/src/squirrel/calendar/service.js';
import { createCalendarApiSource } from '../../atome/src/squirrel/calendar/calendar_api_source.js';
import { parseCalendarData } from '../../atome/src/squirrel/calendar/icalendar.js';
import { CalendarAPI } from '../../eVe/intuition/tools/calendar_api.js';
import { eventCache, alarmTimers } from '../../eVe/intuition/tools/calendar_engine_state.js';

afterEach(() => { eventCache.clear(); for (const timers of alarmTimers.values()) timers.forEach(clearTimeout); alarmTimers.clear(); delete globalThis.window; });
const reference = new Date('2026-10-11T12:00:00Z');
const serviceFor = items => createCalendarService({ now: () => reference,
    primarySource: { source_id: 'canonical', role: 'primary', writable: true, listEvents: async () => ({ ok: true, items }) } });
const event = (id, start, end = start) => ({ id, title: id, start: new Date(start), end: new Date(end), alarms: [] });

test('next filters past, ongoing, cancelled and completed items before limiting and orders future dates', async () => {
    const source = [event('past', '2026-10-10T10:00:00Z'), event('ongoing', '2026-10-11T11:00:00Z', '2026-10-11T13:00:00Z'),
        event('starting', reference.toISOString()), event('later', '2026-10-15T09:00:00Z'), event('first', '2026-10-12T09:00:00Z'),
        { ...event('cancelled', '2026-10-12T08:00:00Z'), status: 'cancelled' },
        { ...event('done', '2026-10-12T07:00:00Z'), kind: 'todo', status: 'done' }];
    expect((await serviceFor(source).calendarNext({ limit: 1 })).items.map(item => item.id)).toEqual(['first']);
    expect((await serviceFor(source).calendarNext({ limit: 10 })).items.map(item => item.id)).toEqual(['first', 'later']);
    expect((await serviceFor([event('distant', '2035-01-01T09:00:00Z')]).calendarNext({ limit: 10 })).items[0].id).toBe('distant');
});

test('next expands recurring masters, suppresses cancellations and replacements, and retains canonical identity', async () => {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:series', 'SUMMARY:Series',
        'DTSTART:20261001T090000Z', 'DTEND:20261001T100000Z', 'RRULE:FREQ=DAILY;COUNT=30', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:series', 'RECURRENCE-ID:20261012T090000Z', 'STATUS:CANCELLED', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:series', 'SUMMARY:Moved', 'RECURRENCE-ID:20261013T090000Z',
        'DTSTART:20261013T150000Z', 'DTEND:20261013T160000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const events = parseCalendarData(ics).map((item, index) => ({ ...item, id: `canonical-${index}`, calendarId: 'private' }));
    const result = await serviceFor(events).calendarNext({ limit: 3 });
    expect(result.items.map(item => item.start.toISOString())).toEqual(['2026-10-13T15:00:00.000Z', '2026-10-14T09:00:00.000Z', '2026-10-15T09:00:00.000Z']);
    expect(result.items.map(item => item.id)).toEqual(['canonical-2', 'canonical-0', 'canonical-0']);
    expect(result.items.every(item => item.seriesId === 'canonical-0')).toBe(true);
    expect(new Set(result.items.map(item => item.occurrenceId)).size).toBe(3);
    expect((await serviceFor(events.filter(item => item.id !== 'canonical-0')).calendarNext({ limit: 3 })).items).toEqual([]);
});

test('upcoming recurrences respect timezone and daylight-saving changes', async () => {
    const items = parseCalendarData(['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:paris', 'SUMMARY:Paris',
        'DTSTART;TZID=Europe/Paris:20261024T090000', 'DTEND;TZID=Europe/Paris:20261024T100000',
        'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')).map(item => ({ ...item, id: 'paris', calendarId: 'personal' }));
    const result = await serviceFor(items).calendarNext({ reference: new Date('2026-10-24T00:00:00Z'), limit: 3 });
    expect(result.items.map(item => item.start.toISOString())).toEqual(['2026-10-24T07:00:00.000Z', '2026-10-25T08:00:00.000Z', '2026-10-26T08:00:00.000Z']);
});

test('a canonical source read error stays an error through search and next', async () => {
    const source = createCalendarApiSource({ apiLoader: async () => ({ listEvents: async () => ({ ok: false, error: 'restoration_not_ready' }) }) });
    const service = createCalendarService({ primarySource: source });
    expect(await service.calendarNext({ limit: 10 })).toMatchObject({ ok: false, error: 'restoration_not_ready' });
    expect(await service.calendarSearch('')).toMatchObject({ ok: false, error: 'restoration_not_ready' });
});

test('Calendar reads more than 10000 records in complete 1000-row pages without a duplicate project scan', async () => {
    const rows = Array.from({ length: 11005 }, (_, index) => ({ atome_id: `event-${index}`, type: 'calendar_event',
        properties: { title: `Event ${index}`, start: '2026-10-20T09:00:00Z', alarms: [] } }));
    const read = vi.fn(async (project, { offset, limit }) => rows.slice(offset, offset + limit));
    globalThis.window = { Atome: { listStateCurrent: read } };
    const result = await CalendarAPI.listEvents({ projectId: 'project' });
    expect(result.ok).toBe(true); expect(result.items).toHaveLength(11005);
    expect(read).toHaveBeenCalledTimes(12);
    expect(read.mock.calls.every(([project, options]) => project === null && options.pageSize === 1000 && options.limit === 1000)).toBe(true);
    expect((await CalendarAPI.listEvents()).items.map(item => item.id)).toEqual(result.items.map(item => item.id));
}, 15000);

test('materialized native instances sharing an exchange uid retain their own writable identity', async () => {
    const events = [event('native-first', '2026-10-12T09:00:00Z'), event('native-second', '2026-10-13T09:00:00Z')]
        .map(item => ({ ...item, calendarId: 'native', exchange_uid: 'shared-uid' }));
    const result = await serviceFor(events).calendarNext({ limit: 10 });
    expect(result.items.map(item => item.seriesId)).toEqual(['native-first', 'native-second']);
});

test('a completed recurring todo exception still suppresses its original upcoming slot', async () => {
    const [master] = parseCalendarData(['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:todo-series', 'SUMMARY:Task',
        'DTSTART:20261011T090000Z', 'DTEND:20261011T100000Z', 'RRULE:FREQ=DAILY;COUNT=4', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
    const source = [{ ...master, id: 'master', kind: 'todo', calendarId: 'private' },
        { id: 'done', exchange_uid: master.exchange_uid, recurrence_id: '20261012T090000Z', calendarId: 'private', kind: 'todo', status: 'done', start: new Date('2026-10-12T09:00:00Z') }];
    const result = await serviceFor(source).calendarNext({ limit: 2 });
    expect(result.items.map(item => item.start.toISOString())).toEqual(['2026-10-13T09:00:00.000Z', '2026-10-14T09:00:00.000Z']);
});

test('a late Calendar account read cannot hydrate the next account cache', async () => {
    let finish; const wait = new Promise(resolve => { finish = resolve; });
    globalThis.window = { Atome: { listStateCurrent: () => wait } };
    const result = CalendarAPI.listEvents();
    globalThis.window = { Atome: {} };
    finish([{ atome_id: 'private-old', type: 'calendar_event', properties: { start: '2026-10-20T09:00:00Z' } }]);
    expect(await result).toMatchObject({ ok: false, error: 'calendar_session_changed' });
    expect(eventCache.has('private-old')).toBe(false);
});
