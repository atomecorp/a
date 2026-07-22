import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';

const { window, document } = installMockBrowserEnv();
globalThis.window = window;
globalThis.document = document;
globalThis.CustomEvent = window.CustomEvent;
globalThis.ResizeObserver = window.ResizeObserver;

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

setMainMenuRuntime({
    showFully: async () => true,
    measure: () => ({ active: true, treeMounted: true })
}, window);
window.eveBevyUiRuntime = {
    readOverlayDiagnostics: () => null
};

const calls = [];
window.eveDashboardBevyUiRuntime = {
    state: { active: false, suspended: false, sceneProjectId: '' },
    readDiagnostics: () => ({ mounted_nodes: 1 }),
    open: async (input) => {
        calls.push({ name: 'dashboard', input });
        window.eveDashboardBevyUiRuntime.state = {
            active: true,
            suspended: false,
            sceneProjectId: input.sceneProjectId
        };
        return { ok: true };
    },
    close: async () => {
        calls.push({ name: 'dashboard_close' });
        window.eveDashboardBevyUiRuntime.state = {
            ...window.eveDashboardBevyUiRuntime.state,
            active: false,
            suspended: true
        };
        return { ok: true };
    }
};

const {
    openWorkspaceDashboardWithProjectBootstrap,
    toggleWorkspaceDashboardAndMainMenu
} = await import('../../eVe/intuition/tools/user_workspace_surface_runtime.js');

const opened = await openWorkspaceDashboardWithProjectBootstrap({
    source: 'contract',
    ensureProjectReady: async () => {
        calls.push({ name: 'project' });
        window.__currentProject = { id: 'project_ready' };
        const projectView = document.createElement('div');
        projectView.id = 'project_view_project_ready';
        view.appendChild(projectView);
        return 'project_ready';
    }
});

assert.equal(opened.ok, true, JSON.stringify(opened));
assert.equal(opened.projectId, 'project_ready');
assert.equal(calls[0].name, 'dashboard', 'Dashboard must mount before project preparation starts');
assert.equal(calls[1].name, 'project', 'project preparation must run behind the mounted Dashboard');
assert.equal(calls.length, 2, 'preparing a project must never hide the Dashboard automatically');
assert.equal(calls[0].input.sceneProjectId, '__eve_dashboard_workspace__');
assert.equal(window.eveDashboardBevyUiRuntime.state.active, true, 'Dashboard stays foregrounded after project preparation');
assert.equal(window.eveDashboardBevyUiRuntime.state.suspended, false, 'Dashboard must not flicker or suspend during preparation');
assert.equal(window.__eveWorkspaceMode.mode, 'dashboard');

await toggleWorkspaceDashboardAndMainMenu({ source: 'contract_explicit_hide' });
assert.equal(calls[2].name, 'dashboard_close', 'only the explicit Dashboard action may close it');
assert.equal(window.__eveWorkspaceMode.mode, 'project');
assert.equal(window.__eveWorkspaceMode.projectId, 'project_ready');

const projectFailure = await openWorkspaceDashboardWithProjectBootstrap({
    source: 'contract_failure',
    ensureProjectReady: async () => {
        throw new Error('projects_create_failed');
    }
});

assert.deepEqual(
    { ok: projectFailure.ok, phase: projectFailure.phase, error: projectFailure.error },
    { ok: false, phase: 'project_bootstrap', error: 'projects_create_failed' },
    'project errors must remain explicit while the Dashboard has already been mounted'
);

let firstBootstrapCalls = 0;
let duplicateBootstrapCalls = 0;
let releaseFirstBootstrap = null;
const firstBootstrap = openWorkspaceDashboardWithProjectBootstrap({
    source: 'contract_lock',
    ensureProjectReady: async () => {
        firstBootstrapCalls += 1;
        await new Promise((resolve) => { releaseFirstBootstrap = resolve; });
        return 'project_locked';
    }
});
await new Promise((resolve) => setTimeout(resolve, 0));
const duplicateBootstrap = openWorkspaceDashboardWithProjectBootstrap({
    source: 'contract_lock_duplicate',
    ensureProjectReady: async () => {
        duplicateBootstrapCalls += 1;
        return 'project_duplicate';
    }
});
releaseFirstBootstrap();
await Promise.all([firstBootstrap, duplicateBootstrap]);
assert.equal(firstBootstrapCalls, 1);
assert.equal(duplicateBootstrapCalls, 0, 'auth and boot must share one in-flight project bootstrap');

console.log('workspace_dashboard_project_bootstrap_contract.test: PASS');
