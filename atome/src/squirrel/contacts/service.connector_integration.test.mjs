import assert from 'node:assert/strict';

import { createIcloudContactsConnector } from './icloud_connector.js';
import { createLocalContactsSource } from './local_source.js';
import { createContactsService } from './service.js';

let initialCalls = 0;
let deltaCalls = 0;
let pushCalls = 0;

const legacyConnector = createIcloudContactsConnector({
    addressbook_url: 'https://contacts.icloud.test/addressbooks/default/',
    carddavClientFactory: async () => ({
        async fetchInitialContacts() {
            initialCalls += 1;
            return {
                ok: true,
                cursor: 'legacy_contacts_cursor_1',
                items: [
                    {
                        id: 'contact_legacy_1',
                        name: 'Legacy initial',
                        first_name: 'Legacy',
                        phones: [{ label: 'cell', value: '+33 6 00 00 00 00' }],
                        emails: [{ label: 'home', value: 'imported@example.test' }],
                        href: '/contact_legacy_1.vcf'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            deltaCalls += 1;
            assert.equal(cursor, 'legacy_contacts_cursor_1', 'contacts service should reuse the stored iCloud sync cursor');
            return {
                ok: true,
                cursor: 'legacy_contacts_cursor_2',
                items: [
                    {
                        id: 'contact_legacy_2',
                        name: 'Legacy delta',
                        first_name: 'Delta',
                        phones: [{ label: 'cell', value: '+33 6 11 11 11 11' }],
                        emails: [{ label: 'home', value: 'delta@example.test' }],
                        href: '/contact_legacy_2.vcf'
                    }
                ],
                removed_hrefs: ['/contact_legacy_1.vcf']
            };
        },
        async createOrUpdateContact({ contact }) {
            pushCalls += 1;
            return {
                ok: true,
                created: true,
                updated: false,
                href: '/contact_legacy_3.vcf',
                etag: '"etag-3"',
                contact: {
                    id: 'contact_legacy_3',
                    name: contact.name,
                    first_name: contact.first_name || '',
                    phones: [{ label: 'cell', value: contact.phone || '+33 6 33 33 33 33' }],
                    emails: [{ label: 'home', value: contact.email || 'push@example.test' }],
                    href: '/contact_legacy_3.vcf',
                    etag: '"etag-3"'
                }
            };
        }
    })
});

const service = createContactsService({
    primarySource: createLocalContactsSource(),
    sources: [legacyConnector]
});

const imported = await service.importSource('icloud_contacts');
assert.equal(imported.ok, true, 'contacts service should import direct iCloud contacts into the local primary store');
assert.equal(imported.target_source_id, 'eve_contacts_local', 'contacts service should import iCloud contacts into the local primary source');

const localOnly = await service.syncInitial({ source_id: 'eve_contacts_local' });
assert.equal(localOnly.ok, true, 'contacts service should sync the local primary store after import');
assert.equal(localOnly.items[0]?.source_provider, 'eve_contacts_local', 'contacts service should expose imported iCloud contacts from the local primary source');

const delta = await legacyConnector.fetchDelta();
assert.equal(delta.ok, true, 'contacts service integration should still expose direct connector delta sync');

const pushed = await service.pushContactToSource('icloud_contacts', {
    contact: {
        name: 'Push imported contact',
        first_name: 'Push',
        phone: '+33 6 33 33 33 33',
        email: 'push@example.test'
    }
});
assert.equal(pushed.ok, true, 'contacts service should push a local contact to the configured iCloud source');
assert.equal(pushed.target_source_id, 'eve_contacts_local', 'contacts service should refresh the local primary store after iCloud push');

assert.deepEqual({ initialCalls, deltaCalls, pushCalls }, { initialCalls: 1, deltaCalls: 1, pushCalls: 1 }, 'contacts service should delegate initial import, delta sync and push to the configured iCloud connector');

console.log('contacts_service_connector_integration: ok');
