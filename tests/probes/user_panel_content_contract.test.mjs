import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

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

const authOpen = await window.open_home_panel({ source: { type: 'user_panel_contract.auth' } });
assert.equal(authOpen.ok, true, 'auth panel open must succeed');
assert.equal(authOpen.panel_id, 'eve_login_sequence', 'anonymous state must open login sequence');

const loginSequence = document.getElementById('eve_login_sequence');
assert.equal(loginSequence?.style?.display, 'block', 'login sequence must be visible');
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Entrez votre téléphone',
    'login sequence must start on the phone step'
);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    document.activeElement?.id,
    'eve_login_sequence__phone_input',
    'phone input must receive initial focus'
);
const logoButton = document.getElementById('eve_login_sequence__logo');
assert.equal(logoButton?.style?.background, 'transparent', 'login validation logo must not render a square background');
assert.equal(logoButton?.style?.border, '0px', 'login validation logo must not render a rounded square border');
assert.equal(logoButton?.style?.boxShadow, 'none', 'login validation logo must not render a panel shadow');
assert.equal(logoButton?.style?.position, 'fixed', 'login validation logo must stay pinned to the page bottom');
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
window.AdoleAPI.auth.current = async () => createdSession
    ? { logged: true, user: { id: createdSession.id, user_id: createdSession.id, username: createdSession.username, phone: createdSession.phone } }
    : { logged: false, user: null };
window.AdoleAPI.auth.getCurrentInfo = () => createdSession ? { id: createdSession.id } : null;
window.AdoleAPI.security.isAuthenticated = () => !!createdSession;
window.AdoleAPI.security.isAnonymous = () => false;

const dispatchInput = (node) => node.dispatchEvent(new window.Event('input', { bubbles: true }));
const dispatchEnter = (node) => node.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

const sequencePhoneInput = document.getElementById('eve_login_sequence__phone_input');
sequencePhoneInput.value = '0612345678';
dispatchInput(sequencePhoneInput);
dispatchEnter(sequencePhoneInput);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Entrez votre mot de passe',
    'validated phone must advance to password entry'
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
assert.ok(userBody?.children?.length > 0, 'user dialog body must contain profile fields');
assert.ok(userActions, 'user dialog actions row must exist');
assert.equal(userBody?.contains(userActions), true, 'user dialog actions must live in the scrollable body');
assert.equal(userFooter?.contains(userActions) || false, false, 'user dialog footer must not contain actions');
assert.equal(userActions?.previousElementSibling, preferences, 'user dialog actions must be directly below preferences');
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
    documentRef: document
});
invalidSequence.open();
const invalidPhoneInput = document.getElementById('eve_login_sequence__phone_input');
invalidPhoneInput.value = '0699999999';
dispatchInput(invalidPhoneInput);
dispatchEnter(invalidPhoneInput);
await new Promise((resolve) => setTimeout(resolve, 0));
const invalidPasswordInput = document.getElementById('eve_login_sequence__password_field__input');
invalidPasswordInput.value = 'badpass';
dispatchInput(invalidPasswordInput);
dispatchEnter(invalidPasswordInput);
await new Promise((resolve) => setTimeout(resolve, 0));
const invalidInstruction = document.getElementById('eve_login_sequence__instruction');
const invalidNotice = document.getElementById('eve_login_sequence__notice');
assert.equal(failedLoginPayload?.phone, '0699999999', 'failed login must submit the entered phone');
assert.equal(invalidInstruction?.textContent, 'Entrez votre téléphone', 'failed login must return to phone entry immediately');
assert.equal(document.activeElement?.id, 'eve_login_sequence__phone_input', 'failed login must focus phone entry');
assert.equal(invalidNotice?.textContent, 'Identifiant ou mot de passe incorrect', 'failed login must keep the generic auth message visible');
assert.equal(invalidNotice?.style?.fontSize, invalidInstruction?.style?.fontSize, 'invalid auth message must use instruction font size');
assert.equal(invalidNotice?.style?.lineHeight, invalidInstruction?.style?.lineHeight, 'invalid auth message must use instruction line height');
assert.equal(invalidNotice?.style?.fontWeight, invalidInstruction?.style?.fontWeight, 'invalid auth message must use instruction font weight');
invalidPhoneInput.value = '0';
dispatchInput(invalidPhoneInput);
assert.equal(invalidNotice?.textContent, '', 'invalid auth message must clear when phone entry starts');
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
    documentRef: document
});
sequence.open();
const sequenceRoot = document.getElementById('eve_login_sequence');
sequenceRoot.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 720));
assert.equal(
    document.getElementById('eve_login_sequence__instruction')?.textContent,
    'Entrez votre mot de passe',
    'voice-confirmed phone must advance to password step'
);
sequenceRoot.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
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
