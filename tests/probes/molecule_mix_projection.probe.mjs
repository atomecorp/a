import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectViewMoleculeMixContent } from '../../eVe/domains/rendering/project_view_molecule_mix_content.js';

const flatten = (node) => [node, ...(node?.children || []).flatMap(flatten)];

test('Mix activity projects canonical Tracks and routes mute through the timeline API', async () => {
    const previousWindow = globalThis.window;
    const operations = [];
    const timeline = {
        schema_version: 2, timeline_id: 'timeline_mix', owner_atome_id: 'molecule_mix',
        sections: [{ section_id: 'section', order: 0 }],
        tracks: [
            { track_id: 'voice', section_id: 'section', name: 'Voice', order: 0, role: 'content', mute: false, output_group_track_id: 'bus' },
            { track_id: 'bus', section_id: 'section', name: 'Bus', order: 10, role: 'group', mute: false },
            { track_id: 'empty', section_id: 'section', name: 'Piste 3', order: 20, role: 'content', empty_slot: true }
        ]
    };
    const api = {
        listOpenGroupTimelines: () => ({ timelines: [{ group_id: 'molecule_mix' }] }),
        readGroupTimeline: () => ({ timeline }),
        applyGroupTimelineOperation: async (detail) => {
            operations.push(detail);
            Object.assign(timeline.tracks.find((track) => track.track_id === detail.command.track_id), detail.command);
            return { ok: true };
        }
    };
    globalThis.window = { eveMoleculeTimelineApi: api };
    try {
        const content = createProjectViewMoleculeMixContent({ requestRefresh: () => {} });
        await content.load({
            projectId: 'project_mix',
            readList: async () => ({ records: [{
                id: 'molecule_mix', atome_id: 'molecule_mix', project_id: 'project_mix',
                properties: { name: 'Molécule 1', molecule_timeline: timeline }
            }], totalCount: 1 })
        });
        const tree = content.build({ width: 640, height: 420, emit: () => {} })[0];
        const ids = flatten(tree).map((node) => node.id);
        assert.ok(ids.includes('molecule_mix_strip_voice'));
        assert.ok(ids.includes('molecule_mix_strip_bus'));
        assert.equal(ids.includes('molecule_mix_strip_empty'), false);
        assert.ok(ids.includes('project_view_molecule_mix_lasso_blocker'));
        assert.ok(ids.includes('molecule_mix_gain_voice'));
        assert.ok(ids.includes('molecule_mix_pan_voice'));
        const result = await content.handleEvent({ type: 'project_view.mix.mute', trackId: 'voice' });
        assert.equal(result.mute, true);
        assert.deepEqual(operations[0], {
            group_id: 'molecule_mix', operation: 'track.mute', command: { track_id: 'voice', mute: true }
        });
        await content.handleEvent({ type: 'project_view.mix.slider.start', trackId: 'voice', parameter: 'gain' });
        const gainDrag = await content.handleEvent({
            type: 'project_view.mix.slider.drag', trackId: 'voice', parameter: 'gain', event: { delta_y: 30 }
        });
        await content.handleEvent({ type: 'project_view.mix.slider.end', trackId: 'voice', parameter: 'gain' });
        assert.ok(gainDrag.value < 1);
        assert.deepEqual(operations[1], {
            group_id: 'molecule_mix', operation: 'track.update', command: { track_id: 'voice', gain: gainDrag.value }
        });
        await content.handleEvent({ type: 'project_view.mix.slider.start', trackId: 'voice', parameter: 'pan' });
        const panDrag = await content.handleEvent({
            type: 'project_view.mix.slider.drag', trackId: 'voice', parameter: 'pan', event: { delta_y: -30 }
        });
        await content.handleEvent({ type: 'project_view.mix.slider.end', trackId: 'voice', parameter: 'pan' });
        assert.ok(panDrag.value > 0);
        assert.deepEqual(operations[2], {
            group_id: 'molecule_mix', operation: 'track.update', command: { track_id: 'voice', pan: panDrag.value }
        });
    } finally {
        globalThis.window = previousWindow;
    }
});
