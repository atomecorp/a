import assert from 'node:assert/strict';
import test from 'node:test';

import { createMoleculeStores } from '../../eVe/intuition/runtime/molecule_stores.js';

const makeStores = () => {
    const commits = [];
    const emits = [];
    const stateByAtome = new Map();
    const atome = {
        commit: async (event) => { commits.push(event); return { ok: true }; },
        getStateCurrent: async (atomeId) => stateByAtome.get(atomeId) || null
    };
    const bus = { emit: (type, payload) => emits.push({ type, payload }) };
    return { stores: createMoleculeStores({ atome, bus }), commits, emits, stateByAtome };
};

test('saveTimeline commits the snapshot as a molecule_timeline prop on the owner atome', async () => {
    const { stores, commits } = makeStores();
    const timeline = { timeline_id: 'tl_grp', project_id: 'proj', owner_atome_id: 'grp', tracks: [], clips: [] };
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

test('eventStore.append emits each history event on the deterministic bus', () => {
    const { stores, emits } = makeStores();
    const event = { event_type: 'apply', tx_id: 'tx1' };
    const returned = stores.eventStore.append(event);

    assert.equal(returned, event);
    assert.equal(emits.length, 1);
    assert.equal(emits[0].type, 'molecule:timeline-event');
    assert.deepEqual(emits[0].payload, event);
});
