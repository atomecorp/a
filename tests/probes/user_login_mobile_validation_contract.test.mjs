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

const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');

const waitForCondition = async (predicate, timeoutMs = 3000, intervalMs = 20) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
};
const dispatchInput = (node) => node.dispatchEvent(new window.Event('input', { bubbles: true }));
const dispatchChange = (node) => node.dispatchEvent(new window.Event('change', { bubbles: true }));
const dispatchKey = (node, key, code = key) => node.dispatchEvent(new window.KeyboardEvent('keydown', { key, code, bubbles: true }));
const dispatchPointerDown = (node) => node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
const dispatchPointerUp = (node) => node.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
const clickButton = async (node) => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
};
const waitGestureBoundary = () => new Promise((resolve) => setTimeout(resolve, 380));
const dispatchClickThenPointerUp = (node) => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    dispatchPointerUp(node);
};
const assertChoiceRestored = (context) => {
    const choice = document.getElementById('eve_login_sequence__choice');
    const credentials = document.getElementById('eve_login_sequence__credentials');
    const withoutAccountChoice = document.getElementById('eve_login_sequence__choice_without_account');
    const authenticateChoice = document.getElementById('eve_login_sequence__choice_authenticate');
    assert.equal(choice?.style?.display, 'flex', `${context}: choice surface must be visible`);
    assert.equal(credentials?.style?.display, 'none', `${context}: credentials surface must be hidden`);
    assert.equal(withoutAccountChoice?.textContent, 'Essayer', `${context}: without-account label must be present`);
    assert.equal(authenticateChoice?.textContent, 'Connexion / inscription', `${context}: authenticate label must be present`);
    assert.notEqual(withoutAccountChoice?.loginLabel?.style?.opacity, '0', `${context}: without-account label must not stay faded out`);
    assert.notEqual(authenticateChoice?.loginLabel?.style?.opacity, '0', `${context}: authenticate label must not stay faded out`);
};

const createSequenceAtPhoneStep = async ({ onSubmit = async () => ({ ok: true }), lookupPhone } = {}) => {
    window.AdoleAPI.auth.lookupPhone = lookupPhone || (async (phone) => ({
        ok: true,
        success: true,
        user: { id: 'user_mobile_validation', phone }
    }));
    const sequence = createUserLoginSequence({
        onSubmit,
        onWithoutAccount: async () => ({ ok: true })
    });
    sequence.open();
    await clickButton(document.getElementById('eve_login_sequence__choice_authenticate'));
    await waitForCondition(() => document.getElementById('eve_login_sequence__phone_input')?.style?.display === 'block');
    return sequence;
};

const fillPhone = (value = '0600000000') => {
    const input = document.getElementById('eve_login_sequence__phone_input');
    input.value = value;
    dispatchInput(input);
    return input;
};
const assertNoAutoSelectOnFocusOrClick = (input, context) => {
    let selectCount = 0;
    input.select = () => { selectCount += 1; };
    input.dispatchEvent(new window.FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(selectCount, 0, `${context}: login input focus/click must not call select on iOS`);
};

await createSequenceAtPhoneStep();
assertNoAutoSelectOnFocusOrClick(document.getElementById('eve_login_sequence__phone_input'), 'phone input');
assert.equal(document.getElementById('eve_login_sequence__phone_input')?.style?.pointerEvents, 'auto', 'phone step must keep the native phone input hit-testable');
assert.equal(document.getElementById('eve_login_sequence__password_field')?.style?.pointerEvents, 'none', 'phone step must not let the password wrapper intercept native phone input taps');
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => (
    document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex'
    && document.getElementById('eve_login_sequence__credentials')?.style?.display === 'none'
));
assert.equal(document.getElementById('eve_login_sequence__credentials')?.style?.display, 'none', 'empty phone Atome icon submit must return to the login choice');

await createSequenceAtPhoneStep();
fillPhone('0600000001');
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'none', 'filled phone Atome icon submit must keep the credential flow');

let emptyPasswordSubmitted = false;
await createSequenceAtPhoneStep({ onSubmit: async () => { emptyPasswordSubmitted = true; return { ok: true }; } });
fillPhone('0600000002');
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
assertNoAutoSelectOnFocusOrClick(document.getElementById('eve_login_sequence__password_field__input'), 'password input');
await waitGestureBoundary();
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => (
    document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex'
    && document.getElementById('eve_login_sequence__credentials')?.style?.display === 'none'
));
assert.equal(emptyPasswordSubmitted, false, 'empty password Atome icon submit must not call auth submit');
assert.equal(document.getElementById('eve_login_sequence__credentials')?.style?.display, 'none', 'empty password Atome icon submit must return to the login choice');
assertChoiceRestored('empty password pointerup return');

