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

window.__authCheckComplete = true;
window.__authCheckResult = {
    complete: true,
    authenticated: false
};

const {
    getSharedLoginHandlers,
    setSharedLoginHandlers
} = await import('../../eVe/intuition/tools/user_login_shared_runtime.js');
const { createMainMenuAuthRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_auth_runtime.js');

let guestCalls = 0;
const realHandlers = {
    onSubmit: async () => ({ ok: true }),
    onWithoutAccount: async () => {
        guestCalls += 1;
        return { ok: true };
    }
};
setSharedLoginHandlers(realHandlers);

const runtime = createMainMenuAuthRuntime({
    intuitionContent: { toolbox: { children: [] } },
    translate: (_key, label) => label,
    ensureHomePanelModule: async () => {
        throw new Error('home_loader_should_not_replace_real_login_handlers');
    }
});

await runtime.openInitialLoginSequence();
assert.equal(getSharedLoginHandlers(), realHandlers, 'initial login boot must not overwrite real Home login handlers with lazy handlers');

await getSharedLoginHandlers().onWithoutAccount();
assert.equal(guestCalls, 1, 'real guest handler must remain callable after initial login boot');

console.log('user_login_shared_runtime_contract.test: PASS');
