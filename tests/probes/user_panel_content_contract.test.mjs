import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

const mainHandle = document.createElement('button');
mainHandle.setAttribute('data-role', 'eve_intuitionx-handle');
document.body.appendChild(mainHandle);

window.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;

globalThis.$ = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.id) node.id = String(options.id);
    if (options.className) node.className = String(options.className);
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.html !== undefined) node.innerHTML = String(options.html);
    if (options.attrs && typeof options.attrs === 'object') {
        Object.entries(options.attrs).forEach(([key, value]) => {
            if (value !== undefined && value !== null) node.setAttribute(key, String(value));
        });
    }
    if (options.css && typeof options.css === 'object') {
        Object.entries(options.css).forEach(([key, value]) => {
            if (value !== undefined && value !== null) node.style[key] = String(value);
        });
    }
    Object.entries(options).forEach(([key, value]) => {
        if (!key.startsWith('on') || typeof value !== 'function') return;
        node.addEventListener(key.slice(2).toLowerCase(), value);
    });
    const parent = typeof options.parent === 'string'
        ? document.querySelector(options.parent)
        : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

window.__authCheckResult = {
    complete: true,
    authenticated: false,
    anonymous: true
};

await import('../../eVe/intuition/tools/user.js');

assert.equal(typeof window.open_home_panel, 'function', 'open_home_panel must be installed');

window.dispatchEvent(new window.CustomEvent('squirrel:auth-checked', {
    detail: { authenticated: false, userId: null, anonymous: false }
}));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(
    document.getElementById('eve_login_sequence')?.style?.display,
    'block',
    'unauthenticated auth-check must open the login sequence instead of leaving only the Atome logo'
);
assert.equal(
    document.getElementById('eve_login_sequence__choice')?.style?.display,
    'flex',
    'unauthenticated auth-check must show the black/white pre-auth choice'
);

const dispatchInput = (node) => node.dispatchEvent(new window.Event('input', { bubbles: true }));
const dispatchEnter = (node) => node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const activateButton = async (node) => {
    node.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
    node.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
};
const setViewport = (width, height) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    window.dispatchEvent(new window.Event('resize'));
};
const submitLoginCredentials = async (phone, password) => {
    const choiceAuthenticate = document.getElementById('eve_login_sequence__choice_authenticate');
    if (document.getElementById('eve_login_sequence__choice')?.style?.display === 'flex') {
        await activateButton(choiceAuthenticate);
    }
    const phoneField = document.getElementById('eve_login_sequence__phone_input');
    phoneField.value = phone;
    dispatchInput(phoneField);
    dispatchEnter(phoneField);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const otpInput = document.getElementById('eve_login_sequence__otp_input');
    otpInput.value = '5273';
    dispatchInput(otpInput);
    dispatchEnter(otpInput);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const passwordFieldInput = document.getElementById('eve_login_sequence__password_field__input');
    passwordFieldInput.value = password;
    dispatchInput(passwordFieldInput);
    dispatchEnter(passwordFieldInput);
    await new Promise((resolve) => setTimeout(resolve, 20));
};

let anonymousUser = null;
const anonymousCalls = [];
window.AdoleAPI.auth.current = async () => anonymousUser
    ? { logged: true, user: anonymousUser }
    : { logged: false, user: null };
window.AdoleAPI.security.isAnonymous = () => !!anonymousUser;
window.AdoleAPI.security.ensureAnonymousUser = async (options = {}) => {
    anonymousCalls.push(options);
    anonymousUser = { id: 'anonymous_user', user_id: 'anonymous_user', username: 'anonymous' };
    window.__currentProject = { id: 'anonymous_project', name: 'welcome', userId: anonymousUser.id };
    window.dispatchEvent(new window.CustomEvent('squirrel:project-changed', { detail: window.__currentProject }));
    return { ok: true, user: anonymousUser };
};

setViewport(1200, 700);
const authOpen = await window.open_home_panel({ source: { type: 'user_panel_contract.auth' } });
assert.equal(authOpen.ok, true, 'auth panel open must succeed');
assert.equal(authOpen.panel_id, 'eve_login_sequence', 'anonymous state must open login sequence');

