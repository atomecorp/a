import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

window.__authCheckComplete = true;
window.__authCheckResult = { authenticated: true, userId: 'user_ready', anonymous: false };
window.__eveStartupView = 'dashboard';

const calls = [];
window.eveToolBase = {
    loadProjectAtomes: async (projectId, options) => {
        calls.push({ name: 'loadProjectAtomes', projectId, options });
        return [{ id: 'project_record' }];
    }
};
window.AdoleAPI = {
    auth: {
        current: async () => ({ logged: true, user: { id: 'user_ready', user_id: 'user_ready' } })
    },
    security: { isAnonymous: () => false },
    projects: {
        loadSaved: async () => ({ id: 'project_last', name: 'Last project' }),
        list: async () => ({ fastify: { projects: [
            { id: 'project_first', atome_id: 'project_first', owner_id: 'user_ready', properties: { name: 'First project' } },
            { id: 'project_last', atome_id: 'project_last', owner_id: 'user_ready', properties: { name: 'Last project' } }
        ] } }),
        setCurrent: async (id, name) => {
            calls.push({ name: 'setCurrent', id });
            window.__currentProject = { id, name };
            return true;
        },
        create: async () => {
            throw new Error('saved_project_must_not_create');
        }
    }
};

const { ensureProjectBootstrapReady } = await import('../../eVe/intuition/tools/project_bootstrap.js');
const projectId = await ensureProjectBootstrapReady();

assert.equal(projectId, 'project_last');
assert.equal(window.__currentProject?.id, 'project_last');
assert.ok(document.getElementById('project_view_project_last'), 'prepared project host must remain resident behind the Dashboard');
assert.deepEqual(calls.map((entry) => entry.name), ['setCurrent', 'loadProjectAtomes']);
assert.deepEqual(calls.at(-1), {
    name: 'loadProjectAtomes',
    projectId: 'project_last',
    options: { staleFirst: true }
});

console.log('project_bootstrap_dashboard_ready_contract: PASS');
