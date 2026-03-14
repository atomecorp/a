import assert from 'node:assert/strict';

import { createIcloudLegacyCalendarConnector, normalizeIcloudLegacyCalendarConnectorConfig } from './icloud_legacy_connector.js';

let initialCalls = 0;
let deltaCalls = 0;

const connector = createIcloudLegacyCalendarConnector({
    auth: {
        email: 'user@icloud.test',
        appPassword: 'calendar-app-password'
    },
    calendar_url: 'https://caldav.icloud.test/user/default/',
    caldavClientFactory: async () => ({
        async fetchInitialCalendar() {
            initialCalls += 1;
            return {
                ok: true,
                cursor: 'calendar_cursor_1',
                items: [
                    {
                        id: 'calendar_connector_1',
                        title: 'Initial connector event',
                        start: '2026-03-13T09:00:00.000Z',
                        end: '2026-03-13T10:00:00.000Z',
                        updatedAt: '2026-03-13T08:00:00.000Z',
                        href: '/calendar_connector_1.ics'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            deltaCalls += 1;
            assert.equal(cursor, 'calendar_cursor_1', 'delta calendar sync should reuse the previous sync cursor');
            return {
                ok: true,
                cursor: 'calendar_cursor_2',
                items: [
                    {
                        id: 'calendar_connector_2',
                        title: 'Delta connector event',
                        start: '2026-03-13T11:00:00.000Z',
                        end: '2026-03-13T12:00:00.000Z',
                        updatedAt: '2026-03-13T10:00:00.000Z',
                        href: '/calendar_connector_2.ics'
                    }
                ],
                removed_hrefs: ['/calendar_connector_1.ics']
            };
        }
    }),
    now: () => new Date('2026-03-13T08:30:00.000Z')
});

const normalized = normalizeIcloudLegacyCalendarConnectorConfig({
    auth: {
        email: 'user@icloud.test',
        appPassword: 'calendar-app-password'
    },
    calendar_url: 'https://caldav.icloud.test/user/default/'
});
assert.equal(normalized.auth.username, 'user@icloud.test', 'calendar connector config should normalize the iCloud username');
assert.equal(normalized.caldav.calendar_url, 'https://caldav.icloud.test/user/default/', 'calendar connector config should normalize the CalDAV calendar URL');

const initial = await connector.fetchInitialCalendar();
assert.equal(initial.ok, true, 'icloud legacy calendar connector should fetch the initial calendar snapshot');
assert.equal(initial.items.length, 1, 'icloud legacy calendar connector should cache initial remote events');
assert.equal(initial.items[0]?.id, 'calendar_connector_1', 'icloud legacy calendar connector should normalize the remote event id');

const listed = await connector.listEvents({ autosync: false });
assert.equal(listed.ok, true, 'icloud legacy calendar connector should list cached remote events');
assert.equal(listed.items[0]?.title, 'Initial connector event', 'icloud legacy calendar connector should expose the cached calendar events');

const delta = await connector.fetchDelta();
assert.equal(delta.ok, true, 'icloud legacy calendar connector should fetch remote delta changes');
assert.equal(delta.cursor, 'calendar_cursor_2', 'icloud legacy calendar connector should expose the updated sync cursor');
assert.equal(delta.items[0]?.id, 'calendar_connector_2', 'icloud legacy calendar connector should replace deleted cache entries on delta sync');

const read = await connector.getEvent('calendar_connector_2');
assert.equal(read.ok, true, 'icloud legacy calendar connector should expose cached remote events by id');
assert.equal(read.event?.title, 'Delta connector event', 'icloud legacy calendar connector should return the cached delta event');

const status = connector.syncStatus();
assert.equal(status.ok, true, 'icloud legacy calendar connector should expose sync status');
assert.equal(status.sync.cursor, 'calendar_cursor_2', 'icloud legacy calendar connector should persist the latest sync cursor');

assert.deepEqual({ initialCalls, deltaCalls }, { initialCalls: 1, deltaCalls: 1 }, 'icloud legacy calendar connector should delegate initial and delta sync to the CalDAV client');

console.log('calendar_icloud_legacy_connector: ok');
