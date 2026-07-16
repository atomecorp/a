import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

window.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;

globalThis.$ = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.id) node.id = String(options.id);
    if (options.className) node.className = String(options.className);
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.attrs && typeof options.attrs === 'object') {
        Object.entries(options.attrs).forEach(([key, value]) => {
            if (value !== undefined && value !== null) node.setAttribute(key, String(value));
        });
    }
    if (options.css && typeof options.css === 'object') {
        Object.entries(options.css).forEach(([key, value]) => {
            if (value !== undefined && value !== null) node.style[key] = String(value);
        });
    }
    Object.entries(options).forEach(([key, value]) => {
        if (!key.startsWith('on') || typeof value !== 'function') return;
        node.addEventListener(key.slice(2).toLowerCase(), value);
    });
    const parent = typeof options.parent === 'string'
        ? document.querySelector(options.parent)
        : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);
window.__authCheckComplete = false;
window.__authCheckResult = { authenticated: false, userId: null, anonymous: false };

let anonymousUser = null;
const anonymousCalls = [];
const loginSignals = [];
const authCheckSignals = [];
const createdProjects = [];
const currentProjects = [];
const loadedProjects = [];
const sceneRecordsByProject = new Map();

setMainMenuRuntime({
    showFully: () => {
        return true;
    }
}, window);
window.eveDashboardBevyUiRuntime = {
    state: { active: false, projectId: '', warmedProjectId: '' },
    warmup: async ({ projectId } = {}) => {
        window.eveDashboardBevyUiRuntime.state.warmedProjectId = projectId || '';
        return { ok: true };
    },
    open: async (payload = {}) => {
        window.eveDashboardBevyUiRuntime.state.active = true;
        window.eveDashboardBevyUiRuntime.state.projectId = payload.projectId || '';
        sceneRecordsByProject.set(payload.projectId, [
            { id: '__eve_dashboard_background', properties: { visible: true, opacity: 1 } },
            { id: '__eve_dashboard_header_news', properties: { text: 'News', visible: true, opacity: 1 } }
        ]);
        return { ok: true, active: true };
    },
    close: async () => ({ ok: true }),
    readDiagnostics: () => ({ mounted_nodes: 2 })
};

window.addEventListener('squirrel:user-logged-in', (event) => {
    loginSignals.push(event.detail || {});
});
window.addEventListener('squirrel:auth-checked', (event) => {
    authCheckSignals.push(event.detail || {});
});

window.eveToolBase = {
    loadProjectAtomes: async (projectId, options = {}) => {
        loadedProjects.push({ projectId, options });
        const view = document.getElementById(`project_view_${projectId}`);
        if (view && !document.getElementById('eve_surface_project')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'eve_surface_project';
            canvas.width = 800;
            canvas.height = 600;
            canvas.getBoundingClientRect = () => ({ x: 0, y: 0, width: 800, height: 600 });
            view.appendChild(canvas);
        }
        return { ok: true };
    },
    getProjectSceneState: (projectId) => ({
        records: sceneRecordsByProject.get(projectId) || [],
        projection: sceneRecordsByProject.has(projectId) ? { ok: true } : null
    })
};

window.AdoleAPI.auth.current = async () => anonymousUser
    ? { logged: true, user: anonymousUser, anonymous: true }
    : { logged: false, user: null, anonymous: false };
window.AdoleAPI.auth.getCurrentInfo = () => anonymousUser ? { id: anonymousUser.id } : null;
window.AdoleAPI.security.isAuthenticated = () => !!anonymousUser;
window.AdoleAPI.security.isAnonymous = () => !!anonymousUser;
window.AdoleAPI.security.getAnonymousUserId = () => anonymousUser?.id || null;
window.AdoleAPI.security.waitForAuthCheck = () => new Promise(() => {});
window.AdoleAPI.security.ensureAnonymousUser = async (options = {}) => {
    anonymousCalls.push(options);
    anonymousUser = {
        id: 'anon_user_valid',
        user_id: 'anon_user_valid',
        username: 'anonymous',
        name: 'anonymous',
        phone: 'anonymous_phone'
    };
    const authCheckDetail = { authenticated: true, userId: anonymousUser.id, anonymous: true };
    const loginDetail = {
        userId: anonymousUser.id,
        user_id: anonymousUser.id,
        userName: anonymousUser.name,
        userPhone: anonymousUser.phone,
        anonymous: true,
        timestamp: Date.now()
    };
    window.__authCheckComplete = true;
    window.__authCheckResult = authCheckDetail;
    window.dispatchEvent(new CustomEvent('squirrel:user-logged-in', { detail: loginDetail }));
    window.dispatchEvent(new CustomEvent('squirrel:auth-checked', { detail: authCheckDetail }));
    return { ok: true, user: anonymousUser };
};
window.AdoleAPI.projects = {
    loadSaved: async () => null,
    list: async () => ({ fastify: { projects: [] }, tauri: { projects: [] } }),
    create: async (name) => {
        createdProjects.push(name);
        return { fastify: { data: { atome_id: 'anon_project_valid' } }, tauri: { success: false } };
    },
    setCurrent: async (projectId, projectName, ownerId) => {
        currentProjects.push({ projectId, projectName, ownerId });
        window.__currentProject = { id: projectId, name: projectName, userId: ownerId };
        window.dispatchEvent(new CustomEvent('squirrel:project-changed', {
            detail: window.__currentProject
        }));
        return true;
    }
};

await import('../../eVe/intuition/tools/project_bootstrap.js');
await import('../../eVe/intuition/tools/user.js');
await new Promise((resolve) => setTimeout(resolve, 0));

await window.open_home_panel({ source: { type: 'anonymous_project_contract' } });
const choice = document.getElementById('eve_login_sequence__choice');
const withoutAccountChoice = document.getElementById('eve_login_sequence__choice_without_account');
assert.equal(choice?.style?.display, 'flex', 'anonymous entry must start from the pre-auth choice');

withoutAccountChoice.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
withoutAccountChoice.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
withoutAccountChoice.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 260));

assert.deepEqual(anonymousCalls, [{ force: true }], 'without-account choice must call ensureAnonymousUser once');
assert.equal(
    loginSignals.filter((entry) => entry.userId === 'anon_user_valid' && entry.anonymous === true).length,
    1,
    'without-account choice must rely on the canonical anonymous login signal only once'
);
assert.equal(
    authCheckSignals.filter((entry) => entry.authenticated === true && entry.userId === 'anon_user_valid' && entry.anonymous === true).length,
    1,
    'without-account choice must rely on the canonical auth-check signal only once'
);
assert.deepEqual(createdProjects, [], 'anonymous dashboard boot must not create a project');
assert.deepEqual(currentProjects, [], 'anonymous dashboard boot must not set a current project');
assert.deepEqual(loadedProjects, [], 'anonymous dashboard boot must not load project atomes');
assert.equal(document.getElementById('project_view_anon_project_valid'), null, 'anonymous dashboard boot must not mount a user project view');

console.log('user_login_choice_anonymous_project_contract.test: PASS');
