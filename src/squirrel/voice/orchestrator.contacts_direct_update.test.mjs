import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const contactsStore = [
    {
        source_contact_id: 'contact_regis_orchestrator_1',
        name: 'Regis',
        phone: '0825232456',
        email: ''
    }
];

const env = {
    Squirrel: {
        contacts: {
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
        }
    }
};

const orchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_contacts_direct_update_free_reply',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const emailResult = await orchestrator.executeUtterance('Ajoute le mail suivant a Regis : jeezs@jeezs.net', {
    session_id: 'voice_contacts_direct_update_session'
});

assert.equal(emailResult.ok, true);
assert.equal(emailResult.executed, true);
assert.equal(emailResult.transport, 'contacts_api');
assert.equal(contactsStore[0].email, 'jeezs@jeezs.net');

const phoneResult = await orchestrator.executeUtterance('Change le numero de Regis en 06 11 22 33 44', {
    session_id: 'voice_contacts_direct_update_session'
});

assert.equal(phoneResult.ok, true);
assert.equal(phoneResult.executed, true);
assert.equal(phoneResult.transport, 'contacts_api');
assert.match(String(contactsStore[0].phone || ''), /0611223344/);

console.log('orchestrator.contacts_direct_update.test: PASS');
