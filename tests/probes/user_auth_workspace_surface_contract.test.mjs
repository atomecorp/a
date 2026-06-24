import assert from 'node:assert/strict';
import { createUserAuthFlowRuntime } from '../../eVe/intuition/tools/user_auth_flow_runtime.js';

const calls = [];

globalThis.window = {
    refreshToolCatalog: async () => {
        calls.push({ name: 'refreshToolCatalog' });
        return true;
    }
};

const runtime = createUserAuthFlowRuntime({
    authDialog: { root: { style: {}, querySelector: () => null } },
    userDialog: { root: { style: {} } },
    getAdoleApi: () => ({
        auth: {
            bootstrap: async (phone, password, username, visibility) => {
                calls.push({ name: 'bootstrap', phone, password, username, visibility });
                return { fastify: { success: true } };
            }
        },
        security: {
            isAnonymous: () => false
        }
    }),
    getCompactAuthMode: () => false,
    getProfileLoaded: () => true,
    closeLoginSequence: () => calls.push({ name: 'closeLoginSequence' }),
    closeHomePanelAfterAuthSuccess: async () => calls.push({ name: 'closeHomePanelAfterAuthSuccess' }),
    isDialogRootVisible: () => false,
    isHomePanelOpen: () => false,
    setUserDialogCompactAuthMode: (value) => calls.push({ name: 'setCompactAuthMode', value }),
    syncActionVisibility: (state) => calls.push({ name: 'syncActionVisibility', workspaceLogged: state.workspaceLogged }),
    clearDeleteConfirmState: () => calls.push({ name: 'clearDeleteConfirmState' }),
    clearWorkspaceProjectView: () => calls.push({ name: 'clearWorkspaceProjectView' }),
    applyDisplayName: () => calls.push({ name: 'applyDisplayName' }),
    flushPendingProfileSave: () => calls.push({ name: 'flushPendingProfileSave' }),
    restoreUserProfile: async (force) => calls.push({ name: 'restoreUserProfile', force }),
    ensureCurrentProject: async ({ force } = {}) => {
        calls.push({ name: 'ensureCurrentProject', force });
        return 'project_auth_valid';
    },
    isProjectBootstrapManaged: () => false,
    afterWorkspaceOpen: async (payload = {}) => {
        calls.push({ name: 'afterWorkspaceOpen', ...payload });
        return { ok: true };
    },
    setUserNotice: (key, text) => calls.push({ name: 'setUserNotice', key, text }),
    clearUserNotice: () => calls.push({ name: 'clearUserNotice' })
});

const shortPasswordOk = await runtime.executeLoginFlow({
    phone: '0600000000',
    password: 'short',
    username: '0600000000'
});
assert.equal(shortPasswordOk, false, 'short password must not attempt account creation');
assert.equal(runtime.getLastLoginErrorText(), 'Mot de passe : 8 caractères minimum', 'short password must expose the account creation password constraint');
assert.equal(calls.filter((entry) => entry.name === 'bootstrap').length, 0, 'short password must be rejected before bootstrap');

const ok = await runtime.executeLoginFlow({
    phone: '0600000000',
    password: 'valid_password',
    username: '0600000000'
});

assert.equal(ok, true, 'authenticated login must succeed');
assert.deepEqual(
    calls.filter((entry) => entry.name === 'afterWorkspaceOpen'),
    [{ name: 'afterWorkspaceOpen', source: 'authenticated', projectId: 'project_auth_valid' }],
    'authenticated login must open the workspace dashboard/menu after project activation'
);
assert.ok(
    calls.findIndex((entry) => entry.name === 'ensureCurrentProject')
    < calls.findIndex((entry) => entry.name === 'afterWorkspaceOpen'),
    'dashboard/menu opening must wait for the current project'
);

console.log('user_auth_workspace_surface_contract.test: PASS');
