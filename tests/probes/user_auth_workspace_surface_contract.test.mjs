import assert from 'node:assert/strict';
import { createUserAuthFlowRuntime } from '../../eVe/intuition/tools/user_auth_flow_runtime.js';

const calls = [];
let workspaceResult = null;

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
        return 'project_one';
    },
    isProjectBootstrapManaged: () => false,
    openWorkspaceWithProjectBootstrap: async (payload = {}) => {
        calls.push({ name: 'openWorkspaceWithProjectBootstrap', source: payload.source });
        if (workspaceResult) return workspaceResult;
        const projectId = await payload.ensureProjectReady();
        return { ok: true, projectId };
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

let resolveAuthenticatedVisual = null;
const authenticatedVisualFinished = new Promise((resolve) => { resolveAuthenticatedVisual = resolve; });
const ok = await runtime.executeLoginFlow({
    phone: '0600000000',
    password: 'valid_password',
    username: '0600000000',
    onAuthenticating: (payload = {}) => {
        calls.push({ name: 'onAuthenticating', ...payload });
    },
    onAuthenticated: async (payload = {}) => {
        calls.push({ name: 'onAuthenticated', ...payload });
        await authenticatedVisualFinished;
        calls.push({ name: 'onAuthenticatedFinished' });
    }
});
resolveAuthenticatedVisual();
await authenticatedVisualFinished;

assert.equal(ok, true, 'authenticated login must succeed');
assert.deepEqual(
    calls.filter((entry) => entry.name === 'openWorkspaceWithProjectBootstrap'),
    [{ name: 'openWorkspaceWithProjectBootstrap', source: 'authenticated' }],
    'authenticated login must delegate Dashboard-first project preparation to the canonical workspace flow'
);
assert.equal(
    calls.some((entry) => entry.name === 'ensureCurrentProject'),
    true,
    'authenticated dashboard boot must await the canonical project readiness'
);
assert.ok(
    calls.findIndex((entry) => entry.name === 'onAuthenticating')
    < calls.findIndex((entry) => entry.name === 'bootstrap'),
    'immediate visual callback must run before bootstrap starts'
);
assert.ok(
    calls.findIndex((entry) => entry.name === 'bootstrap')
    < calls.findIndex((entry) => entry.name === 'onAuthenticated'),
    'authenticated visual callback must wait for successful bootstrap'
);
assert.ok(
    calls.findIndex((entry) => entry.name === 'onAuthenticated')
    < calls.findIndex((entry) => entry.name === 'restoreUserProfile'),
    'authenticated visual callback must run before profile/project/workspace work'
);
assert.ok(
    calls.findIndex((entry) => entry.name === 'openWorkspaceWithProjectBootstrap')
    < calls.findIndex((entry) => entry.name === 'onAuthenticatedFinished'),
    'workspace opening must not wait for the authenticated visual animation to finish'
);
assert.deepEqual(
    calls.filter((entry) => entry.name === 'onAuthenticating'),
    [{ name: 'onAuthenticating', phone: '0600000000', username: '0600000000' }],
    'immediate visual callback must receive the normalized login identity'
);
assert.deepEqual(
    calls.filter((entry) => entry.name === 'onAuthenticated'),
    [{ name: 'onAuthenticated', phone: '0600000000', username: '0600000000' }],
    'authenticated visual callback must receive the normalized login identity'
);

workspaceResult = { ok: false, phase: 'project_bootstrap', error: 'projects_create_failed' };
const projectBootstrapOk = await runtime.executeLoginFlow({
    phone: '0600000000',
    password: 'valid_password',
    username: '0600000000'
});
assert.equal(projectBootstrapOk, false, 'project bootstrap failure must stop only workspace readiness');
assert.equal(
    runtime.getLastLoginErrorText(),
    'Espace de travail indisponible : le projet ne peut pas être préparé',
    'workspace failure must not be reported as invalid credentials'
);

console.log('user_auth_workspace_surface_contract.test: PASS');
