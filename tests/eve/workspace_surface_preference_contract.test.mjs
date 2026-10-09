import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
// Compile the real dependency graph before timed per-test module resets.
import '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import '../../eVe/domains/dashboard/workspace_surface_preference.js';

const profileApi = vi.hoisted(() => ({
    loadUserProfile: vi.fn(),
    upsertUserProfile: vi.fn()
}));

vi.mock('../../eVe/domains/user/profile_api.js', () => profileApi);

const installWindow = () => {
    const env = installMockBrowserEnv();
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = env.window;
    globalThis.document = env.document;
    return {
        window: env.window,
        document: env.document,
        restore: () => {
            globalThis.window = previousWindow;
            globalThis.document = previousDocument;
        }
    };
};

beforeEach(async () => {
    vi.resetModules();
    profileApi.loadUserProfile.mockReset();
    profileApi.upsertUserProfile.mockReset();
    // Load the actual dependency graph before measuring profile mutation.
    // Module resets otherwise let unfinished imports leak into the next test.
    await import('../../eVe/domains/dashboard/dashboard_workspace_mode.js');
    await import('../../eVe/domains/dashboard/workspace_surface_preference.js');
});

test('readStartupView resolves the stored workspace surface, not a written-once default', async () => {
    const env = installWindow();
    try {
        const { readStartupView, readWorkspaceSurfacePreference } = await import(
            '../../eVe/domains/dashboard/workspace_surface_preference.js'
        );

        env.window.__eveProfilePreferences = { workspace: { startup_view: 'dashboard' } };
        assert.equal(readWorkspaceSurfacePreference(), 'dashboard');
        assert.equal(readStartupView(), 'dashboard');

        env.window.__eveProfilePreferences = { workspace: { startup_view: 'project' } };
        assert.equal(readStartupView(), 'project');

        // The removed legacy global is not a startup-view source anymore.
        env.window.__eveProfilePreferences = {};
        env.window.eveUserPreferences = { startup_view: 'dashboard' };
        assert.equal(readStartupView(), 'project');

        // The explicit focused-contract override stays authoritative.
        env.window.__eveStartupView = 'dashboard';
        assert.equal(readStartupView(), 'dashboard');
        env.window.__eveStartupView = 'project';
        assert.equal(readStartupView(), 'project');
        env.window.__eveStartupView = null;
    } finally {
        env.restore();
    }
});

test('a boot with no published preference resolves the surface from the profile once', async () => {
    const env = installWindow();
    try {
        env.window.__eveProfilePreferences = { visual: { handedness: 'left' } };
        profileApi.loadUserProfile.mockResolvedValue({
            ok: true,
            userId: 'surface_user',
            profile: {
                preferences: {
                    visual: { handedness: 'left' },
                    workspace: { startup_view: 'dashboard' }
                }
            }
        });
        const { readStartupView, waitForWorkspaceSurfacePreference } = await import(
            '../../eVe/domains/dashboard/workspace_surface_preference.js'
        );

        assert.equal(await waitForWorkspaceSurfacePreference(), 'dashboard');
        assert.equal(readStartupView(), 'dashboard');
        assert.equal(profileApi.loadUserProfile.mock.calls.length, 1);
        assert.equal(env.window.__eveProfilePreferences.workspace.startup_view, 'dashboard');
        assert.equal(
            env.window.__eveProfilePreferences.visual.handedness,
            'left',
            'publishing the surface never drops the other published preferences'
        );

        assert.equal(await waitForWorkspaceSurfacePreference(), 'dashboard');
        assert.equal(profileApi.loadUserProfile.mock.calls.length, 1, 'the resolved surface is cached for the session');
    } finally {
        env.restore();
    }
});

