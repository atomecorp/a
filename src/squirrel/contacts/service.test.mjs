import assert from 'node:assert/strict';

import { createContactsConnectorContract } from './connector_contract.js';
import { createLocalContactsSource } from './local_source.js';
import { createContactsService } from './service.js';

const createMemorySource = ({
    source_id,
    role,
    writable = false,
    items = []
}) => ({
    source_id,
    role,
    writable,
    contract: createContactsConnectorContract({
        provider: source_id,
        role,
        write_capabilities: writable ? ['contacts_update'] : []
    }),
    syncStatus() {
        return { cursor: `${source_id}_cursor`, synced: true };
    },
    async syncInitial() {
        return {
            ok: true,
            source_id,
            cursor: `${source_id}_cursor`,
            items: items.map((entry) => ({ ...entry }))
        };
    },
    async syncIncremental() {
        return {
            ok: true,
            source_id,
            cursor: `${source_id}_cursor_2`,
            items: items.map((entry) => ({ ...entry }))
        };
    }
});

const service = createContactsService({
    primarySource: createLocalContactsSource(),
    sources: [
        createMemorySource({
            source_id: 'macos_contacts',
            role: 'legacy',
            items: [
                {
                    source_contact_id: 'mac_1',
                    name: 'Alice Martin',
                    first_name: 'Alice',
                    phone: '+33 6 00 00 00 00',
                    email: 'alice@example.test',
                    read_only: true,
                    source_provider: 'macos_contacts',
                    source_label: 'Mac Contacts',
                    custom_fields: [{ label: 'source', value: 'Mac Contacts' }]
                }
            ]
        }),
        createMemorySource({
            source_id: 'directory',
            role: 'primary',
            writable: true,
            items: [
                {
                    id: 'user_alice',
                    name: 'Alice Martin',
                    first_name: 'Alice',
                    phone: '+33 6 00 00 00 00',
                    email: 'alice@example.test',
                    source_provider: 'directory',
                    source_label: 'Directory',
                    source_writable: true,
                    custom_fields: []
                },
                {
                    id: 'user_bob',
                    name: 'Bob Durand',
                    first_name: 'Bob',
                    phone: '+33 6 11 11 11 11',
                    email: 'bob@example.test',
                    source_provider: 'directory',
                    source_label: 'Directory',
                    source_writable: true,
                    custom_fields: []
                }
            ]
        })
    ]
});

const synced = await service.syncInitial();
assert.equal(synced.ok, true, 'contacts service should sync registered sources');
assert.equal(synced.items.length, 2, 'contacts service should merge contacts sharing the same phone/email');

const list = service.contactsList();
assert.equal(list.ok, true, 'contacts service should list merged contacts');
assert.equal(list.items.some((entry) => entry.id === 'user_alice'), true, 'contacts service should keep the Atome user id when a Mac contact merges into it');

const search = service.contactsSearch('bob');
assert.equal(search.items.length, 1, 'contacts service should filter contacts by query');
assert.equal(search.items[0]?.id, 'user_bob', 'contacts search should return the matching contact');

const read = service.contactsRead('mac_1');
assert.equal(read.ok, true, 'contacts service should read a contact by native source identifier');
assert.equal(read.contact?.name, 'Alice Martin', 'contacts read should expose the merged contact payload');

const imported = await service.importMacosContacts();
assert.equal(imported.ok, true, 'contacts service should import the legacy macOS source into the local primary store');
assert.equal(imported.target_source_id, 'eve_contacts_local', 'contacts service should import into the local primary source');

const localOnly = await service.syncInitial({ source_id: 'eve_contacts_local' });
assert.equal(localOnly.ok, true, 'contacts service should sync the local primary store');
assert.equal(localOnly.items[0]?.source_provider, 'eve_contacts_local', 'contacts service should expose imported contacts from the local primary source once imported');

console.log('contacts_service: ok');
