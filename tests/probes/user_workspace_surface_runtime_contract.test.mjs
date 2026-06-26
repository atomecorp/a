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

console.log('user_workspace_surface_runtime_contract.test: PASS');
