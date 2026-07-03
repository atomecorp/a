import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { DASHBOARD_WORKSPACE_PROJECT_ID } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import { startBevyWebRenderer } from '../../eVe/domains/rendering/bevy_web_renderer_runtime.js';

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

const dashboardReadyRecords = ({ visible = true } = {}) => [
    { id: '__eve_dashboard_background', properties: { visible, opacity: visible ? 1 : 0 } },
    { id: '__eve_dashboard_header_news', properties: { text: 'News', visible, opacity: visible ? 1 : 0 } },
    { id: '__eve_dashboard_header_calendar', properties: { text: 'Calendar', visible, opacity: visible ? 1 : 0 } }
];

window.eveToolBase = {
    loadProjectAtomes: async (projectId, options = {}) => {
        calls.push({ name: 'loadProjectAtomes', projectId, options });
        throw new Error('loadProjectAtomes_must_not_run_for_dashboard_boot');
    },
    getProjectSceneState: (projectId) => ({
        records: sceneRecordsByProject.get(projectId) || [],
        projection: sceneRecordsByProject.has(projectId)
            ? {
                ok: true,
                virtual_scene: {
                    nodes: (sceneRecordsByProject.get(projectId) || []).map((record) => ({ id: record.id }))
                }
            }
            : null
    })
};

window.new_menu_v2 = {
    showFully: () => {
        calls.push({ name: 'showFully' });
        return true;
    }
};

window.eveDashboardRuntime = {
    state: {},
    warmup: async (payload = {}) => {
        calls.push({ name: 'dashboardWarmup', ...payload });
        return { ok: true, dataOnly: true };
    },
    open: async (payload = {}) => {
        calls.push({ name: 'dashboardOpen', ...payload });
        sceneRecordsByProject.set(payload.projectId, dashboardReadyRecords());
        return { ok: true, active: true };
    }
};

const {
    openWorkspaceDashboardAndMainMenu,
    toggleWorkspaceDashboardAndMainMenu
} = await import('../../eVe/intuition/tools/user_workspace_surface_runtime.js');

const result = await openWorkspaceDashboardAndMainMenu({
    source: 'authenticated',
    projectId: 'project_valid'
});

assert.deepEqual(result, { ok: true, active: true }, 'workspace opener must return the dashboard open result');
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['dashboardWarmup', 'showFully', 'dashboardOpen'],
    'workspace opener must prepare the neutral dashboard surface without loading a project'
);
assert.equal(
    calls.some((entry) => entry.name === 'loadProjectAtomes'),
    false,
    'workspace opener must not load project atomes before a dashboard project-card click'
);
assert.deepEqual(
    calls[0],
    { name: 'dashboardWarmup', projectId: DASHBOARD_WORKSPACE_PROJECT_ID, dataProjectId: DASHBOARD_WORKSPACE_PROJECT_ID },
    'workspace opener must warm the neutral dashboard workspace scene'
);
assert.deepEqual(
    calls[2],
    {
        name: 'dashboardOpen',
        source: 'authenticated',
        projectId: DASHBOARD_WORKSPACE_PROJECT_ID,
        dataProjectId: DASHBOARD_WORKSPACE_PROJECT_ID
    },
    'workspace opener must open the neutral dashboard workspace scene'
);
assert.equal(
    document.getElementById(`project_view_${DASHBOARD_WORKSPACE_PROJECT_ID}`)?.contains(document.getElementById('eve_surface_project')),
    true,
    'workspace opener must attach the project surface to the neutral dashboard host'
);
const dashboardHost = document.getElementById(`project_view_${DASHBOARD_WORKSPACE_PROJECT_ID}`);
assert.equal(dashboardHost.style.position, 'fixed', 'neutral dashboard host must not depend on content height');
assert.equal(dashboardHost.style.inset, '0', 'neutral dashboard host must fill the viewport from the first frame');
assert.equal(dashboardHost.style.width, '100vw', 'neutral dashboard host must expose viewport width before rendering');
assert.equal(dashboardHost.style.height, '100vh', 'neutral dashboard host must expose viewport height before rendering');
assert.equal(
    document.getElementById('project_view_project_valid'),
    null,
    'workspace opener must not create or load the requested user project host'
);
assert.equal(
    document.querySelectorAll('#eve_surface_project').length,
    1,
    'workspace opener must keep one canonical project canvas'
);
assert.equal(
    dashboardHost.style.zIndex,
    '6',
    'neutral dashboard host must keep its active z-index after dashboard rendering'
);
assert.equal(
    document.querySelectorAll('[id^="__eve_dashboard_"], [data-dashboard]').length,
    0,
    'workspace opener must not create dashboard DOM records'
);

