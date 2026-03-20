import assert from 'node:assert/strict';

import { createVoiceAiPlanner } from './ai_planner.js';

const env = {
    fetch: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            reply: 'J ouvre Mtrack.',
                            domain: 'ui_navigation',
                            action: 'open_tool',
                            target: 'runtime_v2',
                            actions: [{
                                target: 'runtime_v2',
                                tool_id: 'tool.main.mtrack',
                                action: 'pointer.click',
                                input: {}
                            }]
                        })
                    }
                }]
            };
        }
    }),
    AtomeAI: {
        listTools() {
            return [{ name: 'contacts.list', description: 'List contacts' }];
        }
    }
};

const planner = createVoiceAiPlanner({
    env,
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
    fetchImpl: env.fetch
});

const planned = await planner.planUtterance('Ouvre Mtrack', {
    locale: 'fr-FR',
    runtime_tools: [{ tool_id: 'tool.main.mtrack', tool_key: 'main_mtrack' }],
    heuristic_intent: {
        domain: 'ui_navigation',
        action: 'open_tool'
    }
});

assert.equal(planned.execution.target, 'runtime_v2', 'voice ai planner should preserve runtime target planning');
assert.equal(planned.execution.toolchain[0]?.tool_id, 'tool.main.mtrack', 'voice ai planner should return runtime tool ids from the provider plan');
assert.equal(planned.assistant_reply, 'J ouvre Mtrack.', 'voice ai planner should preserve the provider spoken reply');
assert.equal(planned.domain, 'ui_navigation', 'voice ai planner should preserve the domain selected by the provider');
assert.equal(planned.action, 'open_tool', 'voice ai planner should preserve the action selected by the provider');

const failingPlanner = createVoiceAiPlanner({
    env: {
        ...env,
        fetch: async () => {
            throw new Error('Unauthorized');
        }
    },
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [{ provider: 'openai', model: 'gpt-4o-mini', key: 'bad-key' }]
                }
            }
        };
    },
    fetchImpl: async () => {
        throw new Error('Unauthorized');
    }
});

const failed = await failingPlanner.planUtterance('Open Mtrack', {
    locale: 'en-US',
    heuristic_intent: {
        domain: 'ui_navigation',
        action: 'open_tool'
    }
});

assert.equal(failed.status, 'failed', 'voice ai planner should surface provider failures as failed intents');
assert.equal(failed.context.ai_error, 'provider_auth_failed', 'voice ai planner should expose the normalized provider error');
assert.equal(failed.assistant_reply, 'The AI is not responding.', 'voice ai planner should localize spoken failure replies');

console.log('voice_ai_planner: ok');
