import assert from 'node:assert/strict';

import { createIcloudContactsConnector, normalizeIcloudContactsConnectorConfig } from './icloud_connector.js';

let initialCalls = 0;
let deltaCalls = 0;
let pushCalls = 0;

const connector = createIcloudContactsConnector({
    auth: {
        email: 'user@icloud.test',
        appPassword: 'contacts-app-password'
    },
    addressbook_url: 'https://contacts.icloud.test/addressbooks/default/',
    carddavClientFactory: async () => ({
        async fetchInitialContacts() {
            initialCalls += 1;
            return {
                ok: true,
                cursor: 'contacts_connector_cursor_1',
                items: [
                    {
                        id: 'contact_connector_1',
                        name: 'Initial connector contact',
                        first_name: 'Initial',
                        phones: [{ label: 'cell', value: '+33 6 00 00 00 00' }],
                        emails: [{ label: 'home', value: 'initial@example.test' }],
                        href: '/contact_connector_1.vcf'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            deltaCalls += 1;
            assert.equal(cursor, 'contacts_connector_cursor_1', 'contacts connector should reuse the previous sync cursor');
            return {
                ok: true,
                cursor: 'contacts_connector_cursor_2',
                items: [
                    {
                        id: 'contact_connector_2',
                        name: 'Delta connector contact',
                        first_name: 'Delta',
                        phones: [{ label: 'cell', value: '+33 6 11 11 11 11' }],
                        emails: [{ label: 'home', value: 'delta@example.test' }],
                        href: '/contact_connector_2.vcf'
                    }
                ],
                removed_hrefs: ['/contact_connector_1.vcf']
            };
        },
        async createOrUpdateContact({ contact }) {
            pushCalls += 1;
            return {
                ok: true,
                created: true,
                updated: false,
                href: '/contact_connector_3.vcf',
                etag: '"etag-3"',
                contact: {
                    id: 'contact_connector_3',
                    name: contact.name,
                    first_name: contact.first_name || '',
                    phones: [{ label: 'cell', value: contact.phone || '+33 6 22 22 22 22' }],
                    emails: [{ label: 'home', value: contact.email || 'write@example.test' }],
                    organization: 'Atome',
                    note: 'VIP',
                    href: '/contact_connector_3.vcf',
                    etag: '"etag-3"'
                }
            };
        }
    })
});

const normalized = normalizeIcloudContactsConnectorConfig({
    auth: {
        email: 'user@icloud.test',
        appPassword: 'contacts-app-password'
    },
    addressbook_url: 'https://contacts.icloud.test/addressbooks/default/'
});
assert.equal(normalized.auth.username, 'user@icloud.test', 'contacts connector config should normalize the iCloud username');
assert.equal(normalized.carddav.addressbook_url, 'https://contacts.icloud.test/addressbooks/default/', 'contacts connector config should normalize the CardDAV address book URL');

const initial = await connector.fetchInitialContacts();
assert.equal(initial.ok, true, 'icloud contacts connector should fetch the initial contacts snapshot');
assert.equal(initial.items.length, 1, 'icloud contacts connector should cache initial remote contacts');
assert.equal(initial.items[0]?.source_contact_id, 'contact_connector_1', 'icloud contacts connector should normalize the remote contact id');

const listed = await connector.listContacts({ autosync: false });
assert.equal(listed.ok, true, 'icloud contacts connector should list cached remote contacts');
assert.equal(listed.items[0]?.name, 'Initial connector contact', 'icloud contacts connector should expose cached contacts');

const delta = await connector.fetchDelta();
assert.equal(delta.ok, true, 'icloud contacts connector should fetch remote delta changes');
assert.equal(delta.cursor, 'contacts_connector_cursor_2', 'icloud contacts connector should expose the updated sync cursor');
assert.equal(delta.items[0]?.source_contact_id, 'contact_connector_2', 'icloud contacts connector should replace deleted cache entries on delta sync');

const read = await connector.getContact('contact_connector_2');
assert.equal(read.ok, true, 'icloud contacts connector should expose cached contacts by id');
assert.equal(read.contact?.name, 'Delta connector contact', 'icloud contacts connector should return the cached delta contact');

const status = connector.syncStatus();
assert.equal(status.ok, true, 'icloud contacts connector should expose sync status');
assert.equal(status.sync.cursor, 'contacts_connector_cursor_2', 'icloud contacts connector should persist the latest sync cursor');

const pushed = await connector.pushContact({
    name: 'Write connector contact',
    first_name: 'Write',
    phone: '+33 6 22 22 22 22',
    email: 'write@example.test',
    custom_fields: [
        { label: 'organisation', value: 'Atome' },
        { label: 'note', value: 'VIP' }
    ]
});
assert.equal(pushed.ok, true, 'icloud contacts connector should push a contact through the CardDAV client');
assert.equal(pushed.contact?.source_contact_id, 'contact_connector_3', 'icloud contacts connector should normalize the pushed contact id');

assert.deepEqual({ initialCalls, deltaCalls, pushCalls }, { initialCalls: 1, deltaCalls: 1, pushCalls: 1 }, 'icloud contacts connector should delegate initial sync, delta sync and push to the CardDAV client');

console.log('contacts_icloud_connector: ok');
