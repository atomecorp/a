// Contact panel -> account creation.
//
// The Communication user list is the Contact panel: creating a user from there
// must reach the one shared account flow, not a second registration. This probe
// drives the real chain end to end — the panel intent, the module that owns the
// login sequence, and the phone step it must land on.
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

window.__authCheckComplete = true;
window.__authCheckResult = { complete: true, authenticated: true, userId: 'current_user' };
window.AdoleAPI.directory = { list: async () => ({ entries: [] }) };
window.Squirrel = {
    contacts: {
        list: () => ({ items: [] }),
        ensureReady: async () => ({ ok: true, items: [] }),
        sources: () => ({ items: [] }),
        deleteLocalContact: async () => ({ ok: true })
    }
};

// The login sequence builds its views on the app's DOM factory, which the boot
// runtime installs globally.
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

const { contactSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js');
const userModule = await import('../../eVe/intuition/tools/user.js');

assert.equal(typeof window.open_create_user_panel, 'function',
    'the module that owns the account flow registers its entry point for the panels');

const fixed = contactSurface.buildFixedContent(contactSurface.readState(), {
    emit: () => {}, bodyWidth: 388
});
const flatten = (root) => (Array.isArray(root) ? root : [root])
    .flatMap((entry) => (entry ? [entry, ...flatten(entry.children || [])] : []));
assert.ok(flatten(fixed).some((node) => node.id === 'contact_create_user'),
    'the Contact footer offers account creation');

const release = contactSurface.onOpen({ context: {}, refresh: () => {} });
await contactSurface.handleEvent({ type: 'contact.refresh' });
const result = await contactSurface.handleEvent({ type: 'contact.create_user' });
assert.equal(result?.ok, true, 'the panel hands the request over instead of failing');

const root = document.getElementById('eve_login_sequence');
assert.ok(root, 'the shared login sequence is the surface that answers');
assert.notEqual(root.style.display, 'none', 'it is visible');
assert.notEqual(root.style.visibility, 'hidden', 'and interactive');
const credentials = document.getElementById('eve_login_sequence__credentials');
assert.equal(credentials?.style?.display, 'block', 'it lands on the phone step');
const choice = document.getElementById('eve_login_sequence__choice');
assert.equal(choice?.style?.display, 'none', 'the guest/authenticate entry choice is not the landing surface');
assert.ok(document.getElementById('eve_login_sequence__phone_input'), 'the phone field is mounted');

release?.();
await contactSurface.onClose?.();
assert.equal(typeof userModule.open_create_user_panel, 'function', 'the entry point is also importable');

console.log('contact_create_user_account_flow.test: PASS');
