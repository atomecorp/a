import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

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

window.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;

const mainHandle = document.createElement('button');
mainHandle.setAttribute('data-role', 'eve_intuitionx-handle');
document.body.appendChild(mainHandle);

const setViewport = (width, height) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    window.dispatchEvent(new window.Event('resize'));
};
const dispatchInput = (node) => node.dispatchEvent(new window.Event('input', { bubbles: true }));
const dispatchEnter = (node) => node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const clickButton = async (node) => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
};
const waitForCondition = async (predicate, timeoutMs = 3000, intervalMs = 20) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
};

window.AdoleAPI.auth.requestPhoneVerification = async () => ({ ok: true, code: '5273' });
window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });

const { LOGIN_GRADIENTS } = await import('../../eVe/intuition/tools/user_login_visual_contract.js');
const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');

setViewport(1200, 700);
const sequence = createUserLoginSequence({
    onSubmit: async () => ({ ok: true }),
    onWithoutAccount: async () => ({ ok: true })
});
sequence.open();

const root = document.getElementById('eve_login_sequence');
const choice = document.getElementById('eve_login_sequence__choice');
const logo = document.getElementById('eve_login_sequence__persistent_logo');

assert.equal(root?.style?.display, 'block', 'login shell must open');
assert.equal(choice?.style?.display, 'flex', 'choice surface must be visible first');
assert.match(LOGIN_GRADIENTS.shell, /radial-gradient/, 'login shell token must keep the textured background');
assert.match(logo?.style?.transform || '', /600px,350px/, 'login logo must start centered in the viewport');

setViewport(700, 1200);
assert.match(logo?.style?.transform || '', /350px,600px/, 'login logo must stay centered after resize');

await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
const phoneInput = document.getElementById('eve_login_sequence__phone_input');
phoneInput.value = '0600000000';
dispatchInput(phoneInput);
dispatchEnter(phoneInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block');

const otpInput = document.getElementById('eve_login_sequence__otp_input');
otpInput.value = '5273';
dispatchInput(otpInput);
dispatchEnter(otpInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');

const passwordInput = document.getElementById('eve_login_sequence__password_field__input');
const mirroredText = document.getElementById('eve_login_sequence__typed');
assert.equal(passwordInput?.style?.opacity, '0.01', 'native password input must stay visually hidden');
assert.equal(passwordInput?.style?.color, 'transparent', 'native password input must not render browser password dots');
assert.equal(passwordInput?.style?.caretColor, 'transparent', 'native password input must not render a second caret');
passwordInput.value = 'abc';
dispatchInput(passwordInput);
assert.equal(mirroredText?.textContent, '•••', 'password display must be owned by mirrored bullet text');

dispatchEnter(passwordInput);
await waitForCondition(() => root.style.display === 'none');
assert.notEqual(document.activeElement?.id, passwordInput.id, 'successful password submit must clear native password focus');

console.log('user_login_visual_contract.test: PASS');
