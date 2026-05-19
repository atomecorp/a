import assert from 'node:assert/strict';

import { createNodeCarddavClient } from './node_protocol_clients.js';

const directRequests = [];
const directResponses = [
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:sync-token>contacts-sync-1</d:sync-token>
  <d:response>
    <d:href>/abook/user/default/contact-1.vcf</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-1"</d:getetag>
        <card:address-data>BEGIN:VCARD
VERSION:3.0
UID:contact-1
FN:Alice Martin
N:Martin;Alice;;;
TEL;TYPE=CELL:+33 6 00 00 00 00
EMAIL;TYPE=HOME:alice@example.test
ORG:Atome
NOTE:VIP
END:VCARD</card:address-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:sync-token>contacts-sync-2</d:sync-token>
  <d:response>
    <d:href>/abook/user/default/contact-2.vcf</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-2"</d:getetag>
        <card:address-data>BEGIN:VCARD
VERSION:3.0
UID:contact-2
FN:Bob Durand
N:Durand;Bob;;;
TEL;TYPE=CELL:+33 6 11 11 11 11
EMAIL;TYPE=HOME:bob@example.test
END:VCARD</card:address-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/abook/user/default/contact-1.vcf</d:href>
    <d:status>HTTP/1.1 404 Not Found</d:status>
  </d:response>
</d:multistatus>`
];

const directFetchImpl = async (url, init = {}) => {
    directRequests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: String(init.body || '')
    });
    const body = directResponses.shift() || '';
    return {
        ok: true,
        status: 207,
        async text() {
            return body;
        }
    };
};

const directClient = createNodeCarddavClient({
    auth: {
        username: 'user@icloud.test',
        password: 'app-password'
    },
    carddav: {
        addressbook_url: 'https://contacts.icloud.test/abook/user/default/'
    },
    fetchImpl: directFetchImpl
});

const initial = await directClient.fetchInitialContacts();
assert.equal(initial.ok, true, 'node CardDAV client should fetch the initial contacts snapshot');
assert.equal(initial.cursor, 'contacts-sync-1', 'node CardDAV client should expose the initial sync token');
assert.equal(initial.items[0]?.id, 'contact-1', 'node CardDAV client should parse VCARD UID values');
assert.equal(initial.items[0]?.phones?.[0]?.value, '+33 6 00 00 00 00', 'node CardDAV client should parse primary phone values');

const delta = await directClient.fetchDelta({
    cursor: 'contacts-sync-1'
});
assert.equal(delta.ok, true, 'node CardDAV client should fetch delta changes via sync-collection');
assert.equal(delta.cursor, 'contacts-sync-2', 'node CardDAV client should refresh the sync token after delta sync');
assert.equal(delta.items[0]?.id, 'contact-2', 'node CardDAV client should parse delta VCARD payloads');
assert.deepEqual(delta.removed_hrefs, ['/abook/user/default/contact-1.vcf'], 'node CardDAV client should surface deleted contact resources');

assert.equal(directRequests.length, 2, 'node CardDAV client should issue one REPORT for initial sync and one REPORT for delta');
assert.match(directRequests[0]?.headers?.Authorization || '', /^Basic /, 'node CardDAV client should send basic auth when credentials are configured');
assert.match(directRequests[0]?.body || '', /addressbook-query/, 'initial contact sync should use an addressbook-query REPORT body');
assert.match(directRequests[1]?.body || '', /sync-collection/, 'delta contact sync should use a sync-collection REPORT body');

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
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:propstat>
      <d:prop>
        <card:addressbook-home-set>
          <d:href>/123456/addressbooks/</d:href>
        </card:addressbook-home-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/123456/addressbooks/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection /></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/123456/addressbooks/default/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Default</d:displayname>
        <d:resourcetype><d:collection /><card:addressbook /></d:resourcetype>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
    `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:sync-token>root-contacts-1</d:sync-token>
  <d:response>
    <d:href>/123456/addressbooks/default/contact-root.vcf</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-root"</d:getetag>
        <card:address-data>BEGIN:VCARD
VERSION:3.0
UID:contact-root
FN:Root Contact
N:Contact;Root;;;
EMAIL;TYPE=HOME:root@example.test
END:VCARD</card:address-data>
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

const discoveryClient = createNodeCarddavClient({
    auth: {
        username: 'user@icloud.test',
        password: 'app-password'
    },
    carddav: {
        addressbook_url: 'https://contacts.icloud.test'
    },
    fetchImpl: discoveryFetchImpl
});

const discoveredInitial = await discoveryClient.fetchInitialContacts();
assert.equal(discoveredInitial.ok, true, 'node CardDAV client should discover a concrete address book collection from a root iCloud URL');
assert.equal(discoveredInitial.addressbook_url, 'https://contacts.icloud.test/123456/addressbooks/default/', 'node CardDAV client should resolve the discovered address book collection URL');
assert.equal(discoveredInitial.items[0]?.id, 'contact-root', 'node CardDAV client should fetch contacts after address book discovery');
assert.equal(discoveryRequests.length, 4, 'root CardDAV discovery should add three PROPFIND calls before the first REPORT');
assert.equal(discoveryRequests[0]?.method, 'PROPFIND', 'root CardDAV discovery should start with current-user-principal lookup');
assert.match(discoveryRequests[0]?.body || '', /current-user-principal/, 'root CardDAV discovery should request the current user principal');
assert.equal(discoveryRequests[1]?.method, 'PROPFIND', 'root CardDAV discovery should resolve addressbook-home-set');
assert.match(discoveryRequests[1]?.body || '', /addressbook-home-set/, 'root CardDAV discovery should request the address book home set');
assert.equal(discoveryRequests[2]?.method, 'PROPFIND', 'root CardDAV discovery should enumerate address books');
assert.match(discoveryRequests[2]?.body || '', /resourcetype/, 'root CardDAV discovery should inspect resource types to find an address book collection');
assert.equal(discoveryRequests[3]?.url, 'https://contacts.icloud.test/123456/addressbooks/default/', 'root CardDAV discovery should REPORT against the discovered collection URL');

const writeRequests = [];
const writeFetchImpl = async (url, init = {}) => {
    writeRequests.push({
        url,
        method: init.method,
        headers: init.headers,
        body: String(init.body || '')
    });
    return {
        ok: true,
        status: init.headers?.['If-Match'] ? 204 : 201,
        headers: {
            get(name) {
                return String(name || '').toLowerCase() === 'etag'
                    ? (init.headers?.['If-Match'] ? '"etag-write-2"' : '"etag-write-1"')
                    : null;
            }
        },
        async text() {
            return '';
        }
    };
};

const writeClient = createNodeCarddavClient({
    auth: {
        username: 'user@icloud.test',
        password: 'app-password'
    },
    carddav: {
        addressbook_url: 'https://contacts.icloud.test/addressbooks/default/'
    },
    fetchImpl: writeFetchImpl
});

const created = await writeClient.createOrUpdateContact({
    contact: {
        name: 'Write Contact',
        first_name: 'Write',
        email: 'write@example.test',
        phone: '+33 6 22 22 22 22',
        custom_fields: [
            { label: 'organisation', value: 'Atome' },
            { label: 'note', value: 'VIP' }
        ]
    }
});
assert.equal(created.ok, true, 'node CardDAV client should create a remote contact with PUT');
assert.equal(created.created, true, 'node CardDAV client should flag a missing href as create');
assert.match(writeRequests[0]?.headers?.['If-None-Match'] || '', /^\*$/, 'CardDAV create should use If-None-Match for new contacts');
assert.match(writeRequests[0]?.body || '', /FN:Write Contact/, 'CardDAV create should serialize the contact full name into the VCARD body');
assert.match(writeRequests[0]?.body || '', /ORG:Atome/, 'CardDAV create should serialize organization fields into VCARD');

const updated = await writeClient.createOrUpdateContact({
    contact: {
        source_contact_id: 'contact-write-1',
        name: 'Write Contact',
        first_name: 'Write',
        email: 'write@example.test',
        raw: {
            href: '/addressbooks/default/contact-write-1.vcf',
            etag: '"etag-write-1"'
        }
    }
});
assert.equal(updated.ok, true, 'node CardDAV client should update an existing remote contact with PUT');
assert.equal(updated.updated, true, 'node CardDAV client should flag a known href as update');
assert.equal(writeRequests[1]?.headers?.['If-Match'], '"etag-write-1"', 'CardDAV update should send If-Match with the previous ETag');

console.log('contacts_node_protocol_clients: ok');
