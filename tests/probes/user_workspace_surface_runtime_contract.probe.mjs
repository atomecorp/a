import assert from 'node:assert/strict';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);
const projectHost = document.createElement('div');
projectHost.id = 'project_view_project_resident';
const canvas = document.createElement('canvas');
canvas.id = 'eve_surface_project';
projectHost.appendChild(canvas);
view.appendChild(projectHost);
window.__currentProject = { id: 'project_resident', name: 'Resident project' };
window.__eveWorkspaceMode = { mode: 'project', projectId: 'project_resident' };

const calls = [];
setMainMenuRuntime({
    measure: () => ({ active: true, treeMounted: true }),
    showFully: () => {
        calls.push({ name: 'showFully' });
        return true;
    }
}, window);

window.eveToolBase = {
    loadProjectAtomes: async () => {
        calls.push({ name: 'loadProjectAtomes' });
        throw new Error('resident_dashboard_toggle_must_not_reload_project');
    },
    getProjectSceneState: () => ({
        records: [{ id: '__eve_bevy_ui_eve_bevy_ui_main_menu_root' }]
    })
};
window.eveBevyUiRuntime = {
    readOverlayDiagnostics: () => ({
        treeCount: 1,
        trees: [{
            id: 'eve_bevy_ui_main_menu',
            overlayRecordCount: 1,
            interactiveNodeCount: 1,
            interactiveNodes: [{ id: 'main_handle', actions: ['activate'] }]
        }]
    })
};

window.eveDashboardBevyUiRuntime = {
    state: { active: false, suspended: false, sceneProjectId: '' },
    open: async (payload = {}) => {
        calls.push({ name: 'open', ...payload });
        Object.assign(window.eveDashboardBevyUiRuntime.state, {
            active: true,
            suspended: false,
            sceneProjectId: payload.sceneProjectId
        });
        return { ok: true, active: true, suspended: false, sceneProjectId: payload.sceneProjectId, mode: 'bevy-ui' };
    },
    close: async () => {
        calls.push({ name: 'close' });
        Object.assign(window.eveDashboardBevyUiRuntime.state, { active: false, suspended: true });
        return { ok: true, active: false, suspended: true, sceneProjectId: 'project_resident', mode: 'bevy-ui' };
    },
    readDiagnostics: () => ({ mounted_nodes: 24 })
};

const {
    openWorkspaceDashboardAndMainMenu,
    toggleWorkspaceDashboardAndMainMenu
} = await import('../../eVe/intuition/tools/user_workspace_surface_runtime.js');

const opened = await openWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.equal(opened.ok, true);
assert.equal(opened.sceneProjectId, 'project_resident');
assert.equal(window.__eveWorkspaceMode.mode, 'dashboard');
assert.equal(window.__eveWorkspaceMode.projectId, 'project_resident');
assert.equal(canvas.parentElement, projectHost);
assert.equal(document.querySelectorAll('#eve_surface_project').length, 1);
assert.deepEqual(calls.map((entry) => entry.name), ['open']);
assert.equal(calls.some((entry) => entry.name === 'loadProjectAtomes'), false);

calls.length = 0;
const closed = await toggleWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.equal(closed.suspended, true);
assert.equal(window.__eveWorkspaceMode.mode, 'project');
assert.equal(window.__eveWorkspaceMode.projectId, 'project_resident');
assert.equal(canvas.parentElement, projectHost);
assert.deepEqual(calls.map((entry) => entry.name), ['close']);
assert.equal(calls.some((entry) => entry.name === 'loadProjectAtomes'), false);

calls.length = 0;
const reopened = await toggleWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.equal(reopened.ok, true);
assert.equal(reopened.sceneProjectId, 'project_resident');
assert.deepEqual(calls.map((entry) => entry.name), ['open']);

console.log('user_workspace_surface_runtime_contract.test: PASS');
