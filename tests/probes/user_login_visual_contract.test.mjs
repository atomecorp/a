import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

const capturedAnimations = [];
window.Element.prototype.animate = function animate(frames, options) {
    const entry = { element: this, frames, options };
    capturedAnimations.push(entry);
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

const {
    LOGIN_CHOICE_FEEDBACK,
    LOGIN_CHOICE_LIGHT,
    LOGIN_GRADIENT_MOTION,
    LOGIN_GRADIENTS,
    LOGIN_TEXT_STYLE,
    createLoginGradientMotionFrames
} = await import('../../eVe/intuition/tools/user_login_visual_contract.js');
const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');

const gradientMotionFrames = createLoginGradientMotionFrames();
assert.equal(LOGIN_GRADIENT_MOTION.choiceDurationMs, 22000, 'choice gradient motion must expose a slow adjustable duration');
assert.equal(LOGIN_GRADIENT_MOTION.bandDurationMs, 26000, 'band gradient motion must expose a slow adjustable duration');
assert.equal(LOGIN_GRADIENT_MOTION.staggerMs, 2200, 'gradient motion must expose a reusable stagger');
assert.equal(LOGIN_GRADIENT_MOTION.brightnessDelta, 0.032, 'gradient motion must expose a low intensity delta');
assert.equal(LOGIN_GRADIENT_MOTION.easing, 'ease-in-out', 'gradient motion must keep a soft easing');
assert.equal(LOGIN_TEXT_STYLE.fontFamily, 'system-ui', 'login typography must use a modern system font');
assert.equal(LOGIN_TEXT_STYLE.opacity, '0.9', 'login typography must expose a shared reduced text opacity');
assert.equal(LOGIN_TEXT_STYLE.choiceFontSize, 'clamp(22px, 6.8vw, 58px)', 'choice labels must expose a reduced type scale');
assert.equal(LOGIN_TEXT_STYLE.choiceFontWeight, '220', 'choice labels must expose a thin weight');
assert.equal(LOGIN_TEXT_STYLE.instructionFontSize, 'clamp(15px, 3.6vw, 22px)', 'instructions must expose a reduced type scale');
assert.equal(LOGIN_TEXT_STYLE.typedFontSize, 'clamp(25px, 8.2vw, 52px)', 'typed mirror text must expose a reduced type scale');
assert.equal(LOGIN_CHOICE_FEEDBACK.hoverDimOpacity, '0.6', 'choice feedback must dim the non-hovered label to 0.6');
assert.equal(LOGIN_CHOICE_FEEDBACK.entryFadeMs, 640, 'choice screen must expose a slow body-to-login fade duration');
assert.equal(LOGIN_CHOICE_FEEDBACK.clickMs, 320, 'choice click acknowledgement must expose a bounded brightening duration');
assert.match(LOGIN_CHOICE_FEEDBACK.clickFilter, /30px/, 'choice click glow must expand around the chosen text by about 30px');
assert.deepEqual(gradientMotionFrames, [
    { filter: 'brightness(1)', backgroundPosition: '0% 50%' },
    { filter: 'brightness(1.032)', backgroundPosition: '100% 50%' },
    { filter: 'brightness(1)', backgroundPosition: '0% 50%' }
], 'gradient motion must only breathe through brightness and background position');
assert.ok(gradientMotionFrames.every((frame) => !Object.hasOwn(frame, 'background')), 'gradient motion must not rewrite gradient backgrounds');

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
const withoutAccountButton = document.getElementById('eve_login_sequence__choice_without_account');
const authenticateButton = document.getElementById('eve_login_sequence__choice_authenticate');
const withoutAccountMotion = capturedAnimations.find((entry) => entry.element === withoutAccountButton?.loginBackground);
const authenticateMotion = capturedAnimations.find((entry) => entry.element === authenticateButton?.loginBackground);
const topBandMotion = capturedAnimations.find((entry) => entry.element?.id === 'eve_login_sequence__top_band');

assert.equal(root?.style?.display, 'block', 'login shell must open');
assert.equal(choice?.style?.display, 'flex', 'choice surface must be visible first');
assert.match(LOGIN_GRADIENTS.shell, /radial-gradient/, 'login shell token must keep the textured background');
assert.match(LOGIN_GRADIENTS.guest, /radial-gradient/, 'guest choice must use a layered violet background');
assert.match(LOGIN_GRADIENTS.auth, /radial-gradient/, 'account choice must use a separate layered violet background');
assert.equal(withoutAccountButton?.textContent, 'Essayer');
assert.equal(authenticateButton?.textContent, 'Connexion / inscription');
assert.equal(withoutAccountButton?.loginLabel?.style?.fontFamily, LOGIN_TEXT_STYLE.fontFamily, 'guest label must use the shared login typography');
assert.equal(withoutAccountButton?.loginLabel?.style?.fontSize, LOGIN_TEXT_STYLE.choiceFontSize, 'guest label must use the reduced type scale');
assert.equal(withoutAccountButton?.loginLabel?.style?.fontWeight, LOGIN_TEXT_STYLE.choiceFontWeight, 'guest label must use the thin weight');
assert.equal(withoutAccountButton?.loginLabel?.style?.opacity, LOGIN_TEXT_STYLE.opacity, 'guest label must use the reduced text opacity');
assert.equal(authenticateButton?.loginLabel?.style?.fontFamily, LOGIN_TEXT_STYLE.fontFamily, 'auth label must use the shared login typography');
assert.equal(authenticateButton?.loginLabel?.style?.fontSize, LOGIN_TEXT_STYLE.choiceFontSize, 'auth label must use the reduced type scale');
assert.equal(authenticateButton?.loginLabel?.style?.fontWeight, LOGIN_TEXT_STYLE.choiceFontWeight, 'auth label must use the thin weight');
assert.equal(authenticateButton?.loginLabel?.style?.opacity, LOGIN_TEXT_STYLE.opacity, 'auth label must use the reduced text opacity');
assert.equal(withoutAccountMotion?.options?.duration, LOGIN_GRADIENT_MOTION.choiceDurationMs, 'guest background must use the shared slow motion duration');
assert.equal(authenticateMotion?.options?.duration, LOGIN_GRADIENT_MOTION.choiceDurationMs + LOGIN_GRADIENT_MOTION.staggerMs, 'auth background must use the shared slow motion stagger');
assert.deepEqual(withoutAccountMotion?.frames, gradientMotionFrames, 'guest background must use the shared gradient motion frames');
assert.deepEqual(authenticateMotion?.frames, gradientMotionFrames, 'auth background must use the shared gradient motion frames');
assert.equal(topBandMotion?.options?.duration, LOGIN_GRADIENT_MOTION.bandDurationMs, 'credential band gradient must use the shared band motion duration');
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

withoutAccountButton.dispatchEvent(new window.MouseEvent('pointerenter', { bubbles: true }));
assert.equal(withoutAccountButton.loginLabel.style.filter, LOGIN_CHOICE_FEEDBACK.hoverFilter, 'hovered choice label must receive the luminous text halo');
assert.equal(authenticateButton.loginLabel.style.opacity, LOGIN_CHOICE_FEEDBACK.hoverDimOpacity, 'non-hovered choice label must dim on hover');
withoutAccountButton.dispatchEvent(new window.MouseEvent('pointerleave', { bubbles: true }));
assert.equal(authenticateButton.loginLabel.style.opacity, LOGIN_TEXT_STYLE.opacity, 'non-hovered label must restore opacity after hover leaves');

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
const instruction = document.getElementById('eve_login_sequence__instruction');
assert.equal(instruction?.style?.fontFamily, LOGIN_TEXT_STYLE.fontFamily, 'credential instruction must use the shared login typography');
assert.equal(instruction?.style?.fontSize, LOGIN_TEXT_STYLE.instructionFontSize, 'credential instruction must use the reduced type scale');
assert.equal(instruction?.style?.fontWeight, LOGIN_TEXT_STYLE.instructionFontWeight, 'credential instruction must use the thin weight');
assert.equal(instruction?.style?.opacity, LOGIN_TEXT_STYLE.opacity, 'credential instruction must use the reduced text opacity');
assert.equal(mirroredText?.style?.fontFamily, LOGIN_TEXT_STYLE.fontFamily, 'mirrored input text must use the shared login typography');
assert.equal(mirroredText?.style?.fontSize, LOGIN_TEXT_STYLE.typedFontSize, 'mirrored input text must use the reduced type scale');
assert.equal(mirroredText?.style?.fontWeight, LOGIN_TEXT_STYLE.typedFontWeight, 'mirrored input text must use the thin weight');
assert.equal(mirroredText?.style?.opacity, LOGIN_TEXT_STYLE.opacity, 'mirrored input text must use the reduced text opacity');
assert.equal(passwordInput?.style?.opacity, '0.01', 'native password input must stay visually hidden');
assert.equal(passwordInput?.style?.color, 'transparent', 'native password input must not render browser password dots');
assert.equal(passwordInput?.style?.caretColor, 'transparent', 'native password input must not render a second caret');
passwordInput.value = 'abc';
dispatchInput(passwordInput);
assert.equal(mirroredText?.textContent, '•••', 'password display must be owned by mirrored bullet text');

dispatchEnter(passwordInput);
await waitForCondition(() => root.style.display === 'none' && document.activeElement?.id !== passwordInput.id);
assert.notEqual(document.activeElement?.id, passwordInput.id, 'successful password submit must clear native password focus');

console.log('user_login_visual_contract.test: PASS');
