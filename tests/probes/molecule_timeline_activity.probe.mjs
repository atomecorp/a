import assert from 'node:assert/strict';
import test from 'node:test';

import { createTimeline } from '../../eVe/intuition/tools/molecule/kernel/index.js';
import { createMoleculeSession } from '../../eVe/intuition/tools/molecule/session/index.js';
import { createProjectViewTimelineContent } from '../../eVe/domains/rendering/project_view_timeline_content.js';
import { createProjectViewMoleculeMixContent } from '../../eVe/domains/rendering/project_view_molecule_mix_content.js';
import { projectViewModeOwnsTree } from '../../eVe/domains/rendering/project_view_surface_runtime.js';

// The project itself is the root Molecule: Timeline and Mix show ITS timeline,
// seeded once from the List playback, without creating a Molecule.
const fakeMoleculeApi = () => {
    const sessions = new Map();
    return {
        sessions,
        listOpenGroupTimelines: () => ({ timelines: [...sessions.keys()].map((group_id) => ({ group_id })) }),
        async openGroupTimeline({ group_id, project_id }) {
            const timeline = createTimeline({
                timeline_id: `tl_${group_id}`, project_id, owner_atome_id: group_id,
                initial_section_id: `section_${group_id}_1`, initial_track_id: `track_${group_id}_empty_1`
            });
            sessions.set(group_id, createMoleculeSession({ timeline, eventSink: { append: async () => ({ ok: true }) } }));
            return { ok: true, opened: true, group_id };
        },
        readGroupTimeline: ({ group_id }) => ({ ok: true, timeline: sessions.get(group_id).getState() }),
        applyGroupTimelineBatch: async ({ group_id, operations }) => sessions.get(group_id).applyBatch(operations, {}),
        applyGroupTimelineOperation: async ({ group_id, operation, command }) => sessions.get(group_id).applyTimelineOperation(operation, command)
    };
};

const projectRecords = [
    { id: 'take_a', atome_id: 'take_a', type: 'sound', project_id: 'project_tl', properties: { name: 'voix', duration_seconds: 4 } },
    { id: 'take_b', atome_id: 'take_b', type: 'sound', project_id: 'project_tl', properties: { name: 'guitare', duration_seconds: 4 } }
];

const withWindow = async (api, run) => {
    const previous = globalThis.window;
    const project = { atome_id: 'project_tl', id: 'project_tl', type: 'project', properties: { name: 'tl', playback_mode: 'simultaneous' } };
    globalThis.window = {
        eveMoleculeTimelineApi: api,
        Atome: { getStateCurrent: async (id) => (id === 'project_tl' ? project : projectRecords.find((record) => record.atome_id === id) || null) },
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true
    };
    try { return await run(); } finally { globalThis.window = previous; }
};

test('the Timeline view owns the project-view tree like every structured view', () => {
    assert.equal(projectViewModeOwnsTree('timeline'), true);
    assert.equal(projectViewModeOwnsTree('natural'), false);
    assert.equal(projectViewModeOwnsTree('list'), true);
    assert.equal(projectViewModeOwnsTree('mix'), true);
});

test('a project without a Molecule opens as its own timeline, seeded from the List', async () => {
    const api = fakeMoleculeApi();
    await withWindow(api, async () => {
        const content = createProjectViewTimelineContent({ requestRefresh: () => {} });
        await content.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        const state = content.readState();
        assert.equal(state.ownerId, 'project_tl');
        const timeline = api.readGroupTimeline({ group_id: 'project_tl' }).timeline;
        assert.deepEqual(timeline.clips.map((clip) => clip.source.atome_id).sort(), ['take_a', 'take_b']);
        assert.equal(new Set(timeline.clips.map((clip) => clip.track_id)).size, 2, 'simultaneous takes get one track each');
        const ids = [];
        const walk = (node) => { if (!node) return; ids.push(node.id); (node.children || []).forEach(walk); };
        content.build({ width: 900, height: 420, emit: () => {} }).forEach(walk);
        assert.ok(ids.some((id) => id.startsWith('project_view_timeline_header_')));
        assert.ok(ids.includes('project_view_timeline_ruler'));
        assert.ok(ids.includes('project_view_timeline_playhead'));
        // The Mix view presents the very same project timeline.
        const mix = createProjectViewMoleculeMixContent({ requestRefresh: () => {} });
        await mix.load({ projectId: 'project_tl', readList: async () => ({ records: projectRecords, totalCount: 2 }) });
        assert.equal(mix.readState().ownerId, 'project_tl');
        assert.equal(mix.readState().timelineId, timeline.timeline_id);
    });
});
