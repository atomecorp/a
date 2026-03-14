import assert from 'node:assert/strict';

import { createMacosContactsSource } from './macos_source.js';

const source = createMacosContactsSource({
    commandRunner: async () => ({
        ok: true,
        fetched_at: '2026-03-14T09:00:00.000Z',
        contacts: [
            {
                id: 'mac_1',
                name: 'Alice Martin',
                first_name: 'Alice',
                nickname: 'Ali',
                organization: 'Atome',
                note: 'VIP',
                phones: [
                    { label: 'mobile', value: '+33 6 00 00 00 00' },
                    { label: 'work', value: '+33 1 00 00 00 00' }
                ],
                emails: [
                    { label: 'home', value: 'alice@example.test' },
                    { label: 'work', value: 'alice@atome.test' }
                ]
            }
        ]
    })
});

const initial = await source.syncInitial();
assert.equal(initial.ok, true, 'macOS contacts source should sync the initial contact snapshot');
assert.equal(initial.items[0]?.source_contact_id, 'mac_1', 'macOS contacts source should keep the native contact identifier');
assert.equal(initial.items[0]?.phone, '+33 6 00 00 00 00', 'macOS contacts source should expose the primary phone');
assert.equal(initial.items[0]?.email, 'alice@example.test', 'macOS contacts source should expose the primary email');
assert.equal(initial.items[0]?.read_only, true, 'macOS contacts source should expose contacts as read-only');
assert.equal(initial.items[0]?.custom_fields.some((entry) => entry.label === 'source' && entry.value === 'Mac Contacts'), true, 'macOS contacts source should label Mac contacts explicitly');

const searched = await source.listContacts({ query: 'alice@atome' });
assert.equal(searched.ok, true, 'macOS contacts source should list contacts after sync');
assert.equal(searched.items.length, 1, 'macOS contacts source should search custom fields as well');

console.log('contacts_macos_source: ok');
