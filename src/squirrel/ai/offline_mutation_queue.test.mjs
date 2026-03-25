import assert from 'node:assert/strict';

import { createOfflineMutationQueue } from './offline_mutation_queue.js';

const queue = createOfflineMutationQueue();

queue.clear();

const firstEntry = queue.enqueue({
    domain: 'contacts',
    operation: 'create',
    payload: { name: 'Sylvain', phone: '0611223344' }
});

assert.ok(firstEntry?.id, 'offline mutation queue should assign an id');
assert.equal(queue.list().length, 1, 'offline mutation queue should store pending mutations');

let calls = 0;
const firstFlush = await queue.flush(async (request) => {
    calls += 1;
    if (request.operation === 'create') return { ok: false, offline: true, error: 'Server unreachable' };
    return { ok: true };
});

assert.equal(calls, 1, 'offline mutation queue should invoke the processor during flush');
assert.equal(firstFlush.failed, 1, 'offline mutation queue should retain offline failures');
assert.equal(queue.list().length, 1, 'offline failures should remain queued');

const secondFlush = await queue.flush(async () => ({ ok: true }));

assert.equal(secondFlush.failed, 0, 'successful replay should clear the queue');
assert.equal(queue.list().length, 0, 'queue should be empty once replay succeeds');

console.log('offline_mutation_queue.test: PASS');
