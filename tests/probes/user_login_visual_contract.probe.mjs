import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
Object.defineProperty(window.navigator, 'languages', { configurable: true, value: ['fr-FR'] });
Object.defineProperty(window.navigator, 'language', { configurable: true, value: 'fr-FR' });
globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
window.Element.prototype.animate = () => ({ cancel() {}, finished: Promise.resolve() });
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
window.AdoleAPI.auth.cancelPhoneLogin = async () => ({ ok: true });

const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');
const waitFor = async (predicate, timeout = 1500) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('condition_not_reached');
};

const sequence = createUserLoginSequence({
    onSubmit: async () => ({ ok: true }),
    onWithoutAccount: async () => ({ ok: true })
});
sequence.open();
document.getElementById('eve_login_sequence__choice_authenticate')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await waitFor(() => document.getElementById('eve_login_sequence__credentials')?.style.display === 'block');

const input = document.getElementById('eve_login_sequence__phone_input');
const instruction = document.getElementById('eve_login_sequence__instruction');
const logo = document.getElementById('eve_login_sequence__persistent_logo');
assert.ok(input, 'the phone-link screen must expose one native telephone input');
assert.equal(document.getElementById('eve_login_sequence__otp_input'), null, 'a link login must not expose a typed OTP field');
assert.equal(document.getElementById('eve_login_sequence__password_field'), null, 'a link login must not expose a password field');
assert.match(instruction.textContent, /numéro local/i, 'the prompt must explicitly accept a local number');
assert.match(instruction.textContent, /06/, 'the French prompt must show a local-format example');
assert.match(logo.getAttribute('aria-label'), /SMS/i, 'the validation control must announce that it sends an SMS');

input.value = '+33612345678';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await waitFor(() => /SMS envoyé/i.test(instruction.textContent));
assert.match(logo.getAttribute('aria-label'), /numéro/i, 'the waiting-state control must allow changing the number');

sequence.destroy();
console.log('user login visual phone-link contract: ok');
