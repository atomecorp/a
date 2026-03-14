import assert from 'node:assert/strict';

import { createGlobalCalendarApi } from './bootstrap.js';

const previousCalendarApi = globalThis.CalendarAPI;
const calendarStore = new Map();

globalThis.CalendarAPI = {
    async listEvents() {
        return { ok: true, items: Array.from(calendarStore.values()).map((entry) => ({ ...entry })) };
    },
    async getEvent(eventId) {
        const event = calendarStore.get(String(eventId || ''));
        return event ? { ...event } : null;
    },
    async ensureCalendar(calendarId) {
        return { id: calendarId };
    },
    async createEvent(input = {}) {
        const event = {
            id: 'calendar_bootstrap_created_1',
            calendarId: input.calendarId || 'default',
            title: input.title || '',
            start: input.start,
            end: input.end,
            updatedAt: '2026-03-13T08:00:00.000Z'
        };
        calendarStore.set(event.id, event);
        return { ok: true, event: { ...event } };
    },
    async updateEvent(eventId, changes = {}) {
        const current = calendarStore.get(String(eventId || ''));
        const event = {
            ...(current || {}),
            id: String(eventId || ''),
            calendarId: current?.calendarId || 'default',
            title: changes.title || current?.title || 'Bootstrap event',
            start: changes.start || current?.start || '2026-03-13T09:00:00.000Z',
            end: changes.end || current?.end || '2026-03-13T10:00:00.000Z',
            updatedAt: '2026-03-13T08:05:00.000Z'
        };
        calendarStore.set(event.id, event);
        return { ok: true, event: { ...event } };
    }
};

const env = {
    open_calendar_panel: async () => {
        env.__panel_opened = true;
    },
    close_calendar_panel: () => {
        env.__panel_closed = true;
    }
};

const api = createGlobalCalendarApi({ env });

assert.equal(env.Squirrel.calendar, api, 'calendar bootstrap should expose a global Squirrel calendar API');
assert.equal(env.atome.calendar, api, 'calendar bootstrap should expose a global atome calendar API');
assert.equal(env.atome.tools.calendar, api, 'calendar bootstrap should expose calendar under atome.tools');

const created = await api.create({
    title: 'Bootstrap event',
    start: '2026-03-13T09:00:00.000Z',
    end: '2026-03-13T10:00:00.000Z'
});
assert.equal(created.ok, true, 'calendar bootstrap should expose unified create through the shared singleton');

const today = await api.today();
assert.equal(today.ok, true, 'calendar bootstrap should expose today events');
assert.equal(today.items[0]?.id, created.event?.id, 'calendar bootstrap should query the shared singleton service');

const opened = await api.openPanel();
assert.equal(opened.ok, true, 'calendar bootstrap should graft onto the existing calendar panel entrypoint');
assert.equal(env.__panel_opened, true, 'calendar bootstrap should call the existing open_calendar_panel function');

const closed = api.closePanel();
assert.equal(closed.ok, true, 'calendar bootstrap should graft onto the existing calendar panel close entrypoint');
assert.equal(env.__panel_closed, true, 'calendar bootstrap should call the existing close_calendar_panel function');

if (previousCalendarApi === undefined) {
    delete globalThis.CalendarAPI;
} else {
    globalThis.CalendarAPI = previousCalendarApi;
}

console.log('calendar_bootstrap: ok');
