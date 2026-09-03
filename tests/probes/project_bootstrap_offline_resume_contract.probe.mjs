import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
globalThis.window = window;
globalThis.document = document;
globalThis.CustomEvent = window.CustomEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

window.__authCheckComplete = true;
window.__authCheckResult = { authenticated: true, userId: 'offline_user', anonymous: false };
window.__eveProfilePreferences = { workspace: { startup_view: 'project' } };

const loads = [];
const setCurrent = [];
window.eveToolBase = {
    loadProjectAtomes: async (projectId, options) => {
        loads.push({ projectId, options });
        return [{ id: 'offline_shape', project_id: projectId, type: 'shape' }];
    }
};
window.AdoleAPI = {
    auth: {
        current: async () => ({ logged: true, user: { id: 'offline_user', user_id: 'offline_user' } })
    },
    security: {
        isAnonymous: () => false,
        waitForAuthCheck: async () => ({ authenticated: true, userId: 'offline_user', anonymous: false })
    },
    projects: {
        loadSaved: async () => ({ id: 'saved_offline_project', name: 'Projet hors ligne' }),
        list: async () => { throw new Error('network_unavailable'); },
        setCurrent: async (...args) => { setCurrent.push(args); }
    }
};

const {
    ensureProjectBootstrapReady,
    readProjectBootstrapPresentation
} = await import('../../eVe/intuition/tools/project_bootstrap.js');

const projectId = await ensureProjectBootstrapReady();
const presentation = readProjectBootstrapPresentation();

assert.equal(projectId, 'saved_offline_project');
assert.equal(presentation.startupView, 'project');
assert.equal(presentation.restoredSavedProject, true);
assert.equal(presentation.projectId, 'saved_offline_project');
assert.equal(setCurrent.length, 1, 'offline resume keeps the canonical projects.setCurrent owner');
assert.deepEqual(loads, [{
    projectId: 'saved_offline_project',
    options: { staleFirst: true, reason: 'project_bootstrap' }
}], 'offline resume must project canonical local state before background synchronization');

console.log('project_bootstrap_offline_resume_contract.test: PASS');
