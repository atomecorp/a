import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

const capturedAnimations = [];
const spokenLoginTexts = [];
window.Element.prototype.animate = function animate(frames, options) {
    const entry = { element: this, frames, options };
    capturedAnimations.push(entry);
    return {
        cancel() {},
        finished: Promise.resolve()
    };
};

window.Squirrel = {
    ...(window.Squirrel || {}),
    voice: {
        speak: async (text, options = {}) => {
            spokenLoginTexts.push({ text, options });
            return { ok: true };
        }
    }
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
    LOGIN_LOGO_INTRO,
    LOGIN_TEXT_STYLE,
    createLoginGradientMotionFrames
} = await import('../../eVe/intuition/tools/user_login_visual_contract.js');
const { ANIMATION_MS } = await import('../../eVe/intuition/tools/user_login_choreography.js');
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
assert.equal(LOGIN_CHOICE_FEEDBACK.entryFadeMs, 4000, 'choice screen must expose a very slow body-to-login fade duration');
assert.equal(LOGIN_CHOICE_FEEDBACK.entryEasing, 'ease-in-out', 'choice entry fade must use a slow balanced easing');
assert.equal(LOGIN_LOGO_INTRO.durationMs, 1500, 'choice logo intro must expose a configurable 1.5s duration');
assert.equal(LOGIN_LOGO_INTRO.blurPx, 66, 'choice logo intro must expose the starting blur amount');
assert.equal(LOGIN_LOGO_INTRO.easing, 'ease-in-out', 'choice logo intro must use a soft easing');
assert.equal(LOGIN_CHOICE_FEEDBACK.guestAckFadeMs, 2000, 'guest acknowledgement fade must stay slow enough to read');
assert.equal(LOGIN_CHOICE_FEEDBACK.clickMs, 320, 'choice click acknowledgement must expose a bounded brightening duration');
assert.match(LOGIN_CHOICE_FEEDBACK.clickTextShadow, /30px/, 'choice click glow must expand around the chosen text by about 30px');
assert.deepEqual(gradientMotionFrames, [
    { filter: 'brightness(1)', backgroundPosition: '0% 50%' },
    { filter: 'brightness(1.032)', backgroundPosition: '100% 50%' },
    { filter: 'brightness(1)', backgroundPosition: '0% 50%' }
], 'gradient motion must only breathe through brightness and background position');
assert.ok(gradientMotionFrames.every((frame) => !Object.hasOwn(frame, 'background')), 'gradient motion must not rewrite gradient backgrounds');