calls.length = 0;
window.eveDashboardRuntime.state = { warmedProjectId: DASHBOARD_WORKSPACE_PROJECT_ID };
const warmedReopen = await openWorkspaceDashboardAndMainMenu({
    source: 'warmed',
    projectId: 'project_valid'
});
assert.deepEqual(warmedReopen, { ok: true, active: true }, 'workspace opener must reopen warmed dashboards');
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['showFully', 'dashboardOpen'],
    'workspace opener must not repeat neutral dashboard warmup when it is already current'
);

calls.length = 0;
sceneRecordsByProject.set(DASHBOARD_WORKSPACE_PROJECT_ID, dashboardReadyRecords());
window.eveDashboardRuntime.state = {
    active: true,
    closing: false,
    projectId: DASHBOARD_WORKSPACE_PROJECT_ID,
    warmedProjectId: DASHBOARD_WORKSPACE_PROJECT_ID
};
window.eveDashboardRuntime.close = async (payload = {}) => {
    calls.push({ name: 'dashboardClose', ...payload });
    sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
    window.eveDashboardRuntime.state.active = false;
    return { ok: true, active: false };
};
const closedFromToggle = await toggleWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.deepEqual(closedFromToggle, { ok: true, active: false }, 'main handle toggle must close a presentable active dashboard');
assert.deepEqual(
    calls,
    [{ name: 'dashboardClose', honorLabelEditorKeyboardGuard: false }],
    'main handle close must use the dashboard close path without rebuilding records'
);

calls.length = 0;
window.eveDashboardRuntime.state = {
    active: true,
    closing: false,
    projectId: DASHBOARD_WORKSPACE_PROJECT_ID,
    warmedProjectId: DASHBOARD_WORKSPACE_PROJECT_ID
};
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
const missingProjectionClose = await toggleWorkspaceDashboardAndMainMenu({ source: 'main_handle' });
assert.deepEqual(
    missingProjectionClose,
    { ok: true, active: true },
    'main handle toggle must repair an active dashboard when its projection is missing'
);
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['showFully', 'dashboardOpen'],
    'missing-projection active dashboards must rebuild records instead of closing a phantom state'
);

calls.length = 0;
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
window.eveDashboardRuntime.state = {};
window.eveDashboardRuntime.open = async (payload = {}) => {
    calls.push({ name: 'dashboardOpen', ...payload });
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    sceneRecordsByProject.set(payload.projectId, dashboardReadyRecords());
    return { ok: true, active: true, source: payload.source };
};

const [firstConcurrent, secondConcurrent] = await Promise.all([
    openWorkspaceDashboardAndMainMenu({ source: 'first', projectId: 'project_a' }),
    openWorkspaceDashboardAndMainMenu({ source: 'second', projectId: 'project_b' })
]);

assert.deepEqual(
    firstConcurrent,
    { ok: true, active: true, source: 'first' },
    'first concurrent workspace open owns the neutral dashboard request'
);
assert.deepEqual(
    secondConcurrent,
    firstConcurrent,
    'second concurrent workspace open must reuse the neutral in-flight dashboard request'
);
assert.equal(
    calls.filter((entry) => entry.name === 'dashboardOpen').length,
    1,
    'workspace opener must not open duplicate neutral dashboards'
);

