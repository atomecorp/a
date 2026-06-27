import assert from 'node:assert/strict';

import { createGlobalContactsApi } from './bootstrap.js';

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

const originalLocalStorage = globalThis.localStorage;
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: createMemoryStorage()
});

const events = new EventTarget();
const peopleDirectoryEvents = [];
class TestCustomEvent extends Event {
    constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
    }
}

const env = {
    CustomEvent: TestCustomEvent,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    open_contact_panel: async () => {
        env.__panel_opened = true;
    },
    close_contact_panel: () => {
        env.__panel_closed = true;
    }
};

const api = createGlobalContactsApi({ env });
env.addEventListener('eve:people-directory-updated', (event) => peopleDirectoryEvents.push(event.detail));

assert.equal(env.Squirrel.contacts, api, 'contacts bootstrap should expose a global Squirrel contacts API');
assert.equal(env.atome.contacts, api, 'contacts bootstrap should expose a global atome contacts API');
assert.equal(env.atome.tools.contacts, api, 'contacts bootstrap should expose contacts under atome.tools');

api.configureMacosSource({
    commandRunner: async () => ({
        ok: true,
        fetched_at: '2026-03-14T09:30:00.000Z',
        contacts: [
            {
                id: 'mac_2',
                name: 'Chloe Bernard',
                first_name: 'Chloe',
                phones: [{ label: 'mobile', value: '+33 6 22 22 22 22' }],
                emails: [{ label: 'home', value: 'chloe@example.test' }]
            }
        ]
    })
});

const ready = await api.ensureReady();
assert.equal(ready.ok, true, 'contacts bootstrap should expose a readiness helper for MCP/AI consumers');
assert.equal(api.service.getPrimarySource().source_id, 'eve_contacts_local', 'contacts bootstrap should keep the local contacts store as the primary readable source');

const synced = await api.syncInitial();
assert.equal(synced.ok, true, 'contacts bootstrap should expose sync through the shared singleton');
assert.equal(api.list().items[0]?.source_contact_id, 'mac_2', 'contacts bootstrap should expose the synced contacts');

const imported = await api.importMacosContacts();
assert.equal(imported.ok, true, 'contacts bootstrap should expose an explicit macOS import action');

const created = await api.createLocalContact({
    name: 'Sylvain Godard',
    phone: '06 44 55 78 96'
});
assert.equal(created.ok, true, 'contacts bootstrap should expose a local contact creation helper');
assert.equal(created.contact?.name, 'Sylvain Godard', 'contacts bootstrap should surface the created local contact payload');

const updated = await api.updateLocalContact(created.contact?.source_contact_id, {
    phone: '06 44 55 78 97'
});
assert.equal(updated.ok, true, 'contacts bootstrap should expose a local contact update helper');
assert.equal(updated.contact?.phone, '06 44 55 78 97', 'contacts bootstrap should surface the updated local contact payload');

const deleted = await api.deleteLocalContact(created.contact?.source_contact_id);
assert.equal(deleted.ok, true, 'contacts bootstrap should expose a local contact delete helper');
assert.equal(api.search('Sylvain').items.length, 0, 'contacts bootstrap should remove deleted local contacts from the shared directory view');
assert.deepEqual(
    peopleDirectoryEvents.map((event) => event.action),
    ['create', 'update', 'delete'],
    'contacts bootstrap should publish dashboard directory invalidation events for local mutations'
);

const opened = await api.openPanel();
assert.equal(opened.ok, true, 'contacts bootstrap should graft onto the existing contact panel entrypoint');
assert.equal(env.__panel_opened, true, 'contacts bootstrap should call the existing open_contact_panel function');

const closed = api.closePanel();
assert.equal(closed.ok, true, 'contacts bootstrap should graft onto the existing contact panel close entrypoint');
assert.equal(env.__panel_closed, true, 'contacts bootstrap should call the existing close_contact_panel function');

Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: originalLocalStorage
});

console.log('contacts_bootstrap: ok');
