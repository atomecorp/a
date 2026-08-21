import assert from 'node:assert/strict';
import test from 'node:test';

import { createMoleculeStores } from '../../eVe/intuition/runtime/molecule_stores.js';
import { createMinimalMoleculeFixture } from '../fixtures/molecule/canonical_v2_fixtures.mjs';

const makeStores = () => {
    const commits = [];
    const batches = [];
    const emits = [];
    const stateByAtome = new Map();
    const atome = {
        commit: async (event) => { commits.push(event); return { ok: true }; },
        commitBatch: async (events, options) => { batches.push({ events, options }); return { ok: true }; },
        getStateCurrent: async (atomeId) => stateByAtome.get(atomeId) || null
    };
    const bus = { emit: (type, payload) => emits.push({ type, payload }) };
    return { stores: createMoleculeStores({ atome, bus }), batches, commits, emits, stateByAtome };
};

test('saveTimeline commits the snapshot as a molecule_timeline prop on the owner atome', async () => {
    const { stores, commits } = makeStores();
    const timeline = createMinimalMoleculeFixture({
        timelineId: 'tl_grp', projectId: 'proj', ownerAtomeId: 'grp'
    });
    await stores.projectStore.saveTimeline('proj', timeline);

    assert.equal(commits.length, 1);
    assert.equal(commits[0].kind, 'set');
    assert.equal(commits[0].atome_id, 'grp', 'persisted on the owner group atome');
    assert.equal(commits[0].project_id, 'proj');
    assert.deepEqual(commits[0].payload.props.molecule_timeline, timeline);
});

test('saveTimeline rejects a timeline without an owner atome', async () => {
    const { stores } = makeStores();
    await assert.rejects(
        () => stores.projectStore.saveTimeline('proj', { timeline_id: 'tl_x', tracks: [], clips: [] }),
        /owner_required/
    );
});

test('saveTimelines atomically persists both Molecules and deletes an emptied owner', async () => {
    const { stores, batches } = makeStores();
    const source = createMinimalMoleculeFixture({
        timelineId: 'tl_source', projectId: 'proj', ownerAtomeId: 'source'
    });
    const target = createMinimalMoleculeFixture({
        timelineId: 'tl_target', projectId: 'proj', ownerAtomeId: 'target'
    });
    await stores.projectStore.saveTimelines('proj', [source, target], {
        delete_owner_ids: ['obsolete'], tx_id: 'transfer_1'
    });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].events.length, 3);
    assert.deepEqual(batches[0].events.map((event) => [event.kind, event.atome_id]), [
        ['set', 'source'], ['set', 'target'], ['delete', 'obsolete']
    ]);
    assert.equal(batches[0].options.tx_id, 'transfer_1');
});

test('saveTimelines atomically patches the performance rule on its timeline owner', async () => {
    const { stores, batches } = makeStores();
    const timeline = createMinimalMoleculeFixture({
        timelineId: 'tl_project', projectId: 'proj', ownerAtomeId: 'project'
    });
    await stores.projectStore.saveTimelines('proj', [timeline], {
        tx_id: 'record_take_1',
        owner_property_patches: { project: { playback_mode: 'performance' } }
    });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].events.length, 1);
    assert.deepEqual(batches[0].events[0].payload.props, {
        molecule_timeline: timeline,
        playback_mode: 'performance'
    });
    assert.equal(batches[0].options.tx_id, 'record_take_1');
});

test('deleteTimelineOwner removes only the Molecule owner through the canonical commit', async () => {
    const { stores, commits } = makeStores();
    await stores.projectStore.deleteTimelineOwner('proj', 'molecule_owner', { tx_id: 'delete_1' });
    assert.deepEqual(commits, [{
        kind: 'delete', atome_id: 'molecule_owner', project_id: 'proj', payload: {}, tx_id: 'delete_1'
    }]);
});

test('loadTimeline reads the snapshot back from the owner atome derived from the timeline id', async () => {
    const { stores, stateByAtome } = makeStores();
    const timeline = { timeline_id: 'tl_grp', owner_atome_id: 'grp' };
    stateByAtome.set('grp', { molecule_timeline: timeline });

    assert.deepEqual(await stores.projectStore.loadTimeline('proj', 'tl_grp'), timeline);
    assert.equal(await stores.projectStore.loadTimeline('proj', 'tl_absent'), null);
});

test('loadTimeline also reads a nested props.molecule_timeline shape', async () => {
    const { stores, stateByAtome } = makeStores();
    const timeline = { timeline_id: 'tl_grp', owner_atome_id: 'grp' };
    stateByAtome.set('grp', { props: { molecule_timeline: timeline } });
    assert.deepEqual(await stores.projectStore.loadTimeline('proj', 'tl_grp'), timeline);
});

test('loadTimeline reads the canonical Atome properties.molecule_timeline shape', async () => {
    const { stores, stateByAtome } = makeStores();
    const timeline = { timeline_id: 'tl_grp', owner_atome_id: 'grp' };
    stateByAtome.set('grp', { properties: { molecule_timeline: timeline } });
    assert.deepEqual(await stores.projectStore.loadTimeline('proj', 'tl_grp'), timeline);
});

test('eventStore.append emits each history event on the deterministic bus', () => {
    const { stores, emits } = makeStores();
    const event = { event_type: 'apply', tx_id: 'tx1' };
    const returned = stores.eventStore.append(event);

    assert.equal(returned, event);
    assert.equal(emits.length, 1);
    assert.equal(emits[0].type, 'molecule:timeline-event');
    assert.deepEqual(emits[0].payload, event);
});
