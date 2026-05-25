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

const createConfirmation = (suffix) => ({
    confirmation_id: `confirm_contacts_update_${suffix}`,
    actor_id: 'voice_test_user',
    idempotency_key: `voice_contacts_update_${suffix}`
});

const emailUpdateRequest = {
    domain: 'contacts',
    operation: 'update',
    filters: { query_text: 'Regis' },
    payload: { email: 'jeezs@jeezs.net' },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Ajoute le mail suivant a Regis : jeezs@jeezs.net',
        utterance_normalized: 'ajoute le mail suivant a regis jeezs jeezs net'
    }
};

const unconfirmedEmailUpdate = await router.execute(createStructuredRequest(emailUpdateRequest));
assert.equal(unconfirmedEmailUpdate.ok, false, 'contacts.update should require explicit confirmation before mutation');
assert.equal(unconfirmedEmailUpdate.confirmation_required, true, 'contacts.update should expose confirmation requirement');
assert.equal(contactsStore[0].email, '');

const emailConfirmation = createConfirmation('email');
const emailUpdate = await router.execute(createStructuredRequest({
    ...emailUpdateRequest,
    confirmation: emailConfirmation,
    idempotency_key: emailConfirmation.idempotency_key
}));

assert.equal(emailUpdate.ok, true, 'contacts.update should resolve the target contact from query_text when no current contact id exists');
assert.equal(contactsStore[0].email, 'jeezs@jeezs.net');

const phoneConfirmation = createConfirmation('phone');
const phoneUpdate = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'update',
    filters: { query_text: 'Regis' },
    payload: { phone: '06 11 22 33 44' },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Change le numero de Regis en 06 11 22 33 44',
        utterance_normalized: 'change le numero de regis en 06 11 22 33 44'
    },
    confirmation: phoneConfirmation,
    idempotency_key: phoneConfirmation.idempotency_key
}));

assert.equal(phoneUpdate.ok, true);
assert.match(String(contactsStore[0].phone || ''), /0611223344/, 'phone update should be persisted on the matched contact');

const createConfirmationForExisting = createConfirmation('create_existing');
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
    },
    confirmation: createConfirmationForExisting,
    idempotency_key: createConfirmationForExisting.idempotency_key
}));

assert.equal(createConflict.ok, true);
assert.equal(createConflict.operation, 'update', 'contacts.create should be normalized to update when the target contact already exists');
assert.equal(contactsStore.length, 1, 'create/update normalization should not duplicate existing contacts');

console.log('tool_router.contacts_direct_update.test: PASS');