const loginSequence = document.getElementById('eve_login_sequence');
assert.equal(loginSequence?.style?.display, 'block', 'login sequence must be visible');
const loginChoice = document.getElementById('eve_login_sequence__choice');
const withoutAccountChoice = document.getElementById('eve_login_sequence__choice_without_account');
const authenticateChoice = document.getElementById('eve_login_sequence__choice_authenticate');
assert.equal(loginChoice?.style?.display, 'flex', 'login choice must be the first visible auth surface');
assert.equal(loginChoice?.style?.flexDirection, 'column', 'login choice must split horizontally');
assert.equal(withoutAccountChoice?.textContent, 'Entrez sans compte', 'without-account label must come from i18n');
assert.equal(authenticateChoice?.textContent, 'Authentification', 'authenticate label must come from i18n');
assert.equal(withoutAccountChoice?.style?.background, 'transparent', 'without-account button must keep its background on the animated layer');
assert.match(withoutAccountChoice?.querySelector('span')?.style?.background || '', /linear-gradient/, 'without-account side must use the dark mauve gradient');
assert.equal(withoutAccountChoice?.style?.color, 'rgb(255, 255, 255)', 'without-account text must be white');
assert.equal(authenticateChoice?.style?.background, 'transparent', 'authenticate button must keep its background on the animated layer');
assert.match(authenticateChoice?.querySelector('span')?.style?.background || '', /linear-gradient/, 'authenticate side must use the dark violet gradient');
assert.equal(authenticateChoice?.style?.color, 'rgb(255, 255, 255)', 'authenticate text must be white');
const centralLogo = document.getElementById('eve_login_sequence__persistent_logo');
assert.ok(centralLogo, 'login choice must expose one persistent Atome logo control');
assert.equal(document.querySelectorAll('#eve_login_sequence__persistent_logo').length, 1, 'login must keep a single persistent logo node');
assert.equal(document.getElementById('eve_login_sequence__choice_logo'), null, 'login choice must not create a second static logo');

setViewport(700, 1200);
assert.equal(loginChoice?.style?.flexDirection, 'column', 'portrait login choice must split horizontally');

await activateButton(withoutAccountChoice);
assert.deepEqual(anonymousCalls, [{ force: true }], 'without-account choice must use the anonymous account flow');
assert.equal(loginSequence?.style?.display, 'none', 'successful anonymous entry must close the login sequence');
anonymousUser = null;

setViewport(1200, 700);
const authOpenAgain = await window.open_home_panel({ source: { type: 'user_panel_contract.auth_again' } });
assert.equal(authOpenAgain.ok, true, 'auth panel reopen must succeed');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'flex', 'login choice must re-open before credentials');
await activateButton(document.getElementById('eve_login_sequence__choice_authenticate'));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Entrez votre numéro de téléphone',
    'authenticate choice must open the phone step'
);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    document.activeElement?.id,
    'eve_login_sequence__phone_input',
    'phone input must receive initial focus'
);
const pendingAuthPhoneInput = document.getElementById('eve_login_sequence__phone_input');
window.AdoleAPI.auth.requestPhoneVerification = async () => ({ ok: true, code: '5273' });
window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });
pendingAuthPhoneInput.value = '0600000000';
dispatchInput(pendingAuthPhoneInput);
dispatchEnter(pendingAuthPhoneInput);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'O.T.P: 5273',
    'phone entry must advance to visible demo OTP before auth transition checks'
);
const pendingOtpInput = document.getElementById('eve_login_sequence__otp_input');
pendingOtpInput.value = '0000';
dispatchInput(pendingOtpInput);
dispatchEnter(pendingOtpInput);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Code incorrect',
    'invalid OTP must display a precise error'
);
assert.equal(pendingOtpInput.value, '', 'invalid OTP must clear the entered code');
pendingOtpInput.value = '5273';
dispatchInput(pendingOtpInput);
dispatchEnter(pendingOtpInput);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Saisissez votre mot de passe',
    'validated OTP must advance to password before auth transition checks'
);
window.dispatchEvent(new window.CustomEvent('squirrel:auth-checked', {
    detail: { authenticated: false, userId: null, anonymous: false }
}));
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(
    document.getElementById('eve_login_sequence__credentials')?.style?.display,
    'block',
    'transient unauthenticated auth-check during credential entry must preserve the password screen'
);
assert.equal(
    document.getElementById('eve_login_sequence__choice')?.style?.display,
    'none',
    'transient unauthenticated auth-check during credential entry must not redraw the first choice screen'
);
const logoButton = document.getElementById('eve_login_sequence__persistent_logo');
assert.equal(logoButton?.style?.background, 'transparent', 'login validation logo must not render a square background');
assert.equal(logoButton?.style?.border, '0px', 'login validation logo must not render a rounded square border');
assert.equal(logoButton?.style?.boxShadow, 'none', 'login validation logo must not render a panel shadow');
assert.equal(logoButton?.style?.position, 'absolute', 'login validation logo must stay inside the login shell');
assert.equal(document.getElementById('eve_login_sequence__logo'), null, 'credential flow must not create a second validation logo');
const logoImage = logoButton?.querySelector?.('img');
assert.ok(logoImage?.src?.includes('atome.svg'), 'login validation control must render the pulsing Atome logo image');
const authBody = document.getElementById('eve_auth_dialog__body');
const authFooter = document.getElementById('eve_auth_dialog__body_footer');
assert.equal(document.getElementById('eve_auth_dialog')?.style?.display, 'none', 'old auth dialog must stay hidden');
assert.equal(authFooter?.children?.length || 0, 0, 'old auth dialog footer must not keep login actions');
[
    'eve_auth_dialog__phone',
    'eve_auth_dialog__password',
    'eve_auth_dialog__actions'
].forEach((id) => {
    assert.equal(document.getElementById(id), null, `${id} must not remain in the old auth dialog`);
});

