import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

const calls = [];

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
    }
};

window.new_menu_v2 = {
    reveal: () => {
        calls.push({ name: 'reveal' });
        return true;
    }
};

window.eveDashboardRuntime = {
    open: async (payload = {}) => {
        calls.push({ name: 'dashboardOpen', ...payload });
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
    ['loadProjectAtomes', 'reveal', 'dashboardOpen'],
    'workspace opener must load the project canvas before revealing the menu and opening dashboard'
);
assert.equal(calls[0].projectId, 'project_valid', 'workspace opener must load the requested project');
assert.deepEqual(calls[1], { name: 'reveal' }, 'workspace opener must reveal the existing menu once');
assert.deepEqual(
    calls[2],
    { name: 'dashboardOpen', source: 'authenticated', projectId: 'project_valid' },
    'workspace opener must pass the resolved project id to dashboard'
);
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
