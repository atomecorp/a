import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.CustomEvent = window.CustomEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

window.__authCheckComplete = false;
window.__authCheckResult = { authenticated: false, userId: null, anonymous: false };
window.__eveStartupView = 'dashboard';

let loggedIn = false;
const authWaiters = [];

window.eveToolBase = {
    loadProjectAtomes: async () => {
        throw new Error('dashboard_bootstrap_must_not_load_project_atomes');
    }
};

window.AdoleAPI = {
    auth: {
        current: async () => loggedIn
            ? { logged: true, user: { id: 'user_valid', user_id: 'user_valid' } }
            : { logged: false, user: null }
    },
    security: {
        isAnonymous: () => false,
        waitForAuthCheck: () => new Promise((resolve) => {
            authWaiters.push(resolve);
        })
    },
    projects: {
        list: async () => ({
            fastify: {
                projects: [{
                    id: 'project_existing',
                    atome_id: 'project_existing',
                    owner_id: 'user_valid',
                    properties: {
                        name: 'existing project',
                        owner_id: 'user_valid'
                    }
                }]
            },
            tauri: { projects: [] }
        }),
        create: async () => {
            throw new Error('dashboard_bootstrap_must_not_create_project_when_one_exists');
        }
    }
};

await import('../../eVe/intuition/tools/project_bootstrap.js');
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(authWaiters.length, 1, 'initial bootstrap must wait for auth before dashboard entry');

loggedIn = true;
window.dispatchEvent(new CustomEvent('squirrel:user-logged-in', {
    detail: {
        userId: 'user_valid',
        user_id: 'user_valid',
        anonymous: false
    }
}));
authWaiters.shift()({ authenticated: false, userId: null, anonymous: false });

await new Promise((resolve) => setTimeout(resolve, 25));

const projectView = document.createElement('div');
projectView.id = 'project_view_project_existing';
const projectCanvas = document.createElement('canvas');
projectCanvas.id = 'eve_surface_project';
projectView.appendChild(projectCanvas);
view.appendChild(projectView);

window.__eveWorkspaceMode = {
    mode: 'project',
    projectId: 'project_existing',
    transitioning: false,
    targetMode: ''
};
window.__currentProject = {
    id: 'project_existing',
    atome_id: 'project_existing',
    name: 'existing project'
};

await new Promise((resolve) => setTimeout(resolve, 180));

assert.equal(
    document.getElementById('project_view_project_existing'),
    projectView,
    'delayed dashboard bootstrap must preserve a project workspace activated after login'
);
assert.equal(
    document.getElementById('eve_surface_project'),
    projectCanvas,
    'delayed dashboard bootstrap must preserve the shared canvas'
);
assert.equal(
    projectCanvas.parentElement,
    projectView,
    'delayed dashboard bootstrap must not move the canvas back to #view'
);
assert.equal(
    window.__currentProject?.id,
    'project_existing',
    'delayed dashboard bootstrap must not clear the active current project'
);

console.log('project_bootstrap_preserves_active_project_workspace_contract.test: PASS');