let createdSession = null;
const authAttempts = [];
const forbiddenAuthCalls = [];
window.Atome.getStateCurrent = async () => null;
window.AdoleAPI.projects = {
    loadSaved: async () => null,
    list: async () => ({ fastify: { projects: [] }, tauri: { projects: [] } }),
    create: async () => ({ fastify: { data: { atome_id: 'created_project' } } }),
    setCurrent: async () => ({ ok: true })
};
window.AdoleAPI.auth.bootstrap = async (phone, password, username, visibility) => {
    authAttempts.push({ action: 'bootstrap', phone, password, username, visibility });
    createdSession = { id: 'created_user', username, phone };
    return {
        fastify: {
            success: true,
            data: { user: { id: createdSession.id, user_id: createdSession.id, username, phone }, token: 'token' }
        },
        tauri: { success: false }
    };
};
window.AdoleAPI.auth.login = async () => {
    forbiddenAuthCalls.push('login');
    return { fastify: { success: false, error: 'forbidden' }, tauri: { success: false, error: 'forbidden' } };
};
window.AdoleAPI.auth.create = async () => {
    forbiddenAuthCalls.push('create');
    return { fastify: { success: false, error: 'forbidden' }, tauri: { success: false, error: 'forbidden' } };
};
window.AdoleAPI.auth.current = async () => ({ logged: false, user: null });
window.AdoleAPI.auth.getCurrentInfo = () => createdSession ? { id: createdSession.id } : null;
window.AdoleAPI.security.isAuthenticated = () => !!createdSession;
window.AdoleAPI.security.isAnonymous = () => false;

assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Saisissez votre mot de passe',
    'preserved credential flow must remain on password before bootstrap'
);
const sequencePasswordInput = document.getElementById('eve_login_sequence__password_field__input');
sequencePasswordInput.value = 'validpass';
dispatchInput(sequencePasswordInput);
dispatchEnter(sequencePasswordInput);
await new Promise((resolve) => setTimeout(resolve, 20));
assert.deepEqual(
    authAttempts.map((entry) => entry.action),
    ['bootstrap'],
    'login sequence must use the atomic auth bootstrap contract'
);
assert.equal(authAttempts[0].visibility, 'public', 'login sequence bootstrap must use explicit public visibility');
assert.deepEqual(forbiddenAuthCalls, [], 'login sequence must not call auth.login or auth.create after bootstrap');
assert.equal(loginSequence.style.display, 'none', 'successful login-sequence creation must close the first auth screen');

