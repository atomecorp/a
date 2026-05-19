import assert from 'node:assert/strict';

import { installMockBrowserEnv } from '../../eVe/tests/strangler_v2/_env.mjs';

const registeredTools = new Map();

globalThis.AtomeAI = {
    registerTool(definition = {}) {
        registeredTools.set(definition.name, definition);
    }
};

installMockBrowserEnv({
    runTool: async (payload = {}) => ({ ok: true, payload }),
    eveToolBase: {
        createAtome: async (spec) => ({ ok: true, id: 'default_tools_runtime_trace', spec })
    }
});

const { commandBusV2 } = await import('../../../eVe/intuition/runtime/index.js');
await import('./default_tools.js');

const calendarCreateTool = registeredTools.get('calendar.create_event');
assert.ok(calendarCreateTool, 'calendar.create_event should be registered in AtomeAI');

commandBusV2.clear();

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

const acceptedEvents = commandBusV2.listEvents({ kind: 'command_accepted' });
const executionEvents = commandBusV2.listEvents({ kind: 'tool_execution_result' });

assert.equal(acceptedEvents.length > 0, true, 'runtime command bus should record command_accepted events');
assert.equal(executionEvents.length > 0, true, 'runtime command bus should record tool_execution_result events');
assert.equal(
    acceptedEvents.at(-1)?.envelope?.trace_id,
    'trace_ai_runtime_1',
    'runtime command bus should preserve the AI trace_id'
);
assert.equal(
    acceptedEvents.at(-1)?.envelope?.source,
    'ai',
    'runtime command bus should preserve the AI source type'
);
assert.equal(
    executionEvents.at(-1)?.tool_id,
    'calendar.create_event',
    'runtime command bus should record the canonical runtime tool id'
);
assert.equal(
    executionEvents.at(-1)?.trace_id,
    'trace_ai_runtime_1',
    'runtime execution events should preserve the AI trace_id'
);
assert.equal(
    executionEvents.at(-1)?.source,
    'ai',
    'runtime execution events should preserve the AI source type'
);
assert.equal(
    executionEvents.at(-1)?.source_layer,
    'atome_ai_default_tool',
    'runtime execution events should preserve the AI source layer'
);
assert.equal(
    executionEvents.at(-1)?.result?.event?.title,
    'Trace runtime event',
    'runtime execution result should contain the created calendar event'
);

console.log('default_tools.runtime_trace_integration.test: PASS');
process.exit(0);
