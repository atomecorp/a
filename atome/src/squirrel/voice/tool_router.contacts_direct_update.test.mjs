import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { createStructuredRequest } from './semantic_contract.js';

const contactsStore = [
    {
        source_contact_id: 'contact_regis_1',
        name: 'Regis',
        phone: '0825232456',
        email: ''
    }
];

const contactsApi = {
    async syncPull() {
        return { ok: true, items: contactsStore.map((entry) => ({ ...entry })) };
    },
    async search(query = '') {
        const needle = String(query || '').trim().toLowerCase();
        return {
            ok: true,
            items: contactsStore
                .filter((entry) => `${entry.name} ${entry.phone} ${entry.email}`.toLowerCase().includes(needle))
                .map((entry) => ({ ...entry }))
        };
    },
    async updateLocalContact(contactId, changes = {}) {
        const index = contactsStore.findIndex((entry) => entry.source_contact_id === contactId);
        if (index < 0) return { ok: false, error: 'contacts_not_found' };
        contactsStore[index] = { ...contactsStore[index], ...changes };
        return { ok: true, contact: { ...contactsStore[index] } };
    }
};

const router = createToolRouter({
    connectors: { contacts: contactsApi }
});

const emailUpdate = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'update',
    filters: { query_text: 'Regis' },
    payload: { email: 'jeezs@jeezs.net' },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Ajoute le mail suivant a Regis : jeezs@jeezs.net',
        utterance_normalized: 'ajoute le mail suivant a regis jeezs jeezs net'
    }
}));

assert.equal(emailUpdate.ok, true, 'contacts.update should resolve the target contact from query_text when no current contact id exists');
assert.equal(contactsStore[0].email, 'jeezs@jeezs.net');

const phoneUpdate = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'update',
    filters: { query_text: 'Regis' },
    payload: { phone: '06 11 22 33 44' },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Change le numero de Regis en 06 11 22 33 44',
        utterance_normalized: 'change le numero de regis en 06 11 22 33 44'
    }
}));

assert.equal(phoneUpdate.ok, true);
assert.match(String(contactsStore[0].phone || ''), /0611223344/, 'phone update should be persisted on the matched contact');

const createConflict = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'create',
    payload: {
        name: 'Regis',
        email: 'jeezs@jeezs.net'
    },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Cree Regis avec le mail jeezs@jeezs.net',
        utterance_normalized: 'cree regis avec le mail jeezs jeezs net'
    }
}));

assert.equal(createConflict.ok, true);
assert.equal(createConflict.operation, 'update', 'contacts.create should be normalized to update when the target contact already exists');
assert.equal(contactsStore.length, 1, 'create/update normalization should not duplicate existing contacts');

console.log('tool_router.contacts_direct_update.test: PASS');
