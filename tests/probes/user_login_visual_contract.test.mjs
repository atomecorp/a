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

const { LOGIN_CHOICE_LIGHT, LOGIN_GRADIENTS } = await import('../../eVe/intuition/tools/user_login_visual_contract.js');
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
const divider = document.getElementById('eve_login_sequence__choice_divider');
const dividerSweep = document.getElementById('eve_login_sequence__choice_divider_sweep');
const logoGlowReveal = document.getElementById('eve_login_sequence__persistent_logo_glow_reveal');
const logoGlowSource = document.getElementById('eve_login_sequence__persistent_logo_glow_source');
const logoImg = logo?.querySelector('img');

assert.equal(root?.style?.display, 'block', 'login shell must open');
assert.equal(choice?.style?.display, 'flex', 'choice surface must be visible first');
assert.match(LOGIN_GRADIENTS.shell, /radial-gradient/, 'login shell token must keep the textured background');
assert.match(LOGIN_GRADIENTS.guest, /radial-gradient/, 'guest choice must use a layered violet background');
assert.match(LOGIN_GRADIENTS.auth, /radial-gradient/, 'account choice must use a separate layered violet background');
assert.equal(document.getElementById('eve_login_sequence__choice_without_account')?.textContent, 'Essayer');
assert.equal(document.getElementById('eve_login_sequence__choice_authenticate')?.textContent, 'Connexion / inscription');
assert.ok(divider, 'choice screen must keep the separator light behind the logo');
assert.equal(divider?.style?.top, '50%', 'choice separator must sit on the two-zone junction');
assert.match(dividerSweep?.style?.background || '', /radial-gradient/, 'choice separator must use the shared glow sweep token');
assert.ok(LOGIN_CHOICE_LIGHT.glowHeightPx <= 6, 'choice separator glow must stay very low');
assert.ok(LOGIN_CHOICE_LIGHT.sweepWidthPx >= 180, 'choice separator sweep must stay wide');
assert.match(dividerSweep?.style?.filter || '', /brightness/, 'choice separator sweep must keep a bright controlled pulse');
assert.ok(logoGlowReveal, 'persistent logo must expose one horizontal glow reveal layer');
assert.ok(logoGlowSource, 'persistent logo must expose one silhouette glow source');
assert.match(logoGlowReveal?.style?.webkitMaskImage || logoGlowReveal?.style?.maskImage || '', /linear-gradient/, 'logo glow reveal must use a soft horizontal mask');
assert.match(logoGlowSource?.style?.webkitMaskImage || logoGlowSource?.style?.maskImage || '', /atome/i, 'logo glow source must follow the logo silhouette');
assert.equal(logoGlowSource?.style?.width, logoImg?.style?.width, 'logo glow source must match the real logo width');
assert.equal(logoGlowSource?.style?.height, logoImg?.style?.height, 'logo glow source must match the real logo height');
assert.ok(Number(logoGlowReveal?.style?.zIndex) < Number(logoImg?.style?.zIndex), 'logo glow must stay behind the fixed white logo image');
assert.equal(document.getElementById('eve_login_sequence__persistent_logo_highlight'), null, 'legacy masked logo highlight must not remain');
assert.equal(logoImg?.style?.opacity, '1', 'base logo must stay white at full opacity');
assert.match(logoImg?.style?.filter || '', /brightness\(0\) invert\(1\)/, 'base logo must keep a fixed white filter');
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
