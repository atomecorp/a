import assert from 'node:assert/strict';

import { createIcloudLegacyCalendarConnector } from './icloud_legacy_connector.js';
import { createCalendarService } from './service.js';

const primaryEvents = new Map();

const primarySource = {
    source_id: 'tauri_caldav_primary',
    role: 'primary',
    writable: true,
    contract: {
        provider: 'tauri_caldav_primary',
        protocol: 'caldav',
        role: 'primary',
        read_capabilities: ['calendar_today', 'calendar_next', 'calendar_search', 'calendar_sources'],
        write_capabilities: ['calendar_create', 'calendar_update']
    },
    async listEvents() {
        return {
            ok: true,
            items: Array.from(primaryEvents.values()).map((entry) => ({ ...entry }))
        };
    },
    async ensureCalendar(calendarId) {
        return {
            ok: true,
            calendar: { id: calendarId || 'default' }
        };
    },
    async createEvent(input = {}) {
        const event = {
            id: 'calendar_primary_1',
            calendarId: input.calendarId || 'default',
            title: input.title || '',
            start: input.start,
            end: input.end,
            updatedAt: '2026-03-13T08:00:00.000Z'
        };
        primaryEvents.set(event.id, event);
        return { ok: true, event: { ...event } };
    },
    async updateEvent(eventId, changes = {}) {
        const current = primaryEvents.get(String(eventId || ''));
        const updated = {
            ...(current || {}),
            id: String(eventId || ''),
            title: changes.title || current?.title || '',
            start: changes.start || current?.start || null,
            end: changes.end || current?.end || null,
            updatedAt: '2026-03-13T08:05:00.000Z'
        };
        primaryEvents.set(updated.id, updated);
        return { ok: true, event: { ...updated } };
    }
};

let initialCalls = 0;
let deltaCalls = 0;

const legacyConnector = createIcloudLegacyCalendarConnector({
    calendar_url: 'https://caldav.icloud.test/user/default/',
    caldavClientFactory: async () => ({
        async fetchInitialCalendar() {
            initialCalls += 1;
            return {
                ok: true,
                cursor: 'legacy_cursor_1',
                items: [
                    {
                        id: 'calendar_legacy_1',
                        title: 'Legacy initial',
                        start: '2026-03-13T09:00:00.000Z',
                        end: '2026-03-13T10:00:00.000Z',
                        updatedAt: '2026-03-13T08:00:00.000Z',
                        href: '/calendar_legacy_1.ics'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            deltaCalls += 1;
            assert.equal(cursor, 'legacy_cursor_1', 'calendar service should reuse the stored legacy sync cursor');
            return {
                ok: true,
                cursor: 'legacy_cursor_2',
                items: [
                    {
                        id: 'calendar_legacy_2',
                        title: 'Legacy delta',
                        start: '2026-03-13T11:00:00.000Z',
                        end: '2026-03-13T12:00:00.000Z',
                        updatedAt: '2026-03-13T10:00:00.000Z',
                        href: '/calendar_legacy_2.ics'
                    }
                ],
                removed_hrefs: ['/calendar_legacy_1.ics']
            };
        }
    }),
    now: () => new Date('2026-03-13T08:30:00.000Z')
});

const service = createCalendarService({
    primarySource,
    sources: [legacyConnector],
    now: () => new Date('2026-03-13T08:30:00.000Z')
});

const initial = await service.syncInitial({
    source_id: 'icloud_legacy'
});
assert.equal(initial.ok, true, 'calendar service should expose initial sync for legacy calendar sources');
assert.equal(initial.sync[0]?.cursor, 'legacy_cursor_1', 'calendar service should expose the initial legacy sync cursor');

const firstSearch = await service.calendarSearch('legacy');
assert.equal(firstSearch.ok, true, 'calendar service should search synced legacy events');
assert.equal(firstSearch.items[0]?.id, 'calendar_legacy_1', 'calendar service should expose the initial legacy snapshot');

const delta = await service.syncIncremental({
    source_id: 'icloud_legacy'
});
assert.equal(delta.ok, true, 'calendar service should expose incremental sync for legacy calendar sources');
assert.equal(delta.sync[0]?.cursor, 'legacy_cursor_2', 'calendar service should expose the updated legacy sync cursor');

const secondSearch = await service.calendarSearch('delta');
assert.equal(secondSearch.ok, true, 'calendar service should search incrementally synced legacy events');
assert.equal(secondSearch.items[0]?.id, 'calendar_legacy_2', 'calendar service should expose the latest synced legacy event');

const syncStatus = service.syncStatus();
assert.equal(syncStatus.ok, true, 'calendar service should expose per-source sync status');
assert.equal(syncStatus.sources[1]?.sync?.sync?.cursor, 'legacy_cursor_2', 'calendar service should surface the latest legacy sync cursor');

assert.deepEqual({ initialCalls, deltaCalls }, { initialCalls: 1, deltaCalls: 1 }, 'calendar service should delegate initial and delta sync to the configured legacy connector');

console.log('calendar_service_connector_integration: ok');
