import assert from 'node:assert/strict';

import { CALENDAR_V1_ARCHITECTURE_DECISION } from './connector_contract.js';
import { createCalendarApiSource } from './calendar_api_source.js';

const previousCalendarApi = globalThis.CalendarAPI;

globalThis.CalendarAPI = {
    async listEvents() {
        return {
            ok: true,
            items: [{
                id: 'calendar_api_event_1',
                calendarId: 'default',
                title: 'API source event',
                start: '2026-03-13T09:00:00.000Z',
                end: '2026-03-13T10:00:00.000Z',
                updatedAt: '2026-03-13T08:30:00.000Z'
            }]
        };
    },
    async getEvent(eventId) {
        return {
            id: eventId,
            calendarId: 'default',
            title: 'API source event',
            start: '2026-03-13T09:00:00.000Z',
            end: '2026-03-13T10:00:00.000Z'
        };
    },
    async ensureCalendar(calendarId) {
        return {
            id: calendarId,
            name: 'Default calendar'
        };
    },
    async createEvent(input = {}) {
        return {
            ok: true,
            event: {
                id: 'calendar_api_created_1',
                calendarId: input.calendarId || 'default',
                title: input.title,
                start: input.start,
                end: input.end,
                updatedAt: '2026-03-13T09:05:00.000Z'
            }
        };
    },
    async updateEvent(eventId, changes = {}) {
        return {
            ok: true,
            event: {
                id: eventId,
                calendarId: 'default',
                title: changes.title || 'Updated title',
                start: '2026-03-13T09:00:00.000Z',
                end: '2026-03-13T10:00:00.000Z',
                updatedAt: '2026-03-13T09:10:00.000Z'
            }
        };
    }
};

const source = createCalendarApiSource();

assert.equal(
    CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.id,
    'tauri_caldav_primary',
    'calendar architecture decision should keep the existing Tauri calendar as the primary write source'
);

const listed = await source.listEvents();
assert.equal(listed.ok, true, 'calendar API source should list events through CalendarAPI');
assert.equal(listed.items[0]?.title, 'API source event', 'calendar API source should normalize listed events');

const read = await source.getEvent('calendar_api_event_1');
assert.equal(read.ok, true, 'calendar API source should read one event through CalendarAPI');
assert.equal(read.event?.id, 'calendar_api_event_1', 'calendar API source should normalize read events');

const ensured = await source.ensureCalendar('default');
assert.equal(ensured.ok, true, 'calendar API source should expose ensureCalendar when the underlying CalendarAPI supports it');
assert.equal(ensured.calendar?.id, 'default', 'calendar API source should return the ensured calendar id');

const created = await source.createEvent({
    title: 'Created event',
    start: '2026-03-13T11:00:00.000Z',
    end: '2026-03-13T12:00:00.000Z'
});
assert.equal(created.ok, true, 'calendar API source should create events through CalendarAPI');
assert.equal(created.event?.id, 'calendar_api_created_1', 'calendar API source should normalize created events');

const updated = await source.updateEvent('calendar_api_created_1', {
    title: 'Created event updated'
});
assert.equal(updated.ok, true, 'calendar API source should update events through CalendarAPI');
assert.equal(updated.event?.title, 'Created event updated', 'calendar API source should normalize updated events');

if (previousCalendarApi === undefined) {
    delete globalThis.CalendarAPI;
} else {
    globalThis.CalendarAPI = previousCalendarApi;
}

console.log('calendar_api_source: ok');
