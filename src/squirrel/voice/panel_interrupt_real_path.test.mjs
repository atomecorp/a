import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createGlobalVoiceApi } from './bootstrap.js';
import { mountVoicePanel } from './panel.js';

class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = 'fr-FR';
    }
}

class FakeSpeechSynthesis {
    constructor(env) {
        this.env = env;
        this.cancelled = false;
        this.current = null;
        this.timer = null;
    }

    speak(utterance) {
        this.cancelled = false;
        this.current = utterance;
        this.timer = this.env.setTimeout(() => {
            const current = this.current;
            this.current = null;
            this.timer = null;
            current?.onend?.();
        }, 10000);
    }

    cancel() {
        this.cancelled = true;
        if (this.timer) {
            this.env.clearTimeout(this.timer);
            this.timer = null;
        }
        const current = this.current;
        this.current = null;
        this.env.setTimeout(() => {
            current?.onend?.();
        }, 0);
    }

    getVoices() {
        return [{ name: 'system-fr', voiceURI: 'system-fr' }];
    }
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.test/?voicepanel=1'
});

const { window } = dom;
window.console = {
    warn() {},
    log() {},
    error() {}
};
window.SpeechSynthesisUtterance = FakeSpeechSynthesisUtterance;
window.speechSynthesis = new FakeSpeechSynthesis(window);

createGlobalVoiceApi({
    env: window,
    importModule: async () => ({})
});

const controller = await mountVoicePanel({
    env: window,
    force: true
});

assert.ok(controller, 'voice real-path panel should mount');

const flush = async (ms = 0) => new Promise((resolve) => window.setTimeout(resolve, ms));
const waitFor = async (predicate, timeoutMs = 1000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await predicate();
        if (value) return value;
        await flush(10);
    }
    throw new Error('waitFor timeout');
};

const launcher = window.document.getElementById('squirrel-voice-launcher');
const panel = window.document.getElementById('squirrel-voice-panel');
launcher.click();
await flush();

const buttons = Array.from(panel.querySelectorAll('button'));
const newButton = buttons.find((node) => node.textContent === 'New');
const stopButton = buttons.find((node) => node.textContent === 'Stop');
const commandButton = buttons.find((node) => node.textContent === 'Send Cmd');
const probeButton = buttons.find((node) => node.textContent === 'Probe');

newButton.click();
await flush();

probeButton.click();
await flush();

const sessionId = await waitFor(() => controller.getState().currentSessionId);
await waitFor(async () => {
    const snapshot = await window.Squirrel.voice.getSession(sessionId);
    return snapshot.phase === 'speaking';
});

stopButton.click();
await waitFor(() => {
    const probe = controller.getState().probe;
    return probe.speech_stopped === true && probe.processing_aborted === true;
});

let snapshot = await window.Squirrel.voice.getSession(sessionId);
assert.equal(snapshot.phase, 'interrupted', 'real panel path should move the session to interrupted when stop is pressed');
assert.equal(window.speechSynthesis.cancelled, true, 'real panel path should cancel live speech synthesis immediately');

const commandInput = panel.querySelector('[data-test-id="voice-panel-command-input"]');
commandInput.value = 'passe au suivant';
commandButton.click();

await waitFor(() => controller.getState().probe.new_command_accepted === true);
snapshot = await window.Squirrel.voice.getSession(sessionId);
assert.equal(snapshot.conversation.pending_followup, 'next_item', 'real panel path should accept the next command immediately after interruption');

const probeLine = panel.querySelector('[data-test-id="voice-panel-probe"]');
assert.match(probeLine.textContent, /probe: validated/, 'voice panel should expose a validated probe verdict after stop + next');

const telemetry = window.Squirrel.voice.telemetry.snapshot(sessionId);
assert.equal(telemetry.metrics.cancel_roundtrip_ms > 0, true, 'real panel path should record interruption latency through the shared telemetry');

controller.destroy();

console.log('voice_panel_interrupt_real_path: ok');
