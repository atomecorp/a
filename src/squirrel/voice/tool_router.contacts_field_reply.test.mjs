import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { createStructuredRequest } from './semantic_contract.js';

const contactsApi = {
    async syncPull() {
        return {
            ok: true,
            items: [
                {
                    source_contact_id: 'contact_field_1',
                    name: 'Sylvain Godard',
                    phone: '08 76 65 67',
                    email: 'sylvain@example.test',
                    updated_at: '2026-03-24T12:34:00.000Z'
                }
            ]
        };
    },
    async search(query) {
        if (String(query || '').toLowerCase().includes('regis')) {
            return {
                ok: true,
                query,
                items: [
                    {
                        source_contact_id: 'contact_field_regis_1',
                        name: 'regis',
                        phone: '08 25 23 24 56',
                        email: 'regis.one@example.test',
                        updated_at: '2026-03-24T12:34:00.000Z'
                    },
                    {
                        source_contact_id: 'contact_field_regis_2',
                        name: 'Regis',
                        phone: '06 11 22 33 44',
                        email: 'regis.two@example.test',
                        updated_at: '2026-03-24T12:35:00.000Z'
                    }
                ]
            };
        }
        return {
            ok: true,
            query,
            items: [
                {
                    source_contact_id: 'contact_field_1',
                    name: 'Sylvain Godard',
                    phone: '08 76 65 67',
                    email: 'sylvain@example.test',
                    updated_at: '2026-03-24T12:34:00.000Z'
                }
            ]
        };
    }
};

const router = createToolRouter({
    connectors: { contacts: contactsApi }
});

const phoneResult = await router.execute(createStructuredRequest({
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

assert.equal(phoneResult.ok, true);
assert.match(phoneResult.reply_text || '', /08 76 65 67|08766567/, 'contact field queries should verbalize the phone number instead of a generic list reply');

const emailResult = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'search',
    filters: {
        query_text: 'Sylvain'
    },
    source: {
        locale: 'en-US',
        utterance_raw: "What is Sylvain's email address?",
        utterance_normalized: "what is sylvain's email address"
    }
}));

assert.equal(emailResult.ok, true);
assert.match(emailResult.reply_text || '', /sylvain@example\.test/i, 'contact field queries should verbalize the email address');

const workingMemory = {
    getCurrentItemId() {
        return null;
    },
    getResultSetItems() {
        return [
            {
                source_contact_id: 'contact_field_regis_1',
                name: 'regis',
                phone: '08 25 23 24 56',
                email: 'regis.one@example.test'
            },
            {
                source_contact_id: 'contact_field_regis_2',
                name: 'Regis',
                phone: '06 11 22 33 44',
                email: 'regis.two@example.test'
            }
        ];
    }
};

const pluralRouter = createToolRouter({
    connectors: { contacts: contactsApi },
    workingMemory
});

const pluralEmailResult = await pluralRouter.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'read',
    source: {
        locale: 'fr-FR',
        utterance_raw: 'Et leurs email ?',
        utterance_normalized: 'et leurs email'
    }
}));

assert.equal(pluralEmailResult.ok, true);
assert.match(pluralEmailResult.reply_text || '', /regis\.one@example\.test/i, 'multi-contact follow-ups should answer with emails from the active contacts result set');
assert.match(pluralEmailResult.reply_text || '', /regis\.two@example\.test/i, 'multi-contact follow-ups should include each matching contact value');

console.log('tool_router.contacts_field_reply.test: PASS');
