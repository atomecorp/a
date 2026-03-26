import assert from 'node:assert/strict';

import { createVoiceAiPlanner } from './ai_planner.js';
import { createAiQuotaTracker } from '../ai/quota_tracker.js';

const quotaTracker = createAiQuotaTracker();
quotaTracker.setBudgetTokensPerDay(100);

const planner = createVoiceAiPlanner({
    quotaTracker,
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'voice-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            reply: '',
                            domain: 'contacts',
                            action: 'read_contact',
                            target: 'pending_connector',
                            query_text: 'Sylvain'
                        })
                    }
                }],
                usage: {
                    prompt_tokens: 45,
                    completion_tokens: 40,
                    total_tokens: 85
                }
            };
        }
    })
});

const planned = await planner.planUtterance('Quel est le numero de Sylvain ?', {
    locale: 'fr-FR',
    heuristic_intent: {
        domain: 'contacts',
        action: 'read_contact'
    }
});

assert.equal(planned.context.ai_usage.total_tokens, 85, 'voice ai planner should surface provider token usage');
assert.equal(planned.context.ai_quota_warning_code, 'quota_running_low', 'voice ai planner should surface low-quota warnings');

console.log('ai_planner.quota_warning.test: PASS');
