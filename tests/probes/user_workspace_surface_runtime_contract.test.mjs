import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { DASHBOARD_WORKSPACE_PROJECT_ID } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';

const { window, document } = installMockBrowserEnv();
window.innerWidth = 900;
window.innerHeight = 600;
window.requestAnimationFrame = (callback) => window.setTimeout(() => callback(Date.now()), 0);
window.cancelAnimationFrame = (handle) => window.clearTimeout(handle);
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 900,
    bottom: 600,
    width: 900,
    height: 600
});

const view = document.createElement('div');
view.id = 'view';
view.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 900,
    bottom: 600,
    width: 900,
    height: 600
});
document.body.appendChild(view);

const calls = [];
const sceneRecordsByProject = new Map();
let menuActive = false;
let menuOverlayRecordCount = 0;
let menuTreeMounted = false;

window.eveToolBase = {
    loadProjectAtomes: async (projectId, options = {}) => {
        calls.push({ name: 'loadProjectAtomes', projectId, options });
        throw new Error('loadProjectAtomes_must_not_run_for_dashboard_boot');
    },
    getProjectSceneState: (projectId) => ({
        records: sceneRecordsByProject.get(projectId) || [],
        projection: sceneRecordsByProject.has(projectId) ? { ok: true } : null
    })
};

window.new_menu_v2 = {
    showFully: () => {
        menuActive = true;
        menuTreeMounted = true;
        menuOverlayRecordCount = 1;
        const projectId = window.__eveBevyUiOverlayProjectIdOverride
            || window.__eveWorkspaceMode?.projectId
            || DASHBOARD_WORKSPACE_PROJECT_ID;
        sceneRecordsByProject.set(projectId, [{
            id: '__eve_bevy_ui_eve_bevy_ui_main_menu_test',
            properties: {}
        }]);
        calls.push({ name: 'showFully' });
        return true;
    },
    measure: () => ({ active: menuActive, treeMounted: menuActive })
};

window.eveBevyUiRuntime = {
    readOverlayDiagnostics: () => ({
        treeCount: menuTreeMounted ? 1 : 0,
        lastOverlayError: null,
        trees: menuTreeMounted
            ? [{
                id: 'eve_bevy_ui_main_menu',
                overlayRecordCount: menuOverlayRecordCount,
                overlayRecordIds: ['__eve_bevy_ui_eve_bevy_ui_main_menu_test'],
                interactiveNodeCount: 1,
                interactiveNodes: [{
                    id: 'main_handle',
                    actions: ['activate'],
                    accessibility: {
                        role: 'button',
                        label: 'Atome',
                        focusable: true,
                        visible_to_accessibility: true
                    }
                }]
            }]
            : []
    })
};

window.eveDashboardBevyUiRuntime = {
    state: {},
    warmup: async (payload = {}) => {
        calls.push({ name: 'bevyUiWarmup', ...payload });
        window.eveDashboardBevyUiRuntime.state.warmedProjectId = payload.projectId;
        return { ok: true, mode: 'bevy-ui' };
    },
    open: async (payload = {}) => {
        calls.push({ name: 'bevyUiOpen', ...payload });
        window.eveDashboardBevyUiRuntime.state.active = true;
        window.eveDashboardBevyUiRuntime.state.projectId = payload.projectId;
        sceneRecordsByProject.set(payload.projectId, [{ id: '__eve_bevy_ui_dashboard_root', properties: {} }]);
        return { ok: true, active: true, mode: 'bevy-ui' };
    },
    close: async (payload = {}) => {
        calls.push({ name: 'bevyUiClose', ...payload });
        window.eveDashboardBevyUiRuntime.state.active = false;
        sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
        return { ok: true, active: false, mode: 'bevy-ui' };
    },
    readDiagnostics: () => ({
        mounted_nodes: window.eveDashboardBevyUiRuntime.state.active === true
            && sceneRecordsByProject.has(DASHBOARD_WORKSPACE_PROJECT_ID)
            ? 12
            : 0
    })
};

const {
    openWorkspaceDashboardAndMainMenu,
    toggleWorkspaceDashboardAndMainMenu
} = await import('../../eVe/intuition/tools/user_workspace_surface_runtime.js');
const {
    ensureWorkspaceMainMenuVisible
} = await import('../../eVe/intuition/tools/workspace_main_menu_visibility.js');

const opened = await openWorkspaceDashboardAndMainMenu({
    source: 'authenticated',
    projectId: 'project_valid'
});

