import assert from 'node:assert/strict';

import { createVoiceOrchestrator } from './orchestrator.js';

const orchestrator = createVoiceOrchestrator({
    env: {
        async handleAtomeMCPRequestAsync(request = {}) {
            if (request.method === 'runtime.tools.list') {
                return { jsonrpc: '2.0', id: request.id, result: { tools: [] } };
            }
            return { jsonrpc: '2.0', id: request.id, result: { ok: true } };
        }
    },
    aiPlanner: {
        async planUtterance(_utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'trace_orchestrator_intent',
                locale: options.locale || 'fr-FR',
                utterance: { raw: 'Bonjour' },
                context: {
                    identity_resolution: {
                        resolved: [{ domain: 'contacts', entity_id: 'contact_trace_1', confidence: 0.99 }]
                    },
                    ai_provider: 'openai',
                    ai_model: 'gpt-test'
                },
                domain: 'conversation',
                action: 'answer',
                type: 'ambiguous',
                status: 'ready',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                },
                assistant_reply: 'Bonjour.'
            };
        }
    }
});

await orchestrator.executeUtterance('Bonjour', {
    locale: 'fr-FR',
    context: {
        identity_resolution: {
            resolved: [{ domain: 'contacts', entity_id: 'contact_trace_1', confidence: 0.99 }]
        }
    }
});

const traces = orchestrator.listTraces({ limit: 1 });
assert.equal(traces.length, 1, 'orchestrator should emit a structured trace for each utterance');
assert.equal(traces[0]?.identity_resolution?.resolved?.[0]?.entity_id, 'contact_trace_1', 'structured traces should keep identity resolution data');
assert.equal(traces[0]?.response?.reply_text, 'Bonjour.', 'structured traces should keep the delivered response');

const metrics = orchestrator.traceMetrics();
assert.equal(metrics.trace_count, 1, 'orchestrator should expose aggregated trace metrics');

console.log('orchestrator.trace_store.test: PASS');
process.exit(0);
