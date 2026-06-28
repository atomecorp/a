import assert from 'node:assert/strict';

import { createLocalContactsSource } from './local_source.js';

const source = createLocalContactsSource();

const imported = await source.importContacts([
    {
        source_contact_id: 'mac_1',
        name: 'Alice Martin',
        first_name: 'Alice',
        phone: '+33 6 00 00 00 00',
        email: 'alice@example.test',
        source_provider: 'macos_contacts',
        source_label: 'Mac Contacts',
        custom_fields: [{ label: 'source', value: 'Mac Contacts' }]
    }
], {
    imported_from_source: 'macos_contacts',
    imported_from_label: 'Mac Contacts'
});

assert.equal(imported.ok, true, 'local contacts source should import contacts into the local store');
assert.equal(imported.items[0]?.source_provider, 'eve_contacts_local', 'local contacts source should re-home imported contacts under the local provider');
assert.equal(imported.items[0]?.source_writable, true, 'local contacts source should expose local contacts as writable');
assert.equal(imported.items[0]?.read_only, false, 'local contacts source should not mark local contacts as read-only');
assert.equal(imported.items[0]?.source_contact_id, 'mac_1', 'local contacts source should preserve the imported source contact identifier');
assert.equal(imported.items[0]?.custom_fields.some((entry) => entry.label === 'importe depuis' && entry.value === 'Mac Contacts'), true, 'local contacts source should persist import provenance');

const listed = await source.listContacts({});
assert.equal(listed.ok, true, 'local contacts source should list persisted contacts');
assert.equal(listed.items.length, 1, 'local contacts source should expose persisted contacts after import');

const read = await source.getContact('mac_1');
assert.equal(read.ok, true, 'local contacts source should read one persisted contact by source identifier');
assert.equal(read.contact?.name, 'Alice Martin', 'local contacts source should preserve the imported contact payload');

console.log('contacts_local_source: ok');
