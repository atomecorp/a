import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountHomeVoiceSurface } from './home_surface.js';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
    url: 'https://example.test/'
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;

let sessionCounter = 0;
const listeners = [];
const calls = {
    startListening: 0,
    stopListening: 0,
    executeUtterance: 0,
    stopSpeaking: 0
};

const voiceApi = {
    async ensureReady() {
        return { ok: true };
    },
    subscribe(listener) {
        listeners.push(listener);
        return () => {};
    },
    async createSession() {
        sessionCounter += 1;
        return { session_id: `eve_session_${sessionCounter}` };
    },
    async startListening() {
        calls.startListening += 1;
        if (calls.startListening > 1) {
            return {
                session_id: `eve_session_${sessionCounter}`,
                promise: new Promise(() => {})
            };
        }
        return {
            session_id: `eve_session_${sessionCounter}`,
            promise: Promise.resolve({ text: 'Lis mes mails' })
        };
    },
    async stopListening() {
        calls.stopListening += 1;
        return { ok: true };
    },
    async executeUtterance(text) {
        calls.executeUtterance += 1;
        return {
            ok: true,
            executed: true,
            spoken_reply: `Reponse pour: ${text}`
        };
    },
    async stopSpeaking() {
        calls.stopSpeaking += 1;
        return { stopped: true };
    }
};

const host = window.document.getElementById('host');
const controller = await mountHomeVoiceSurface({
    env: window,
    host,
    voiceApi
});

assert.ok(controller, 'home voice surface should mount a controller');
assert.ok(host.querySelector('[data-role="eve-voice-surface"]'), 'home voice surface should render into the host');

controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

const state = controller.getState();
assert.equal(calls.startListening >= 1, true, 'home voice surface should auto-start listening when activated');
assert.equal(calls.executeUtterance >= 1, true, 'home voice surface should execute the utterance after STT completes');
assert.equal(state.history.some((entry) => entry.role === 'user' && entry.text === 'Lis mes mails'), true, 'home voice surface should store the user question in history');
assert.equal(state.history.some((entry) => entry.role === 'assistant' && entry.text === 'Reponse pour: Lis mes mails'), true, 'home voice surface should store the assistant reply in history');

const action = host.querySelector('[data-role="eve-voice-action"]');
const input = host.querySelector('[data-role="eve-voice-input"]');
const send = host.querySelector('[data-role="eve-voice-send"]');
assert.equal(action.textContent, 'Stop', 'home voice surface should expose a stop control while listening');
input.value = 'Ouvre Mtrack';
send.click();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(calls.executeUtterance >= 2, true, 'home voice surface should allow manual text sends');

await controller.deactivate();
assert.equal(calls.stopSpeaking >= 1, true, 'home voice surface should stop speech on deactivate');

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface: ok');
