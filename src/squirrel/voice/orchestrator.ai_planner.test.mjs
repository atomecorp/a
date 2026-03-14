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

console.log('voice_orchestrator_ai_planner: ok');
