import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { ensureDashboardWorkspaceSurface, markProjectWorkspaceArrival, markProjectWorkspaceMode } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import { openWorkspaceDashboardWithProjectBootstrap } from '../../eVe/intuition/tools/user_workspace_surface_runtime.js';
import '../../eVe/domains/user/first_launch_runtime.js';

const owners = vi.hoisted(() => ({ activate: vi.fn(), prepare: vi.fn(), present: vi.fn() }));
vi.mock('../../eVe/intuition/matrix/core/project_data.js', () => ({ activateProjectWorkspace: owners.activate }));
vi.mock('../../eVe/domains/rendering/project_thumbnail_transition.js', () => ({
    beginProjectClosing: async () => null,
    prepareProjectOpening: owners.prepare, presentOpenedProject: owners.present
}));
vi.mock('../../eVe/intuition/tools/workspace_main_menu_visibility.js', () => ({
    setWorkspaceMainMenuDashboardSuspended: async () => ({ ok: true }), ensureWorkspaceMainMenuVisible: async () => ({ ok: true })
}));
vi.mock('../../eVe/intuition/tools/user_login_shared_runtime.js', () => ({
    ensureSharedLoginSequence: () => ({ handleAuthenticated: async () => false })
}));
vi.mock('../../eVe/domains/dashboard/workspace_surface_preference.js', () => ({ rememberWorkspaceSurface: async () => ({ ok: true }) }));
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
    owners.activate.mockReset(); owners.prepare.mockReset().mockResolvedValue({ ok: true }); owners.present.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { dom.window.close(); vi.unstubAllGlobals(); });

it('keeps the wallpaper canvas visible throughout pending Dashboard restoration', async () => {
    const canvas = ensureDashboardWorkspaceSurface(); let release, arrived;
    const ready = new Promise(done => { arrived = done; });
    const opacityChanges = [];
    const observer = new window.MutationObserver(() => opacityChanges.push(canvas.style.opacity));
    observer.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    const runtime = window.eveDashboardBevyUiRuntime = {
        state: { active: false }, readDiagnostics: () => ({ mounted_nodes: 24 }), close: async () => ({ ok: true }),
        open: async input => {
            await new Promise(done => { release = done; arrived(); });
            Object.assign(runtime.state, { active: true, sceneProjectId: input.sceneProjectId, dataProjectId: input.dataProjectId });
            return { ok: true };
        }
    };
    const restoring = openWorkspaceDashboardWithProjectBootstrap({ ensureProjectReady: async () => 'saved' });
    await ready;
    expect(canvas.style.opacity).not.toBe('0'); expect(canvas.isConnected).toBe(true);
    release(); expect(await restoring).toMatchObject({ ok: true, route: 'dashboard' });
    observer.disconnect();
    expect(opacityChanges).not.toContain('0'); expect(document.getElementById('eve_surface_project')).toBe(canvas);
});

it.each([true, false])('keeps the wallpaper during Matrix Dashboard activation, preferences already loaded: %s', async loaded => {
    ensureDashboardWorkspaceSurface(); let release, arrived;
    const ready = new Promise(done => { arrived = done; });
    const preferences = { workspace: { startup_view: 'dashboard', home_template_project_id: 'home' } };
    if (loaded) window.__eveProfilePreferences = preferences;
    owners.activate.mockImplementation(async () => {
        markProjectWorkspaceArrival('home');
        await new Promise(done => { release = done; arrived(); });
        markProjectWorkspaceMode('home'); return { ok: true };
    });
    const restoring = openWorkspaceDashboardWithProjectBootstrap({ ensureProjectReady: async () => {
        window.__eveProfilePreferences = preferences; return 'saved';
    } });
    await ready;
    expect(window.__eveWorkspaceMode).toMatchObject({ mode: 'transition', targetMode: 'project', projectId: 'home' });
    release(); expect(await restoring).toMatchObject({ ok: true, route: 'dashboard_basic' });
    expect(owners.prepare).not.toHaveBeenCalled(); expect(owners.present).not.toHaveBeenCalled();
});

it('fades into a restored ordinary project through the existing thumbnail transition owner', async () => {
    const canvas = ensureDashboardWorkspaceSurface(); let release, arrived;
    const ready = new Promise(done => { arrived = done; });
    window.eveToolBase = { loadProjectAtomes: async () => { await new Promise(done => { release = done; arrived(); }); return { ok: true }; } };
    owners.present.mockImplementation(async () => {
        expect(window.__eveWorkspaceMode.mode).toBe('transition');
        return { ok: true };
    });
    const restoring = openWorkspaceDashboardWithProjectBootstrap({ ensureProjectReady: async () => 'saved',
        readBootstrapPresentation: () => ({ startupView: 'project', restoredSavedProject: true }) });
    await ready;
    expect(window.__eveWorkspaceMode.mode).toBe('transition'); expect(canvas.style.opacity).not.toBe('0');
    release(); expect(await restoring).toMatchObject({ ok: true, route: 'project', resumed: true });
    expect(owners.prepare).toHaveBeenCalledWith({ projectId: 'saved' }); expect(owners.present).toHaveBeenCalledWith('saved');
    expect(window.__eveWorkspaceMode).toMatchObject({ mode: 'project', projectId: 'saved' });
});
