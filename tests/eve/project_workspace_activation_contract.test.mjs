import assert from 'node:assert/strict';
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

vi.mock('../../eVe/domains/rendering/project_preview_runtime.js', () => ({
    warmProjectPreviewCapture: async () => ({ ok: true })
}));


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
    let renderedRecords = null;
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
            renderedRecords = records;
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
        { force: true, staleFirst: false, forceProjectSurface: true }
    );
    assert.deepEqual(
        renderedRecords?.map((record) => record.id),
        ['media_alpha'],
        'activation must project loaded project records, not stale overlay-only scene records'
    );
    assert.equal(
        calls.find((entry) => entry.name === 'renderProjectScene')?.hostId,
        'project_view_project_alpha'
    );
    assert.deepEqual(calls.map((entry) => entry.name), ['setCurrent', 'commit', 'loadProjectAtomes', 'showFully', 'renderProjectScene']);
}, 10_000);

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
        { force: true, staleFirst: false, forceProjectSurface: true }
    );
    assert.deepEqual(calls.map((entry) => entry.name), [
        'destroyDashboard',
        'setCurrent',
        'commit',
        'loadProjectAtomes',
        'showFully'
    ]);
});

test('Empty project activation transfers the real main-menu overlay off the Dashboard scene', async () => {
    clearAllProjectScenes();
    const dom = installDom('<!doctype html><html><body><main id="view"><div id="project_view___eve_dashboard_workspace__"><canvas id="eve_surface_project"></canvas></div></main></body></html>');
    const { window, document } = dom.window;
    globalThis.window = window;
    globalThis.document = document;
    window.requestAnimationFrame = (callback) => {
        callback();
        return 1;
    };
    window.cancelAnimationFrame = () => {};
    const surface = document.getElementById('eve_surface_project');
    surface.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 1124, bottom: 853, width: 1124, height: 853
    });
    await renderProjectScene({
        projectId: '__eve_dashboard_workspace__',
        records: [{ id: '__eve_dashboard_sentinel', type: 'shape', properties: { width: 10, height: 10 } }],
        host: document.getElementById('project_view___eve_dashboard_workspace__'),
        compositor: createTestCompositor()
    });

    const uiRuntime = createEveBevyUiRuntime({
        imageResolverFactory: () => async () => ({ width: 1, height: 1, rgba: [255, 255, 255, 255] }),
        requestFrame: (callback) => {
            callback();
            return 1;
        },
        cancelFrame: () => {}
    });
    window.eveBevyUiRuntime = uiRuntime;
    const menu = createBevyUiMainMenuRuntime({
        content: {},
        surfaceResolver: () => document.getElementById('eve_surface_project'),
        runtimeResolver: () => uiRuntime,
        handednessResolver: () => 'right',
        requestFrame: (callback) => {
            callback();
            return 1;
        },
        cancelFrame: () => {},
        reducedMotionResolver: () => true
    });
    setMainMenuRuntime(menu, window);
    await menu.showFully();
    assert.equal(
        getProjectSceneState('__eve_dashboard_workspace__').records.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        true,
        'precondition: the real menu overlay starts on the Dashboard scene'
    );

    window.eveDashboardBevyUiRuntime = {
        state: { active: true, suspended: false, sceneProjectId: '__eve_dashboard_workspace__' },
        destroy: async () => {
            window.eveDashboardBevyUiRuntime.state.active = false;
            return { ok: true };
        }
    };
    window.AdoleAPI = {
        auth: { getCurrentInfo: () => ({ id: 'user_empty' }) },
        projects: {
            setCurrent: async (projectId, name, ownerId) => {
                window.__currentProject = { id: projectId, name, owner_id: ownerId };
                return { ok: true };
            }
        }
    };
    window.Atome = { commit: async () => ({ ok: true }) };
    window.eveToolBase = {
        loadProjectAtomes: async (projectId) => {
            const host = document.getElementById(`project_view_${projectId}`);
            await renderProjectScene({ projectId, records: [], host, compositor: createTestCompositor() });
            return [];
        },
        getProjectSceneState,
        renderProjectScene
    };

    const { activateProjectWorkspace } = await import('../../eVe/intuition/matrix/core/project_data.js');
    const result = await activateProjectWorkspace({
        id: 'project_empty',
        name: 'Empty Project',
        owner_id: 'user_empty'
    });

    const projectRecords = getProjectSceneState('project_empty')?.records || [];
    const dashboardRecords = getProjectSceneState('__eve_dashboard_workspace__')?.records || [];
    assert.equal(result.ok, true);
    assert.equal(surface.parentElement?.id, 'project_view_project_empty');
    assert.equal(
        projectRecords.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        true,
        'the main menu must remain actionable even when the selected project has no persisted content'
    );
    assert.equal(
        dashboardRecords.some((record) => String(record.id || '').startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        false,
        'the shared-canvas menu must not remain owned by the hidden Dashboard scene'
    );
    assert.equal(uiRuntime.readOverlayDiagnostics().lastOverlayError, null);
}, 10_000);
