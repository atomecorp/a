import assert from 'node:assert/strict';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

const values = new Map();
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.window = {
    location: { protocol: 'https:', hostname: 'example.test', port: '' },
    dispatchEvent: () => true,
    __SQUIRREL_AUTH_SOURCE__: 'fastify'
};

const { FastifyAdapter } = await import('../../atome/src/squirrel/apis/unified/adole.js');
const { auth } = await import('../../atome/src/squirrel/apis/unified/adole_api/auth.js');
const { setSessionState } = await import('../../atome/src/squirrel/apis/unified/adole_api/session.js');
const store = await import('../../atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js');

const messages = [];
FastifyAdapter.ws.send = async (message) => {
    messages.push(message);
    if (message.type !== 'guest-adoption') throw new Error('unexpected_remote_call');
    return { ok: true, success: true, status: message.action === 'finalize' ? 'completed' : 'importing' };
};

const started = await auth.startGuest({ force: true });
assert.equal(started.ok, true);
const guestId = started.user.id;
assert.equal((await store.commitGuestAtome(guestId, {
    atome_id: 'guest-lifecycle-project', type: 'project', properties: { name: 'Offline guest project' }
})).ok, true);
assert.equal((await store.putGuestFile(guestId, { name: 'offline.txt', blob: new Blob(['offline guest file']) })).ok, true);

assert.deepEqual(await auth.leaveGuest(), { ok: true, retained: true });
const resumed = await auth.startGuest({ force: true });
assert.equal(resumed.user.id, guestId);
assert.equal((await store.guestAdoptionPayload(guestId)).events.length, 1);
assert.equal((await store.guestAdoptionPayload(guestId)).snapshots.length, 1);
assert.equal(messages.length, 0);

setSessionState({ mode: 'authenticated', user: { id: crypto.randomUUID(), name: 'Account', phone: null }, backend: 'fastify' });
const refused = await auth.adoptGuestWorkspace({ confirmed: false, operationId: crypto.randomUUID() });
assert.equal(refused.error, 'guest_adoption_confirmation_required');
assert.equal((await store.guestAdoptionPayload(guestId)).atomes.length, 1);
assert.equal(messages.length, 0);

const adopted = await auth.adoptGuestWorkspace({ confirmed: true, operationId: crypto.randomUUID() });
assert.equal(adopted.ok, true);
assert.deepEqual(messages.map((message) => message.action), ['prepare', 'import', 'stage-file', 'finalize']);
assert.deepEqual(await store.guestAdoptionPayload(guestId), {
    atomes: [], events: [], snapshots: [], sync_queue: [], permissions: [], files: []
});
console.log('guest_workspace_lifecycle_runtime_probe: PASS');
