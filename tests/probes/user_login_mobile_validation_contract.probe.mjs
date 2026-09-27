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

let cancelCount = 0;
window.AdoleAPI.auth.cancelPhoneLogin = async () => { cancelCount += 1; return { ok: true }; };
const { createUserLoginSequence } = await import('../../eVe/intuition/tools/user_login_sequence.js');

const waitFor = async (predicate, timeout = 1500) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('condition_not_reached');
};
const click = node => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const key = (node, value) => node.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));

let releaseSend;
let submittedPhone = null;
const sequence = createUserLoginSequence({
    onSubmit: async ({ phone }) => {
        submittedPhone = phone;
        await new Promise(resolve => { releaseSend = resolve; });
        return { ok: true };
    },
    onWithoutAccount: async () => ({ ok: true })
});
sequence.open();
click(document.getElementById('eve_login_sequence__choice_authenticate'));
await waitFor(() => document.getElementById('eve_login_sequence__credentials')?.style.display === 'block');

const input = document.getElementById('eve_login_sequence__phone_input');
const instruction = document.getElementById('eve_login_sequence__instruction');
const mirrored = document.getElementById('eve_login_sequence__typed_value');
assert.equal(input.getAttribute('enterkeyhint'), 'send', 'mobile keyboard must expose a send action');
input.value = '06 12 34 56 78';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
key(input, 'Enter');
await waitFor(() => submittedPhone !== null);
assert.equal(submittedPhone, '+33612345678', 'Enter must normalize and submit a French local number');
assert.equal(input.disabled, true, 'the field must lock while the SMS request is in flight');
assert.match(instruction.textContent, /Envoi du SMS/i, 'the UI must acknowledge the send immediately');

releaseSend();
await waitFor(() => /SMS envoyé/i.test(instruction.textContent));
assert.equal(input.value, '', 'the native input must be cleared after provider acceptance');
assert.equal(mirrored.textContent, '', 'the mirrored number must disappear in the waiting state');
assert.match(instruction.textContent, /lien reçu/i, 'the waiting state must tell the user to open the SMS link');

await new Promise(resolve => setTimeout(resolve, 380));
click(document.getElementById('eve_login_sequence__persistent_logo'));
await waitFor(() => cancelCount === 1);
assert.equal(input.disabled, false, 'changing the number must restore phone entry');
assert.doesNotMatch(instruction.textContent, /SMS envoyé/i, 'changing the number must leave the waiting state');

sequence.destroy();
console.log('user login mobile phone-link contract: ok');
