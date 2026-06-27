import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

const calls = [];
const sceneRecordsByProject = new Map();

window.eveToolBase = {
    loadProjectAtomes: async (projectId, options = {}) => {
        calls.push({ name: 'loadProjectAtomes', projectId, options });
        let projectView = document.getElementById(`project_view_${projectId}`);
        if (!projectView) {
            projectView = document.createElement('div');
            projectView.id = `project_view_${projectId}`;
            view.appendChild(projectView);
        }
        const canvas = document.getElementById('eve_surface_project') || document.createElement('canvas');
        canvas.id = 'eve_surface_project';
        canvas.width = 900;
        canvas.height = 600;
        if (canvas.parentElement !== projectView) projectView.appendChild(canvas);
        return { ok: true };
    },
    getProjectSceneState: (projectId) => ({
        records: sceneRecordsByProject.get(projectId) || [],
        projection: sceneRecordsByProject.has(projectId) ? { ok: true } : null
    })
};

window.new_menu_v2 = {
    showFully: () => {
        calls.push({ name: 'showFully' });
        return true;
    }
};

window.eveDashboardRuntime = {
    open: async (payload = {}) => {
        calls.push({ name: 'dashboardOpen', ...payload });
        sceneRecordsByProject.set(payload.projectId, [{ id: '__eve_dashboard_background', properties: {} }]);
        return { ok: true, active: true };
    }
};

const { openWorkspaceDashboardAndMainMenu } = await import('../../eVe/intuition/tools/user_workspace_surface_runtime.js');

const result = await openWorkspaceDashboardAndMainMenu({
    source: 'authenticated',
    projectId: 'project_valid'
});

assert.deepEqual(result, { ok: true, active: true }, 'workspace opener must return the dashboard open result');
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['loadProjectAtomes', 'showFully', 'dashboardOpen'],
    'workspace opener must stabilize the existing menu before opening the dashboard scene'
);
assert.equal(calls[0].projectId, 'project_valid', 'workspace opener must load the requested project');
assert.deepEqual(calls[0].options, {
    staleFirst: true,
    resolveOnFirstPaint: true
}, 'workspace opener must request the fast first-paint project load path');
assert.deepEqual(
    calls[2],
    { name: 'dashboardOpen', source: 'authenticated', projectId: 'project_valid' },
    'workspace opener must pass the resolved project id to dashboard'
);
assert.deepEqual(calls[1], { name: 'showFully' }, 'workspace opener must fully show the existing menu before dashboard layout');
assert.equal(
    document.getElementById('project_view_project_valid')?.contains(document.getElementById('eve_surface_project')),
    true,
    'workspace opener must require the canonical project canvas in the active project view'
);
assert.equal(
    document.querySelectorAll('#eve_surface_project').length,
    1,
    'workspace opener must keep one visible project canvas'
);
assert.equal(
    document.querySelectorAll('[id^="__eve_dashboard_"], [data-dashboard]').length,
    0,
    'workspace opener must not create dashboard DOM records'
);

calls.length = 0;
const reopened = await openWorkspaceDashboardAndMainMenu({
    source: 'reopen',
    projectId: 'project_valid'
});
assert.deepEqual(reopened, { ok: true, active: true }, 'workspace opener must reopen over the existing surface');
assert.equal(
    calls.some((entry) => entry.name === 'loadProjectAtomes'),
    false,
    'workspace opener must not reload project atomes when the canonical surface is already available'
);
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['showFully', 'dashboardOpen'],
    'workspace opener must only settle menu and open dashboard over an existing surface'
);

calls.length = 0;
const bootWarmup = await openWorkspaceDashboardAndMainMenu({
    source: 'boot_workspace',
    projectId: 'project_valid'
});
assert.deepEqual(
    bootWarmup,
    { ok: true, active: false, warmed: true, projectId: 'project_valid' },
    'workspace boot must warm the surface/menu without reopening the dashboard'
);
assert.deepEqual(
    calls.map((entry) => entry.name),
    ['showFully'],
    'workspace boot must not project dashboard records after a refresh or resize boot signal'
);

calls.length = 0;
window.eveDashboardRuntime.state = { warmedProjectId: 'project_valid' };
window.eveDashboardRuntime.warmup = async (payload = {}) => {
    calls.push({ name: 'dashboardWarmup', ...payload });
    return { ok: true };
};
const warmedReopen = await openWorkspaceDashboardAndMainMenu({
    source: 'warmed',
    projectId: 'project_valid'
});
assert.deepEqual(warmedReopen, { ok: true, active: true }, 'workspace opener must reopen warmed dashboards');
assert.equal(
    calls.some((entry) => entry.name === 'dashboardWarmup'),
    false,
    'workspace opener must not repeat dashboard warmup when warmed projection is still present'
);

calls.length = 0;
sceneRecordsByProject.delete('project_valid_2');
window.eveDashboardRuntime.open = async (payload = {}) => {
    calls.push({ name: 'dashboardOpen', ...payload });
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    sceneRecordsByProject.set(payload.projectId, [{ id: '__eve_dashboard_background', properties: {} }]);
    return { ok: true, active: true, source: payload.source };
};

const [firstConcurrent, secondConcurrent] = await Promise.all([
    openWorkspaceDashboardAndMainMenu({ source: 'first', projectId: 'project_valid_2' }),
    openWorkspaceDashboardAndMainMenu({ source: 'second', projectId: 'project_valid_2' })
]);

assert.deepEqual(
    firstConcurrent,
    { ok: true, active: true, source: 'first' },
    'first concurrent workspace open owns the in-flight dashboard request'
);
assert.deepEqual(
    secondConcurrent,
    firstConcurrent,
    'second concurrent workspace open for the same project must reuse the in-flight request'
);
assert.equal(
    calls.filter((entry) => entry.name === 'loadProjectAtomes').length,
    1,
    'workspace opener must not double-load a project while the same dashboard open is in flight'
);
assert.equal(
    calls.filter((entry) => entry.name === 'showFully').length,
    1,
    'workspace opener must not double-settle the menu while the same dashboard open is in flight'
);
assert.equal(
    calls.filter((entry) => entry.name === 'dashboardOpen').length,
    1,
    'workspace opener must not open duplicate dashboards for the same project'
);

console.log('user_workspace_surface_runtime_contract.test: PASS');