let doubleGestureSubmitted = false;
await createSequenceAtPhoneStep({ onSubmit: async () => { doubleGestureSubmitted = true; return { ok: true }; } });
fillPhone('0600000007');
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
await waitGestureBoundary();
dispatchClickThenPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex');
await new Promise((resolve) => setTimeout(resolve, 40));
assert.equal(doubleGestureSubmitted, false, 'empty password click plus pointerup must not submit credentials');
assertChoiceRestored('empty password click plus pointerup return');

let submittedPassword = '';
await createSequenceAtPhoneStep({ onSubmit: async ({ password }) => { submittedPassword = password; return { ok: true }; } });
fillPhone('0600000003');
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
await waitGestureBoundary();
const passwordInput = document.getElementById('eve_login_sequence__password_field__input');
const passwordField = document.getElementById('eve_login_sequence__password_field');
assert.equal(passwordField?.style?.pointerEvents, 'auto', 'password wrapper must keep native iOS input hit-testing enabled');
assert.equal(passwordInput?.style?.pointerEvents, 'auto', 'password input must be the native touch target on iOS');
passwordInput.blur();
dispatchPointerDown(passwordInput);
passwordInput.focus();
assert.equal(document.activeElement?.id, passwordInput.id, 'direct password input pointerdown must keep native focus');
dispatchPointerUp(passwordInput);
assert.equal(document.activeElement?.id, passwordInput.id, 'direct password input pointerup must not blur');
passwordInput.blur();
dispatchPointerDown(document.getElementById('eve_login_sequence__center'));
assert.equal(document.activeElement?.id, passwordInput.id, 'password surface pointerdown must focus the password input');
dispatchPointerUp(document.getElementById('eve_login_sequence__center'));
assert.equal(document.activeElement?.id, passwordInput.id, 'password surface pointerup must not blur the password input');
passwordInput.value = 'valid_password';
dispatchInput(passwordInput);
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => submittedPassword === 'valid_password');
assert.equal(submittedPassword, 'valid_password', 'filled password Atome icon submit must call auth submit');

await createSequenceAtPhoneStep();
const enterPhoneInput = fillPhone('0600000004');
dispatchKey(enterPhoneInput, 'Enter');
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
assert.equal(document.getElementById('eve_login_sequence__password_field__input')?.style?.display, 'block', 'Enter must validate the active phone input');

await createSequenceAtPhoneStep({
    lookupPhone: async (phone) => ({ ok: true, success: false, missing: true, phone })
});
fillPhone('0600000008');
dispatchPointerUp(document.getElementById('eve_login_sequence__persistent_logo'));
await waitForCondition(() => document.getElementById('eve_login_sequence__otp_input')?.style?.display === 'block');
assertNoAutoSelectOnFocusOrClick(document.getElementById('eve_login_sequence__otp_input'), 'otp input');
assert.equal(document.getElementById('eve_login_sequence__otp_input')?.style?.pointerEvents, 'auto', 'OTP step must keep the native OTP input hit-testable');
assert.equal(document.getElementById('eve_login_sequence__password_field')?.style?.pointerEvents, 'none', 'OTP step must not let the password wrapper intercept native OTP input taps');

await createSequenceAtPhoneStep();
const numpadPhoneInput = fillPhone('0600000005');
dispatchKey(numpadPhoneInput, 'NumpadEnter', 'NumpadEnter');
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
assert.equal(document.getElementById('eve_login_sequence__password_field__input')?.style?.display, 'block', 'NumpadEnter must validate the active phone input');

let lookupCount = 0;
await createSequenceAtPhoneStep({
    lookupPhone: async (phone) => {
        lookupCount += 1;
        return { ok: true, success: true, user: { id: 'user_change_validation', phone } };
    }
});
const changePhoneInput = fillPhone('0600000006');
dispatchChange(changePhoneInput);
await waitForCondition(() => document.getElementById('eve_login_sequence__password_field__input')?.style?.display === 'block');
dispatchChange(changePhoneInput);
assert.equal(lookupCount, 1, 'filled active change validation must submit only once');

let emptyChangeLookupCount = 0;
await createSequenceAtPhoneStep({
    lookupPhone: async () => {
        emptyChangeLookupCount += 1;
        return { ok: true, success: true, user: { id: 'user_empty_change' } };
    }
});
dispatchChange(document.getElementById('eve_login_sequence__phone_input'));
await new Promise((resolve) => setTimeout(resolve, 40));
assert.equal(emptyChangeLookupCount, 0, 'empty active change validation must not submit');
