import assert from 'node:assert/strict';

import { createContactsConnectorContract } from './connector_contract.js';
import { createLocalContactsSource } from './local_source.js';
import { createContactsService } from './service.js';

const createMemoryStorage = () => {
    const state = new Map();
    return {
        getItem(key) {
            return state.has(key) ? state.get(key) : null;
        },
        setItem(key, value) {
            state.set(key, String(value));
        }
    };
};

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
    primarySource: createLocalContactsSource({
        storage: createMemoryStorage()
    }),
    sources: [
        createMemorySource({
            source_id: 'macos_contacts',
            role: 'import',
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

const phoneSearch = service.contactsSearch('0611111111');
assert.equal(phoneSearch.items.length, 1, 'contacts service should normalize phone queries before matching');
assert.equal(phoneSearch.items[0]?.id, 'user_bob', 'contacts service should match normalized phone queries to the correct contact');

const read = service.contactsRead('mac_1');
assert.equal(read.ok, true, 'contacts service should read a contact by native source identifier');
assert.equal(read.contact?.name, 'Alice Martin', 'contacts read should expose the merged contact payload');

const imported = await service.importMacosContacts();
assert.equal(imported.ok, true, 'contacts service should import the macOS source into the local primary store');
assert.equal(imported.target_source_id, 'eve_contacts_local', 'contacts service should import into the local primary source');

const localOnly = await service.syncInitial({ source_id: 'eve_contacts_local' });
assert.equal(localOnly.ok, true, 'contacts service should sync the local primary store');
assert.equal(localOnly.items[0]?.source_provider, 'eve_contacts_local', 'contacts service should expose imported contacts from the local primary source once imported');

const created = await service.createLocalContact({
    name: 'Sylvain Godard',
    phone: '06 44 55 78 96'
});
assert.equal(created.ok, true, 'contacts service should create a local contact directly in the primary store');
assert.equal(created.contact?.name, 'Sylvain Godard', 'contacts service should expose the created local contact');
assert.equal(created.contact?.source_provider, 'eve_contacts_local', 'created local contacts should live in the local contacts store');

const updated = await service.updateLocalContact(created.contact?.source_contact_id, {
    phone: '06 44 55 78 97',
    email: 'sylvain@example.test'
});
assert.equal(updated.ok, true, 'contacts service should update a local contact in the primary store');
assert.equal(updated.contact?.phone, '06 44 55 78 97', 'contacts service should expose updated local contact fields');
assert.equal(updated.contact?.email, 'sylvain@example.test', 'contacts service should persist newly added local contact fields');

const deleted = await service.deleteLocalContact(created.contact?.source_contact_id);
assert.equal(deleted.ok, true, 'contacts service should delete a local contact from the primary store');
assert.equal(deleted.deleted, true, 'contacts service should confirm local contact deletion');
assert.equal(service.contactsSearch('Sylvain').items.length, 0, 'contacts service should remove deleted contacts from the shared directory view');

console.log('contacts_service: ok');