let sessionOpeningSnapshot = null;
let authenticatingSnapshot = null;
setViewport(1200, 700);
const sequence = createUserLoginSequence({
    onSubmit: async (payload = {}) => {
        assert.equal(typeof payload.onAuthenticating, 'function', 'successful login payload must expose the immediate visual callback');
        assert.equal(typeof payload.onAuthenticated, 'function', 'successful login payload must expose the authenticated visual callback');
        await payload.onAuthenticating();
        const authenticating = document.getElementById('eve_login_sequence__session_opening');
        authenticatingSnapshot = {
            rootDisplay: document.getElementById('eve_login_sequence')?.style?.display,
            messageDisplay: authenticating?.style?.display,
            line1: document.getElementById('eve_login_sequence__session_opening_line1')?.textContent,
            line2: document.getElementById('eve_login_sequence__session_opening_line2')?.textContent
        };
        await payload.onAuthenticated();
        const sessionOpening = document.getElementById('eve_login_sequence__session_opening');
        const logoNode = document.getElementById('eve_login_sequence__persistent_logo');
        sessionOpeningSnapshot = {
            rootDisplay: document.getElementById('eve_login_sequence')?.style?.display,
            messageDisplay: sessionOpening?.style?.display,
            messageOpacity: sessionOpening?.style?.opacity,
            line1: document.getElementById('eve_login_sequence__session_opening_line1')?.textContent,
            line2: document.getElementById('eve_login_sequence__session_opening_line2')?.textContent,
            logoWidth: logoNode?.style?.width,
            logoTransform: logoNode?.style?.transform
        };
        return { ok: true };
    },
    onWithoutAccount: async () => ({ ok: true })
});
sequence.open();
await new Promise((resolve) => setTimeout(resolve, 0));
await waitForCondition(() => spokenLoginTexts.length === 1);

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
assert.equal(root?.style?.backgroundColor, 'inherit', 'login shell must inherit the body background before the choice fade');
assert.equal(choice?.style?.display, 'flex', 'choice surface must be visible first');
assert.deepEqual(spokenLoginTexts, [{
    text: 'Souhaitez-vous être guidé vocalement ?',
    options: {
        lang: 'fr-FR',
        source: 'login_choice'
    }
}], 'login choice must announce the voice-guidance prompt once through the voice API');
assert.match(LOGIN_GRADIENTS.shell, /radial-gradient/, 'login shell token must keep the textured background');
assert.match(LOGIN_GRADIENTS.guest, /radial-gradient/, 'guest choice must use a layered violet background');
assert.match(LOGIN_GRADIENTS.auth, /radial-gradient/, 'account choice must use a separate layered violet background');
assert.doesNotMatch(LOGIN_GRADIENTS.choiceDivider, /gradient/, 'choice divider line must not use a gradient');
assert.doesNotMatch(LOGIN_GRADIENTS.choiceDivider, /transparent/, 'choice divider line must stay crisp across the full width');
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
assert.doesNotMatch(document.getElementById('eve_login_sequence__choice_divider_line')?.style?.background || '', /transparent/, 'choice separator line must not fade at the viewport edges');
assert.match(dividerSweep?.style?.background || '', /radial-gradient/, 'choice separator must use the shared glow sweep token');
assert.equal(LOGIN_CHOICE_LIGHT.durationMs, 9600, 'choice separator sweep must move at half the previous speed');
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
assert.equal(logo?.style?.opacity, '1', 'persistent logo wrapper must stay fully opaque during the choice entry fade');
assert.equal(logoImg?.style?.opacity, '1', 'base logo must stay white at full opacity');
assert.match(logoImg?.style?.filter || '', /brightness\(0\) invert\(1\)/, 'base logo must keep a fixed white filter');
assert.match(logo?.style?.transform || '', /600px,350px/, 'login logo must start centered in the viewport');
const logoIntroAnimation = capturedAnimations.find((entry) => (
    entry.element === logo
    && entry.frames?.[0]?.opacity === '0'
    && entry.frames?.[0]?.filter === `blur(${LOGIN_LOGO_INTRO.blurPx}px)`
    && entry.frames?.at?.(-1)?.opacity === '1'
    && entry.frames?.at?.(-1)?.filter === 'blur(0px)'
));
assert.ok(logoIntroAnimation, 'choice logo must animate opacity and blur before the choice surface fade');
assert.equal(logoIntroAnimation?.options?.duration, LOGIN_LOGO_INTRO.durationMs, 'choice logo intro must use the shared duration token');
assert.equal(logoIntroAnimation?.options?.easing, LOGIN_LOGO_INTRO.easing, 'choice logo intro must use the shared easing token');

