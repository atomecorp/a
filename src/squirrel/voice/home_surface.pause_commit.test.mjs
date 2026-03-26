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
window.__currentUser = { name: 'Jean-Eric' };
window.__EVE_VOICE_FAST_COMMIT_MS = 10;
window.__EVE_VOICE_PAUSE_COMMIT_MS = 20;
window.__EVE_VOICE_FORCE_COMMIT_MS = 40;
window.__EVE_VOICE_STT_SILENCE_MS = 1000;
window.__EVE_VOICE_STT_FINAL_SILENCE_MS = 200;
window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {}
});

const listeners = [];
let currentResolve = null;
const calls = {
    startListening: 0,
    stopListening: [],
    executeUtterance: []
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
        return { session_id: 'pause_commit_session' };
    },
    async startListening() {
        calls.startListening += 1;
        listeners.forEach((listener) => listener({
            type: 'voice.stt.state',
            session_id: 'pause_commit_session',
            payload: { state: 'listening' }
        }));
        return {
            session_id: 'pause_commit_session',
            promise: new Promise((resolve) => {
                currentResolve = resolve;
            })
        };
    },
    async stopListening(sessionId, options = {}) {
        calls.stopListening.push(options);
        currentResolve?.(
            options?.commitPartial === true
                ? { text: 'Lis mes mails', cancelled: false, reason: 'commit' }
                : { text: '', cancelled: true, reason: 'manual' }
        );
        currentResolve = null;
        return { session_id: sessionId, ok: true };
    },
    async executeUtterance(text) {
        calls.executeUtterance.push(text);
        return {
            ok: true,
            executed: true,
            spoken_reply: `Réponse pour: ${text}`
        };
    },
    async speak(text) {
        return {
            text,
            promise: Promise.resolve({ text })
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

await controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));

listeners.forEach((listener) => listener({
    type: 'voice.stt.partial',
    session_id: 'pause_commit_session',
    payload: { text: 'Lis mes mails' }
}));

await new Promise((resolve) => setTimeout(resolve, 80));

assert.equal(calls.startListening >= 1, true, 'pause commit flow should start listening');
assert.equal(calls.stopListening.some((entry) => entry?.commitPartial === true), true, 'pause commit flow should stop listening with partial commit enabled');
assert.equal(calls.executeUtterance.includes('Lis mes mails'), true, 'pause commit flow should execute the committed utterance');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_pause_commit: ok');
