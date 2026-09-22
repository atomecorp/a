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
            sceneProjectId: input.sceneProjectId,
            dataProjectId: input.dataProjectId
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
window.eveToolBase = {
    loadProjectAtomes: async (projectId, options) => {
        calls.push({ name: 'project_load', projectId, options });
        return [{ id: 'prepared_shape', atome_id: 'prepared_shape', type: 'shape', project_id: projectId, properties: { left: 10, top: 20 } }];
    }
};

const {
    openWorkspaceDashboardWithProjectBootstrap,
    showPreparedProject,
    toggleWorkspaceDashboardAndMainMenu
} = await import('../../eVe/intuition/tools/user_workspace_surface_runtime.js');

const opened = await openWorkspaceDashboardWithProjectBootstrap({
    source: 'contract',
    ensureProjectReady: async () => {
        calls.push({ name: 'project' });
        window.__currentProject = { id: 'project_ready' };
        const projectView = document.createElement('div');
        projectView.id = 'project_view_project_ready';
        const projectCanvas = document.createElement('canvas');
        projectCanvas.id = 'eve_surface_project';
        projectView.appendChild(projectCanvas);
        view.appendChild(projectView);
        return 'project_ready';
    },
    readBootstrapPresentation: () => ({ startupView: 'project', restoredSavedProject: false, projectId: 'project_ready' })
});

assert.equal(opened.ok, true, JSON.stringify(opened));
assert.equal(opened.projectId, 'project_ready');
assert.equal(calls[0].name, 'project', 'canonical project readiness must resolve before choosing the first visible route');
assert.equal(calls[1].name, 'dashboard', 'first use without a saved project must choose Dashboard');
assert.equal(calls.length, 2, 'first-use Dashboard must mount once after project readiness');
assert.equal(calls[1].input.sceneProjectId, 'project_ready', 'Dashboard must reuse the prepared project surface instead of creating a second scene');
assert.equal(calls[1].input.dataProjectId, 'project_ready');
assert.equal(window.eveDashboardBevyUiRuntime.state.active, true, 'Dashboard stays foregrounded after project preparation');
assert.equal(window.eveDashboardBevyUiRuntime.state.suspended, false, 'Dashboard must not flicker or suspend during preparation');
assert.equal(window.__eveWorkspaceMode.mode, 'dashboard');

await toggleWorkspaceDashboardAndMainMenu({ source: 'contract_explicit_hide' });
assert.equal(calls[2].name, 'dashboard_close', 'only the explicit Dashboard action may close it');
assert.equal(window.__eveWorkspaceMode.mode, 'project');
assert.equal(window.__eveWorkspaceMode.projectId, 'project_ready');

const dashboardCallCountBeforeResume = calls.filter((entry) => entry.name === 'dashboard').length;
const resumed = await openWorkspaceDashboardWithProjectBootstrap({
    source: 'contract_resume',
    ensureProjectReady: async () => {
        calls.push({ name: 'resume_project' });
        return 'project_ready';
    },
    readBootstrapPresentation: () => ({ startupView: 'project', restoredSavedProject: true, projectId: 'project_ready' })
});
assert.equal(resumed.route, 'project', 'a valid saved project must be the first visible workspace route');
assert.equal(resumed.resumed, true);
assert.equal(
    calls.filter((entry) => entry.name === 'dashboard').length,
    dashboardCallCountBeforeResume,
    'saved-project resume must not mount Dashboard'
);

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

// A session resume reveals the saved project without any user decision, so its
// reveal must project canonical local state. A balanced load awaited the
// authoritative read before this reveal could publish readiness, which is how a
// slow or unreachable server held the whole boot on the native launch surface.
const revealCanvas = document.getElementById('eve_surface_project');
revealCanvas.remove();
const reveal = await showPreparedProject('project_ready');
assert.equal(reveal.ok, true);
const revealLoads = calls.filter((entry) => entry.name === 'project_load');
assert.equal(revealLoads.length, 1, 'a missing resident surface must be reprojected by the reveal');
assert.equal(revealLoads[0].projectId, 'project_ready');
assert.equal(revealLoads[0].options.staleFirst, true,
    'a resumed session owns no user decision: its reveal must project canonical local state');
assert.equal(revealLoads[0].options.force, true);
assert.equal(revealLoads[0].options.forceProjectSurface, true);
assert.equal(revealLoads[0].options.reason, 'workspace_surface');

console.log('workspace_dashboard_project_bootstrap_contract.test: PASS');
