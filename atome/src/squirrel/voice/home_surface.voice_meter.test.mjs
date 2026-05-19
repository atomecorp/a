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

let meterStartCalls = 0;
let meterStopCalls = 0;

const voiceApi = {
    async ensureReady() {
        return { providers: { stt: { selected: 'browser_web_speech' } } };
    },
    subscribe() {
        return () => {};
    },
    async createSession() {
        return { session_id: 'meter_session' };
    },
    async startListening() {
        return {
            session_id: 'meter_session',
            promise: new Promise(() => {})
        };
    },
    async stopListening() {
        return { ok: true };
    }
};

const host = window.document.getElementById('host');
const controller = await mountHomeVoiceSurface({
    env: window,
    host,
    voiceApi,
    voiceMeterFactory: () => ({
        async start() {
            meterStartCalls += 1;
            return true;
        },
        async stop() {
            meterStopCalls += 1;
            return true;
        }
    })
});

controller.activate();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(meterStartCalls, 1, 'home voice surface should start the meter when activated');
assert.equal(controller.getState().meterRunning, true, 'home voice surface should expose meter activity in state');

await controller.deactivate();

assert.equal(meterStopCalls, 1, 'home voice surface should stop the meter when deactivated');
assert.equal(controller.getState().meterRunning, false, 'home voice surface should clear meter activity after deactivation');

controller.destroy();

delete globalThis.window;
delete globalThis.document;
delete globalThis.localStorage;

console.log('voice_home_surface_voice_meter: ok');
