import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test, vi } from 'vitest';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { createBevyUiMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_runtime.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import {
    clearAllProjectScenes,
    getProjectSceneState,
    renderProjectScene
} from '../../eVe/domains/rendering/project_scene_runtime.js';
import { createTestCompositor, installDom } from './unified_rendering_test_helpers.mjs';
import {
    __testClearPrefetch,
    __testSetCommitLoader,
    restoreProjectViewMode
} from '../../eVe/domains/rendering/project_view_mode_state.js';
import { readProjectViewSurfaceState } from '../../eVe/domains/rendering/project_view_surface_runtime.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';
import { contactSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js';

const previewRuntime = vi.hoisted(() => ({
    warmProjectPreviewCapture: vi.fn(async () => ({ ok: true }))
}));

vi.mock('../../eVe/domains/rendering/project_preview_runtime.js', () => ({
    warmProjectPreviewCapture: previewRuntime.warmProjectPreviewCapture
}));

test('restoring a Natural project applies the canonical surface transition', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.__currentProject = { id: 'project_natural_restore' };
    __testClearPrefetch();
    __testSetCommitLoader(async () => ({
        getStateCurrent: async () => ({ properties: { view_mode: 'natural' } })
    }));
    try {
        const restored = await restoreProjectViewMode('project_natural_restore');
        assert.equal(restored.ok, true);
        assert.equal(restored.restored, true);
        assert.equal(restored.mode, 'natural');
        assert.equal(readProjectViewSurfaceState().mode, 'natural');
        assert.equal(readProjectViewSurfaceState().projectId, 'project_natural_restore');
    } finally {
        __testSetCommitLoader();
        __testClearPrefetch();
    }
});

test('Dashboard project activation delegates workspace and menu ownership once', async () => {
    const calls = [];
    const runtime = createDashboardActionRuntime({
        destroy: async () => { calls.push('destroy'); },
        openPanel: async () => ({ ok: true }),
        loadProjectRuntime: async () => ({
            activateProjectWorkspace: async (project, options) => {
                calls.push({ project, options });
                return { ok: true, projectId: project.id };
            }
        })
    });

    const project = { id: 'project_second', name: 'Second' };
    const result = await runtime.activateItemAction({
        category: { id: 'projects' },
        item: { payload: project }
    });

    assert.equal(result.ok, true);
    assert.equal(result.project, project);
    assert.deepEqual(calls, [
        { project, options: { force: true, staleFirst: false } }
    ]);
});

test('Dashboard routes Contacts by stable identity and leaves unsupported cards inert', async () => {
    const opened = [];
    const runtime = createDashboardActionRuntime({
        openPanel: async (surfaceKey, context) => {
            opened.push({ surfaceKey, context });
            return { ok: true, surface_key: surfaceKey };
        }
    });

    const openedContact = await runtime.activateItemAction({
        category: { id: 'contacts' },
        item: {
            id: 'dashboard_projection_id',
            payload: { id: 'contact_stable_id', source_contact_id: 'source_contact_id', phone: '0600000000' }
        }
    });
    assert.equal(openedContact.ok, true);
    assert.deepEqual(opened, [{
        surfaceKey: 'contact',
        context: {
            contactId: 'contact_stable_id',
            source: { type: 'dashboard_contact_item' }
        }
    }]);

    assert.deepEqual(await runtime.activateItemAction({
        category: { id: 'contacts' },
        item: { id: 'phone_projection', payload: { phone: '0600000000' } }
    }), { ok: true, ignored: 'dashboard_contact_identity_missing' });
    assert.deepEqual(await runtime.activateItemAction({ category: { id: 'news' }, item: { id: 'news_1' } }), {
        ok: true,
        ignored: 'dashboard_item_action_unsupported'
    });
    assert.deepEqual(await runtime.activateItemAction({ category: { id: 'monitor' }, item: { id: 'monitor_1' } }), {
        ok: true,
        ignored: 'dashboard_item_action_unsupported'
    });
    assert.equal(opened.length, 1, 'unsupported and phone-only cards must not open a panel');
});

test('Dashboard Contact context reveals only the requested stable identity', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const items = [{
        id: 'contact_stable', source_contact_id: 'contact_stable', source_provider: 'eve_contacts_local',
        source_writable: true, name: 'Stable contact', phone: '0600000000', custom_fields: []
    }];
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    dom.window.Squirrel = { contacts: {
        list: () => ({ items: items.map((item) => ({ ...item })) }),
        ensureReady: async () => ({ ok: true, items }),
        sources: () => ({ items: [] })
    } };
    dom.window.AdoleAPI = {
        auth: { getCurrentInfo: () => ({ id: 'current_user', name: 'Current', phone: '0600000000' }) },
        directory: { list: async () => ({ entries: [] }) }
    };
    const openFor = (contactId) => new Promise((resolve) => {
        contactSurface.onOpen({ context: { contactId }, refresh: resolve });
    });

    try {
        assert.deepEqual(await openFor('contact_stable'), { preserveNodeId: 'contact_accordion_contact_stable' });
        assert.equal(contactSurface.readState().expandedId, 'contact_stable');
        await openFor('0600000000');
        assert.equal(contactSurface.readState().expandedId, '', 'phone display data cannot select a contact');
    } finally {
        await contactSurface.onClose();
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});


test('Project workspace activation restores the project surface and main menu', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.requestAnimationFrame = (callback) => {
        callback();
        return 0;
    };
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    globalThis.WebSocket = class TestWebSocket {
        constructor() {
            this.readyState = 0;
        }

        addEventListener() {}
        removeEventListener() {}
        send() {}
        close() {
            this.readyState = 3;
        }
    };

    const calls = [];
    let menuActive = false;
    window.__eveWorkspaceMode = { mode: 'transition', projectId: 'project_alpha', targetMode: 'project', transitioning: true };
    setMainMenuRuntime({
        showFully: async () => {
            menuActive = true;
            calls.push({ name: 'showFully' });
            return true;
        },
        measure: () => ({ active: menuActive, treeMounted: menuActive })
    });
    window.AdoleAPI = {
        auth: {
            getCurrentInfo: () => ({ id: 'user_alpha' })
        },
        projects: {
            setCurrent: async (projectId, projectName, ownerId, authenticated) => {
                calls.push({ name: 'setCurrent', projectId, projectName, ownerId, authenticated });
                window.__currentProject = { id: projectId, name: projectName, owner_id: ownerId };
                return { ok: true };
            }
        }
    };
    window.Atome = {
        commit: async (payload) => {
            calls.push({ name: 'commit', payload });
            return { ok: true };
        }
    };
    window.eveToolBase = {
        loadProjectAtomes: async (projectId, options) => {
            calls.push({ name: 'loadProjectAtomes', projectId, options });
            const layer = document.createElement('div');
            layer.id = `project_view_${projectId}`;
            layer.style.display = 'none';
            layer.style.visibility = 'hidden';
            layer.style.pointerEvents = 'none';
            const canvas = document.createElement('canvas');
            canvas.id = 'eve_surface_project';
            canvas.style.visibility = 'hidden';
            canvas.style.pointerEvents = 'none';
            layer.appendChild(canvas);
            view.appendChild(layer);
            return [{ id: 'media_alpha', project_id: projectId }];
        },
        getProjectSceneState: () => ({
            records: [{ id: '__eve_bevy_ui_menu_only', properties: { layer: 'mainMenu' } }]
        }),
        renderProjectScene: async ({ projectId, records, host }) => {
            calls.push({ name: 'renderProjectScene', projectId, hostId: host?.id || null });
            return { ok: true };
        }
    };

    const { activateProjectWorkspace } = await import('../../eVe/intuition/matrix/core/project_data.js');
    const { sceneState } = await import('../../eVe/domains/rendering/project_scene_state.js');
    const result = await activateProjectWorkspace({
        id: 'project_alpha',
        name: 'Project Alpha',
        owner_id: 'user_alpha'
    }, { force: true, staleFirst: false });

    const layer = document.getElementById('project_view_project_alpha');
    const canvas = document.getElementById('eve_surface_project');
    assert.equal(result.ok, true);
    assert.equal(result.projectId, 'project_alpha');
    assert.equal(window.__eveWorkspaceMode.mode, 'project');
    assert.equal(window.__eveWorkspaceMode.projectId, 'project_alpha');
    assert.equal(sceneState.foregroundProjectId, 'project_alpha');
    assert.equal(layer.style.display, 'block');
    assert.equal(layer.style.visibility, 'visible');
    assert.equal(layer.style.pointerEvents, 'auto');
    assert.equal(canvas.parentElement, layer);
    assert.equal(canvas.style.display, 'block');
    assert.equal(canvas.style.visibility, '');
    assert.equal(canvas.style.pointerEvents, '');
    assert.equal(menuActive, true);
    assert.deepEqual(
        calls.find((entry) => entry.name === 'loadProjectAtomes')?.options,
        {
            force: true,
            staleFirst: false,
            forceProjectSurface: true,
            viewModePrepared: true,
            reason: 'workspace_activation'
        }
    );
    assert.equal(calls.some((entry) => entry.name === 'renderProjectScene'), false,
        'activation must reuse the authoritative projection owned by loadProjectAtomes');
    assert.deepEqual(calls.map((entry) => entry.name), ['setCurrent', 'commit', 'loadProjectAtomes', 'showFully']);
}, 10_000);

