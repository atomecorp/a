import assert from 'node:assert/strict';

import { createVoiceAiPlanner } from './ai_planner.js';

const planner = createVoiceAiPlanner({
    env: {},
    async loadProfile() {
        return { ok: false, error: 'no_ai_key_configured' };
    }
});

const degraded = await planner.planUtterance('Lis mes mails', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'mail',
        action: 'list',
        type: 'connector_tool',
        status: 'pending_connector',
        execution: {
            target: 'pending_connector',
            confirmation_required: false,
            toolchain: []
        }
    }
});

assert.equal(degraded.status, 'ready', 'degraded mode should preserve safe heuristic intents as executable');
assert.equal(degraded.execution.target, 'pending_connector', 'degraded mode should keep safe connector execution paths');
assert.equal(degraded.context.ai_model_tier, 'degraded', 'degraded mode should expose the degraded tier in context');

const unsafe = await planner.planUtterance('Supprime ce contact', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'contacts',
        action: 'delete',
        execution: {
            target: 'pending_connector',
            confirmation_required: true,
            toolchain: []
        }
    }
});

assert.equal(unsafe.status, 'failed', 'degraded mode should reject unsafe heuristic execution');

console.log('ai_planner.degraded_mode.test: PASS');
process.exit(0);
