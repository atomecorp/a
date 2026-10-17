import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWorkspaceBootstrapOpen } from '../../eVe/intuition/tools/user_workspace_bootstrap_runtime.js';
import { ensureProjectBootstrapReady } from '../../eVe/intuition/tools/project_bootstrap.js';
import { bootstrapState } from '../../eVe/intuition/tools/project_bootstrap_state.js';

const boot = vi.hoisted(() => ({ user: 'owner', api: null, onboarding: false }));
vi.mock('../../eVe/intuition/tools/user_login_shared_runtime.js', () => ({ ensureSharedLoginSequence: () => ({ handleAuthenticated: async () => boot.onboarding }) }));
vi.mock('../../eVe/core/project_security.js', () => ({ getCurrentUserId: () => boot.user,
    pickAuthoritativeProjects: result => result.fastify.projects, extractProjectOwnerId: record => record.owner_id,
    resolveProjectMeta: record => ({ id: record.id, name: record.name || 'Project', owner_id: record.owner_id }) }));
vi.mock('../../eVe/intuition/tools/project_bootstrap_support.js', () => ({
    bootstrapPerfNowMs: () => 0, bootstrapPerfElapsedMs: () => 0, bootstrapPerfLog() {}, bootstrapDebugLog() {},
    toErrorMessage: error => error.message, waitForAuthCheck: async () => ({ authenticated: true, userId: boot.user }),
    getAdoleApi: () => boot.api, normalizeAuthBootstrapDetail: input => input, isAnonymousWorkspace: () => false,
    getAnonymousProjectName: () => 'Guest', extractAtomeId: result => result.id, extractUserId: value => value.id, clearProjectView: async () => {}
}));
vi.mock('../../eVe/intuition/tools/project_bootstrap_projects.js', () => ({
    syncActiveProjectFlag: vi.fn(), seedAnonymousProject: vi.fn(), ensureAnonymousProjectSeeded: vi.fn(),
    migrateAnonymousWelcomeText: vi.fn(), findRenderableProjectFromStateCurrent: vi.fn(), persistCurrentProjectId: vi.fn(),
    ensureProjectView: vi.fn(), selectMostRecentProject: projects => projects[0]
}));
vi.mock('../../eVe/domains/dashboard/workspace_surface_preference.js', () => ({
    readStartupView: () => 'dashboard', resolveWorkspaceSurfacePreference: async () => {}, waitForWorkspaceSurfacePreference: async () => {}
}));
const previousWindow = globalThis.window;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
    boot.user = 'owner'; boot.onboarding = false;
    boot.api = { auth: { getCurrentInfo: () => ({ id: boot.user }) }, security: { isAuthenticated: () => true }, projects: {} };
    globalThis.window = { AdoleAPI: boot.api, __eveProfilePreferences: { visual: { dashboardStyle: 'eve_basic' } },
        eveToolBase: { loadProjectAtomes: vi.fn() } };
    Object.assign(bootstrapState, { done: false, inFlight: false, userId: null, readyProjectId: null, authResult: null, pendingDetail: null });
});
afterEach(() => { globalThis.window = previousWindow; });

test('an eVe template becomes usable without waiting for an unrelated work-project bootstrap', async () => {
    const openWorkspaceDashboardAndMainMenu = vi.fn(async () => ({ ok: true, route: 'dashboard_eve' }));
    const ensureProjectReady = vi.fn(() => new Promise(() => {}));
    const open = createWorkspaceBootstrapOpen({ openWorkspaceDashboardAndMainMenu, publishNativeBootMilestone() {} });
    expect(await open({ source: 'startup', ensureProjectReady })).toMatchObject({ ok: true, route: 'dashboard_eve', resumed: false });
    expect(ensureProjectReady).not.toHaveBeenCalled(); expect(openWorkspaceDashboardAndMainMenu).toHaveBeenCalledOnce();
    boot.onboarding = true;
    expect(await open({ ensureProjectReady })).toMatchObject({ ok: true, route: 'dashboard_eve' });
    expect(openWorkspaceDashboardAndMainMenu).toHaveBeenCalledTimes(2);
});

test('a late saved project cannot replace the project selected while loading', async () => {
    const saved = deferred();
    boot.api.projects = { loadSaved: vi.fn(() => saved.promise), setCurrent: vi.fn(), list: vi.fn() };
    const opening = ensureProjectBootstrapReady({ force: true });
    await vi.waitFor(() => expect(boot.api.projects.loadSaved).toHaveBeenCalled());
    window.__currentProject = { id: 'newly_selected' };
    saved.resolve({ id: 'old_saved', name: 'Old' });
    expect(await opening).toBe('newly_selected');
    expect(boot.api.projects.setCurrent).not.toHaveBeenCalled();
    expect(window.eveToolBase.loadProjectAtomes).not.toHaveBeenCalled();
});

test('a response from the previous account cannot be admitted to the new workspace', async () => {
    const saved = deferred();
    boot.api.projects = { loadSaved: vi.fn(() => saved.promise), setCurrent: vi.fn() };
    const opening = ensureProjectBootstrapReady({ force: true });
    const rejected = expect(opening).rejects.toThrow('project_bootstrap_context_changed');
    await vi.waitFor(() => expect(boot.api.projects.loadSaved).toHaveBeenCalled());
    boot.user = 'other'; saved.resolve({ id: 'old_saved' });
    await rejected; expect(boot.api.projects.setCurrent).not.toHaveBeenCalled();
});
