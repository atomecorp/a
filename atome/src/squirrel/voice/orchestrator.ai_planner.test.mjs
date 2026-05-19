import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const contactsStore = [{
    source_contact_id: 'contact_regis_ai_planner_1',
    name: 'Regis',
    email: '',
    phone: '0600000000'
}];

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
                    items: contactsStore.filter((entry) => entry.name.toLowerCase().includes(needle)).map((entry) => ({ ...entry }))
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
                intent_id: options.intent_id || 'voice_orchestrator_ai_planner_structured',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'connector_tool',
                domain: 'contacts',
                action: 'update',
                status: 'ready',
                assistant_reply: 'Je mets a jour le contact.',
                entities: {
                    query_text: 'Regis',
                    email: 'jeezs@jeezs.net'
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const result = await orchestrator.executeUtterance('Ajoute le mail suivant a Regis : jeezs@jeezs.net', {
    session_id: 'voice_orchestrator_ai_planner_structured_session'
});

assert.equal(result.ok, true);
assert.equal(result.executed, true);
assert.equal(result.transport, 'contacts_api');
assert.equal(contactsStore[0].email, 'jeezs@jeezs.net');

console.log('voice_orchestrator_ai_planner: ok');
