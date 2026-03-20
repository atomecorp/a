import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';

const runtime = createVoiceSessionRuntime();

const calls = [];
const env = {
    AtomeAI: {
        async callTool(request = {}) {
            calls.push(request);
            return {
                status: 'OK',
                human_summary: `${request.tool_name} executed`
            };
        }
    }
};

const aiPlanner = {
    async planUtterance(utterance, options = {}) {
        if (String(utterance) === 'stop') {
            throw new Error('local commands should not reach the ai planner');
        }
        if (String(utterance) === 'Lis mes mails') {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                assistant_reply: 'Je regarde tes mails.',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.list',
                        params: { limit: 5 }
                    }]
                }
            };
        }
        return {
            intent_id: options.intent_id || 'voice_ai_intent_1',
            utterance: { raw: utterance },
            locale: options.locale || 'fr-FR',
            type: 'agent_tool',
            domain: 'contacts',
            action: 'list_contacts',
            status: 'ready',
            assistant_reply: 'Je lis les contacts.',
            execution: {
                target: 'atome_ai',
                confirmation_required: false,
                toolchain: [{
                    source: 'atome_ai',
                    tool_name: 'contacts.list',
                    params: { limit: 5 }
                }]
            }
        };
    }
};

const orchestrator = createVoiceOrchestrator({
    env,
    aiPlanner,
    sessionRuntime: runtime
});

const session = runtime.createSession({
    session_id: 'voice_ai_session_orchestrator'
});

const executed = await orchestrator.executeUtterance('Lis mes contacts', {
    session_id: session.session_id,
    trace_id: 'trace_voice_contacts'
});

assert.equal(executed.ok, true, 'voice orchestrator should execute ai planned toolchains');
assert.equal(executed.transport, 'atome_ai', 'voice orchestrator should route ai plans through AtomeAI');
assert.equal(executed.spoken_reply, 'Je lis les contacts.', 'voice orchestrator should preserve spoken replies from the ai planner');
assert.equal(calls[0]?.tool_name, 'contacts.list', 'voice orchestrator should execute the planned AtomeAI tool');

const localCommand = await orchestrator.executeUtterance('stop', {
    session_id: session.session_id
});
assert.equal(localCommand.transport, 'voice_runtime', 'local commands should remain outside the ai planner');

const heuristicMail = await orchestrator.executeUtterance('Lis mes mails', {
    session_id: session.session_id
});
assert.equal(heuristicMail.transport, 'mail_api', 'mail requests should execute through the deterministic mail connector even when AI planning is available');
assert.equal(calls.length, 1, 'mail requests should not invoke AtomeAI when a deterministic business connector route exists');

const failingOrchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: runtime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_fail',
                utterance: { raw: utterance },
                locale: options.locale || 'en-US',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'failed',
                assistant_reply: 'The AI is not responding.',
                context: { ai_error: 'provider_timeout' },
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const failed = await failingOrchestrator.executeUtterance('Open the project', {
    session_id: session.session_id,
    locale: 'en-US'
});

assert.equal(failed.ok, false, 'voice orchestrator should surface ai planner failures as execution failures');
assert.equal(failed.spoken_reply, 'The AI is not responding.', 'voice orchestrator should preserve localized spoken failures');

const fallbackOrchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: runtime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_none',
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

const fallbackMail = await fallbackOrchestrator.executeUtterance('Lis mes mails', {
    session_id: session.session_id
});
assert.equal(fallbackMail.transport, 'mail_api', 'voice orchestrator should fall back to deterministic business routing when the ai planner returns no executable plan');

const plannerMailReplyShouldUseConnector = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail_reply',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
                assistant_reply: 'Je réponds au mail et je l’envoie.',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.reply',
                        params: { reply_target: 'Jean-Eric', draft_text: 'bien recu' }
                    }]
                }
            };
        }
    }
});

const connectorReply = await plannerMailReplyShouldUseConnector.executeUtterance('Reponds a Jean-Eric que j ai bien recu le mail');
assert.equal(connectorReply.transport, 'mail_api', 'mail reply should use the deterministic mail connector even when the ai planner proposes an AtomeAI action');
assert.notEqual(connectorReply.reply_text, 'Je réponds au mail et je l’envoie.', 'mail reply should not surface a planner placeholder instead of the transport result');

console.log('voice_orchestrator_ai_planner: ok');
