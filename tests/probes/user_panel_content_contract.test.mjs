import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

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
    const parent = typeof options.parent === 'string'
        ? document.querySelector(options.parent)
        : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

window.__authCheckResult = {
    complete: true,
    authenticated: false,
    anonymous: true
};

await import('../../eVe/intuition/tools/user.js');

assert.equal(typeof window.open_home_panel, 'function', 'open_home_panel must be installed');

const authOpen = await window.open_home_panel({ source: { type: 'user_panel_contract.auth' } });
assert.equal(authOpen.ok, true, 'auth panel open must succeed');
assert.equal(authOpen.panel_id, 'eve_auth_dialog', 'anonymous state must open auth dialog');

const authBody = document.getElementById('eve_auth_dialog__body');
const authFooter = document.getElementById('eve_auth_dialog__body_footer');
assert.ok(authBody?.children?.length > 0, 'auth dialog body must contain login fields');
assert.ok(authFooter?.children?.length > 0, 'auth dialog footer must contain actions');

window.__authCheckResult = {
    complete: true,
    authenticated: true,
    anonymous: false
};
window.AdoleAPI.auth.current = async () => ({ logged: true, id: 'test_user' });
window.AdoleAPI.auth.getCurrentInfo = () => ({ id: 'test_user' });
window.AdoleAPI.security.isAuthenticated = () => true;
window.AdoleAPI.security.isAnonymous = () => false;

const userOpen = await window.open_home_panel({ source: { type: 'user_panel_contract.user' } });
assert.equal(userOpen.ok, true, 'user panel open must succeed');
assert.equal(userOpen.panel_id, 'eve_user_dialog', 'authenticated state must open user dialog');

const userBody = document.getElementById('eve_user_dialog__body');
const userFooter = document.getElementById('eve_user_dialog__body_footer');
assert.ok(userBody?.children?.length > 0, 'user dialog body must contain profile fields');
assert.ok(userFooter?.children?.length > 0, 'user dialog footer must contain actions');

[
    'eve_user_dialog__name',
    'eve_user_dialog__first_name',
    'eve_user_dialog__phone',
    'eve_user_dialog__password',
    'eve_user_dialog__preferences',
    'eve_user_dialog__bio'
].forEach((id) => {
    assert.ok(document.getElementById(id), `${id} must exist`);
});

console.log('user_panel_content_contract.test: PASS');
process.exit(0);
