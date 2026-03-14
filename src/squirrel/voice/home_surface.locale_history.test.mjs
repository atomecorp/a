import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountHomeVoiceSurface } from './home_surface.js';
import { setEveLocale } from '../../application/eVe/i18n/i18n.js';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'https://example.test/'
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;

window.localStorage.setItem('eve_voice_history_v1', JSON.stringify([
    { role: 'user', text: 'Hello eVe', ts: 1 },
    { role: 'assistant', text: 'Hello back', ts: 2 }
]));

const voiceApi = {
    async ensureReady() {
        return { ok: true };
    },
    subscribe() {
        return () => {};
    },
    async createSession() {
        return { session_id: 'history_session' };
    }
};

const host = window.document.getElementById('host');
const controller = await mountHomeVoiceSurface({
    env: window,
    host,
    voiceApi
});

const historyBefore = controller.getState().history;
assert.equal(historyBefore.length, 2, 'home voice surface should restore stored history');
assert.equal(host.textContent.includes('Hello eVe'), true, 'home voice surface should render stored history entries');

setEveLocale('en-US');
window.document.documentElement.lang = 'en-US';
controller.refreshLabels();

const sendButton = host.querySelector('[data-role="eve-voice-send"]');
const transcript = host.querySelector('[data-role="eve-voice-transcript"]');
assert.equal(sendButton.textContent, 'Send', 'home voice surface should refresh visible labels on locale changes');
assert.equal(transcript.textContent, '', 'empty transcript line should stay clean after a locale refresh');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_locale_history: ok');
