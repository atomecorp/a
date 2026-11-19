// The GPS itinerary store (atome/src/squirrel/gps/trip_store.js) on a real, isolated atome-server
// (tests/helpers/probe_server.mjs): its events reach the person's vault through the one commit, a stale
// revision is refused, another account never reads the trip, and everything survives a server restart.
import assert from 'node:assert/strict';
import { createGpsTripStore } from '../../atome/src/squirrel/gps/trip_store.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { encodeGpsShape } from '../../atome/src/squirrel/gps/route_geometry.js';
import { normalizeEventInput } from '../../eVe/core/atome_commit_fetch.js';
import { commit, connectUser, startServer } from '../helpers/probe_server.mjs';

registerCoreAtomeTypes();
const suffix = String(process.pid % 50000).padStart(5, '0');
let server = await startServer();
try {
    let owner = await connectUser(server, { phone: `+33995${suffix}`, name: 'gps_owner' });
    const other = await connectUser(server, { phone: `+33996${suffix}`, name: 'gps_other' });
    let actor = owner, sequence = 0;
    const api = {
        getStateCurrent: async (id) => {
            const reply = await actor.call({ type: 'state-current', action: 'get', atome_id: id });
            return reply.success ? reply.state : null;
        },
        listStateCurrent: async (_projectId, { atomeType, limit, offset }) => {
            const reply = await actor.call({ type: 'state-current', action: 'list', atome_type: atomeType, limit, offset });
            if (!reply.success) throw new Error(reply.error || 'state_list_failed');
            return reply.states;
        },
        commit: (event) => commit(actor, normalizeEventInput({ ...event, ts: new Date().toISOString() }))
    };
    const eventsOf = async (atomeId) => {
        const reply = await owner.call({ type: 'events', action: 'list', atome_id: atomeId });
        assert.equal(reply.success, true, JSON.stringify(reply));
        return reply.events;
    };
    const store = createGpsTripStore({ api, readActor: () => actor.id, createId: () => `gps_event_${++sequence}` });

    const input = { request_id: `trip_${suffix}`, name: 'Paris', origin: { lat: 48, lon: 2 }, destination: { lat: 48, lon: 2.002 } };
    const created = await store.create(input);
    assert.equal(created.properties.revision, 0);
    assert.equal(created.properties.status, 'planned');
    assert.equal((await store.create(input)).id, created.id);
    await assert.rejects(() => store.create({ ...input, destination: { lat: 48.1, lon: 2 } }), /VERSION_CONFLICT/);
    const route = { shape: encodeGpsShape([input.origin, input.destination]), maneuvers: [], distance_m: 150,
        duration_s: 20, provider: 'valhalla', calculated_at: new Date().toISOString() };
    const routed = await store.update(created, { route });
    await assert.rejects(() => store.update(created, { status: 'navigating' }), /VERSION_CONFLICT/);
    const started = await store.update(routed, { status: 'navigating', navigation_device: 'qa' });
    await store.update(started, { status: 'stopped', ended_at: new Date().toISOString() });
    const before = await eventsOf(created.id);
    assert.equal(before.length, 4, JSON.stringify(before));

    actor = other;
    await assert.rejects(() => store.read(created.id), /TRIP_NOT_FOUND/);
    assert.deepEqual(await store.list(), []);

    const session = { id: owner.id, phone: owner.phone, name: owner.name, token: owner.token };
    owner.close();
    other.close();
    server = await server.restart();
    owner = await connectUser(server, { session });
    actor = owner;
    const restored = await store.read(created.id);
    assert.equal(restored.properties.status, 'stopped');
    assert.deepEqual(restored.properties.route, route);
    assert.ok(restored.updated_at, 'The canonical state metadata supplies the history date');
    assert.equal((await store.list()).length, 1);
    assert.equal((await eventsOf(created.id)).length, before.length);
    owner.close();
    console.log('gps_trip_persistence: PASS');
} finally {
    await server.stop();
}
