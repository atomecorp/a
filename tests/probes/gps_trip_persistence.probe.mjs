import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createGpsTripStore } from '../../atome/src/squirrel/gps/trip_store.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { encodeGpsShape } from '../../atome/src/squirrel/gps/route_geometry.js';
import { normalizeEventInput } from '../../eVe/core/atome_commit_fetch.js';

test('GPS itinerary lifecycle uses real SQLite events, survives reopen and rejects stale writes', async () => {
    const directory = fs.mkdtempSync(path.resolve('temp/gps-db-'));
    process.env.SQLITE_PATH = path.join(directory, 'gps.db');
    const db = await import('../../database/adole.js?gps_trip_probe');
    registerCoreAtomeTypes();
    let actor = 'gps_owner', sequence = 0;
    const api = {
        getStateCurrent: db.getStateCurrent,
        listStateCurrent: (projectId, options) => db.listStateCurrent(projectId, { ...options, ownerId: actor }),
        commit: async event => {
            await db.appendEvent(normalizeEventInput({ ...event, actor: { type: 'user', id: actor }, ts: new Date().toISOString() }));
            return { ok: true };
        }
    };
    const store = createGpsTripStore({ api, readActor: () => actor, createId: () => 'gps_event_' + (++sequence) });
    try {
        await db.initDatabase();
        await db.createAtome({ id: actor, type: 'user', owner: actor, creator: actor });
        const input = { request_id: 'trip_a', name: 'Paris', origin: { lat: 48, lon: 2 }, destination: { lat: 48, lon: 2.002 } };
        const created = await store.create(input);
        assert.equal(created.properties.revision, 0); assert.equal(created.properties.status, 'planned');
        assert.equal((await store.create(input)).id, created.id);
        await assert.rejects(() => store.create({ ...input, destination: { lat: 48.1, lon: 2 } }), /VERSION_CONFLICT/);
        const route = { shape: encodeGpsShape([input.origin, input.destination]), maneuvers: [], distance_m: 150,
            duration_s: 20, provider: 'valhalla', calculated_at: new Date().toISOString() };
        const routed = await store.update(created, { route });
        await assert.rejects(() => store.update(created, { status: 'navigating' }), /VERSION_CONFLICT/);
        const started = await store.update(routed, { status: 'navigating', navigation_device: 'qa' });
        await store.update(started, { status: 'stopped', ended_at: new Date().toISOString() });
        const before = await db.listEvents({ atomeId: created.id });
        assert.equal(before.length, 4); assert.equal(before[0].payload.scope, 'global');
        assert.equal((await db.getStateCurrent(created.id)).project_id ?? null, null);
        actor = 'other_owner'; await assert.rejects(() => store.read(created.id), /TRIP_NOT_FOUND/);
        assert.deepEqual(await store.list(), []); actor = 'gps_owner';
        await db.closeDatabase(); await db.initDatabase();
        const restored = await store.read(created.id);
        assert.equal(restored.properties.status, 'stopped'); assert.deepEqual(restored.properties.route, route);
        assert.ok(restored.updated_at, 'The canonical state metadata supplies the history date');
        assert.equal((await store.list()).length, 1);
        assert.equal((await db.listEvents({ atomeId: created.id })).length, before.length);
    } finally { await db.closeDatabase(); fs.rmSync(directory, { recursive: true, force: true }); }
});