withoutAccountButton.dispatchEvent(new window.MouseEvent('pointerenter', { bubbles: true }));
const hoverTextAnimation = capturedAnimations.find((entry) => entry.element === withoutAccountButton.loginLabel && entry.frames?.at?.(-1)?.textShadow === LOGIN_CHOICE_FEEDBACK.hoverTextShadow);
const hoverDimAnimation = capturedAnimations.find((entry) => entry.element === authenticateButton.loginLabel && entry.frames?.at?.(-1)?.opacity === LOGIN_CHOICE_FEEDBACK.hoverDimOpacity);
assert.equal(withoutAccountButton.loginLabel.style.textShadow, LOGIN_CHOICE_FEEDBACK.idleTextShadow, 'hover must not apply the final halo before the animation starts');
assert.ok(hoverTextAnimation, 'hovered choice label must animate toward the luminous text halo');
assert.ok(hoverDimAnimation, 'non-hovered choice label must animate toward 0.6 opacity');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(authenticateButton.loginLabel.style.opacity, LOGIN_CHOICE_FEEDBACK.hoverDimOpacity, 'non-hovered choice label must settle on dimmed opacity after animation completion');
withoutAccountButton.dispatchEvent(new window.MouseEvent('pointerleave', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(authenticateButton.loginLabel.style.opacity, LOGIN_TEXT_STYLE.opacity, 'non-hovered label must restore opacity after hover leaves');

setViewport(700, 1200);
assert.match(logo?.style?.transform || '', /350px,600px/, 'login logo must stay centered after resize');

await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
const phoneInput = document.getElementById('eve_login_sequence__phone_input');
assert.equal(document.getElementById('eve_login_sequence__typed_caret')?.style?.opacity, '1', 'mirrored caret must be visible on the active phone step');
phoneInput.value = '0600000000';
dispatchInput(phoneInput);
dispatchEnter(phoneInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block');

const otpInput = document.getElementById('eve_login_sequence__otp_input');
assert.equal(document.getElementById('eve_login_sequence__typed_caret')?.style?.opacity, '1', 'mirrored caret must be visible on the active OTP step');
otpInput.value = '5273';
dispatchInput(otpInput);
dispatchEnter(otpInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');

const passwordInput = document.getElementById('eve_login_sequence__password_field__input');
const mirroredText = document.getElementById('eve_login_sequence__typed');
const mirroredCaret = document.getElementById('eve_login_sequence__typed_caret');
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
assert.ok(mirroredCaret, 'credential surface must expose a mirrored caret');
assert.equal(mirroredCaret?.style?.borderLeftWidth, '2px', 'mirrored caret must expose a visible stroke width');
assert.equal(mirroredCaret?.style?.borderLeftStyle, 'solid', 'mirrored caret must expose a solid stroke');
assert.match(mirroredCaret?.style?.borderLeftColor || '', /rgba\(255,\s*255,\s*255,\s*0\.92\)/, 'mirrored caret must be visible without using the native caret');
assert.equal(mirroredCaret?.style?.opacity, '1', 'mirrored caret must be visible on the active password step');
passwordInput.value = 'abc';
dispatchInput(passwordInput);
assert.equal(mirroredText?.textContent, '•••', 'password display must be owned by mirrored bullet text');

dispatchEnter(passwordInput);
await waitForCondition(() => root.style.display === 'none' && document.activeElement?.id !== passwordInput.id);
assert.deepEqual(
    authenticatingSnapshot,
    {
        rootDisplay: 'block',
        messageDisplay: 'flex',
        line1: 'Validation en cours',
        line2: 'merci de patienter'
    },
    'password submit must show the neutral validation feedback before the authenticated message'
);
assert.deepEqual(
    sessionOpeningSnapshot,
    {
        rootDisplay: 'block',
        messageDisplay: 'flex',
        messageOpacity: LOGIN_TEXT_STYLE.opacity,
        line1: 'Bienvenue,',
        line2: 'nous ouvrons votre session',
        logoWidth: '175px',
        logoTransform: 'translate3d(350px,600px,0) translate(-50%,-50%)'
    },
    'authenticated visual callback must keep login visible, enlarge the single logo, and show the localized two-line wait message'
);
const finalTopReveal = capturedAnimations.find((entry) => (
    entry.element?.id === 'eve_login_sequence__top_band'
    && entry.frames?.[0]?.transform === 'translateY(0)'
    && entry.frames?.at?.(-1)?.transform === 'translateY(-115%)'
));
const finalBottomReveal = capturedAnimations.find((entry) => (
    entry.element?.id === 'eve_login_sequence__bottom_band'
    && entry.frames?.[0]?.transform === 'translateY(0)'
    && entry.frames?.at?.(-1)?.transform === 'translateY(115%)'
));
assert.ok(finalTopReveal, 'final reveal top band must exit upward');
assert.ok(finalBottomReveal, 'final reveal bottom band must exit downward');
assert.equal(finalTopReveal?.options?.duration, ANIMATION_MS.authBandsExit, 'final reveal top band must use the fast authenticated exit duration');
assert.equal(finalBottomReveal?.options?.duration, ANIMATION_MS.authBandsExit, 'final reveal bottom band must use the fast authenticated exit duration');
assert.notEqual(document.activeElement?.id, passwordInput.id, 'successful password submit must clear native password focus');

let emptyPasswordSubmitted = false;
const emptyPasswordSequence = createUserLoginSequence({
    onSubmit: async () => {
        emptyPasswordSubmitted = true;
        return { ok: true };
    },
    onWithoutAccount: async () => ({ ok: true })
});
emptyPasswordSequence.open();
await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
const emptyPasswordPhoneInput = document.getElementById('eve_login_sequence__phone_input');
emptyPasswordPhoneInput.value = '0600000002';
dispatchInput(emptyPasswordPhoneInput);
dispatchEnter(emptyPasswordPhoneInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block');
const emptyPasswordOtpInput = document.getElementById('eve_login_sequence__otp_input');
emptyPasswordOtpInput.value = '5273';
dispatchInput(emptyPasswordOtpInput);
dispatchEnter(emptyPasswordOtpInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
const emptyPasswordStepInput = document.getElementById('eve_login_sequence__password_field__input');
assert.equal(emptyPasswordStepInput?.value, '', 'empty-password regression must start with an empty password input');
const emptyPasswordInstruction = document.getElementById('eve_login_sequence__instruction');
const emptyPasswordTypedText = document.getElementById('eve_login_sequence__typed');
[emptyPasswordInstruction, emptyPasswordTypedText].forEach((node) => {
    node.style.opacity = '0';
    node.style.filter = 'blur(18px)';
    node.style.transform = 'scale(1.18)';
});
await clickButton(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex');
assert.equal(emptyPasswordSubmitted, false, 'empty password logo click must not submit credentials');
assert.equal(document.getElementById('eve_login_sequence__credentials')?.style?.display, 'none', 'empty password logo click must close the credential surface');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'flex', 'empty password logo click must return to the first login choice');
emptyPasswordSequence.destroy();

const immediateAnimate = window.Element.prototype.animate;
const pendingReentryAnimations = [];
const pendingReentryAnimationEntries = [];
window.Element.prototype.animate = function animate(frames, options) {
    const isChoiceExit = this.id === 'eve_login_sequence__choice'
        && options?.duration === ANIMATION_MS.enterCredentials
        && frames?.at?.(-1)?.opacity === 0;
    if (options?.duration !== ANIMATION_MS.returnHome && !isChoiceExit) {
        return immediateAnimate.call(this, frames, options);
    }
    const entry = { element: this, frames, options };
    entry.cancelled = false;
    capturedAnimations.push(entry);
    pendingReentryAnimationEntries.push(entry);
    let finishAnimation = () => {};
    const finished = new Promise((resolve) => {
        finishAnimation = resolve;
    });
    pendingReentryAnimations.push(finishAnimation);
    return {
        cancel() {
            entry.cancelled = true;
            finishAnimation();
        },
        finished
    };
};
try {
    const finishPendingReentryAnimations = async () => {
        pendingReentryAnimations.splice(0).forEach((finishAnimation) => finishAnimation());
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const assertReopenedPhoneStep = (context, typedPhone) => {
        const reentryCredentials = document.getElementById('eve_login_sequence__credentials');
        const reentryPhoneInput = document.getElementById('eve_login_sequence__phone_input');
        const reentryCaret = document.getElementById('eve_login_sequence__typed_caret');
        const reentryTypedValue = document.getElementById('eve_login_sequence__typed_value');
        const reentryPasswordField = document.getElementById('eve_login_sequence__password_field');
        const reentryOtpInput = document.getElementById('eve_login_sequence__otp_input');
        const reentryPasswordInput = document.getElementById('eve_login_sequence__password_field__input');
        assert.equal(reentryCredentials?.style?.display, 'block', `${context}: late animations must not hide the reopened credential surface`);
        assert.equal(reentryPhoneInput?.disabled, false, `${context}: late animations must not disable the reopened phone input`);
        assert.deepEqual({
            phone: reentryPhoneInput?.style?.display,
            otp: reentryOtpInput?.style?.display,
            password: reentryPasswordInput?.style?.display
        }, {
            phone: 'block',
            otp: 'none',
            password: 'none'
        }, `${context}: reopening must restore the phone step exclusively`);
        assert.equal(reentryPhoneInput?.style?.pointerEvents, 'auto', `${context}: reopened phone input must remain the native hit target`);
        assert.ok(Number(reentryPhoneInput?.style?.zIndex) > Number(reentryPasswordField?.style?.zIndex), `${context}: reopened phone input must stay above the inactive password wrapper`);
        assert.equal(reentryPasswordField?.style?.pointerEvents, 'none', `${context}: inactive password wrapper must not intercept phone input taps`);
        assert.equal(reentryCaret?.style?.opacity, '1', `${context}: reopened mirrored caret must stay visible`);
        reentryPhoneInput.value = typedPhone;
        dispatchInput(reentryPhoneInput);
        assert.equal(reentryTypedValue?.textContent, typedPhone, `${context}: reopened phone input must keep updating the mirrored text`);
    };
    const reentrySequence = createUserLoginSequence({
        onSubmit: async () => ({ ok: true }),
        onWithoutAccount: async () => ({ ok: true })
    });
    reentrySequence.open();
    await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
    assert.equal(document.getElementById('eve_login_sequence__phone_input')?.style?.display, 'block', 'reentry regression must start on the phone step');
    await clickButton(document.getElementById('eve_login_sequence__persistent_logo'));
    await waitForCondition(() => document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex');
    assert.equal(document.getElementById('eve_login_sequence__credentials')?.style?.pointerEvents, 'none', 'returning credential surface must let the visible choice receive the next click');
    assert.equal(document.getElementById('eve_login_sequence__phone_input')?.style?.pointerEvents, 'none', 'returning phone input must not intercept the visible choice');
    await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
    await waitForCondition(() => document.getElementById('eve_login_sequence__phone_input')?.style?.display === 'block');
    const cancelledSurfaceReturn = pendingReentryAnimationEntries.find((entry) => entry.element?.id === 'eve_login_sequence__credentials');
    assert.equal(cancelledSurfaceReturn?.cancelled, true, 'reopening credentials must cancel the stale surface opacity animation');
    await finishPendingReentryAnimations();
    assertReopenedPhoneStep('empty phone return and reentry', '0600000099');

    const passwordReentryPhone = document.getElementById('eve_login_sequence__phone_input');
    dispatchEnter(passwordReentryPhone);
    assert.equal(await waitForCondition(() => (
        document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block'
        && document.activeElement?.id === 'eve_login_sequence__otp_input'
    )), true, 'password reentry regression must reach an interactive OTP step');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const passwordReentryOtp = document.getElementById('eve_login_sequence__otp_input');
    passwordReentryOtp.value = '5273';
    dispatchInput(passwordReentryOtp);
    dispatchEnter(passwordReentryOtp);
    assert.equal(await waitForCondition(() => (
        document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block'
        && document.activeElement?.id === 'eve_login_sequence__password_field__input'
    )), true, 'password reentry regression must reach an interactive password step');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.getElementById('eve_login_sequence__password_field__input')?.value, '', 'password reentry regression must start with an empty password input');
    await new Promise((resolve) => setTimeout(resolve, 380));
    await clickButton(document.getElementById('eve_login_sequence__persistent_logo'));
    await waitForCondition(() => document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex');
    await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
    await waitForCondition(() => document.getElementById('eve_login_sequence__phone_input')?.style?.display === 'block');
    await finishPendingReentryAnimations();
    assertReopenedPhoneStep('empty password return and reentry', '0600000088');
    reentrySequence.destroy();
} finally {
    window.Element.prototype.animate = immediateAnimate;
    pendingReentryAnimations.splice(0).forEach((finishAnimation) => finishAnimation());
}

let invalidPayload = null;
let invalidAuthenticatingSnapshot = null;
let invalidAuthenticatedCallbackAvailable = false;
const invalidSequence = createUserLoginSequence({
    onSubmit: async (payload) => {
        invalidPayload = payload;
        await payload.onAuthenticating();
        invalidAuthenticatingSnapshot = {
            messageDisplay: document.getElementById('eve_login_sequence__session_opening')?.style?.display,
            line1: document.getElementById('eve_login_sequence__session_opening_line1')?.textContent,
            line2: document.getElementById('eve_login_sequence__session_opening_line2')?.textContent
        };
        invalidAuthenticatedCallbackAvailable = typeof payload.onAuthenticated === 'function';
        return { ok: false, errorText: 'Identifiant ou mot de passe incorrect' };
    },
    onWithoutAccount: async () => ({ ok: true })
});
invalidSequence.open();
await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
const invalidPhoneInput = document.getElementById('eve_login_sequence__phone_input');
invalidPhoneInput.value = '0600000001';
dispatchInput(invalidPhoneInput);
dispatchEnter(invalidPhoneInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block');
const invalidOtpInput = document.getElementById('eve_login_sequence__otp_input');
invalidOtpInput.value = '5273';
dispatchInput(invalidOtpInput);
dispatchEnter(invalidOtpInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
const invalidPasswordStepInput = document.getElementById('eve_login_sequence__password_field__input');
invalidPasswordStepInput.value = 'wrong-password';
dispatchInput(invalidPasswordStepInput);
dispatchEnter(invalidPasswordStepInput);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(invalidPayload?.phone, '0600000001', 'invalid password submit must keep the entered phone in the payload');
assert.deepEqual(
    invalidAuthenticatingSnapshot,
    {
        messageDisplay: 'flex',
        line1: 'Validation en cours',
        line2: 'merci de patienter'
    },
    'invalid password submit must still show the immediate neutral validation feedback while auth is pending'
);
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'none', 'invalid password must not return to the choice screen');
assert.equal(document.getElementById('eve_login_sequence__credentials')?.style?.display, 'block', 'invalid password must keep the credential surface visible');
assert.equal(invalidPasswordStepInput?.style?.display, 'block', 'invalid password must stay on the password step');
assert.equal(invalidPasswordStepInput?.value, '', 'invalid password must clear the bad password');
assert.equal(document.getElementById('eve_login_sequence__typed')?.textContent, '', 'invalid password must clear mirrored bullets');
assert.equal(document.getElementById('eve_login_sequence__instruction')?.textContent, 'Identifiant ou mot de passe incorrect', 'invalid password must show the auth error');
assert.equal(invalidAuthenticatedCallbackAvailable, true, 'invalid password payload must still expose the callback for the auth owner');
assert.equal(document.getElementById('eve_login_sequence__session_opening')?.style?.display, 'none', 'invalid password must not start the session-opening message');
invalidSequence.destroy();

capturedAnimations.length = 0;
setViewport(1200, 700);
const guestSequence = createUserLoginSequence({
    onSubmit: async () => ({ ok: true }),
    onWithoutAccount: async () => ({ ok: true })
});
guestSequence.open();
await new Promise((resolve) => setTimeout(resolve, 0));
const guestButton = document.getElementById('eve_login_sequence__choice_without_account');
const guestAuthButton = document.getElementById('eve_login_sequence__choice_authenticate');
const guestDivider = document.getElementById('eve_login_sequence__choice_divider');
await clickButton(guestButton);
await new Promise((resolve) => setTimeout(resolve, 0));
const guestShineAnimation = capturedAnimations.find((entry) => (
    entry.element === guestButton.loginLabel
    && entry.frames?.at?.(-1)?.textShadow === LOGIN_CHOICE_FEEDBACK.clickTextShadow
));
const guestLabelFadeAnimation = capturedAnimations.find((entry) => (
    entry.element === guestButton.loginLabel
    && entry.frames?.at?.(-1)?.opacity === '0'
    && entry.frames?.at?.(-1)?.textShadow === LOGIN_CHOICE_FEEDBACK.idleTextShadow
));
const guestDividerFadeAnimation = capturedAnimations.find((entry) => (
    entry.element === guestDivider
    && entry.frames?.at?.(-1)?.opacity === '0'
));
const guestExitTextAnimation = capturedAnimations.find((entry) => (
    entry.element === guestButton.loginLabel
    && entry.frames?.[0]?.opacity === '0'
    && entry.frames?.at?.(-1)?.opacity === 0
));
assert.ok(guestShineAnimation, 'guest choice must first acknowledge the click with the selected label glow');
assert.ok(guestLabelFadeAnimation, 'guest choice label must fade out after its click glow finishes');
assert.equal(guestLabelFadeAnimation?.options?.duration, LOGIN_CHOICE_FEEDBACK.guestAckFadeMs, 'guest choice label fade must use the shared slow acknowledgement duration');
assert.ok(guestDividerFadeAnimation, 'choice divider must fade out after the guest click glow finishes');
assert.equal(guestDividerFadeAnimation?.options?.duration, LOGIN_CHOICE_FEEDBACK.guestAckFadeMs, 'choice divider fade must use the shared slow acknowledgement duration');
assert.ok(guestExitTextAnimation, 'guest desktop exit must not restart hidden selected label from visible opacity');
assert.equal(guestAuthButton.loginLabel.style.opacity, '0', 'opposite auth label must stay hidden after guest click acknowledgement');

console.log('user_login_visual_contract.test: PASS');