assert.deepEqual(opened, { ok: true, active: true, mode: 'bevy-ui' });
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['bevyUiWarmup', 'showFully', 'bevyUiOpen', 'showFully'],
    'workspace opener must warm, project the menu, open the dashboard, and verify the menu scene records'
);
assert.equal(calls.some((entry) => entry.name === 'loadProjectAtomes'), false);
assert.deepEqual(
    calls[0],
    { name: 'bevyUiWarmup', projectId: DASHBOARD_WORKSPACE_PROJECT_ID, dataProjectId: DASHBOARD_WORKSPACE_PROJECT_ID }
);
assert.deepEqual(
    calls[2],
    {
        name: 'bevyUiOpen',
        source: 'authenticated',
        projectId: DASHBOARD_WORKSPACE_PROJECT_ID,
        dataProjectId: DASHBOARD_WORKSPACE_PROJECT_ID
    }
);
const dashboardHost = document.getElementById(`project_view_${DASHBOARD_WORKSPACE_PROJECT_ID}`);
assert.equal(dashboardHost?.contains(document.getElementById('eve_surface_project')), true);
assert.equal(dashboardHost.style.position, 'fixed');
assert.equal(document.getElementById('project_view_project_valid'), null);
assert.equal(document.querySelectorAll('#eve_surface_project').length, 1);
assert.equal(document.querySelectorAll('[id^="__eve_dashboard_"], [data-dashboard]').length, 0);

calls.length = 0;
menuOverlayRecordCount = 0;
sceneRecordsByProject.set(DASHBOARD_WORKSPACE_PROJECT_ID, [{
    id: '__eve_bevy_ui_eve_bevy_ui_main_menu_test',
    properties: {}
}]);
window.__eveWorkspaceMode = { mode: 'dashboard', projectId: DASHBOARD_WORKSPACE_PROJECT_ID };
const visibleFromSceneRecords = await ensureWorkspaceMainMenuVisible();
assert.deepEqual(visibleFromSceneRecords, { ok: true, visible: true });
assert.deepEqual(calls, []);

calls.length = 0;
const warmedReopen = await openWorkspaceDashboardAndMainMenu({
    source: 'warmed',
    projectId: 'project_valid'
});
assert.deepEqual(warmedReopen, { ok: true, active: true, mode: 'bevy-ui' });
assert.deepEqual(calls.map((entry) => entry.name), ['bevyUiOpen', 'showFully']);

calls.length = 0;
const closedFromToggle = await toggleWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.deepEqual(closedFromToggle, { ok: true, active: false, mode: 'bevy-ui' });
assert.deepEqual(calls, [
    { name: 'bevyUiClose', honorLabelEditorKeyboardGuard: false },
    { name: 'showFully' }
]);

calls.length = 0;
window.__currentProject = { id: 'project_valid', name: 'Project valid' };
window.__eveWorkspaceMode = { mode: 'project', projectId: 'project_valid' };
const openedFromBevyAtome = await openWorkspaceDashboardAndMainMenu({
    source: 'bevy_ui_main_menu_atome',
    projectId: 'project_valid'
});
assert.deepEqual(openedFromBevyAtome, { ok: true, active: true, mode: 'bevy-ui' });
assert.deepEqual(calls.map((entry) => entry.name), ['showFully', 'bevyUiOpen']);

calls.length = 0;
window.eveDashboardBevyUiRuntime.state.active = true;
window.eveDashboardBevyUiRuntime.state.projectId = DASHBOARD_WORKSPACE_PROJECT_ID;
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
const repaired = await toggleWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.deepEqual(repaired, { ok: true, active: true, mode: 'bevy-ui' });
assert.deepEqual(calls.map((entry) => entry.name), ['bevyUiOpen']);

calls.length = 0;
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
window.eveDashboardBevyUiRuntime.state = {};
window.__eveWorkspaceMode = { mode: 'dashboard', projectId: DASHBOARD_WORKSPACE_PROJECT_ID };
window.AdoleAPI = { projects: { getCurrentId: () => 'project_from_api' } };
const apiResolved = await openWorkspaceDashboardAndMainMenu({ source: 'boot_workspace' });
assert.deepEqual(apiResolved, { ok: true, active: true, mode: 'bevy-ui' });
assert.equal(calls.some((entry) => entry.projectId === 'project_from_api'), false);
delete window.AdoleAPI;

console.log('user_workspace_surface_runtime_contract.test: PASS');
