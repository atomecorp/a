import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { createStructuredRequest } from './semantic_contract.js';

const contactsStore = [];

const normalizeText = (value) => String(value || '').trim();

const contactsApi = {
    async createLocalContact(input = {}) {
        const created = {
            source_contact_id: `contact_flow_${contactsStore.length + 1}`,
            name: normalizeText(input.name || input.display_name || 'Sans nom'),
            phone: normalizeText(input.phone),
            email: normalizeText(input.email),
            updated_at: new Date('2026-03-24T15:00:00.000Z').toISOString()
        };
        contactsStore.push(created);
        return {
            ok: true,
            contact: { ...created }
        };
    },
    async syncPull() {
        return {
            ok: true,
            items: contactsStore.map((entry) => ({ ...entry }))
        };
    },
    async list() {
        return {
            ok: true,
            items: contactsStore.map((entry) => ({ ...entry }))
        };
    },
    async search(query = {}) {
        const joinedQuery = normalizeText(
            query?.query
            || query?.query_text
            || query?.name
        ).toLowerCase();
        const items = contactsStore.filter((entry) => {
            if (!joinedQuery) return true;
            return `${entry.name} ${entry.phone} ${entry.email}`.toLowerCase().includes(joinedQuery);
        });
        return {
            ok: true,
            query,
            items: items.map((entry) => ({ ...entry }))
        };
    }
};

const router = createToolRouter({
    connectors: { contacts: contactsApi }
});

const created = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'create',
    input: {
        name: 'Sylvain Godard',
        phone: '08 76 65 67'
    },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Cree un nouveau contact Sylvain Godard avec le numero 08 76 65 67',
        utterance_normalized: 'cree un nouveau contact sylvain godard avec le numero 08 76 65 67'
    }
}));

assert.equal(created.ok, true, 'contacts.create should create the local contact used by the follow-up flow');

const listed = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'list',
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Liste mes users',
        utterance_normalized: 'liste mes users'
    }
}));

assert.equal(listed.ok, true, 'contacts.list should confirm the contact exists after creation');
assert.match(listed.reply_text || '', /Sylvain Godard/i, 'contacts.list should mention the created contact');

const phoneLookup = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'search',
    filters: {
        query_text: 'Sylvain'
    },
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Quel est le numero de telephone de Sylvain ?',
        utterance_normalized: 'quel est le numero de telephone de sylvain'
    }
}));

assert.equal(phoneLookup.ok, true, 'contacts.search should succeed after create/list in the same flow');
assert.match(phoneLookup.reply_text || '', /08 76 65 67|08766567/, 'the phone follow-up should return the phone number, not just a generic list answer');

console.log('tool_router.contacts_crud_field_flow.test: PASS');
