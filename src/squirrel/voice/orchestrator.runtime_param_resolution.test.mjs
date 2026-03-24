import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';
import { classifyVoiceIntent } from './intent_schema.js';

const sessionRuntime = createVoiceSessionRuntime();

const bridge = {
    kind: 'runtime_v2',
    async listRuntimeTools() {
        return [
            { tool_id: 'ui.circle', tool_key: 'circle' },
            { tool_id: 'ui.couleur.apply', tool_key: 'couleur_apply' }
        ];
    },
    async callRuntimeTool(payload = {}) {
        if (payload.tool_id === 'ui.circle') {
            return {
                ok: true,
                created: true,
                atome_id: 'atome_runtime_circle_1'
            };
        }
        if (payload.tool_id === 'ui.couleur.apply') {
            return {
                ok: true,
                atome_id: payload.input?.atome_id || null
            };
        }
        return { ok: false, error: 'unexpected_tool' };
    }
};

const orchestrator = createVoiceOrchestrator({
    bridge,
    sessionRuntime,
    aiPlanner: {
        async planUtterance() {
            return {
                locale: 'fr-FR',
                domain: 'creative',
                action: 'draw_circle',
                status: 'ready',
                assistant_reply: 'Je crée un cercle sur le projet courant.',
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'runtime_v2',
                        tool_id: 'ui.circle',
                        action: 'pointer.click',
                        input: {}
                    }]
                }
            };
        }
    }
});

sessionRuntime.createSession({
    session_id: 'voice_runtime_param_resolution',
    locale: 'fr-FR'
});

const plannedCreate = await orchestrator.planUtterance('Peux tu me creer un cercle rouge sur le projet courant', {
    session_id: 'voice_runtime_param_resolution'
});

assert.equal(plannedCreate.execution.toolchain[0]?.tool_id, 'ui.circle');
assert.equal(
    plannedCreate.execution.toolchain[0]?.input?.color,
    'red',
    'runtime planning should preserve the requested circle color when the AI planner drops it'
);

const createResult = await orchestrator.executeIntent(plannedCreate, {
    session_id: 'voice_runtime_param_resolution'
});

assert.equal(createResult.ok, true);
assert.equal(createResult.result?.atome_id, 'atome_runtime_circle_1');
assert.equal(
    sessionRuntime.getActiveIntent('voice_runtime_param_resolution')?.meta?.atome_id,
    'atome_runtime_circle_1',
    'runtime execution should persist the created atome id for follow-up voice actions'
);

const followupIntent = classifyVoiceIntent('Mets le en violet', {
    runtime_tools: await bridge.listRuntimeTools(),
    context: {
        active_intent: sessionRuntime.getActiveIntent('voice_runtime_param_resolution')
    }
});

assert.equal(followupIntent.execution.toolchain[0]?.tool_id, 'ui.couleur.apply');
assert.equal(followupIntent.execution.toolchain[0]?.input?.color, 'violet');
assert.equal(
    followupIntent.execution.toolchain[0]?.input?.atome_id,
    'atome_runtime_circle_1',
    'runtime follow-ups should target the last created atome when available'
);

console.log('orchestrator.runtime_param_resolution.test: PASS');