test('every real surface change persists the preference through the profile owner', async () => {
    const env = installWindow();
    try {
        env.window.__eveProfilePreferences = {};
        profileApi.loadUserProfile.mockResolvedValue({
            ok: true,
            userId: 'surface_user',
            profile: { preferences: { visual: { handedness: 'right' } } }
        });
        profileApi.upsertUserProfile.mockResolvedValue({ ok: true });
        const mode = await import('../../eVe/domains/dashboard/dashboard_workspace_mode.js');

        mode.markProjectWorkspaceMode('project_one');
        await vi.waitFor(() => assert.equal(profileApi.upsertUserProfile.mock.calls.length, 1));
        const [savedProfile, saveOptions] = profileApi.upsertUserProfile.mock.calls[0];
        assert.equal(savedProfile.preferences.workspace.startup_view, 'project');
        assert.equal(savedProfile.preferences.visual.handedness, 'right', 'the other stored preferences survive the write');
        assert.equal(saveOptions.eventSource, 'workspace_surface');
        assert.equal(saveOptions.allowCreate, false);
        assert.equal(saveOptions.userId, 'surface_user');
        assert.equal(env.window.__eveProfilePreferences.workspace.startup_view, 'project');

        const upsertsAfterProject = profileApi.upsertUserProfile.mock.calls.length;
        mode.markProjectWorkspaceMode('project_one');
        mode.beginDashboardWorkspaceTransition('dashboard', 'project_one');
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(
            profileApi.upsertUserProfile.mock.calls.length,
            upsertsAfterProject,
            'an unchanged mode and a transition never rewrite the stored surface'
        );
        assert.equal(env.window.__eveProfilePreferences.workspace.startup_view, 'project');

        mode.markDashboardWorkspaceMode();
        await vi.waitFor(() => assert.equal(profileApi.upsertUserProfile.mock.calls.length, upsertsAfterProject + 1));
        assert.equal(profileApi.upsertUserProfile.mock.calls.at(-1)[0].preferences.workspace.startup_view, 'dashboard');
        assert.equal(env.window.__eveProfilePreferences.workspace.startup_view, 'dashboard');
    } finally {
        env.restore();
    }
});

test('a guest workspace keeps the surface for the session without a profile write', async () => {
    const env = installWindow();
    try {
        env.window.__eveProfilePreferences = {};
        profileApi.loadUserProfile.mockResolvedValue({ ok: false, reason: 'no_user', error: 'no_user_logged_in' });
        const mode = await import('../../eVe/domains/dashboard/dashboard_workspace_mode.js');

        mode.markDashboardWorkspaceMode();
        await vi.waitFor(() => assert.equal(profileApi.loadUserProfile.mock.calls.length, 1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(profileApi.upsertUserProfile.mock.calls.length, 0, 'a guest workspace has no profile to write');
        assert.equal(env.window.__eveProfilePreferences.workspace.startup_view, 'dashboard');
    } finally {
        env.restore();
    }
});

test('the startup presentation resumes a saved project only for the project surface', async () => {
    const env = installWindow();
    try {
        env.window.__authCheckComplete = true;
        env.window.__authCheckResult = { authenticated: true, userId: 'surface_user', anonymous: false };
        env.window.__eveProfilePreferences = { workspace: { startup_view: 'dashboard' } };
        env.window.eveToolBase = { loadProjectAtomes: async () => [{ id: 'shape_one', type: 'shape' }] };
        env.window.AdoleAPI = {
            auth: {
                current: async () => ({ logged: true, user: { id: 'surface_user', user_id: 'surface_user' } })
            },
            security: {
                isAnonymous: () => false,
                waitForAuthCheck: async () => ({ authenticated: true, userId: 'surface_user', anonymous: false })
            },
            projects: {
                loadSaved: async () => ({ id: 'saved_surface_project', name: 'Projet surface' }),
                list: async () => [],
                setCurrent: async () => true
            }
        };
        const { ensureProjectBootstrapReady, readProjectBootstrapPresentation } = await import(
            '../../eVe/intuition/tools/project_bootstrap.js'
        );

        await ensureProjectBootstrapReady();
        const presentation = readProjectBootstrapPresentation();
        assert.equal(presentation.startupView, 'dashboard', 'a Dashboard session must not resume the project');
        assert.equal(presentation.projectId, 'saved_surface_project');
        assert.equal(presentation.restoredSavedProject, true);
    } finally {
        env.restore();
    }
});
