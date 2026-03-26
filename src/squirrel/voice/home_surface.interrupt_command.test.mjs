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
window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {}
});

let sessionCounter = 0;
const listeners = [];
const pendingListenResolvers = [];
const calls = {
    startListening: [],
    stopListening: 0,
    interrupt: [],
    executeUtterance: 0,
    speak: []
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
        return { session_id: `interrupt_session_${sessionCounter}` };
    },
    async startListening(options = {}) {
        calls.startListening.push(options);
        listeners.forEach((listener) => listener({
            type: 'voice.stt.state',
            session_id: `interrupt_session_${sessionCounter}`,
            payload: { state: 'listening' }
        }));
        const promise = new Promise((resolve) => {
            pendingListenResolvers.push(resolve);
        });
        return {
            session_id: `interrupt_session_${sessionCounter}`,
            promise
        };
    },
    async stopListening() {
        calls.stopListening += 1;
        const resolve = pendingListenResolvers.shift();
        resolve?.({
            cancelled: true,
            reason: 'stopped',
            text: ''
        });
        return { ok: true };
    },
    async executeUtterance() {
        calls.executeUtterance += 1;
        return {
            ok: true,
            executed: true,
            spoken_reply: 'Réponse test'
        };
    },
    async interrupt(sessionId, options = {}) {
        calls.interrupt.push({ sessionId, options });
        listeners.forEach((listener) => listener({
            type: 'voice.cancel.requested',
            session_id: sessionId,
            payload: { source: 'tts' }
        }));
        listeners.forEach((listener) => listener({
            type: 'voice.tts.state',
            session_id: sessionId,
            payload: { state: 'interrupted' }
        }));
        return { matched: true, command: 'stop' };
    },
    async stopSpeaking() {
        return { stopped: true };
    },
    async speak(text) {
        calls.speak.push(text);
        return {
            text,
            promise: Promise.resolve({ text })
        };
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
await new Promise((resolve) => setTimeout(resolve, 0));

listeners.forEach((listener) => listener({
    type: 'voice.cancel.requested',
    session_id: 'interrupt_session_1',
    payload: { source: 'stt' }
}));

listeners.forEach((listener) => listener({
    type: 'voice.tts.state',
    session_id: 'interrupt_session_1',
    payload: { state: 'speaking' }
}));

await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(calls.startListening.length >= 2, true, 'home voice surface should open a restricted STT listener while the assistant is speaking');

listeners.forEach((listener) => listener({
    type: 'voice.stt.partial',
    session_id: 'interrupt_session_1',
    payload: { text: 'arrête' }
}));

await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(calls.interrupt.length, 1, 'home voice surface should route spoken stop commands to the interrupt API during TTS');
assert.equal(calls.interrupt[0]?.options?.utterance, 'arrête', 'home voice surface should preserve the spoken interrupt utterance');
assert.equal(calls.executeUtterance, 0, 'home voice surface should not send interrupt commands to the normal planner');
assert.equal(calls.startListening.length >= 3, true, 'home voice surface should resume the normal listening loop after the interruption');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_interrupt_command: ok');
