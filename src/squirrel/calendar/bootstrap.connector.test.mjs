import assert from 'node:assert/strict';

import { createGlobalCalendarApi } from './bootstrap.js';
import { createGlobalSecurityApi } from '../security/bootstrap.js';

const previousCalendarApi = globalThis.CalendarAPI;

globalThis.CalendarAPI = {
    async listEvents() {
        return { ok: true, items: [] };
    },
    async getEvent() {
        return null;
    },
    async ensureCalendar(calendarId) {
        return { id: calendarId || 'default' };
    },
    async createEvent(input = {}) {
        return {
            ok: true,
            event: {
                id: 'calendar_bootstrap_primary_1',
                calendarId: input.calendarId || 'default',
                title: input.title || '',
                start: input.start,
                end: input.end,
                updatedAt: '2026-03-13T08:00:00.000Z'
            }
        };
    },
    async updateEvent(eventId, changes = {}) {
        return {
            ok: true,
            event: {
                id: eventId,
                calendarId: 'default',
                title: changes.title || '',
                start: changes.start || null,
                end: changes.end || null,
                updatedAt: '2026-03-13T08:05:00.000Z'
            }
        };
    }
};

const env = {};
const security = createGlobalSecurityApi({ env });
security.configureVaultSecret('calendar-bootstrap-secret');
await security.storeToken('icloud_calendar_bootstrap_auth', {
    email: 'user@icloud.test',
    appPassword: 'calendar-password'
}, {
    provider: 'icloud_caldav_legacy'
});
const api = createGlobalCalendarApi({ env });

let initialCalls = 0;
let deltaCalls = 0;

const configured = await api.configureIcloudLegacyConnector({
    auth_ref: 'icloud_calendar_bootstrap_auth',
    calendar_url: 'https://caldav.icloud.test/user/default/',
    caldavClientFactory: async () => ({
        async fetchInitialCalendar() {
            initialCalls += 1;
            return {
                ok: true,
                cursor: 'bootstrap_calendar_cursor_1',
                items: [
                    {
                        id: 'calendar_bootstrap_legacy_1',
                        title: 'Bootstrap legacy event',
                        start: '2026-03-13T09:00:00.000Z',
                        end: '2026-03-13T10:00:00.000Z',
                        updatedAt: '2026-03-13T08:00:00.000Z',
                        href: '/calendar_bootstrap_legacy_1.ics'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            deltaCalls += 1;
            assert.equal(cursor, 'bootstrap_calendar_cursor_1', 'calendar bootstrap should reuse the stored legacy sync cursor');
            return {
                ok: true,
                cursor: 'bootstrap_calendar_cursor_2',
                items: [
                    {
                        id: 'calendar_bootstrap_legacy_2',
                        title: 'Bootstrap legacy delta',
                        start: '2026-03-13T11:00:00.000Z',
                        end: '2026-03-13T12:00:00.000Z',
                        updatedAt: '2026-03-13T10:00:00.000Z',
                        href: '/calendar_bootstrap_legacy_2.ics'
                    }
                ]
            };
        }
    })
});

assert.equal(configured.ok, true, 'calendar bootstrap should configure the iCloud legacy connector');
assert.equal(configured.source, 'icloud_legacy', 'calendar bootstrap should register the legacy source with the canonical source id');

const initial = await api.syncInitial({
    source_id: 'icloud_legacy'
});
assert.equal(initial.ok, true, 'calendar bootstrap should expose initial sync for the legacy calendar connector');

const delta = await api.syncIncremental({
    source_id: 'icloud_legacy'
});
assert.equal(delta.ok, true, 'calendar bootstrap should expose incremental sync for the legacy calendar connector');

const sources = api.sources();
assert.equal(sources.items.some((entry) => entry.source_id === 'icloud_legacy'), true, 'calendar bootstrap should surface the configured legacy source');
assert.equal(api.syncStatus().sources.find((entry) => entry.source_id === 'icloud_legacy')?.sync?.sync?.cursor, 'bootstrap_calendar_cursor_2', 'calendar bootstrap should expose the connector sync cursor');

assert.deepEqual({ initialCalls, deltaCalls }, { initialCalls: 1, deltaCalls: 1 }, 'calendar bootstrap should delegate initial and delta sync to the configured legacy connector');

if (previousCalendarApi === undefined) {
    delete globalThis.CalendarAPI;
} else {
    globalThis.CalendarAPI = previousCalendarApi;
}

console.log('calendar_bootstrap_connector: ok');
