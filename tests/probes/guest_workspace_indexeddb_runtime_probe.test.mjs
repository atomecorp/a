import assert from 'node:assert/strict';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

const store = await import('../../atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js');
const ownerId = '550e8400-e29b-41d4-a716-446655440000';
const secondOwnerId = '660e8400-e29b-41d4-a716-446655440000';
const atomeId = 'guest-project-indexeddb';

assert.deepEqual(await store.listGuestAtomes(ownerId), []);
assert.equal((await store.commitGuestAtome(ownerId, {
    atome_id: atomeId,
    type: 'project',
    project_id: atomeId,
    properties: { name: 'IndexedDB guest project' }
})).ok, true);
assert.equal((await store.getGuestAtome(ownerId, atomeId)).properties.name, 'IndexedDB guest project');

const file = new Blob(['guest local file'], { type: 'text/plain' });
const fileResult = await store.putGuestFile(ownerId, { name: 'guest.txt', blob: file });
assert.equal(fileResult.ok, true);
const payload = await store.guestAdoptionPayload(ownerId);
assert.equal(payload.atomes.length, 1);
assert.equal(payload.events.length, 1);
assert.equal(payload.snapshots.length, 1);
assert.equal(payload.snapshots[0].actor.id, ownerId);
assert.equal(payload.sync_queue.length, 1);
assert.equal(payload.files.length, 1);
assert.equal(payload.files[0].file_name, 'guest.txt');
assert.equal(payload.files[0].byte_length, file.size);

assert.equal((await store.commitGuestAtome(secondOwnerId, {
    atome_id: 'guest-project-indexeddb-second', type: 'project', properties: { name: 'Second installation' }
})).ok, true);
assert.equal((await store.putGuestFile(secondOwnerId, { name: 'second.txt', blob: new Blob(['second local file']) })).ok, true);
assert.equal((await store.guestAdoptionPayload(secondOwnerId)).atomes.length, 1);
assert.equal((await store.guestAdoptionPayload(secondOwnerId)).snapshots.length, 1);
assert.equal((await store.guestAdoptionPayload(ownerId)).atomes.length, 1);

assert.equal((await store.deleteGuestAtome(ownerId, atomeId)).ok, true);
assert.equal((await store.listGuestAtomes(ownerId)).length, 0);
await store.clearGuestWorkspace(ownerId);
assert.deepEqual(await store.guestAdoptionPayload(ownerId), {
    atomes: [], events: [], snapshots: [], sync_queue: [], permissions: [], files: []
});
assert.equal((await store.guestAdoptionPayload(secondOwnerId)).atomes.length, 1);
assert.equal((await store.guestAdoptionPayload(secondOwnerId)).files.length, 1);
await store.clearGuestWorkspace(secondOwnerId);
console.log('guest_workspace_indexeddb_runtime_probe: PASS');
