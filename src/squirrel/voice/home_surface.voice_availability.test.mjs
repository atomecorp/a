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

const voiceApi = {
    async ensureReady() {
        return {
            providers: {
                stt: { selected: 'unsupported' }
            }
        };
    },
    subscribe() {
        return () => {};
    },
    async createSession() {
        return { session_id: 'unavailable_session' };
    },
    async startListening() {
        throw new Error('Voice stt backend is not available');
    }
};

const host = window.document.getElementById('host');
const controller = await mountHomeVoiceSurface({
    env: window,
    host,
    voiceApi,
    voiceMeterFactory: () => ({
        async start() {
            return true;
        },
        async stop() {
            return true;
        }
    })
});

const notice = host.querySelector('[data-role="eve-voice-notice"]');
assert.equal(
    notice.textContent.includes('reconnaissance vocale') || notice.textContent.includes('Voice recognition'),
    true,
    'home voice surface should surface an unavailable STT backend'
);

controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(
    controller.getState().errorMessage.includes('reconnaissance vocale') || controller.getState().errorMessage.includes('Voice recognition'),
    true,
    'home voice surface should keep a visible STT failure message after a failed listen start'
);
assert.equal(
    controller.getState().errorMessage.includes('continuer par écrit') || controller.getState().errorMessage.includes('continue by typing'),
    true,
    'home voice surface should propose a typed fallback path when voice recognition fails'
);

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_voice_availability: ok');
