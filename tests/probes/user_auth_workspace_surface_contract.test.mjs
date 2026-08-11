import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../eVe/intuition/tools/user_home_panel_runtime.js', import.meta.url), 'utf8');
const userSource = await readFile(new URL('../../eVe/intuition/tools/user.js', import.meta.url), 'utf8');
const executeLoginFlow = source.slice(source.indexOf('const executeLoginFlow = async'), source.indexOf('setSharedLoginHandlers({'));
const authenticatedWorkspace = source.slice(source.indexOf('const openAuthenticatedWorkspace = async'), source.indexOf('const openHomePanel = async'));

const authenticatingIndex = executeLoginFlow.indexOf('onAuthenticating?.');
const bootstrapIndex = executeLoginFlow.indexOf('await api.auth.bootstrap');
const authenticatedIndex = executeLoginFlow.indexOf('onAuthenticated?.');
const workspaceIndex = executeLoginFlow.indexOf('void openAuthenticatedWorkspace()');

assert.ok(authenticatingIndex >= 0 && authenticatingIndex < bootstrapIndex,
    'the authenticating visual callback must run before bootstrap');
assert.ok(bootstrapIndex < authenticatedIndex,
    'the authenticated visual callback must run only after bootstrap success');
assert.ok(authenticatedIndex < workspaceIndex,
    'asynchronous workspace opening must follow the authenticated visual transition');
assert.doesNotMatch(executeLoginFlow, /await openWorkspace/,
    'session success must never wait on Dashboard or project readiness');
assert.match(authenticatedWorkspace, /ensureProjectReady: \(\) => ensureCurrentProject\?\.\(\{ force: false \}\)/,
    'authenticated entry must keep the canonical Dashboard-first project readiness path');
assert.match(authenticatedWorkspace, /result\?\.ok !== true[\s\S]*reportWorkspaceFailure/,
    'workspace failures must be reported separately from authentication');
assert.match(userSource, /openWorkspaceDashboardWithProjectBootstrap/,
    'the Home entrypoint must reuse the existing workspace owner');
assert.doesNotMatch(userSource, /createEveDialog|eve_user_dialog|querySelector|createElement/,
    'the Home entrypoint must not reconstruct the deleted HTML panel');

console.log('user_auth_workspace_surface_contract.test: PASS');
