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
let executeUtteranceCalls = 0;
let executeFollowupCalls = 0;
const speaks = [];

const voiceApi = {
    async ensureReady() {
        return { ok: true };
    },
    subscribe() {
        return () => {};
    },
    async createSession() {
        sessionCounter += 1;
        return { session_id: `followup_session_${sessionCounter}` };
    },
    async getSession() {
        return {
            conversation: {
                pending_followup: 'resume_interrupted',
                resume_available: false,
                active_intent: {
                    intent_id: 'intent_followup_resume',
                    domain: 'mail',
                    action: 'summarize',
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: []
                    }
                }
            }
        };
    },
    async startListening() {
        startListeningCalls += 1;
        if (startListeningCalls === 1) {
            return {
                session_id: `followup_session_${sessionCounter}`,
                promise: Promise.resolve({ text: 'oui' })
            };
        }
        return {
            session_id: `followup_session_${sessionCounter}`,
            promise: new Promise(() => {})
        };
    },
    async executeUtterance() {
        executeUtteranceCalls += 1;
        return {
            ok: true,
            executed: true,
            spoken_reply: 'Cette route ne devrait pas etre appelee.'
        };
    },
    async executeFollowup() {
        executeFollowupCalls += 1;
        return {
            ok: true,
            executed: true,
            spoken_reply: 'Je continue le resume de tes mails.'
        };
    },
    async speak(text) {
        speaks.push(text);
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
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

const state = controller.getState();
assert.equal(executeFollowupCalls, 1, 'home voice surface should route a short affirmative answer to the pending followup');
assert.equal(executeUtteranceCalls, 0, 'home voice surface should not treat a pending yes/no answer as a fresh utterance');
assert.equal(state.history.some((entry) => entry.role === 'user' && entry.text === 'oui'), true, 'home voice surface should store the decision utterance in history');
assert.equal(state.history.some((entry) => entry.role === 'assistant' && entry.text === 'Je continue le resume de tes mails.'), true, 'home voice surface should store the followup response in history');
assert.equal(speaks[0], 'Salut, que veux-tu ?', 'home voice surface should still announce readiness before handling the followup');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_followup_decision: ok');
