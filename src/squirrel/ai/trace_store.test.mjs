import assert from 'node:assert/strict';

import { createAiTraceStore } from './trace_store.js';

const storage = new Map();
const env = {
    localStorage: {
        getItem(key) {
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            storage.set(key, String(value));
        }
    }
};

const traces = createAiTraceStore({ env, storageKey: 'trace_store_test' });
const started = traces.startTrace({
    trace_id: 'trace_store_probe',
    input: {
        utterance: 'Lis mes mails',
        modality: 'voice'
    }
});
traces.appendExecution(started.trace_id, {
    tool_name: 'mail.list',
    ok: true
});
traces.finishTrace(started.trace_id, {
    total_latency_ms: 123,
    response: {
        ok: true,
        reply_text: 'Tu as 2 mails.'
    }
});

const listed = traces.list({ limit: 1 });
assert.equal(listed.length, 1, 'trace store should persist traces locally');
assert.equal(listed[0]?.execution?.[0]?.tool_name, 'mail.list', 'trace store should keep execution steps');
assert.equal(listed[0]?.total_latency_ms, 123, 'trace store should keep total latency');

console.log('trace_store.test: PASS');
process.exit(0);
