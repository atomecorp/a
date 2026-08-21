import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectViewMoleculeTimelineContent } from '../../eVe/domains/rendering/project_view_molecule_timeline_content.js';
import { projectViewModeOwnsTree } from '../../eVe/domains/rendering/project_view_surface_runtime.js';
import { workspaceSceneLayerOrder, workspaceSceneLayerForRecord } from '../../eVe/domains/rendering/workspace_scene_layers.js';

test('Timeline activity reveals one Molecule scene without duplicating data', async () => {
    const previousWindow = globalThis.window;
    const visibility = [];
    const timeline = {
        schema_version: 2, timeline_id: 'timeline_activity', owner_atome_id: 'molecule_activity',
        sections: [], tracks: [], clips: [], record_regions: []
    };
    globalThis.window = { eveMoleculeTimelineApi: {
        listOpenGroupTimelines: () => ({ timelines: [{ group_id: 'other' }, { group_id: 'molecule_activity' }] }),
        setGroupTimelineSceneVisibility: async (detail) => { visibility.push(detail); return { ok: true }; },
        readGroupTimeline: () => ({ timeline })
    } };
    try {
        const content = createProjectViewMoleculeTimelineContent({ requestRefresh: () => {} });
        await content.load({
            projectId: 'project_activity',
            readList: async () => ({ records: [{
                id: 'molecule_activity', atome_id: 'molecule_activity',
                project_id: 'project_activity',
                properties: { molecule_timeline: timeline }
            }], totalCount: 1 })
        });
        assert.deepEqual(visibility, [
            { group_id: 'other', visible: false },
            { group_id: 'molecule_activity', visible: true }
        ]);
        assert.deepEqual(content.build({ width: 800 }), []);
        assert.equal(workspaceSceneLayerForRecord({ properties: { layer: 'molecule' } }), 'molecule');
        assert.ok(workspaceSceneLayerOrder('molecule') > workspaceSceneLayerOrder('projectView'));
        assert.ok(workspaceSceneLayerOrder('molecule') < workspaceSceneLayerOrder('dashboard'));
    } finally {
        globalThis.window = previousWindow;
    }
});

test('Timeline leaves no full-canvas project-view input tree above its scene', () => {
    assert.equal(projectViewModeOwnsTree('timeline'), false);
    assert.equal(projectViewModeOwnsTree('natural'), false);
    assert.equal(projectViewModeOwnsTree('list'), true);
    assert.equal(projectViewModeOwnsTree('mix'), true);
});
