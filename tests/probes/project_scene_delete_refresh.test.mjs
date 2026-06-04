import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { document } = installMockBrowserEnv();

const {
    clearProjectScene,
    getProjectSceneState,
    removeProjectSceneRecordByAtomeId,
    renderProjectScene
} = await import('../../eVe/domains/rendering/project_scene_runtime.js');

const host = document.createElement('div');
host.id = 'project_view_project_delete_refresh';
host.style.width = '640px';
host.style.height = '360px';
document.body.appendChild(host);

await renderProjectScene({
    projectId: 'project_delete_refresh',
    host,
    documentRef: document,
    records: [
        {
            id: 'delete_refresh_a',
            type: 'shape',
            properties: {
                x: 10,
                y: 20,
                width: 100,
                height: 80
            }
        },
        {
            id: 'delete_refresh_b',
            type: 'shape',
            properties: {
                x: 140,
                y: 20,
                width: 100,
                height: 80
            }
        }
    ]
});

const before = getProjectSceneState('project_delete_refresh');
assert.equal(before.records.length, 2, 'scene should start with two records');
assert.equal(before.scene.byId.has('delete_refresh_a'), true, 'deleted candidate should be present before deletion');

await removeProjectSceneRecordByAtomeId({
    projectId: 'project_delete_refresh',
    atomeId: 'delete_refresh_a'
});

const after = getProjectSceneState('project_delete_refresh');
assert.equal(after.records.length, 1, 'scene records should refresh immediately after deletion');
assert.equal(after.scene.byId.has('delete_refresh_a'), false, 'deleted atome should leave the render scene');
assert.equal(after.scene.byId.has('delete_refresh_b'), true, 'unrelated atome should remain in the render scene');

clearProjectScene('project_delete_refresh');
