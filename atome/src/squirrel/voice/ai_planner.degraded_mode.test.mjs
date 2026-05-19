import assert from 'node:assert/strict';

import { createVoiceAiPlanner } from './ai_planner.js';

const planner = createVoiceAiPlanner({
    env: {},
    async loadProfile() {
        return { ok: false, error: 'no_ai_key_configured' };
    }
});

const failed = await planner.planUtterance('Lis mes mails', {
    locale: 'fr-FR'
});

assert.equal(failed.status, 'failed', 'planner should fail explicitly when no AI key is configured');
assert.equal(failed.execution.target, 'none', 'planner should not synthesize a local fallback execution path');
assert.equal(failed.context.ai_error, 'no_ai_key_configured', 'planner should expose the root cause');
assert.match(failed.assistant_reply, /cle IA|IA/i, 'planner should expose a spoken failure');

console.log('ai_planner.degraded_mode.test: PASS');
process.exit(0);