window.__authCheckResult = {
    complete: true,
    authenticated: true,
    anonymous: false
};
window.AdoleAPI.auth.current = async () => ({ logged: true, id: 'test_user' });
window.AdoleAPI.auth.getCurrentInfo = () => ({ id: 'test_user' });
window.AdoleAPI.security.isAuthenticated = () => true;
window.AdoleAPI.security.isAnonymous = () => false;

const userOpen = await window.open_home_panel({ source: { type: 'user_panel_contract.user' } });
assert.equal(userOpen.ok, true, 'user panel open must succeed');
assert.equal(userOpen.panel_id, 'eve_user_dialog', 'authenticated state must open user dialog');

const userBody = document.getElementById('eve_user_dialog__body');
const userFooter = document.getElementById('eve_user_dialog__body_footer');
const userActions = document.getElementById('eve_user_dialog__actions');
const preferences = document.getElementById('eve_user_dialog__preferences');
const userToolsDock = document.getElementById('eve_user_dialog__tools_dock');
assert.ok(userBody?.children?.length > 0, 'user dialog body must contain profile fields');
assert.ok(userActions, 'user dialog actions row must exist');
assert.equal(userBody?.contains(userActions), true, 'user dialog actions must live in the scrollable body');
assert.equal(userFooter?.contains(userActions) || false, false, 'user dialog footer must not contain actions');
assert.equal(userActions?.previousElementSibling, preferences, 'user dialog actions must be directly below preferences');
assert.equal(document.getElementById('eve_user_dialog__contact_tool'), null, 'user dialog must not expose the contact tool');
assert.equal(userToolsDock?.style?.display, 'none', 'user dialog contact tool dock must stay hidden');
assert.ok(
    userActions?.contains(document.getElementById('eve_user_dialog__actions__logout')),
    'user dialog actions must contain logout'
);
assert.ok(
    userActions?.contains(document.getElementById('eve_user_dialog__actions__delete')),
    'user dialog actions must contain delete user'
);
assert.equal(
    document.getElementById('eve_user_dialog__actions__create'),
    null,
    'user dialog footer must not expose the create user action'
);
await activateButton(document.getElementById('eve_user_dialog__actions__logout'));
assert.equal(
    document.getElementById('eve_login_sequence')?.style?.display,
    'block',
    'logout must return to the pre-auth login sequence'
);
assert.equal(
    document.getElementById('eve_login_sequence__choice')?.style?.display,
    'flex',
    'logout must show the new pre-auth choice screen'
);

const contractCalls = [];
window.AdoleAPI.auth.bootstrap = async (phone, password, username, visibility) => {
    contractCalls.push({ phone, password, username, visibility });
    if (phone === '0611111111' && password === 'wrongpass') {
        return {
            fastify: { success: false, error: 'Invalid credentials' },
            tauri: { success: false, error: 'Invalid credentials' }
        };
    }
    if (phone === '0611111111' && password === 'rightpass') {
        return {
            fastify: { success: true, data: { user: { id: 'existing_user', user_id: 'existing_user', phone }, token: 'token' } },
            tauri: { success: false }
        };
    }
    return {
        fastify: { success: false, error: 'unexpected_credentials' },
        tauri: { success: false, error: 'unexpected_credentials' }
    };
};
window.AdoleAPI.auth.current = async () => ({ logged: false, user: null });
window.AdoleAPI.auth.requestPhoneVerification = async () => ({ ok: true, code: '5273' });
window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });
await submitLoginCredentials('0611111111', 'wrongpass');
assert.equal(
    document.getElementById('eve_login_sequence')?.style?.display,
    'block',
    'existing phone with wrong password must stay on login'
);
assert.equal(
    document.getElementById('eve_login_sequence__choice')?.style?.display,
    'flex',
    'wrong password must return to the first login choice'
);
await submitLoginCredentials('0611111111', 'rightpass');
assert.equal(
    document.getElementById('eve_login_sequence')?.style?.display,
    'none',
    'existing phone with correct password must close login'
);
assert.deepEqual(
    contractCalls.map((entry) => `${entry.phone}:${entry.password}`),
    ['0611111111:wrongpass', '0611111111:rightpass'],
    'existing-phone attempts must use bootstrap for bad and good passwords'
);
assert.deepEqual(forbiddenAuthCalls, [], 'existing-phone flow must not call auth.login or auth.create');

