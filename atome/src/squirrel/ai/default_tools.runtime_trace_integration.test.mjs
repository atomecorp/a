import assert from 'node:assert/strict';

const registeredTools = new Map();
const runtimeInvocations = [];

globalThis.AtomeAI = {
    registerTool(definition = {}) {
        registeredTools.set(definition.name, definition);
    }
};

globalThis.atome = {
    tools: {
        v2Runtime: {
            async invokeById(payload = {}) {
                runtimeInvocations.push(payload);
                return {
                    ok: true,
                    trace_id: payload?.meta?.trace_id,
                    intent_id: payload?.meta?.intent_id,
                    event: payload?.input
                };
            }
        }
    }
};

await import('./default_tools.js');

const calendarCreateTool = registeredTools.get('calendar.create_event');
assert.ok(calendarCreateTool, 'calendar.create_event should be registered in AtomeAI');

const result = await calendarCreateTool.handler({
    params: {
        title: 'Trace runtime event',
        start: '2026-03-12T14:00:00.000Z',
        end: '2026-03-12T15:00:00.000Z'
    },
    context: {
        trace_id: 'trace_ai_runtime_1',
        intent_id: 'intent_ai_runtime_1',
        idempotency_key: 'calendar_create_trace_1'
    }
});

assert.equal(result?.ok, true, 'calendar.create_event default tool should succeed through runtime V2');
assert.equal(result?.trace_id, 'trace_ai_runtime_1', 'runtime result should surface the propagated trace_id');
assert.equal(result?.intent_id, 'intent_ai_runtime_1', 'runtime result should surface the propagated intent_id');

assert.equal(runtimeInvocations.length, 1, 'calendar.create_event should call the injected runtime once');
assert.equal(
    runtimeInvocations[0]?.meta?.trace_id,
    'trace_ai_runtime_1',
    'runtime invocation should preserve the AI trace_id'
);
assert.equal(
    runtimeInvocations[0]?.source?.type,
    'ai',
    'runtime invocation should preserve the AI source type'
);
assert.equal(
    runtimeInvocations[0]?.tool_id,
    'calendar.create_event',
    'runtime invocation should use the canonical runtime tool id'
);
assert.equal(
    runtimeInvocations[0]?.source?.layer,
    'atome_ai_default_tool',
    'runtime invocation should preserve the AI source layer'
);
assert.equal(
    runtimeInvocations[0]?.input?.title,
    'Trace runtime event',
    'runtime invocation should contain the created calendar event'
);

console.log('default_tools.runtime_trace_integration.test: PASS');
process.exit(0);
