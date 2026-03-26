import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { createStructuredRequest } from './semantic_contract.js';
import { buildContactQueryReply } from './contact_reply.js';

// Test 1: "j'ai un contact nomme Sylvain" — existence check, no specific field
const existenceReplyFr = buildContactQueryReply(
    { name: 'Sylvain Godard', phone: '08 76 65 67', email: 'sylvain@example.test' },
    {
        locale: 'fr-FR',
        utteranceRaw: "j'ai un contact nomme Sylvain ?",
        utteranceNormalized: "j'ai un contact nomme sylvain",
        contact_field: null
    }
);
assert.ok(existenceReplyFr, 'existence check should produce a reply');
assert.match(
    existenceReplyFr,
    /oui.*contact.*nomme.*Sylvain/i,
    `existence check should confirm the contact exists, got: "${existenceReplyFr}"`
);
assert.ok(
    !/numero|telephone|email|phone/i.test(existenceReplyFr),
    `existence check should NOT mention a field value, got: "${existenceReplyFr}"`
);

// Test 2: "do I have a contact named Alice" — English existence check
const existenceReplyEn = buildContactQueryReply(
    { name: 'Alice Smith', phone: '+1 555 0100', email: 'alice@example.test' },
    {
        locale: 'en-US',
        utteranceRaw: 'Do I have a contact named Alice?',
        utteranceNormalized: 'do i have a contact named alice',
        contact_field: null
    }
);
assert.ok(existenceReplyEn, 'English existence check should produce a reply');
assert.match(
    existenceReplyEn,
    /yes.*contact.*named.*Alice/i,
    `English existence check should confirm the contact exists, got: "${existenceReplyEn}"`
);

// Test 3: "quel est le nom de Sylvain" — asking for the name field explicitly (should still work)
const nameFieldReply = buildContactQueryReply(
    { name: 'Sylvain Godard', phone: '08 76 65 67', email: 'sylvain@example.test' },
    {
        locale: 'fr-FR',
        utteranceRaw: 'Quel est le nom complet de Sylvain ?',
        utteranceNormalized: 'quel est le nom complet de sylvain',
        contact_field: null
    }
);
assert.ok(nameFieldReply, 'name field query should produce a reply');
assert.match(
    nameFieldReply,
    /Sylvain Godard/i,
    `name field query should mention the full name, got: "${nameFieldReply}"`
);

// Test 4: "quel est le numero de Sylvain" — phone field should still work
const phoneFieldReply = buildContactQueryReply(
    { name: 'Sylvain Godard', phone: '08 76 65 67', email: 'sylvain@example.test' },
    {
        locale: 'fr-FR',
        utteranceRaw: 'Quel est le numero de Sylvain ?',
        utteranceNormalized: 'quel est le numero de sylvain',
        contact_field: null
    }
);
assert.match(
    phoneFieldReply,
    /08 76 65 67/,
    `phone field query should return the phone number, got: "${phoneFieldReply}"`
);

// Test 5: Full tool_router flow for existence check
const contactsApi = {
    async search(query) {
        return {
            ok: true,
            query,
            items: [
                {
                    source_contact_id: 'existence_1',
                    name: 'Sylvain Godard',
                    phone: '08 76 65 67',
                    email: 'sylvain@example.test'
                }
            ]
        };
    }
};

const router = createToolRouter({
    connectors: { contacts: contactsApi }
});

const existenceResult = await router.execute(createStructuredRequest({
    domain: 'contacts',
    operation: 'search',
    filters: {
        query_text: 'Sylvain'
    },
    source: {
        locale: 'fr-FR',
        utterance_raw: "j'ai un contact nomme Sylvain ?",
        utterance_normalized: "j'ai un contact nomme sylvain"
    }
}));

assert.equal(existenceResult.ok, true, 'existence search should succeed');
assert.match(
    existenceResult.reply_text || '',
    /oui|Sylvain Godard/i,
    `existence search reply should confirm the contact, got: "${existenceResult.reply_text}"`
);
assert.ok(
    !/Le nom.*est/i.test(existenceResult.reply_text || ''),
    `existence search should NOT say "Le nom de... est..." — got: "${existenceResult.reply_text}"`
);

console.log('tool_router.contacts_existence.test: PASS');