[
    'eve_user_dialog__name',
    'eve_user_dialog__first_name',
    'eve_user_dialog__phone',
    'eve_user_dialog__password',
    'eve_user_dialog__preferences',
    'eve_user_dialog__bio'
].forEach((id) => {
    assert.ok(document.getElementById(id), `${id} must exist`);
});

const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');
let failedLoginPayload = null;
const invalidSequence = createUserLoginSequence({
    onSubmit: async (payload) => {
        failedLoginPayload = payload;
        return { ok: false, errorText: 'Identifiant ou mot de passe incorrect' };
    },
    onWithoutAccount: async () => ({ ok: true }),
    documentRef: document
});
invalidSequence.open();
await activateButton(document.getElementById('eve_login_sequence__choice_authenticate'));
window.AdoleAPI.auth.requestPhoneVerification = async () => ({ ok: true, code: '5273' });
window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });
const invalidPhoneInput = document.getElementById('eve_login_sequence__phone_input');
invalidPhoneInput.value = '0699999999';
dispatchInput(invalidPhoneInput);
dispatchEnter(invalidPhoneInput);
await new Promise((resolve) => setTimeout(resolve, 0));
const invalidOtpInput = document.getElementById('eve_login_sequence__otp_input');
assert.equal(document.getElementById('eve_login_sequence__instruction')?.textContent, 'O.T.P: 5273', 'failed login test must expose the demo OTP');
invalidOtpInput.value = '5273';
dispatchInput(invalidOtpInput);
dispatchEnter(invalidOtpInput);
await new Promise((resolve) => setTimeout(resolve, 0));
const invalidPasswordInput = document.getElementById('eve_login_sequence__password_field__input');
invalidPasswordInput.value = 'badpass';
dispatchInput(invalidPasswordInput);
dispatchEnter(invalidPasswordInput);
await new Promise((resolve) => setTimeout(resolve, 0));
const invalidInstruction = document.getElementById('eve_login_sequence__instruction');
assert.equal(failedLoginPayload?.phone, '0699999999', 'failed login must submit the entered phone');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'flex', 'failed login must return to the first screen');
assert.equal(invalidInstruction?.textContent, 'Saisissez votre mot de passe', 'hidden credential surface keeps its last label without showing an error');
invalidSequence.destroy();

const spoken = [];
const heard = ['0612345678', 'oui', 'secret vocal', 'oui'];
window.Squirrel = window.Squirrel || {};
window.Squirrel.voice = {
    speak: async (text) => {
        spoken.push(String(text || ''));
        return { ok: true };
    },
    listen: async () => ({ text: heard.shift() || '' })
};
let submittedLogin = null;
const sequence = createUserLoginSequence({
    onSubmit: async (payload) => {
        submittedLogin = payload;
        return { ok: true };
    },
    onWithoutAccount: async () => ({ ok: true }),
    documentRef: document
});
sequence.open();
await activateButton(document.getElementById('eve_login_sequence__choice_authenticate'));
const sequenceCredentials = document.getElementById('eve_login_sequence__credentials');
window.AdoleAPI.auth.requestPhoneVerification = async () => ({ ok: true, code: '5273' });
window.AdoleAPI.auth.verifyPhoneVerification = async (_phone, code) => ({ ok: code === '5273' });
sequenceCredentials.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 720));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'O.T.P: 5273',
    'voice-confirmed phone must advance to OTP step'
);
const voiceOtpInput = document.getElementById('eve_login_sequence__otp_input');
voiceOtpInput.value = '5273';
dispatchInput(voiceOtpInput);
dispatchEnter(voiceOtpInput);
await new Promise((resolve) => setTimeout(resolve, 0));
sequenceCredentials.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 720));
assert.equal(submittedLogin?.phone, '0612345678', 'voice phone must be submitted through the login payload');
assert.equal(submittedLogin?.password, 'secret vocal', 'voice password must be submitted through the login payload');
assert.equal(
    spoken.some((entry) => entry.includes('secret vocal')),
    false,
    'voice password must not be spoken back in clear text'
);

console.log('user_panel_content_contract.test: PASS');
process.exit(0);
