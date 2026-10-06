import assert from 'node:assert/strict';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: name => storage.get(name) || null,
    setItem: (name, value) => storage.set(name, String(value)),
    removeItem: name => storage.delete(name)
} });

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

// Exercise the actual local reader consumed by the contextual menu, not a
// handcrafted record with rights that the IndexedDB path never supplied.
const { setSessionState } = await import('../../atome/src/squirrel/apis/unified/adole_api/session.js');
const { browserWorkspaceRequest } = await import('../../atome/src/squirrel/apis/unified/adole_api/browser_workspace.js');
const { getStateCurrent } = await import('../../eVe/core/atome_commit.js');
const { AdoleAPI } = await import('../../atome/src/squirrel/apis/unified/adole_apis.js');
await AdoleAPI.security.waitForAuthCheck();
setSessionState({ mode: 'anonymous', user: { id: ownerId }, backend: 'local_guest' });
const read = await browserWorkspaceRequest({ type: 'state-current', action: 'get', atome_id: atomeId });
assert.equal(read.state.capabilities?.create, true, 'guest project must expose its local owner access to the rail');
assert.equal(read.state.capabilities?.properties?.name?.write, true);
assert.equal(read.state.capabilities?.delete, true);
assert.deepEqual((await getStateCurrent(atomeId)).capabilities, read.state.capabilities,
    'the canonical Atome reader must retain the projection consumed by menus');
assert.equal(read.atome, read.state);
assert.equal(read.data, read.state);
const listed = await browserWorkspaceRequest({ type: 'state-current', action: 'list', project_id: atomeId });
assert.deepEqual(listed.states[0].capabilities, read.state.capabilities);
assert.equal((await store.getGuestAtome(ownerId, atomeId)).capabilities, undefined,
    'access is a read projection, not durable guest state');
setSessionState({ mode: 'anonymous', user: { id: secondOwnerId }, backend: 'local_guest' });
await assert.rejects(browserWorkspaceRequest({ type: 'state-current', action: 'get', atome_id: atomeId }), /atome_not_available_locally/);
setSessionState({ mode: 'anonymous', user: { id: ownerId }, backend: 'local_guest' });
const pendingRead = browserWorkspaceRequest({ type: 'state-current', action: 'get', atome_id: atomeId });
setSessionState({ mode: 'anonymous', user: { id: secondOwnerId }, backend: 'local_guest' });
await assert.rejects(pendingRead, /workspace_identity_changed/);
setSessionState({ mode: 'logged_out', user: null, backend: null });
await assert.rejects(browserWorkspaceRequest({ type: 'state-current', action: 'get', atome_id: atomeId }), /local_authorization_required/);

// Existing server projections must keep their restrictions at the local boundary.
const restrictedId = 'guest-restricted-projection';
const restrictedOwner = '770e8400-e29b-41d4-a716-446655440000';
const restrictedAccess = { create: false, delete: false, share: false, properties: { name: { write: false } } };
await store.importWorkspaceStates(restrictedOwner, [{ atome_id: restrictedId, owner_id: restrictedOwner,
    properties: { name: 'Restricted' }, capabilities: restrictedAccess }]);
setSessionState({ mode: 'authenticated', user: { id: restrictedOwner }, backend: 'fastify' });
assert.deepEqual((await browserWorkspaceRequest({ type: 'atome', action: 'get', atome_id: restrictedId })).state.capabilities, restrictedAccess);
await store.clearGuestWorkspace(restrictedOwner);

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
