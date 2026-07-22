import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
globalThis.window = window;
globalThis.document = document;
globalThis.CustomEvent = window.CustomEvent;

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

window.__authCheckComplete = true;
window.__authCheckResult = { authenticated: true, userId: 'user_recent', anonymous: false };
window.__eveStartupView = 'dashboard';

const calls = [];
window.eveToolBase = {
    loadProjectAtomes: async (projectId) => {
        calls.push({ name: 'loadProjectAtomes', projectId });
        return [];
    }
};
window.AdoleAPI = {
    auth: {
        current: async () => ({ logged: true, user: { id: 'user_recent', user_id: 'user_recent' } })
    },
    security: { isAnonymous: () => false },
    projects: {
        loadSaved: async () => null,
        list: async () => ({ fastify: { projects: [
            {
                id: 'project_old',
                atome_id: 'project_old',
                owner_id: 'user_recent',
                updated_at: '2026-01-01T00:00:00.000Z',
                properties: { name: 'Old project' }
            },
            {
                id: 'project_recent',
                atome_id: 'project_recent',
                owner_id: 'user_recent',
                updated_at: '2026-07-01T00:00:00.000Z',
                properties: { name: 'Recent project' }
            }
        ] } }),
        setCurrent: async (id, name) => {
            calls.push({ name: 'setCurrent', id });
            window.__currentProject = { id, name };
            return true;
        }
    }
};

const { ensureProjectBootstrapReady } = await import('../../eVe/intuition/tools/project_bootstrap.js?recent-fallback');
const projectId = await ensureProjectBootstrapReady();

assert.equal(projectId, 'project_recent');
assert.deepEqual(calls.map((entry) => entry.id || entry.projectId), ['project_recent', 'project_recent']);
assert.ok(document.getElementById('project_view_project_recent'));

console.log('project_bootstrap_recent_fallback_contract: PASS');
