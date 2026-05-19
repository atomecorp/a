import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { createContactsRequest } from './semantic_contract.js';

let capturedContact = null;

const router = createToolRouter({
    connectors: {
        contacts: {
            async createLocalContact(contact) {
                capturedContact = { ...contact };
                return {
                    ok: true,
                    created: true,
                    contact: {
                        source_contact_id: 'contact_voice_1',
                        source_provider: 'eve_contacts_local',
                        ...contact
                    }
                };
            }
        }
    }
});

const result = await router.execute(createContactsRequest({
    operation: 'create',
    source: {
        utterance_raw: 'peux tu crrer un nouveaiu contact nomé Sylvain Godard qui le niumero de telephone 06 44 55 78 96',
        utterance_normalized: 'peux tu crrer un nouveaiu contact nomé sylvain godard qui le niumero de telephone 06 44 55 78 96',
        locale: 'fr-FR'
    }
}));

assert.equal(result.ok, true, 'tool router should support voice contact creation');
assert.equal(capturedContact?.name, 'Sylvain Godard', 'tool router should extract the spoken contact name');
assert.equal(capturedContact?.phone, '0644557896', 'tool router should normalize the spoken phone number');
assert.match(result.reply_text || '', /Sylvain Godard/i, 'tool router should mention the created contact in the reply');

console.log('voice_tool_router_contacts_create: ok');