calls.length = 0;
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
window.AdoleAPI = { projects: { getCurrentId: () => 'project_from_api' } };
window.eveDashboardRuntime.open = async (payload = {}) => {
    calls.push({ name: 'dashboardOpen', ...payload });
    sceneRecordsByProject.set(payload.projectId, dashboardReadyRecords());
    return { ok: true, active: true };
};
const apiResolved = await openWorkspaceDashboardAndMainMenu({ source: 'boot_workspace' });
assert.deepEqual(apiResolved, { ok: true, active: true }, 'workspace opener must ignore current project ids for dashboard boot');
assert.equal(
    calls.some((entry) => entry.projectId === 'project_from_api'),
    false,
    'workspace opener must not resolve dashboard boot through AdoleAPI project ids'
);
delete window.AdoleAPI;

calls.length = 0;
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
window.eveDashboardRuntime.state = {};
window.eveDashboardRuntime.open = async (payload = {}) => {
    calls.push({ name: 'dashboardOpen', ...payload });
    sceneRecordsByProject.set(payload.projectId, [{ id: '__eve_dashboard_background', properties: { visible: true, opacity: 1 } }]);
    window.setTimeout(() => {
        sceneRecordsByProject.set(payload.projectId, dashboardReadyRecords());
    }, 30);
    return { ok: true, active: true };
};
const slowHeaderResult = await openWorkspaceDashboardAndMainMenu({
    source: 'slow_headers',
    projectId: 'project_slow_headers'
});
assert.deepEqual(slowHeaderResult, { ok: true, active: true }, 'workspace opener must return after delayed dashboard headers become presentable');
assert.deepEqual(
    (sceneRecordsByProject.get(DASHBOARD_WORKSPACE_PROJECT_ID) || [])
        .filter((record) => /^__eve_dashboard_header_(?!bg|icon|side)/.test(String(record.id || '')))
        .map((record) => record.properties.text),
    ['News', 'Calendar'],
    'workspace opener must wait for visible dashboard header text records on the neutral scene'
);

calls.length = 0;
const staleSurface = document.getElementById('eve_surface_project');
await startBevyWebRenderer({
    surface: staleSurface,
    width: 900,
    height: 600,
    virtualScene: {
        nodes: [{
            id: 'stale_project_atom',
            kind: 'shape',
            parentId: null,
            bounds: { x: 0, y: 0, width: 20, height: 20 },
            localTransform: { x: 0, y: 0 },
            material: { fill: '#000000' },
            renderLayer: 0,
            visible: true,
            children: []
        }],
        byId: new Map([['stale_project_atom', { id: 'stale_project_atom' }]]),
        roots: ['stale_project_atom']
    },
    wasmModule: {
        default: async () => {},
        run_atome_bevy_renderer: () => {},
        apply_atome_bevy_ops: () => {},
        request_atome_bevy_redraw: () => {}
    }
});
sceneRecordsByProject.delete(DASHBOARD_WORKSPACE_PROJECT_ID);
window.eveDashboardRuntime.state = {};
window.eveDashboardRuntime.open = async (payload = {}) => {
    calls.push({ name: 'dashboardOpen', ...payload });
    sceneRecordsByProject.set(payload.projectId, dashboardReadyRecords());
    return { ok: true, active: true };
};
const staleRuntimeResult = await openWorkspaceDashboardAndMainMenu({
    source: 'stale_bevy_runtime_nodes',
    projectId: 'project_valid'
});
assert.deepEqual(
    staleRuntimeResult,
    { ok: true, active: true },
    'workspace opener must trust the current projection virtual scene over stale Bevy runtime node cache'
);

console.log('user_workspace_surface_runtime_contract.test: PASS');
