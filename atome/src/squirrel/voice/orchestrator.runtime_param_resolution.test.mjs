import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceSessionRuntime } from './session_runtime.js';

const calls = [];
const env = {
    async handleAtomeMCPRequestAsync(request = {}) {
        if (request.method === 'runtime.tools.list') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    tools: [
                        { tool_id: 'calendar.ensure_calendar', tool_key: 'calendar_ensure_calendar' },
                        { tool_id: 'calendar.create_event', tool_key: 'calendar_create_event' }
                    ]
                }
            };
        }
        if (request.method === 'runtime.tools.batch_call') {
            calls.push(request.params.events);
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    results: request.params.events.map((entry) => ({ ok: true, tool_id: entry.tool_id, input: entry.input }))
                }
            };
        }
        return { jsonrpc: '2.0', id: request.id, error: { message: 'unsupported' } };
    }
};

const orchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_runtime_param_resolution_llm',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                source: options.source,
                context: options.context,
                type: 'runtime_toolchain',
                domain: 'calendar',
                action: 'create_event',
                status: 'ready',
                entities: {
                    temporal_ref: 'tomorrow',
                    time_hint: '15:00',
                    participant_hint: 'Paul'
                },
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [
                        {
                            source: 'runtime_v2',
                            tool_id: 'calendar.ensure_calendar',
                            action: 'pointer.click',
                            input: {}
                        },
                        {
                            source: 'runtime_v2',
                            tool_id: 'calendar.create_event',
                            action: 'pointer.click',
                            input: {
                                temporal_ref: 'tomorrow',
                                time_hint: '15:00',
                                participant_hint: 'Paul'
                            }
                        }
                    ]
                }
            };
        }
    }
});

const result = await orchestrator.executeUtterance('Ajoute un rendez-vous demain a 15h avec Paul', {
    session_id: 'voice_runtime_param_resolution'
});

assert.equal(result.ok, true);
assert.equal(result.executed, true);
assert.equal(calls.length, 1);
assert.equal(calls[0][1].tool_id, 'calendar.create_event');
assert.equal(calls[0][1].input.time_hint, '15:00');
assert.equal(calls[0][1].input.participant_hint, 'Paul');

console.log('orchestrator.runtime_param_resolution.test: PASS');
