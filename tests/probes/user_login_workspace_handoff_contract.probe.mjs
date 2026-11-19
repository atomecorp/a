import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

// The login → workspace handoff since Authentication V1 (user_home_panel_runtime.js): a submit only authenticates
// (`executeLoginFlow`); the sign-in proof (`squirrel:phone-login-complete`) opens the workspace, once, through the
// canonical `openWorkspace` with the current project as its readiness.
const { window } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;

const { createUserHomePanelRuntime } = await import('../../eVe/intuition/tools/user_home_panel_runtime.js');
const { getSharedLoginHandlers } = await import('../../eVe/intuition/tools/user_login_shared_runtime.js');

const passwordLogins = [];
const workspaceOpens = [];
createUserHomePanelRuntime({
    getAdoleApi: () => ({
        auth: {
            startPhoneLogin: async () => ({ ok: false, error: 'not_used_by_this_probe' }),
            loginWithPassword: async (phone, password) => {
                passwordLogins.push({ phone, password });
                return { ok: true, user: { id: 'qa_user' } };
            }
        },
        security: { isAnonymous: () => false, guestAdoptionStatus: () => null }
    }),
    openWorkspace: async ({ source, ensureProjectReady }) => {
        workspaceOpens.push(source);
        return { ok: true, projectId: await ensureProjectReady() };
    },
    ensureCurrentProject: async () => 'qa_project',
    cleanupWorkspace() {}
});

const submitted = await getSharedLoginHandlers().onSubmit({ phone: '+33900000001', password: 'secret' });
assert.equal(submitted.ok, true, 'a successful password sign-in must answer ok');
assert.deepEqual(passwordLogins, [{ phone: '+33900000001', password: 'secret' }], 'the submit must sign in by password, once');
assert.deepEqual(workspaceOpens, [], 'the submit alone must not open the workspace before the sign-in proof');

window.dispatchEvent(new window.CustomEvent('squirrel:phone-login-complete', { detail: { user: { id: 'qa_user' } } }));
for (const started = Date.now(); !workspaceOpens.length && Date.now() - started < 3000;) {
    await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.deepEqual(workspaceOpens, ['authenticated'], 'the sign-in proof must open the workspace once, by the canonical route');

console.log('user_login_workspace_handoff_contract.test: PASS');
process.exit(0);
