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
window.__EVE_VOICE_ECHO_COOLDOWN_MS = 0;
window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {}
});

let sessionCounter = 0;
let startListeningCalls = 0;
let executeCalls = 0;

const voiceApi = {
    async ensureReady() {
        return { ok: true };
    },
    subscribe() {
        return () => {};
    },
    async createSession() {
        sessionCounter += 1;
        return { session_id: `fragment_session_${sessionCounter}` };
    },
    async startListening() {
        startListeningCalls += 1;
        if (startListeningCalls === 1) {
            return {
                session_id: `fragment_session_${sessionCounter}`,
                promise: Promise.resolve({ text: 'tout' })
            };
        }
        if (startListeningCalls === 2) {
            return {
                session_id: `fragment_session_${sessionCounter}`,
                promise: Promise.resolve({ text: 'mes mails' })
            };
        }
        return {
            session_id: `fragment_session_${sessionCounter}`,
            promise: new Promise(() => {})
        };
    },
    async executeUtterance(text) {
        executeCalls += 1;
        return {
            ok: true,
            executed: true,
            spoken_reply: `Reponse pour: ${text}`
        };
    },
    async stopSpeaking() {
        return { stopped: true };
    }
};

const host = window.document.getElementById('host');
const controller = await mountHomeVoiceSurface({
    env: window,
    host,
    voiceApi
});

controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

const state = controller.getState();
assert.equal(executeCalls, 1, 'home voice surface should not execute the first low-information fragment');
assert.equal(state.history.some((entry) => entry.role === 'user' && entry.text === 'tout mes mails'), true, 'home voice surface should merge a low-information fragment with the following utterance');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_fragment_buffer: ok');
