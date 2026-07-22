import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

window.__authCheckComplete = true;
window.__authCheckResult = { authenticated: true, userId: 'user_new', anonymous: false };
window.__eveStartupView = 'dashboard';

const calls = [];
window.eveToolBase = {
    loadProjectAtomes: async (projectId, options) => {
        calls.push({ name: 'loadProjectAtomes', projectId, options });
        return [];
    }
};
window.AdoleAPI = {
    auth: {
        current: async () => ({ logged: true, user: { id: 'user_new', user_id: 'user_new' } })
    },
    security: { isAnonymous: () => false },
    projects: {
        loadSaved: async () => null,
        list: async () => ({ fastify: { projects: [] } }),
        create: async (name) => {
            calls.push({ name: 'create', projectName: name });
            return { id: 'project_new' };
        },
        setCurrent: async (id, name) => {
            calls.push({ name: 'setCurrent', id });
            window.__currentProject = { id, name };
            return true;
        }
    }
};

const { ensureProjectBootstrapReady } = await import('../../eVe/intuition/tools/project_bootstrap.js');
const projectId = await ensureProjectBootstrapReady();

assert.equal(projectId, 'project_new');
assert.equal(window.__currentProject?.id, 'project_new');
assert.ok(document.getElementById('project_view_project_new'), 'new project host must be ready behind the Dashboard');
assert.deepEqual(calls.map((entry) => entry.name), ['create', 'setCurrent', 'loadProjectAtomes']);
assert.equal(calls[0].projectName, 'untitled');

console.log('project_bootstrap_first_project_ready_contract: PASS');
