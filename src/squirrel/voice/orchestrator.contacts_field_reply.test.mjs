import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const env = {
    Squirrel: {
        contacts: {
            async syncPull() {
                return {
                    ok: true,
                    items: [
                        {
                            source_contact_id: 'contact_orchestrator_1',
                            name: 'Sylvain Godard',
                            phone: '08 76 65 67',
                            email: 'sylvain@example.test'
                        },
                        {
                            source_contact_id: 'contact_orchestrator_regis_1',
                            name: 'regis',
                            phone: '08 25 23 24 56',
                            email: 'regis.one@example.test'
                        },
                        {
                            source_contact_id: 'contact_orchestrator_regis_2',
                            name: 'Regis',
                            phone: '06 11 22 33 44',
                            email: 'regis.two@example.test'
                        }
                    ]
                };
            },
            async search(query) {
                if (String(query || '').toLowerCase().includes('regis')) {
                    return {
                        ok: true,
                        items: [
                            {
                                source_contact_id: 'contact_orchestrator_regis_1',
                                name: 'regis',
                                phone: '08 25 23 24 56',
                                email: 'regis.one@example.test'
                            },
                            {
                                source_contact_id: 'contact_orchestrator_regis_2',
                                name: 'Regis',
                                phone: '06 11 22 33 44',
                                email: 'regis.two@example.test'
                            }
                        ]
                    };
                }
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

const multiTurnPlanner = {
    async planUtterance(utterance, options = {}) {
        if (String(utterance).toLowerCase().includes('regis')) {
            return {
                intent_id: options.intent_id || 'voice_contacts_regis_email_intent',
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
                        params: { query: 'Regis', limit: 5 }
                    }]
                }
            };
        }
        return {
            intent_id: options.intent_id || 'voice_contacts_followup_free_reply',
            utterance: { raw: utterance },
            locale: options.locale || 'fr-FR',
            type: 'ambiguous',
            domain: 'unknown',
            action: 'unknown',
            status: 'failed',
            assistant_reply: "Je ne peux pas voir ton repertoire telephonique directement.",
            context: { ai_error: 'provider_rate_limited' },
            execution: {
                target: 'none',
                confirmation_required: false,
                toolchain: []
            }
        };
    }
};

const multiTurnOrchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: multiTurnPlanner
});
multiTurnOrchestrator.sessionRuntime.createSession({
    session_id: 'voice_contacts_field_session_multiturn'
});

const firstRegisResult = await multiTurnOrchestrator.executeUtterance("Donne moi l'adrrese mail de regis ?", {
    session_id: 'voice_contacts_field_session_multiturn'
});
assert.equal(firstRegisResult.ok, true);
assert.equal(firstRegisResult.transport, 'contacts_api');
assert.match(firstRegisResult.reply_text || '', /regis\.one@example\.test/i, 'multi-match email lookup should answer with contact field values instead of a generic list');
assert.match(firstRegisResult.reply_text || '', /regis\.two@example\.test/i, 'multi-match email lookup should include all matching email values');

const followupRegisResult = await multiTurnOrchestrator.executeUtterance('Et leurs email ?', {
    session_id: 'voice_contacts_field_session_multiturn'
});
assert.equal(followupRegisResult.ok, true);
assert.equal(followupRegisResult.executed, true, 'contact field follow-ups should still execute through the contacts connector after planner failure');
assert.equal(followupRegisResult.transport, 'contacts_api');
assert.match(followupRegisResult.reply_text || '', /regis\.one@example\.test/i, 'contact field follow-ups should resolve from the active contacts result set');
assert.match(followupRegisResult.reply_text || '', /regis\.two@example\.test/i, 'contact field follow-ups should keep every matching contact in scope');

console.log('orchestrator.contacts_field_reply.test: PASS');
