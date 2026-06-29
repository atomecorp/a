import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

window.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.ResizeObserver = window.ResizeObserver;
window.Squirrel = {
    ...(window.Squirrel || {}),
    voice: { speak: async () => ({ ok: true }) }
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

window.Element.prototype.animate = function animate() {
    return { cancel() {}, finished: Promise.resolve() };
};

const handle = document.createElement('button');
handle.setAttribute('data-role', 'eve_intuitionx-handle');
document.body.appendChild(handle);

const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');

const waitForCondition = async (predicate, timeoutMs = 2000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
};
const clickChoice = async () => {
    document.getElementById('eve_login_sequence__choice_authenticate')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await waitForCondition(() => document.getElementById('eve_login_sequence__phone_input')?.style?.display === 'block');
};
const submitPhone = (phone) => {
    const input = document.getElementById('eve_login_sequence__phone_input');
    input.value = phone;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};
const runPhoneStep = async ({ lookupResult, lookupError = null } = {}) => {
    let otpRequests = 0;
    const lookups = [];
    window.AdoleAPI.auth.lookupPhone = async (phone) => {
        lookups.push(phone);
        if (lookupError) throw lookupError;
        return lookupResult;
    };
    window.AdoleAPI.auth.requestPhoneVerification = async () => {
        otpRequests += 1;
        return { ok: true, code: '5273' };
    };
    window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });
    const sequence = createUserLoginSequence({
        onSubmit: async () => ({ ok: true }),
        onWithoutAccount: async () => ({ ok: true }),
        documentRef: document
    });
    sequence.open();
    await clickChoice();
    submitPhone('0612345678');
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { sequence, lookups, otpRequests };
};

let result = await runPhoneStep({ lookupResult: { ok: true, user: { id: 'known_user', phone: '0612345678' } } });
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
assert.deepEqual(result.lookups, ['0612345678'], 'phone entry must lookup the active account first');
assert.equal(result.otpRequests, 0, 'existing local account must skip OTP');
assert.equal(document.getElementById('eve_login_sequence__otp_input')?.style?.display, 'none', 'existing local account must not show OTP');
assert.equal(document.getElementById('eve_login_sequence__instruction')?.textContent, 'Saisissez votre mot de passe', 'existing local account must go directly to password');
result.sequence.destroy();

result = await runPhoneStep({ lookupResult: { ok: false, success: false, error: 'User not found' } });
await waitForCondition(() => document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block');
assert.equal(result.otpRequests, 1, 'new local account must request OTP');
assert.equal(document.getElementById('eve_login_sequence__instruction')?.textContent, 'O.T.P: 5273', 'new local account must show the OTP step');
result.sequence.destroy();

result = await runPhoneStep({ lookupResult: { ok: false, success: false, error: 'backend_unavailable' } });
await waitForCondition(() => document.getElementById('eve_login_sequence__instruction')?.textContent === 'Vérification du numéro impossible');
assert.equal(result.otpRequests, 0, 'hard lookup failure must not request OTP');
assert.equal(document.getElementById('eve_login_sequence__phone_input')?.style?.display, 'block', 'hard lookup failure must stay on phone');
assert.equal(document.getElementById('eve_login_sequence__otp_input')?.style?.display, 'none', 'hard lookup failure must not show OTP');
result.sequence.destroy();
