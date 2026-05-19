import assert from 'node:assert/strict';

import { createCalendarConnectorContract } from './connector_contract.js';
import { createCalendarService } from './service.js';

const primaryEvents = new Map([
    ['event_shared', {
        id: 'event_shared',
        calendarId: 'default',
        title: 'Primary planning',
        description: 'Source primaire',
        location: 'Paris',
        start: '2026-03-13T09:00:00.000Z',
        end: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T08:00:00.000Z'
    }]
]);

const legacyEvents = new Map([
    ['event_shared', {
        id: 'event_shared',
        calendarId: 'icloud_legacy',
        title: 'Legacy planning',
        description: 'Source legacy',
        location: 'Paris',
        start: '2026-03-13T09:00:00.000Z',
        end: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T08:30:00.000Z'
    }],
    ['event_legacy_only', {
        id: 'event_legacy_only',
        calendarId: 'icloud_legacy',
        title: 'Legacy follow-up',
        description: 'Evenement legacy',
        location: 'Lyon',
        start: '2026-03-13T14:00:00.000Z',
        end: '2026-03-13T15:00:00.000Z',
        updatedAt: '2026-03-13T08:45:00.000Z'
    }]
]);

const createMemorySource = ({
    source_id,
    role,
    writable,
    events
}) => ({
    source_id,
    role,
    writable,
    contract: createCalendarConnectorContract({
        provider: source_id,
        role,
        write_capabilities: writable ? ['calendar_create', 'calendar_update'] : []
    }),
    async listEvents() {
        return {
            ok: true,
            items: Array.from(events.values()).map((entry) => ({ ...entry }))
        };
    },
    async getEvent(eventId) {
        const event = events.get(String(eventId || ''));
        return event ? { ok: true, event: { ...event } } : { ok: false, error: 'calendar_event_not_found' };
    },
    async ensureCalendar(calendarId) {
        return {
            ok: true,
            calendar: { id: calendarId || 'default' }
        };
    },
    async createEvent(input = {}) {
        const created = {
            id: 'event_created_primary',
            calendarId: input.calendarId || 'default',
            title: input.title || '',
            description: input.description || '',
            location: input.location || '',
            start: input.start,
            end: input.end,
            updatedAt: '2026-03-13T11:00:00.000Z'
        };
        events.set(created.id, created);
        return { ok: true, event: { ...created } };
    },
    async updateEvent(eventId, changes = {}) {
        const existing = events.get(String(eventId || ''));
        if (!existing) return { ok: false, error: 'calendar_event_not_found' };
        const updated = {
            ...existing,
            ...changes,
            id: existing.id,
            updatedAt: '2026-03-13T11:05:00.000Z'
        };
        events.set(updated.id, updated);
        return { ok: true, event: { ...updated } };
    }
});

const service = createCalendarService({
    primarySource: createMemorySource({
        source_id: 'tauri_caldav_primary',
        role: 'primary',
        writable: true,
        events: primaryEvents
    }),
    sources: [
        createMemorySource({
            source_id: 'icloud_legacy',
            role: 'legacy',
            writable: false,
            events: legacyEvents
        })
    ],
    now: () => new Date('2026-03-13T08:30:00.000Z')
});

const sources = service.calendarSources();
assert.equal(sources.ok, true, 'calendar service should expose registered sources');
assert.deepEqual(
    sources.items.map((entry) => entry.source_id),
    ['tauri_caldav_primary', 'icloud_legacy'],
    'calendar service should keep the primary and legacy sources in the registry'
);

const synced = await service.syncSources();
assert.equal(synced.ok, true, 'calendar service should sync the unified multi-source view');
assert.equal(synced.items.length, 2, 'calendar service should resolve duplicate events into one visible entry');

const resolvedShared = synced.items.find((entry) => entry.id === 'event_shared');
assert.equal(resolvedShared?.source_id, 'tauri_caldav_primary', 'calendar service should prefer the primary source when conflicts exist');
assert.equal(resolvedShared?.conflict_count, 1, 'calendar service should expose hidden conflicting variants');

const search = await service.calendarSearch('legacy');
assert.equal(search.ok, true, 'calendar service should search the unified calendar view');
assert.equal(search.items.length, 1, 'calendar service should filter search results');
assert.equal(search.items[0]?.id, 'event_legacy_only', 'calendar search should return the matching legacy event');

const today = await service.calendarToday();
assert.equal(today.ok, true, 'calendar service should expose today events');
assert.deepEqual(
    today.items.map((entry) => entry.id),
    ['event_shared', 'event_legacy_only'],
    'calendar today should include today events from all registered sources'
);

const next = await service.calendarNext({ limit: 1 });
assert.equal(next.ok, true, 'calendar service should expose next events');
assert.equal(next.items[0]?.id, 'event_shared', 'calendar next should return the earliest upcoming event');

const created = await service.calendarCreate({
    title: 'Primary created event',
    start: '2026-03-13T11:00:00.000Z',
    end: '2026-03-13T12:00:00.000Z'
});
assert.equal(created.ok, true, 'calendar service should create events on the writable primary source');
assert.equal(created.source_id, 'tauri_caldav_primary', 'calendar create should route to the primary source by default');

const updated = await service.calendarUpdate('event_created_primary', {
    title: 'Primary created event updated'
});
assert.equal(updated.ok, true, 'calendar service should update events on the owning source');
assert.equal(updated.event?.title, 'Primary created event updated', 'calendar update should persist changes through the source');

const readOnlyUpdate = await service.calendarUpdate('event_legacy_only', {
    title: 'Should fail'
});
assert.equal(readOnlyUpdate.ok, false, 'calendar service should reject updates on read-only sources');
assert.equal(readOnlyUpdate.error, 'calendar_source_read_only', 'calendar service should expose the read-only source error');

console.log('calendar_service: ok');
