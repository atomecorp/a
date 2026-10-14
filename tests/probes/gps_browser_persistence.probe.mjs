import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createGpsTripStore } from '../../atome/src/squirrel/gps/trip_store.js';

test('real browser commit pipeline creates GPS after a missing read and rejects stale local revisions', async () => {
    globalThis.indexedDB = indexedDB; globalThis.IDBKeyRange = IDBKeyRange;
    const values = new Map();
    globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
    globalThis.window = { location: { protocol: 'https:', hostname: 'example.test', port: '' }, dispatchEvent: () => true,
        addEventListener: () => {}, __SQUIRREL_AUTH_SOURCE__: 'fastify' };
    const { setSessionState, getSessionState } = await import('../../atome/src/squirrel/apis/unified/adole_api/session.js');
    const workspace = await import('../../atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js');
    await import('../../eVe/core/atome_commit.js');
    const owner = 'gps_browser_owner'; setSessionState({ mode: 'authenticated', user: { id: owner }, backend: 'fastify' });
    const store = createGpsTripStore({ api: window.__atomeCommitApi, readActor: () => getSessionState().user?.id, createId: () => crypto.randomUUID() });
    try {
        const input = { request_id: 'browser_a', name: 'Paris', origin: { lat: 48, lon: 2 }, destination: { lat: 48, lon: 2.002 } };
        const created = await store.create(input);
        assert.equal(created.properties.status, 'planned'); assert.equal(created.properties.revision, 0);
        assert.equal((await store.create(input)).id, created.id);
        const updated = await store.update(created, { status: 'navigating' });
        await assert.rejects(() => store.update(created, { status: 'stopped' }), /VERSION_CONFLICT/);
        assert.equal((await store.read(created.id)).properties.revision, updated.properties.revision);
        const rebuilt = createGpsTripStore({ api: window.__atomeCommitApi, readActor: () => owner, createId: () => crypto.randomUUID() });
        assert.equal((await rebuilt.read(created.id)).properties.status, 'navigating');
        assert.equal((await workspace.listWorkspaceEvents(owner, { atome_id: created.id })).length, 2);
        setSessionState({ mode: 'authenticated', user: { id: 'other_browser_owner' }, backend: 'fastify' });
        assert.deepEqual(await store.list(), []); await assert.rejects(() => store.read(created.id), /TRIP_NOT_FOUND/);
    } finally { await workspace.clearGuestWorkspace(owner); delete globalThis.window; }
});
