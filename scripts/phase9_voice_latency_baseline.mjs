import fs from 'node:fs';
import path from 'node:path';

import { createVoiceService } from '../atome/src/squirrel/voice/service.js';

const OUTPUT_DIR = path.join(process.cwd(), 'tools', 'headless_output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase9_voice_latency_baseline.json');

// The browser recognizer, with Chrome's on-device availability: this Node host reaches no
// server, so the service listens offline and requires an on-device recognizer.
const createMockSpeechRecognition = () => class MockSpeechRecognition {
    static async available() {
        return 'available';
    }

    start() {
        setTimeout(() => this.onstart?.(), 5);
        setTimeout(() => this.onresult?.({
            resultIndex: 0,
            results: [[{ transcript: 'Lis le prochain mail' }]]
        }), 20);
    }
    stop() {
        setTimeout(() => this.onend?.(), 30);
    }
    abort() {
        setTimeout(() => this.onend?.(), 5);
    }
};

// The local ONNX voice synthesizes in a module Worker (local_tts_worker.js) that Node cannot
// load: this engine answers its protocol after 5 ms with a 35 ms phrase. The measure covers
// the service's route (worker request, transient asset, voice start, end, stop), not inference.
const SAMPLE_RATE = 22050;
class MockTtsWorker {
    postMessage(message) {
        setTimeout(() => this.onmessage?.({
            data: message.type === 'preload'
                ? { id: message.id, type: 'ready' }
                : { id: message.id, type: 'result', pcm: new Float32Array(Math.round(SAMPLE_RATE * 0.035)).fill(0.1), sampleRate: SAMPLE_RATE, phonemes: [] }
        }), 5);
    }
}

// The audio playback API the local voice plays through (`getAudioPlaybackAPI(env)`).
const audio = {
    async loadTransientAsset() {},
    async startVoice() {},
    async stopVoice() {},
    async releaseTransientAsset() {}
};

const env = {
    SpeechRecognition: createMockSpeechRecognition(),
    Worker: MockTtsWorker,
    __SQUIRREL_AUDIO_PLAYBACK_API__: audio,
    performance,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (callback, delay) => setInterval(callback, delay),
    clearInterval: (id) => clearInterval(id),
    requestAnimationFrame: (callback) => setTimeout(() => callback(performance.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
};

const voice = createVoiceService({ env });

const started = await voice.stt.start({
    locale: 'fr-FR'
});
await new Promise((resolve) => setTimeout(resolve, 40));
await voice.stt.stop(started.session_id);
const ttsStart = Date.now();
const speaking = await voice.tts.speak('Je lis le prochain mail.', {
    session_id: started.session_id
});
await speaking.promise;
const ttsPlaybackMs = Date.now() - ttsStart;
// The phrase played to its end; the interrupted one below must not stand for it.
const playedMetrics = { ...(voice.telemetry.snapshot(started.session_id)?.metrics || {}) };
const cancelling = await voice.tts.speak('Interruption test.', {
    session_id: started.session_id
});
await new Promise((resolve) => setTimeout(resolve, 10));
await voice.tts.stop(started.session_id, {
    reason: 'phase9_latency_probe'
});
await cancelling.promise.catch(() => null);

const snapshot = voice.telemetry.snapshot(started.session_id);
const targets = {
    stt_first_partial_ms_max: 150,
    stt_final_ms_max: 250,
    tts_playback_ms_max: 500,
    cancel_roundtrip_ms_max: 150
};
const measured = { ...(snapshot?.metrics || {}) };
measured.tts_playback_ms = Number(playedMetrics.tts_playback_ms || 0) || ttsPlaybackMs;
const report = {
    generated_at: new Date().toISOString(),
    targets,
    measured,
    passed: (
        Number(measured.stt_first_partial_ms || 0) <= targets.stt_first_partial_ms_max
        && Number(measured.stt_final_ms || 0) <= targets.stt_final_ms_max
        && Number(measured.tts_playback_ms || 0) <= targets.tts_playback_ms_max
        && Number(measured.cancel_roundtrip_ms || 0) <= targets.cancel_roundtrip_ms_max
    )
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
    process.exitCode = 1;
}
