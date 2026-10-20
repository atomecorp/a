import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { ensureDashboardWorkspaceSurface, markProjectWorkspaceArrival, markProjectWorkspaceMode } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import { openWorkspaceDashboardWithProjectBootstrap, openWorkspaceDashboardAndMainMenu } from '../../eVe/intuition/tools/user_workspace_surface_runtime.js';
import '../../eVe/domains/user/first_launch_runtime.js';

const owners = vi.hoisted(() => ({ activate: vi.fn(), prepare: vi.fn(), present: vi.fn(), home: vi.fn() }));
vi.mock('../../eVe/intuition/matrix/core/project_data.js', () => ({ activateProjectWorkspace: owners.activate }));
vi.mock('../../eVe/domains/rendering/project_thumbnail_transition.js', () => ({
    beginProjectClosing: async () => null,
    prepareProjectOpening: owners.prepare, presentOpenedProject: owners.present,
    revealProjectMainMenu: async () => null, discardProjectOpening: async () => false
}));
vi.mock('../../eVe/intuition/tools/workspace_main_menu_visibility.js', () => ({
    setWorkspaceMainMenuDashboardSuspended: async () => ({ ok: true }), ensureWorkspaceMainMenuVisible: async () => ({ ok: true })
}));
vi.mock('../../eVe/intuition/tools/user_login_shared_runtime.js', () => ({
    ensureSharedLoginSequence: () => ({ handleAuthenticated: async () => false })
}));
vi.mock('../../eVe/domains/dashboard/workspace_surface_preference.js', () => ({ rememberWorkspaceSurface: async () => ({ ok: true }),
    waitForHomePreferences: async () => true,
    ensureHomeTemplateProject: async () => ({ ok: true, projectId: window.__eveProfilePreferences.workspace.home_eve_project_id }) }));
vi.mock('../../eVe/domains/matrix/matrix_module_runtime.js', () => ({ openWorkspaceHomeProjection: owners.home, readMatrixInstance: () => null,
    closeWorkspaceHomeProjection: vi.fn(async () => {}) }));
vi.mock('../../eVe/domains/dashboard/dashboard_bevy_ui_runtime.js', () => ({
    getDashboardBevyUiRuntime: () => window.eveDashboardBevyUiRuntime
}));

let dom;
beforeEach(() => {
    dom = new JSDOM('<div id="view"><div id="project_view_saved"></div></div>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    window.AdoleAPI = { security: { isAuthenticated: () => true }, auth: { getCurrentInfo: () => ({ id: 'existing' }) } };
    window.__currentProject = { id: 'saved' };
    window.__eveWorkspaceMode = { mode: 'dashboard', projectId: '__eve_dashboard_workspace__' };
    owners.home.mockReset().mockImplementation(async input => ({ ok: true, projectId: input.projectId, route: input.templateKey }));
    owners.activate.mockReset().mockResolvedValue({ ok: true }); owners.prepare.mockReset().mockResolvedValue({ ok: true }); owners.present.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

it('keeps the wallpaper canvas visible throughout pending home restoration', async () => {
    const canvas = ensureDashboardWorkspaceSurface(); let release, arrived;
    const ready = new Promise(done => { arrived = done; });
    const opacityChanges = [];
    const observer = new window.MutationObserver(() => opacityChanges.push(canvas.style.opacity));
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    window.eveDashboardBevyUiRuntime = { state: { active: false }, open: vi.fn(), close: vi.fn() };
    owners.home.mockImplementation(async input => {
        await new Promise(done => { release = done; arrived(); });
        return { ok: true, projectId: input.projectId, route: input.templateKey };
    });
    const restoring = openWorkspaceDashboardWithProjectBootstrap({ ensureProjectReady: async () => 'saved' });
    await ready;
    expect(canvas.style.opacity).not.toBe('0'); expect(canvas.isConnected).toBe(true);
    release(); expect(await restoring).toMatchObject({ ok: true, route: 'dashboard_eve' });
    observer.disconnect();
    expect(opacityChanges).not.toContain('0'); expect(document.getElementById('eve_surface_project')).toBe(canvas);
});

it.each(['beginner', 'intermediate', 'advanced'])('presents the eVe home without loading a work project (%s)', async level => {
    const canvas = ensureDashboardWorkspaceSurface();
    window.__eveProfilePreferences = { visual: { masteryLevel: level }, workspace: { startup_view: 'project', home_eve_project_id: 'home' } };
    window.eveDashboardBevyUiRuntime = { state: { active: false }, open: vi.fn(), close: vi.fn() };
    const ensure = vi.fn(() => new Promise(() => {}));
    expect(await openWorkspaceDashboardWithProjectBootstrap({ ensureProjectReady: ensure })).toMatchObject({ ok: true, route: 'dashboard_eve', resumed: false });
    expect(owners.home).toHaveBeenCalledExactlyOnceWith({ templateKey: 'dashboard_eve', projectId: '__eve_dashboard_workspace__' });
    expect(ensure).not.toHaveBeenCalled(); expect(owners.activate).not.toHaveBeenCalled();
    expect(window.eveDashboardBevyUiRuntime.open).not.toHaveBeenCalled();
    expect(canvas.isConnected).toBe(true); expect(canvas.style.opacity).not.toBe('0');
});

it('presents the standard creation surface over the eVe home', async () => {
    ensureDashboardWorkspaceSurface();
    window.__eveProfilePreferences = { visual: { masteryLevel: 'beginner' },
        workspace: { startup_view: 'dashboard', home_eve_project_id: 'home' } };
    const runtime = window.eveDashboardBevyUiRuntime = {
        state: { active: false }, close: vi.fn(), readDiagnostics: () => ({ mounted_nodes: 24 }),
        activateCategory: vi.fn(async category => ({ ok: true, category_id: category })),
        open: vi.fn(async input => { Object.assign(runtime.state, { active: true, sceneProjectId: input.sceneProjectId }); return { ok: true }; })
    };
    expect(await openWorkspaceDashboardAndMainMenu({ creationCategory: 'projects' })).toMatchObject({ ok: true, route: 'dashboard_creation' });
    expect(runtime.activateCategory).toHaveBeenCalledExactlyOnceWith('projects');
    expect(owners.activate).not.toHaveBeenCalled();
    expect(await openWorkspaceDashboardAndMainMenu()).toMatchObject({ route: 'dashboard_eve' });
    expect(runtime.close).toHaveBeenCalledExactlyOnceWith({ honorLabelEditorKeyboardGuard: false });
});
