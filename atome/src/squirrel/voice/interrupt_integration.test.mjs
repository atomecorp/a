import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceService } from './service.js';

class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = 'fr-FR';
    }
}

class FakeSpeechSynthesis {
    constructor() {
        this.cancelled = false;
        this.queue = [];
    }

    speak(utterance) {
        this.cancelled = false;
        this.queue.push(utterance);
    }

    cancel() {
        this.cancelled = true;
        this.queue = [];
    }

    getVoices() {
        return [{ name: 'system-fr', voiceURI: 'system-fr' }];
    }
}

let tick = 0;
let seq = 0;
const synth = new FakeSpeechSynthesis();
const env = {
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    speechSynthesis: synth
};

const runtime = createVoiceSessionRuntime({
    now: () => {
        tick += 1;
        return tick;
    },
    idFactory: (prefix = 'voice') => {
        seq += 1;
        return `${prefix}_${seq}`;
    }
});

const voice = createVoiceService({
    env,
    sessionRuntime: runtime
});

const session = runtime.createSession({
    locale: 'fr-FR'
});

const processingRun = await voice.processing.run(
    session.session_id,
    ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
            reject(new Error(String(signal.reason || 'aborted')));
        }, { once: true });
        setTimeout(() => resolve({ status: 'unexpected_complete' }), 5000);
    }),
    { step: 'llm_generation' }
);

const speaking = await voice.tts.speak('Je lis un long message qui doit pouvoir etre coupe immediatement.', {
    session_id: session.session_id,
    voiceId: 'system-fr'
});

let snapshot = runtime.getSession(session.session_id);
assert.equal(snapshot.phase, 'speaking', 'integration flow should enter speaking before interruption');

const interrupted = await voice.interrupt(session.session_id, {
    utterance: 'ca suffit'
});
snapshot = runtime.getSession(session.session_id);
assert.equal(interrupted.matched, true, 'voice interruption should classify local stop commands');
assert.equal(synth.cancelled, true, 'voice interruption should cancel the live TTS backend immediately');
assert.equal(snapshot.phase, 'interrupted', 'voice interruption should move the session to interrupted immediately');

const stoppedSpeech = await speaking.promise;
assert.equal(stoppedSpeech.stopped, true, 'stopped speech should resolve without waiting for the original utterance to end');

const abortedProcessing = await processingRun.promise;
assert.equal(abortedProcessing.aborted, true, 'backend processing should be cancelled or truncated when voice interruption occurs');

const nextCommand = await voice.interrupt(session.session_id, {
    utterance: 'passe au suivant'
});
snapshot = runtime.getSession(session.session_id);
assert.equal(nextCommand.command, 'next', 'a new command should be accepted immediately after interruption');
assert.equal(snapshot.conversation.pending_followup, 'next_item', 'next should queue the followup action immediately');

const followup = voice.takePendingFollowup(session.session_id);
snapshot = runtime.getSession(session.session_id);
assert.equal(followup.followup, 'next_item', 'queued followups should be consumable right after interruption');
assert.equal(snapshot.phase, 'processing', 'consuming the next action should restart orchestration immediately');

const telemetry = voice.telemetry.snapshot(session.session_id);
assert.equal(telemetry.metrics.cancel_roundtrip_ms > 0, true, 'integration flow should record interruption latency');

console.log('voice_interrupt_integration: ok');
