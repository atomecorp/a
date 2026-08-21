import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;

const { createUserHomePanelRuntime } = await import('../../eVe/intuition/tools/user_home_panel_runtime.js');
const { getSharedLoginHandlers } = await import('../../eVe/intuition/tools/user_login_shared_runtime.js');

let releaseWorkspace;
const workspaceReady = new Promise((resolve) => { releaseWorkspace = resolve; });
let workspaceStarted = false;
let authenticatedVisualCount = 0;

createUserHomePanelRuntime({
    getAdoleApi: () => ({
        auth: {
            bootstrap: async () => ({ ok: true, backend: 'fastify', user: { id: 'qa_user' } })
        },
        security: { isAnonymous: () => false }
    }),
    openWorkspace: async ({ ensureProjectReady }) => {
        workspaceStarted = true;
        await workspaceReady;
        return { ok: true, projectId: await ensureProjectReady() };
    },
    ensureCurrentProject: async () => 'qa_project',
    cleanupWorkspace() {}
});

const loginPromise = getSharedLoginHandlers().onSubmit({
    phone: '+33900000001',
    password: 'secret',
    onAuthenticated: () => { authenticatedVisualCount += 1; }
});

const result = await loginPromise;
assert.equal(workspaceStarted, true, 'successful authentication must immediately start canonical workspace preparation');
assert.equal(authenticatedVisualCount, 1, 'the authenticated transition callback must run exactly once');
assert.deepEqual(result, { ok: true, errorText: '' });

releaseWorkspace();
await workspaceReady;

console.log('user_login_workspace_handoff_contract.test: PASS');