test('the latest overlapping project activation remains the canonical foreground owner', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.requestAnimationFrame = (callback) => {
        callback();
        return 0;
    };
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    setMainMenuRuntime({
        showFully: async () => true,
        measure: () => ({ active: true, treeMounted: true })
    });
    window.AdoleAPI = {
        auth: { getCurrentInfo: () => ({ id: 'user_overlap' }) },
        projects: {
            setCurrent: async (id, name, ownerId) => {
                window.__currentProject = { id, name, owner_id: ownerId };
                return { ok: true };
            }
        }
    };
    window.Atome = { commit: async () => ({ ok: true }) };
    let releaseFirst;
    const firstRelease = new Promise((resolve) => { releaseFirst = resolve; });
    let markFirstLoading;
    const firstLoading = new Promise((resolve) => { markFirstLoading = resolve; });
    window.eveToolBase = {
        loadProjectAtomes: async (projectId) => {
            if (projectId === 'project_first') {
                markFirstLoading();
                await firstRelease;
            }
            let layer = document.getElementById(`project_view_${projectId}`);
            if (!layer) {
                layer = document.createElement('div');
                layer.id = `project_view_${projectId}`;
                view.appendChild(layer);
            }
            let canvas = document.getElementById('eve_surface_project');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'eve_surface_project';
            }
            layer.appendChild(canvas);
            return [{ id: `atome_${projectId}`, project_id: projectId }];
        }
    };

    const { activateProjectWorkspace } = await import('../../eVe/intuition/matrix/core/project_data.js');
    const { sceneState } = await import('../../eVe/domains/rendering/project_scene_state.js');
    const firstTask = activateProjectWorkspace({ id: 'project_first', name: 'First' });
    await firstLoading;
    const latest = await activateProjectWorkspace({ id: 'project_latest', name: 'Latest' });
    releaseFirst();
    const first = await firstTask;

    assert.equal(latest.ok, true);
    assert.equal(first.superseded, true);
    assert.equal(window.__currentProject.id, 'project_latest');
    assert.equal(sceneState.foregroundProjectId, 'project_latest');
    assert.equal(document.getElementById('eve_surface_project')?.parentElement?.id, 'project_view_project_latest');
});

