import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

window.Element.prototype.animate = function animate() {
    return {
        cancel() {},
        finished: Promise.resolve()
    };
};

globalThis.$ = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.id) node.id = String(options.id);
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.attrs) Object.entries(options.attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (options.css) Object.assign(node.style, options.css);
    Object.entries(options).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    });
    const parent = typeof options.parent === 'string' ? document.querySelector(options.parent) : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

const mainHandle = document.createElement('button');
mainHandle.setAttribute('data-role', 'eve_intuitionx-handle');
document.body.appendChild(mainHandle);

let homeModuleLoadCount = 0;
const menuUpdates = [];
let menuHiddenCount = 0;
let loginVisibleEventCount = 0;
window.new_menu_v2 = {
    updateContent: (content) => {
        menuUpdates.push(content);
    },
    hideCompletely: () => {
        menuHiddenCount += 1;
    }
};
window.addEventListener('eve:login-choice-visible', () => {
    loginVisibleEventCount += 1;
});
window.__authCheckComplete = true;
window.__authCheckResult = {
    complete: true,
    authenticated: false,
    anonymous: false
};

const { createMainMenuAuthRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_auth_runtime.js');

const runtime = createMainMenuAuthRuntime({
    intuitionContent: {
        toolbox: { children: ['home', 'find'] }
    },
    translate: (_key, label) => label,
    ensureHomePanelModule: async () => {
        homeModuleLoadCount += 1;
        return {};
    }
});

runtime.syncMainMenuAuthContent({ force: true });
const openResult = await runtime.openInitialLoginSequence();

assert.equal(openResult?.ok, true, 'initial unauthenticated boot must open the login sequence');
assert.equal(homeModuleLoadCount, 0, 'initial login choice must not wait for the Home panel module');
assert.equal(document.getElementById('eve_login_sequence')?.style?.display, 'block', 'login shell must be present immediately');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'flex', 'login choice must be the first visible auth surface');
assert.equal(loginVisibleEventCount, 1, 'login choice must publish a readiness event for deferred warmups');
assert.deepEqual(menuUpdates.at(-1)?.toolbox?.children, [], 'disconnected boot must keep toolbox content empty before workspace');
assert.equal(menuHiddenCount, 1, 'disconnected boot must hide the main menu before the user enters a workspace');

console.log('user_login_boot_order_contract.test: PASS');
