import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../eVe/intuition/tools/user_home_panel_runtime.js', import.meta.url), 'utf8');
const userSource = await readFile(new URL('../../eVe/intuition/tools/user.js', import.meta.url), 'utf8');

const authenticatingIndex = source.indexOf('onAuthenticating?.');
const bootstrapIndex = source.indexOf('await api.auth.bootstrap');
const authenticatedIndex = source.indexOf('onAuthenticated?.');
const workspaceIndex = source.indexOf("await openWorkspace({ source: 'authenticated'");

assert.ok(authenticatingIndex >= 0 && authenticatingIndex < bootstrapIndex,
    'the authenticating visual callback must run before bootstrap');
assert.ok(bootstrapIndex < authenticatedIndex,
    'the authenticated visual callback must run only after bootstrap success');
assert.ok(authenticatedIndex < workspaceIndex,
    'workspace opening must follow the authenticated visual transition');
assert.match(source, /ensureProjectReady: \(\) => ensureCurrentProject\?\.\(\{ force: false \}\)/,
    'authenticated entry must keep the canonical Dashboard-first project readiness path');
assert.match(userSource, /openWorkspaceDashboardWithProjectBootstrap/,
    'the Home entrypoint must reuse the existing workspace owner');
assert.doesNotMatch(userSource, /createEveDialog|eve_user_dialog|querySelector|createElement/,
    'the Home entrypoint must not reconstruct the deleted HTML panel');

console.log('user_auth_workspace_surface_contract.test: PASS');
