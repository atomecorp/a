import assert from 'node:assert/strict';

import { createGlobalContactsApi } from './bootstrap.js';
import { createGlobalSecurityApi } from '../security/bootstrap.js';

const env = {};
const security = createGlobalSecurityApi({ env });
security.configureVaultSecret('contacts-bootstrap-secret');
await security.storeToken('icloud_contacts_bootstrap_auth', {
    email: 'user@icloud.test',
    appPassword: 'contacts-password'
}, {
    provider: 'icloud_carddav'
});
const api = createGlobalContactsApi({ env });

let initialCalls = 0;
let deltaCalls = 0;
let pushCalls = 0;

const configured = await api.configureIcloudConnector({
    auth_ref: 'icloud_contacts_bootstrap_auth',
    addressbook_url: 'https://contacts.icloud.test/addressbooks/default/',
    carddavClientFactory: async () => ({
        async fetchInitialContacts() {
            initialCalls += 1;
            return {
                ok: true,
                cursor: 'bootstrap_contacts_cursor_1',
                items: [
                    {
                        id: 'contact_bootstrap_icloud_1',
                        name: 'Bootstrap iCloud contact',
                        first_name: 'Bootstrap',
                        phones: [{ label: 'cell', value: '+33 6 00 00 00 00' }],
                        emails: [{ label: 'home', value: 'bootstrap@example.test' }],
                        href: '/contact_bootstrap_icloud_1.vcf'
                    }
                ]
            };
        },
        async fetchDelta({ cursor }) {
            deltaCalls += 1;
            assert.equal(cursor, 'bootstrap_contacts_cursor_1', 'contacts bootstrap should reuse the stored iCloud sync cursor');
            return {
                ok: true,
                cursor: 'bootstrap_contacts_cursor_2',
                items: [
                    {
                        id: 'contact_bootstrap_icloud_2',
                        name: 'Bootstrap iCloud delta',
                        first_name: 'Delta',
                        phones: [{ label: 'cell', value: '+33 6 11 11 11 11' }],
                        emails: [{ label: 'home', value: 'delta@example.test' }],
                        href: '/contact_bootstrap_icloud_2.vcf'
                    }
                ]
            };
        },
        async createOrUpdateContact({ contact }) {
            pushCalls += 1;
            return {
                ok: true,
                created: true,
                updated: false,
                href: '/contact_bootstrap_icloud_3.vcf',
                etag: '"etag-bootstrap-3"',
                contact: {
                    id: 'contact_bootstrap_icloud_3',
                    name: contact.name,
                    first_name: contact.first_name || '',
                    phones: [{ label: 'cell', value: contact.phone || '+33 6 44 44 44 44' }],
                    emails: [{ label: 'home', value: contact.email || 'write@example.test' }],
                    href: '/contact_bootstrap_icloud_3.vcf',
                    etag: '"etag-bootstrap-3"'
                }
            };
        }
    })
});

assert.equal(configured.ok, true, 'contacts bootstrap should configure the iCloud contacts connector');
assert.equal(configured.source, 'icloud_contacts', 'contacts bootstrap should register the iCloud source with the canonical source id');

const imported = await api.importIcloudContacts({
    source_id: 'icloud_contacts'
});
assert.equal(imported.ok, true, 'contacts bootstrap should import iCloud contacts into the local store');
assert.equal(api.list({ source_id: 'eve_contacts_local' }).items[0]?.source_provider, 'eve_contacts_local', 'contacts bootstrap should expose imported iCloud contacts through the local source');

const delta = await api.syncIncremental({
    source_id: 'icloud_contacts'
});
assert.equal(delta.ok, true, 'contacts bootstrap should expose incremental sync for the direct iCloud contacts connector');

const pushGate = await api.pushContactToIcloud({
    contact: {
        name: 'Bootstrap push contact',
        first_name: 'Bootstrap',
        phone: '+33 6 44 44 44 44',
        email: 'write@example.test'
    },
    source_id: 'icloud_contacts'
});
assert.equal(pushGate.ok, false, 'contacts bootstrap should expose a confirmation gate before direct iCloud contact write-back');
assert.equal(pushGate.confirmation_required, true, 'contacts bootstrap should require explicit confirmation for direct iCloud contact write-back');

const pushed = await api.pushContactToIcloud({
    contact: {
        name: 'Bootstrap push contact',
        first_name: 'Bootstrap',
        phone: '+33 6 44 44 44 44',
        email: 'write@example.test'
    },
    source_id: 'icloud_contacts',
    confirmed: true
});
assert.equal(pushed.ok, true, 'contacts bootstrap should expose explicit iCloud contact write-back once confirmed');

const sources = api.sources();
assert.equal(sources.items.some((entry) => entry.source_id === 'icloud_contacts'), true, 'contacts bootstrap should surface the configured iCloud source');

assert.deepEqual({ initialCalls, deltaCalls, pushCalls }, { initialCalls: 1, deltaCalls: 1, pushCalls: 1 }, 'contacts bootstrap should delegate initial import, delta sync and push to the configured iCloud connector');

console.log('contacts_bootstrap_connector: ok');
