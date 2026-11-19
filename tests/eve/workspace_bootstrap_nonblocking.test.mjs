import { expect, test, vi } from 'vitest';
import { createWorkspaceBootstrapOpen } from '../../eVe/intuition/tools/user_workspace_bootstrap_runtime.js';

test('startup always presents home without waiting for work-project restoration', async () => {
    const env = { AdoleAPI: { security: { isAuthenticated: () => false } }, __eveProfilePreferences: { workspace: { startup_view: 'project' } } };
    vi.stubGlobal('window', env);
    try {
        const work = vi.fn(() => new Promise(() => {}));
        const home = vi.fn(async () => ({ ok: true }));
        const show = vi.fn();
        const stopRestore = vi.fn();
        const followRestore = vi.fn(() => stopRestore);
        const waitForHomePreferences = vi.fn(async () => ({ ok: true }));
        const settleDashboardDomain = vi.fn(async () => ({ ok: true, domain: 'pro' }));
        const open = createWorkspaceBootstrapOpen({ openWorkspaceDashboardAndMainMenu: home, showPreparedProject: show, publishNativeBootMilestone() {}, waitForHomePreferences, settleDashboardDomain, followRestore });
        expect(await open({ ensureProjectReady: work, readBootstrapPresentation: () => ({ startupView: 'project', restoredSavedProject: true }) })).toMatchObject({ ok: true, route: 'dashboard', resumed: false });
        expect(work).not.toHaveBeenCalled(); expect(show).not.toHaveBeenCalled(); expect(home).toHaveBeenCalledTimes(1);
        expect(env.__eveWorkspaceDashboardReady).toBe(true);
        // Only the home style and its domain are awaited; the restore under way is followed then released.
        expect(waitForHomePreferences).toHaveBeenCalledTimes(1); expect(settleDashboardDomain).toHaveBeenCalledTimes(1);
        expect(settleDashboardDomain.mock.invocationCallOrder[0]).toBeGreaterThan(waitForHomePreferences.mock.invocationCallOrder[0]); expect(followRestore).toHaveBeenCalledTimes(1); expect(stopRestore).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
});
