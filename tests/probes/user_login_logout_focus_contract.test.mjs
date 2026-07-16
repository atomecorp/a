import assert from 'node:assert/strict';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

const view = Object.assign(document.createElement('div'), { id: 'view' });
document.body.appendChild(view);

window.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.ResizeObserver = window.ResizeObserver;

window.Squirrel = {
    ...(window.Squirrel || {}),
    voice: { speak: async () => ({ ok: true }) }
};
setMainMenuRuntime({
    reveal: () => true,
    setToolLatchedState: () => true
}, window);

const sceneRecordsByProject = new Map();
window.eveDashboardBevyUiRuntime = {
    open: async ({ projectId } = {}) => {
        sceneRecordsByProject.set(projectId, [{ id: '__eve_dashboard_background', properties: {} }]);
        return { ok: true, active: true };
    }
};
window.eveToolBase = {
    loadProjectAtomes: async (projectId) => {
        const projectView = document.getElementById(`project_view_${projectId}`)
            || Object.assign(document.createElement('div'), { id: `project_view_${projectId}` });
        if (!projectView.parentElement) view.appendChild(projectView);
        const canvas = document.getElementById('eve_surface_project') || document.createElement('canvas');
        canvas.id = 'eve_surface_project';
        Object.assign(canvas, { width: 800, height: 600 });
        if (canvas.parentElement !== projectView) projectView.appendChild(canvas);
        return { ok: true };
    },
    getProjectSceneState: (projectId) => ({
        records: sceneRecordsByProject.get(projectId) || []
    })
};

const capturedAnimations = [];
window.Element.prototype.animate = function animate(frames, options = {}) {
    const entry = { element: this, frames, options, canceled: false };
    capturedAnimations.push(entry);
    return {
        cancel() { entry.canceled = true; },
        finished: Promise.resolve()
    };
};

globalThis.$ = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.id) node.id = String(options.id);
    if (options.className) node.className = String(options.className);
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.html !== undefined) node.innerHTML = String(options.html);
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
    const parent = typeof options.parent === 'string' ? document.querySelector(options.parent) : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

const activateButton = async (node) => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
};
const waitForCondition = async (predicate, timeoutMs = 4000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
};
const dispatchInput = (node) => node.dispatchEvent(new window.Event('input', { bubbles: true }));

let currentUser = { id: 'focus_user', user_id: 'focus_user', username: 'focus' };
window.__authCheckResult = {
    complete: true,
    authenticated: true,
    anonymous: false
};
window.AdoleAPI.auth.current = async () => currentUser
    ? { logged: true, user: currentUser }
    : { logged: false, user: null };
window.AdoleAPI.auth.getCurrentInfo = () => currentUser ? { id: currentUser.id } : null;
window.AdoleAPI.auth.logout = async () => {
    currentUser = null;
    window.__authCheckResult = {
        complete: true,
        authenticated: false,
        anonymous: false
    };
    return { ok: true };
};
window.AdoleAPI.auth.lookupPhone = async () => ({ ok: false, success: false, error: 'User not found' });
window.AdoleAPI.auth.requestPhoneVerification = async () => ({ ok: true, code: '5273' });
window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });
window.AdoleAPI.security.isAuthenticated = () => !!currentUser;
window.AdoleAPI.security.isAnonymous = () => false;

await import('../../eVe/intuition/tools/user.js');

const openResult = await window.open_home_panel({ source: { type: 'logout_focus_contract.open_user' } });
assert.equal(openResult.panel_id, 'eve_user_dialog', 'authenticated open must show the user panel');
assert.equal(document.getElementById('eve_user_dialog')?.style?.display, 'flex', 'user panel must be visible before logout');

await activateButton(document.getElementById('eve_user_dialog__actions__logout'));
assert.equal(document.getElementById('eve_login_sequence')?.style?.display, 'block', 'logout must show the login sequence');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'flex', 'logout must return to the login choice');

await activateButton(document.getElementById('eve_login_sequence__choice_authenticate'));
await waitForCondition(() => document.getElementById('eve_login_sequence__phone_input')?.style?.display === 'block');

const phoneInput = document.getElementById('eve_login_sequence__phone_input');
const caret = document.getElementById('eve_login_sequence__typed_caret');
const typedValue = document.getElementById('eve_login_sequence__typed_value');
assert.equal(phoneInput?.style?.display, 'block', 'phone input must be visible after logout authentication reopen');
assert.equal(phoneInput?.disabled, false, 'phone input must be enabled after logout authentication reopen');
assert.equal(document.activeElement?.id, phoneInput?.id, 'phone input must own focus after logout authentication reopen');
assert.equal(caret?.style?.opacity, '1', 'mirrored caret must be visible on the phone step after logout');

phoneInput.value = '0612345678';
dispatchInput(phoneInput);
assert.equal(typedValue?.textContent, '0612345678', 'phone typing must update the mirrored value after logout');
