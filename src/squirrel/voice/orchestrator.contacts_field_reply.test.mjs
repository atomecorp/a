import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const env = {
    Squirrel: {
        contacts: {
            async syncPull() {
                return {
                    ok: true,
                    items: [{
                        source_contact_id: 'contact_regis_1',
                        name: 'Regis',
                        phone: '0825232456',
                        email: 'regis@example.test'
                    }]
                };
            },
            async search(query = '') {
                const needle = String(query || '').trim().toLowerCase();
                return {
                    ok: true,
                    items: needle.includes('regis')
                        ? [{
                            source_contact_id: 'contact_regis_1',
                            name: 'Regis',
                            phone: '0825232456',
                            email: 'regis@example.test'
                        }]
                        : []
                };
            },
            read() {
                return {
                    ok: true,
                    contact: {
                        source_contact_id: 'contact_regis_1',
                        name: 'Regis',
                        phone: '0825232456',
                        email: 'regis@example.test'
                    }
                };
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
                intent_id: options.intent_id || 'voice_contacts_field_reply_llm',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                source: options.source,
                context: options.context,
                type: 'connector_tool',
                domain: 'contacts',
                action: 'read_contact',
                status: 'ready',
                entities: {
                    query_text: 'Regis'
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

const result = await orchestrator.executeUtterance('Quel est le numero de Regis ?', {
    session_id: 'voice_contacts_field_reply_session'
});

assert.equal(result.ok, true);
assert.equal(result.executed, true);
assert.equal(result.transport, 'contacts_api');
assert.match(result.reply_text || '', /Regis.*0825232456/i);

console.log('orchestrator.contacts_field_reply.test: PASS');
