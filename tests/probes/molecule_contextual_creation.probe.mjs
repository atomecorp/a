import assert from 'node:assert/strict';
import test from 'node:test';

import { createTimeline } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createMoleculeContextualCreationRuntime } from '../../eVe/intuition/tools/molecule/runtime_creation.js';
import {
    forgetActiveMoleculeOwner,
    rememberActiveMoleculeOwner
} from '../../eVe/domains/rendering/project_view_molecule_workspace_state.js';

const harness = () => {
    const sessions = new Map();
    const deleted = [];
    let ownerSerial = 0;
    const api = {
        listOpenGroupTimelines: () => ({ timelines: [...sessions.keys()].map((group_id) => ({ group_id })) }),
        async openGroupTimeline({ group_id, project_id }) {
            if (!sessions.has(group_id)) sessions.set(group_id, createMoleculeSession({ eventSink: { append() {} }, timeline: createTimeline({
                timeline_id: `tl_${group_id}`, project_id, owner_atome_id: group_id,
                initial_section_id: `section_${group_id}_1`, initial_track_id: `track_${group_id}_1`
            }) }));
            return { ok: true };
        },
        readGroupTimeline: ({ group_id }) => ({ timeline: sessions.get(group_id).getState() }),
        applyGroupTimelineBatch: ({ group_id, operations }) => sessions.get(group_id).applyBatch(operations),
        async closeGroupTimeline(groupId) { sessions.get(groupId)?.dispose(); sessions.delete(groupId); }
    };
    const env = {
        crypto: { randomUUID: () => `id_${++ownerSerial}` },
        Atome: {
            listStateCurrent: async () => [],
            commit: async (event) => { if (event.kind === 'delete') deleted.push(event.atome_id); return { ok: true }; }
        },
        eveToolBase: {
            createAtome: async () => ({ ok: true, id: `owner_${++ownerSerial}` })
        },
        addEventListener() {}, removeEventListener() {}
    };
    return { api, env, sessions, deleted };
};

test('contextual creation from the List creates one owner, Section, Track and referenced content', async () => {
    const projectId = 'creation_list';
    forgetActiveMoleculeOwner(projectId);
    const fixture = harness();
    const runtime = createMoleculeContextualCreationRuntime(fixture);
    const result = await runtime.attach({ projectId, atome_id: 'text_source', type: 'text' }, { content_kind: 'text' });
    const timeline = fixture.sessions.get(result.owner_atome_id).getState();
    assert.equal(timeline.sections.length, 1);
    assert.equal(timeline.clips[0].source.atome_id, 'text_source');
    assert.equal(timeline.clips[0].kind, 'text');
    assert.equal(timeline.tracks.filter((track) => track.empty_slot).length, 1);
});

test('Molecule and Section destinations add the required local structure atomically', async () => {
    const projectId = 'creation_target';
    const fixture = harness();
    await fixture.api.openGroupTimeline({ group_id: 'existing', project_id: projectId });
    rememberActiveMoleculeOwner(projectId, 'existing', { molecule_entity: 'molecule' });
    const runtime = createMoleculeContextualCreationRuntime(fixture);
    await runtime.attach({ projectId, atome_id: 'page_source', type: 'page' }, { content_kind: 'page' });
    let timeline = fixture.sessions.get('existing').getState();
    assert.equal(timeline.sections.length, 2);
    const createdSection = timeline.sections.at(-1);
    assert.equal(timeline.clips[0].track_id, timeline.tracks.find((track) => track.section_id === createdSection.section_id && !track.empty_slot).track_id);

    rememberActiveMoleculeOwner(projectId, 'existing', {
        molecule_entity: 'section', section_id: createdSection.section_id
    });
    await runtime.attach({ projectId, atome_id: 'drawing_source', type: 'shape' }, { content_kind: 'draw' });
    timeline = fixture.sessions.get('existing').getState();
    assert.equal(timeline.clips.length, 2);
    assert.equal(timeline.tracks.filter((track) => track.section_id === createdSection.section_id && !track.empty_slot).length, 2);
});

test('a failed first contextual creation rolls back its temporary Molecule owner', async () => {
    const projectId = 'creation_rollback';
    forgetActiveMoleculeOwner(projectId);
    const fixture = harness();
    fixture.api.applyGroupTimelineBatch = async () => { throw new Error('forced_failure'); };
    const runtime = createMoleculeContextualCreationRuntime(fixture);
    await assert.rejects(() => runtime.attach({ projectId, atome_id: 'source', type: 'text' }, {}), /forced_failure/);
    assert.deepEqual(fixture.deleted, ['owner_1']);
    assert.equal(fixture.sessions.size, 0);
});

test('direct Record prepares the required focused structure and can roll back an empty first take', async () => {
    const projectId = 'record_prepare';
    forgetActiveMoleculeOwner(projectId);
    const fixture = harness();
    fixture.env.eveToolBase.getCurrentProjectId = () => projectId;
    const runtime = createMoleculeContextualCreationRuntime(fixture);
    const prepared = await runtime.prepareRecording({ record_source: 'audio' });
    assert.equal(prepared.temporary_owner, true);
    assert.ok(fixture.sessions.get(prepared.group_id).getState().tracks.some((track) => track.track_id === prepared.track_id));
    const rolledBack = await runtime.rollbackPreparedRecording({ group_id: prepared.group_id });
    assert.equal(rolledBack.rolled_back, true);
    assert.deepEqual(fixture.deleted, [prepared.group_id]);
});
