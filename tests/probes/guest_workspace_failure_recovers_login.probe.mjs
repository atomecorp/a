// Home starts the local guest session; first launch owns Access and retry notices.
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
const { window } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;
const { createUserHomePanelRuntime } = await import('../../eVe/intuition/tools/user_home_panel_runtime.js');
let failure, workspaces = 0, cleanups = 0;
window.addEventListener('eve:workspace-open-failed', event => { failure = event.detail; });
const create = startGuest => createUserHomePanelRuntime({
    getAdoleApi: () => ({ security: { isAnonymous: () => false, startGuest } }),
    openWorkspace: async () => { workspaces++; return { ok: true }; },
    cleanupWorkspace: async () => { cleanups++; }, anonymousWorkspaceOpenTimeoutMs: 1
});
const failed = create(async () => ({ ok: false, error: 'guest_storage_unavailable' }));
assert.deepEqual(await failed.enterAnonymousWorkspace(), { ok: false, error: 'guest_storage_unavailable' });
assert.deepEqual(failure, { source: 'anonymous', cause: 'guest_storage_unavailable' });
const stalled = create(() => new Promise(() => {}));
assert.deepEqual(await stalled.enterAnonymousWorkspace(), { ok: false, error: 'anonymous_session_start_timeout' });
assert.deepEqual(failure, { source: 'anonymous', cause: 'anonymous_session_start_timeout' });
assert.equal(workspaces, 0, 'session entry never opens the workspace before Goals');
assert.equal(cleanups, 0, 'session failure leaves the existing Access surface owned by first launch');
console.log('guest_workspace_failure_recovers_login: PASS');
process.exit(0);
