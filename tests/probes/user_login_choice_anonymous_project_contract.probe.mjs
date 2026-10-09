// Guest ownership contract. Full canvas/IndexedDB boot is exercised separately
// by UI acceptance; this probe isolates the existing Home session coordinator.
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
const { window } = installMockBrowserEnv();
const { createUserHomePanelRuntime } = await import('../../eVe/intuition/tools/user_home_panel_runtime.js');
const starts = [], workspaces = [];
const api = { security: { startGuest: async options => { starts.push(options); return { ok: true, user: { id: 'guest' } }; } } };
const home = createUserHomePanelRuntime({ getAdoleApi: () => api,
    ensureCurrentProject: async () => 'guest-project', cleanupWorkspace: async () => {},
    openWorkspace: async options => { workspaces.push(options); return { ok: true }; } });
const result = await home.enterAnonymousWorkspace();
assert.equal(result.ok, true);
assert.deepEqual(starts, [{ force: true }], 'free access delegates once to the existing local guest owner');
assert.equal(workspaces.length, 0, 'free access keeps the shared Goals flow instead of opening a workspace');
assert.deepEqual(result.user, { id: 'guest' });
assert.equal(window.__eveProfilePreferences?.first_launch, undefined, 'Home delegates session progress to first launch');
console.log('user_login_choice_anonymous_project_contract.test: PASS');
// Framework imports retain process-wide watchers; this isolated owner probe is finished.
process.exit(0);