test('Project workspace activation records preview warmup failure without delaying the project', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.requestAnimationFrame = (callback) => {
        callback();
        return 0;
    };
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    setMainMenuRuntime({
        showFully: async () => true,
        measure: () => ({ active: true, treeMounted: true })
    });
    window.AdoleAPI = {
        auth: { getCurrentInfo: () => ({ id: 'user_preview_failure' }) },
        projects: {
            setCurrent: async (id, name, ownerId) => {
                window.__currentProject = { id, name, owner_id: ownerId };
                return { ok: true };
            }
        }
    };
    window.Atome = { commit: async () => ({ ok: true }) };
    window.eveToolBase = {
        loadProjectAtomes: async (projectId) => {
            const layer = document.createElement('div');
            layer.id = `project_view_${projectId}`;
            layer.appendChild(document.createElement('canvas'));
            view.appendChild(layer);
            return [];
        }
    };
    const { clearRuntimeErrors, getRuntimeErrors } = await import('../../atome/src/squirrel/runtime_errors.js');
    clearRuntimeErrors();
    previewRuntime.warmProjectPreviewCapture.mockRejectedValueOnce(new Error('bevy_project_preview_frame_runtime_timeout'));

    const { activateProjectWorkspace } = await import('../../eVe/intuition/matrix/core/project_data.js');
    const result = await activateProjectWorkspace({
        id: 'project_preview_failure',
        name: 'Preview Failure',
        owner_id: 'user_preview_failure'
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(result.ok, true);
    assert.ok(getRuntimeErrors().some((entry) => (
        entry.context === 'eve:project-preview:warmup'
        && entry.details?.projectId === 'project_preview_failure'
        && entry.details?.capture === 'bevy_iframe'
    )));
});

test('Project workspace activation from dashboard claims the project surface instead of the dashboard surface', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.requestAnimationFrame = (callback) => {
        callback();
        return 0;
    };
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);

    const dashboardHost = document.createElement('div');
    dashboardHost.id = 'project_view___eve_dashboard_workspace__';
    dashboardHost.style.display = 'block';
    const dashboardCanvas = document.createElement('canvas');
    dashboardCanvas.id = 'eve_surface_project';
    dashboardHost.appendChild(dashboardCanvas);
    view.appendChild(dashboardHost);

    globalThis.WebSocket = class TestWebSocket {
        constructor() {
            this.readyState = 0;
        }

        addEventListener() {}
        removeEventListener() {}
        send() {}
        close() {
            this.readyState = 3;
        }
    };

    const calls = [];
    let menuActive = false;
    window.__eveWorkspaceMode = {
        mode: 'dashboard',
        projectId: '__eve_dashboard_workspace__',
        transitioning: false,
        targetMode: ''
    };
    window.eveDashboardBevyUiRuntime = {
        state: {
            active: true,
            suspended: false,
            sceneProjectId: '__eve_dashboard_workspace__'
        },
        destroy: async () => {
            calls.push({ name: 'destroyDashboard' });
            window.eveDashboardBevyUiRuntime.state.active = false;
            window.__eveWorkspaceMode = {
                mode: 'dashboard',
                projectId: '__eve_dashboard_workspace__',
                transitioning: false,
                targetMode: ''
            };
            return { ok: true };
        }
    };
    setMainMenuRuntime({
        showFully: async () => {
            menuActive = true;
            calls.push({ name: 'showFully' });
            return true;
        },
        measure: () => ({ active: menuActive, treeMounted: menuActive })
    });
    window.AdoleAPI = {
        auth: {
            getCurrentInfo: () => ({ id: 'user_beta' })
        },
        projects: {
            setCurrent: async (projectId, projectName, ownerId, authenticated) => {
                calls.push({ name: 'setCurrent', projectId, projectName, ownerId, authenticated });
                window.__currentProject = { id: projectId, name: projectName, owner_id: ownerId };
                return { ok: true };
            }
        }
    };
    window.Atome = {
        commit: async (payload) => {
            calls.push({ name: 'commit', payload });
            return { ok: true };
        }
    };
    window.eveToolBase = {
        loadProjectAtomes: async (projectId, options) => {
            calls.push({ name: 'loadProjectAtomes', projectId, options });
            return [];
        }
    };

    const { activateProjectWorkspace } = await import('../../eVe/intuition/matrix/core/project_data.js');
    const { sceneState } = await import('../../eVe/domains/rendering/project_scene_state.js');
    const result = await activateProjectWorkspace({
        id: 'project_beta',
        name: 'Project Beta',
        owner_id: 'user_beta'
    }, { force: true, staleFirst: false });

    const projectLayer = document.getElementById('project_view_project_beta');
    const canvas = document.getElementById('eve_surface_project');
    assert.equal(result.ok, true);
    assert.equal(window.__eveWorkspaceMode.mode, 'project');
    assert.equal(window.__eveWorkspaceMode.projectId, 'project_beta');
    assert.equal(sceneState.foregroundProjectId, 'project_beta');
    assert.equal(projectLayer.style.display, 'block');
    assert.equal(projectLayer.style.visibility, 'visible');
    assert.equal(projectLayer.style.pointerEvents, 'auto');
    assert.equal(dashboardHost.style.pointerEvents, 'none');
    assert.equal(canvas.parentElement, projectLayer);
    assert.equal(menuActive, true);
    assert.deepEqual(
        calls.find((entry) => entry.name === 'loadProjectAtomes')?.options,
        {
            force: true,
            staleFirst: false,
            forceProjectSurface: true,
            viewModePrepared: true,
            reason: 'workspace_activation'
        }
    );
    assert.deepEqual(calls.map((entry) => entry.name), [
        'setCurrent',
        'commit',
        'loadProjectAtomes',
        'showFully',
        'destroyDashboard'
    ]);
});
