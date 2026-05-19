import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountVoicePanel } from './panel.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.test/?voicepanel=1'
});

const { window } = dom;
const events = [];
let createdSessionCount = 0;

const runtime = {
    session: {
        session_id: 'voice_session_panel_1',
        phase: 'created',
        conversation: { pending_followup: null },
        transcript: { partial: null, final: null }
    },
    subscribe(listener) {
        events.push(listener);
        return () => {};
    },
    async getSession() {
        return this.session;
    },
    async listSessions() {
        return [this.session];
    }
};

const calls = {
    speak: 0,
    startListening: 0,
    stopSpeaking: 0,
    startCapture: 0,
    interrupt: 0,
    followup: 0,
    planIntent: 0
};

const voiceApi = {
    providers: {
        stt: { selected: 'browser_web_speech' },
        tts: { selected: 'browser_speech_synthesis' },
        capture: { selected: 'native_audio_recorder' }
    },
    runtime,
    async ensureReady() {
        return { providers: this.providers, runtime };
    },
    subscribe(listener) {
        return runtime.subscribe(listener);
    },
    async createSession() {
        createdSessionCount += 1;
        return runtime.session;
    },
    async getSession() {
        return runtime.session;
    },
    async startListening() {
        calls.startListening += 1;
        runtime.session.phase = 'listening';
        return { session_id: runtime.session.session_id, promise: Promise.resolve({ text: 'bonjour' }) };
    },
    async stopListening() {
        runtime.session.phase = 'processing';
        return { session_id: runtime.session.session_id };
    },
    async speak() {
        calls.speak += 1;
        runtime.session.phase = 'speaking';
        return { session_id: runtime.session.session_id, promise: Promise.resolve({ ok: true }) };
    },
    async stopSpeaking() {
        calls.stopSpeaking += 1;
        runtime.session.phase = 'interrupted';
        return { session_id: runtime.session.session_id, stopped: true };
    },
    async startCapture() {
        calls.startCapture += 1;
        runtime.session.phase = 'capturing';
        return { session_id: runtime.session.session_id };
    },
    async stopCapture() {
        runtime.session.phase = 'captured';
        return { session_id: runtime.session.session_id };
    },
    async interrupt(_sessionId, { utterance } = {}) {
        calls.interrupt += 1;
        runtime.session.phase = 'interrupted';
        runtime.session.conversation.pending_followup = utterance === 'passe au suivant' ? 'next_item' : null;
        return { matched: true, command: utterance };
    },
    async takePendingFollowup() {
        calls.followup += 1;
        runtime.session.conversation.pending_followup = null;
        runtime.session.phase = 'processing';
        return { followup: 'next_item' };
    },
    async planUtterance(utterance) {
        calls.planIntent += 1;
        if (String(utterance).includes('truc flou')) {
            return {
                status: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                utterance: {
                    raw: utterance,
                    normalized: 'truc flou'
                }
            };
        }
        return {
            status: 'ready',
            domain: 'media',
            action: 'open_mtrack',
            utterance: {
                raw: utterance,
                normalized: 'ouvre mtrack'
            }
        };
    },
    async runProcessing() {
        return { session_id: runtime.session.session_id, promise: Promise.resolve({ ok: true }) };
    }
};

const controller = await mountVoicePanel({
    env: window,
    voiceApi,
    force: true
});

assert.ok(controller, 'voice panel should mount a controller');
const launcher = window.document.getElementById('squirrel-voice-launcher');
const panel = window.document.getElementById('squirrel-voice-panel');
assert.ok(launcher, 'voice launcher should be rendered');
assert.ok(panel, 'voice panel should be rendered');
assert.equal(panel.style.display, 'none', 'voice panel should start collapsed');

launcher.click();
assert.equal(panel.style.display, 'flex', 'launcher should open the voice panel');

const buttons = Array.from(panel.querySelectorAll('button'));
const newButton = buttons.find((node) => node.textContent === 'New');
const speakButton = buttons.find((node) => node.textContent === 'Speak');
const stopButton = buttons.find((node) => node.textContent === 'Stop');
const commandButton = buttons.find((node) => node.textContent === 'Send Cmd');
const followupButton = buttons.find((node) => node.textContent === 'Followup');
const intentButton = buttons.find((node) => node.textContent === 'Intent');

newButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(createdSessionCount, 1, 'voice panel should create a session on demand');

speakButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.speak, 1, 'voice panel should call the global speak API');

stopButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.stopSpeaking, 1, 'voice panel should call the global stopSpeaking API');

const commandInput = panel.querySelector('[data-test-id="voice-panel-command-input"]');
commandInput.value = 'passe au suivant';
commandButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.interrupt, 1, 'voice panel should route local commands through the global interrupt API');

followupButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.followup, 1, 'voice panel should consume queued followups through the global API');

const input = panel.querySelector('[data-test-id="voice-panel-input"]');
input.value = 'truc flou';
intentButton.click();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.planIntent, 1, 'voice panel should plan utterances through the global API when the intent button is used');
assert.match(
    panel.querySelector('[data-test-id="voice-panel-fallback"]').textContent,
    /Intent ambigu/,
    'voice panel should expose a fallback UI when intent planning is ambiguous'
);

events[0]?.({
    session_id: runtime.session.session_id,
    type: 'voice.stt.final',
    payload: { text: 'transcript panel test' }
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
    panel.querySelector('[data-test-id="voice-panel-transcript"]').textContent,
    'transcript panel test',
    'voice panel should reflect runtime transcript events'
);

controller.destroy();
assert.equal(window.document.getElementById('squirrel-voice-panel'), null, 'voice panel controller should clean up the panel');

console.log('voice_panel: ok');
