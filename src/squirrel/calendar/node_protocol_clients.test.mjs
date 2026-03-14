import assert from 'node:assert/strict';

import { createNodeCaldavClient } from './node_protocol_clients.js';

const requests = [];

const responses = [
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:sync-token>sync-token-1</d:sync-token>
  <d:response>
    <d:href>/calendars/user/default/event-1.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-1"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-1
SUMMARY:Initial event
DESCRIPTION:Initial description
LOCATION:Paris
DTSTART:20260313T090000Z
DTEND:20260313T100000Z
LAST-MODIFIED:20260313T080000Z
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:sync-token>sync-token-2</d:sync-token>
  <d:response>
    <d:href>/calendars/user/default/event-2.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-2"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-2
SUMMARY:Delta event
DTSTART:20260313T110000Z
DTEND:20260313T120000Z
LAST-MODIFIED:20260313T100000Z
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/calendars/user/default/event-1.ics</d:href>
    <d:status>HTTP/1.1 404 Not Found</d:status>
  </d:response>
</d:multistatus>`
];

const fetchImpl = async (url, init = {}) => {
    requests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: String(init.body || '')
    });
    const body = responses.shift() || '';
    return {
        ok: true,
        status: 207,
        async text() {
            return body;
        }
    };
};

const client = createNodeCaldavClient({
    auth: {
        username: 'user@icloud.test',
        password: 'app-password'
    },
    caldav: {
        calendar_url: 'https://caldav.icloud.test/user/default/'
    },
    fetchImpl
});

const initial = await client.fetchInitialCalendar({
    start: new Date('2026-03-01T00:00:00.000Z'),
    end: new Date('2026-03-31T23:59:59.999Z')
});
assert.equal(initial.ok, true, 'node CalDAV client should fetch the initial calendar snapshot');
assert.equal(initial.cursor, 'sync-token-1', 'node CalDAV client should expose the sync token from the multistatus response');
assert.equal(initial.items[0]?.id, 'event-1', 'node CalDAV client should parse VCALENDAR/VEVENT payloads');
assert.equal(initial.items[0]?.title, 'Initial event', 'node CalDAV client should normalize VEVENT summaries');

const delta = await client.fetchDelta({
    cursor: 'sync-token-1'
});
assert.equal(delta.ok, true, 'node CalDAV client should fetch delta changes through sync-collection');
assert.equal(delta.cursor, 'sync-token-2', 'node CalDAV client should refresh the sync token after delta sync');
assert.equal(delta.items[0]?.id, 'event-2', 'node CalDAV client should parse delta events');
assert.deepEqual(
    delta.removed_hrefs,
    ['/calendars/user/default/event-1.ics'],
    'node CalDAV client should surface deleted calendar resources from sync-collection'
);

assert.equal(requests.length, 2, 'node CalDAV client should issue one request for the initial snapshot and one for delta');
assert.match(requests[0]?.headers?.Authorization || '', /^Basic /, 'node CalDAV client should send basic auth when credentials are configured');
assert.match(requests[0]?.body || '', /calendar-query/, 'initial calendar sync should use a calendar-query REPORT body');
assert.match(requests[1]?.body || '', /sync-collection/, 'delta calendar sync should use a sync-collection REPORT body');

console.log('calendar_node_protocol_clients: ok');

const discoveryRequests = [];
const discoveryResponses = [
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:propstat>
      <d:prop>
        <d:current-user-principal>
          <d:href>/123456/principal/</d:href>
        </d:current-user-principal>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:propstat>
      <d:prop>
        <c:calendar-home-set>
          <d:href>/123456/calendars/</d:href>
        </c:calendar-home-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/123456/calendars/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection /></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123456/calendars/default/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Default</d:displayname>
        <d:resourcetype><d:collection /><c:calendar /></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:sync-token>sync-root-1</d:sync-token>
  <d:response>
    <d:href>/123456/calendars/default/root-event.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-root"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:root-event
SUMMARY:Discovered root event
DTSTART:20260314T090000Z
DTEND:20260314T100000Z
LAST-MODIFIED:20260314T080000Z
END:VEVENT
END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`
];

const discoveryFetchImpl = async (url, init = {}) => {
    discoveryRequests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: String(init.body || '')
    });
    const body = discoveryResponses.shift() || '';
    return {
        ok: true,
        status: 207,
        async text() {
            return body;
        }
    };
};

const discoveryClient = createNodeCaldavClient({
    auth: {
        username: 'user@icloud.test',
        password: 'app-password'
    },
    caldav: {
        calendar_url: 'https://caldav.icloud.test'
    },
    fetchImpl: discoveryFetchImpl
});

const discoveredInitial = await discoveryClient.fetchInitialCalendar({
    start: new Date('2026-03-01T00:00:00.000Z'),
    end: new Date('2026-03-31T23:59:59.999Z')
});

assert.equal(discoveredInitial.ok, true, 'node CalDAV client should discover a concrete calendar collection from a root iCloud URL');
assert.equal(discoveredInitial.calendar_url, 'https://caldav.icloud.test/123456/calendars/default/', 'node CalDAV client should resolve the discovered calendar collection URL');
assert.equal(discoveredInitial.items[0]?.id, 'root-event', 'node CalDAV client should fetch events after collection discovery');
assert.equal(discoveryRequests.length, 4, 'root CalDAV discovery should add three PROPFIND calls before the first REPORT');
assert.equal(discoveryRequests[0]?.method, 'PROPFIND', 'root CalDAV discovery should start with current-user-principal lookup');
assert.match(discoveryRequests[0]?.body || '', /current-user-principal/, 'root CalDAV discovery should request the current user principal');
assert.equal(discoveryRequests[1]?.method, 'PROPFIND', 'root CalDAV discovery should resolve calendar-home-set');
assert.match(discoveryRequests[1]?.body || '', /calendar-home-set/, 'root CalDAV discovery should request the calendar home set');
assert.equal(discoveryRequests[2]?.method, 'PROPFIND', 'root CalDAV discovery should enumerate calendar collections');
assert.match(discoveryRequests[2]?.body || '', /resourcetype/, 'root CalDAV discovery should inspect resource types to find a calendar collection');
assert.equal(discoveryRequests[3]?.url, 'https://caldav.icloud.test/123456/calendars/default/', 'root CalDAV discovery should REPORT against the discovered collection URL');
