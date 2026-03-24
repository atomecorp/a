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

let startListeningCalls = 0;
let executeUtteranceCalls = 0;
const speaks = [];
let lastUtterance = '';

const voiceApi = {
    async ensureReady() {
        return {
            providers: {
                stt: { selected: 'tauri_plugin_stt' },
                tts: { selected: 'browser_speech_synthesis' }
            }
        };
    },
    subscribe() {
        return () => {};
    },
    async createSession() {
        return { session_id: 'text_only_session' };
    },
    async startListening() {
        startListeningCalls += 1;
        return {
            session_id: 'text_only_session',
            promise: Promise.resolve({ text: 'ceci ne doit pas arriver' })
        };
    },
    async executeUtterance(text) {
        executeUtteranceCalls += 1;
        lastUtterance = text;
        if (text === 'Nouveaux messages') {
            return {
                ok: true,
                executed: true,
                result: {
                    results: [
                        {
                            result: {
                                human_summary: 'Summarize mail'
                            }
                        }
                    ]
                }
            };
        }
        return {
            ok: true,
            executed: true,
            spoken_reply: `Reponse pour: ${text}`
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
    voiceApi,
    textOnly: true
});

await controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));

const input = host.querySelector('[data-role="eve-voice-input"]');
const send = host.querySelector('[data-role="eve-voice-send"]');
input.value = 'Lis mes mails';
send.click();
await new Promise((resolve) => setTimeout(resolve, 0));

const state = controller.getState();
assert.equal(startListeningCalls, 0, 'text-only mode should never start microphone listening');
assert.equal(executeUtteranceCalls, 1, 'text-only mode should still execute typed utterances');
assert.equal(
    speaks[0],
    'Salut Jean-Eric, ecris-moi ce que tu veux et je te repondrai a voix haute.',
    'text-only mode should announce typed interaction mode on activation'
);
assert.equal(
    state.history.some((entry) => entry.role === 'assistant' && entry.text === 'Reponse pour: Lis mes mails'),
    true,
    'text-only mode should keep assistant responses in history'
);
input.value = 'Nouveaux messages';
send.click();
await new Promise((resolve) => setTimeout(resolve, 0));
const updatedState = controller.getState();

assert.equal(lastUtterance, 'Nouveaux messages', 'text-only mode should execute the second typed utterance');
assert.equal(
    updatedState.history.some((entry) => entry.role === 'assistant' && entry.text === 'Summarize mail'),
    false,
    'text-only mode should never leak internal tool summaries into assistant history'
);
assert.equal(
    updatedState.history.some((entry) => entry.role === 'assistant' && entry.text === 'C est fait.'),
    true,
    'text-only mode should fall back to a localized neutral completion when no user-facing reply is provided'
);
assert.equal(state.textOnly, true, 'controller state should expose text-only mode');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_text_only: ok');
