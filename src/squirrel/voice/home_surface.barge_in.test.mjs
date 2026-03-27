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
window.__EVE_VOICE_BARGE_ARM_DELAY_MS = 0;

let meterFrameHandler = null;
let sessionCounter = 0;
let listeningStarts = 0;
let speakingStops = 0;
const listeners = [];

const voiceApi = {
    async ensureReady() {
        return { ok: true, providers: { stt: { selected: 'tauri_plugin_stt' } } };
    },
    subscribe(listener) {
        listeners.push(listener);
        return () => {};
    },
    async createSession() {
        sessionCounter += 1;
        return { session_id: `barge_session_${sessionCounter}` };
    },
    async startListening() {
        listeningStarts += 1;
        return {
            session_id: `barge_session_${sessionCounter}`,
            promise: new Promise(() => {})
        };
    },
    async stopListening() {
        return { ok: true };
    },
    async stopSpeaking() {
        speakingStops += 1;
        listeners.forEach((listener) => listener({
            session_id: `barge_session_${sessionCounter}`,
            type: 'voice.tts.state',
            payload: { state: 'interrupted' }
        }));
        return { stopped: true };
    }
};

const host = window.document.getElementById('host');
const controller = await mountHomeVoiceSurface({
    env: window,
    host,
    voiceApi,
    voiceMeterFactory: ({ onFrame }) => {
        meterFrameHandler = onFrame;
        return {
            async start() {
                return true;
            },
            async stop() {
                return true;
            }
        };
    }
});

controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));

listeners.forEach((listener) => listener({
    session_id: 'barge_session_1',
    type: 'voice.cancel.requested',
    payload: { source: 'stt' }
}));

listeners.forEach((listener) => listener({
    session_id: 'barge_session_1',
    type: 'voice.processing.state',
    payload: { state: 'processing' }
}));

listeners.forEach((listener) => listener({
    session_id: 'barge_session_1',
    type: 'voice.tts.state',
    payload: { state: 'speaking' }
}));

assert.equal(typeof meterFrameHandler, 'function', 'home voice surface should expose the meter frame hook for barge-in detection');

const speechFrame = Float32Array.from([0.2, 0.18, 0.21, 0.19, 0.2, 0.22, 0.18, 0.2]);
meterFrameHandler(speechFrame);
meterFrameHandler(speechFrame);
meterFrameHandler(speechFrame);
meterFrameHandler(speechFrame);

await new Promise((resolve) => setTimeout(resolve, 100));

assert.equal(speakingStops, 1, 'home voice surface should stop current speech when a user barge-in is detected');
assert.equal(listeningStarts >= 2, true, 'home voice surface should restart listening after barge-in');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_barge_in: ok');
