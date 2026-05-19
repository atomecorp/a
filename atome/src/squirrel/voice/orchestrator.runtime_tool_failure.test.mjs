import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const env = {
    async handleAtomeMCPRequestAsync(request = {}) {
        if (request.method === 'runtime.tools.list') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    tools: [{ tool_id: 'ui.couleur.apply', tool_key: 'couleur_apply' }]
                }
            };
        }
        if (request.method === 'runtime.tools.call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: false,
                    error: 'tool_selection_required'
                }
            };
        }
        throw new Error(`Unhandled method ${request.method}`);
    }
};

const orchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime()
});

const response = await orchestrator.executeIntent({
    intent_id: 'voice_runtime_failure_1',
    locale: 'fr-FR',
    domain: 'creative',
    action: 'invoke_tool',
    assistant_reply: 'Je mets le cercle en violet.',
    execution: {
        target: 'runtime_v2',
        confirmation_required: false,
        toolchain: [{
            source: 'runtime_v2',
            tool_id: 'ui.couleur.apply',
            action: 'pointer.click',
            input: { color: 'violet' }
        }]
    }
}, {
    session_id: 'voice_runtime_failure_session'
});

assert.equal(response.ok, false, 'runtime tool failures should propagate as failures');
assert.equal(response.executed, false, 'runtime tool failures should not be reported as executed');
assert.match(response.reply_text || '', /echoue/i, 'runtime tool failures should speak an explicit failure reply');
assert.doesNotMatch(response.reply_text || '', /violet/i, 'runtime tool failures should not reuse the optimistic assistant reply');

console.log('orchestrator.runtime_tool_failure.test: PASS');
