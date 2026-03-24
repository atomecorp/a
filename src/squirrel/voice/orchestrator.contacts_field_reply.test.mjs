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
                        source_contact_id: 'contact_orchestrator_1',
                        name: 'Sylvain Godard',
                        phone: '08 76 65 67',
                        email: 'sylvain@example.test'
                    }]
                };
            },
            async search() {
                return {
                    ok: true,
                    items: [{
                        source_contact_id: 'contact_orchestrator_1',
                        name: 'Sylvain Godard',
                        phone: '08 76 65 67',
                        email: 'sylvain@example.test'
                    }]
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
                intent_id: options.intent_id || 'voice_contacts_field_intent',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'contacts',
                action: 'search_contacts',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'contacts.search',
                        params: { query: 'Sylvain', limit: 5 }
                    }]
                }
            };
        }
    }
});

const result = await orchestrator.executeUtterance('Quel est le numero de telephone de Sylvain ?', {
    session_id: 'voice_contacts_field_session'
});

assert.equal(result.ok, true);
assert.equal(result.transport, 'contacts_api');
assert.match(result.reply_text || '', /08 76 65 67|08766567/, 'voice contact field queries should return the requested phone number');

const heuristicFallbackOrchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_contacts_field_intent_free_reply',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'ready',
                assistant_reply: "Je ne peux pas voir ton repertoire telephonique directement.",
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const fallbackResult = await heuristicFallbackOrchestrator.executeUtterance('Quel est le numero de telephone de Sylvain ?', {
    session_id: 'voice_contacts_field_session_fallback'
});

assert.equal(fallbackResult.ok, true);
assert.equal(fallbackResult.executed, true, 'a direct phone lookup should execute through the contacts connector instead of keeping a free LLM refusal');
assert.equal(fallbackResult.transport, 'contacts_api');
assert.match(fallbackResult.reply_text || '', /08 76 65 67|08766567/, 'the deterministic contacts fallback should win over a free reply');

console.log('orchestrator.contacts_field_reply.test: PASS');
