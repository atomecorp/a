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

let loggedIn = false;
const authWaiters = [];
const loadedProjects = [];
const currentProjects = [];

window.eveToolBase = {
    loadProjectAtomes: async (projectId, options = {}) => {
        loadedProjects.push({ projectId, options });
        return { ok: true };
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
        loadSaved: async () => null,
        list: async () => ({
            fastify: {
                projects: [{
                    id: 'project_valid',
                    atome_id: 'project_valid',
                    owner_id: 'user_valid',
                    properties: {
                        name: 'valid project',
                        owner_id: 'user_valid'
                    }
                }]
            },
            tauri: { projects: [] }
        }),
        setCurrent: async (projectId, projectName, ownerId) => {
            currentProjects.push({ projectId, projectName, ownerId });
            window.__currentProject = { id: projectId, name: projectName, userId: ownerId };
            window.dispatchEvent(new CustomEvent('squirrel:project-changed', {
                detail: window.__currentProject
            }));
            return true;
        },
        create: async () => {
            throw new Error('project_create_must_not_be_needed');
        }
    }
};

await import('../../eVe/intuition/tools/project_bootstrap.js');
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(authWaiters.length, 1, 'initial bootstrap must be waiting on auth');

const waitForCondition = async (predicate, timeoutMs = 1200, intervalMs = 25) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
};

loggedIn = true;
window.dispatchEvent(new CustomEvent('squirrel:user-logged-in', {
    detail: {
        userId: 'user_valid',
        user_id: 'user_valid',
        anonymous: false
    }
}));

authWaiters.shift()({ authenticated: false, userId: null, anonymous: false });
await waitForCondition(() => currentProjects.length === 1 && loadedProjects.length === 1);

assert.deepEqual(
    currentProjects.map((entry) => entry.projectId),
    ['project_valid'],
    'login received during an in-flight bootstrap must re-bootstrap the authenticated project'
);
assert.deepEqual(
    loadedProjects.map((entry) => entry.projectId),
    ['project_valid'],
    'authenticated project atomes must load without requiring a browser refresh'
);
assert.equal(window.__currentProject?.id, 'project_valid', 'authenticated project must become current');

const projectView = document.createElement('div');
projectView.id = 'project_view_project_valid';
const projectCanvas = document.createElement('canvas');
projectCanvas.id = 'eve_surface_project';
projectView.appendChild(projectCanvas);
view.appendChild(projectView);

loggedIn = false;
window.dispatchEvent(new CustomEvent('squirrel:user-logged-out'));
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(document.getElementById('project_view_project_valid'), null, 'logout must remove project-specific containers');
assert.equal(document.getElementById('eve_surface_project'), projectCanvas, 'logout must preserve the shared Bevy canvas');
assert.equal(projectCanvas.parentElement, view, 'logout must move the shared canvas back to the neutral view root');
assert.equal(projectCanvas.style.visibility, 'hidden', 'logout must hide the shared canvas until the next successful render');
