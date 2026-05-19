import fs from 'node:fs';
import path from 'node:path';

import { createVoiceService } from '../atome/src/squirrel/voice/service.js';

const OUTPUT_DIR = path.join(process.cwd(), 'tools', 'headless_output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'phase9_voice_latency_baseline.json');

const createMockSpeechRecognition = () => class MockSpeechRecognition {
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

const synth = {
    speak(utterance) {
        setTimeout(() => utterance.onstart?.(), 5);
        setTimeout(() => utterance.onend?.(), 35);
    },
    cancel() {}
};

const env = {
    SpeechRecognition: createMockSpeechRecognition(),
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class SpeechSynthesisUtterance {
        constructor(text) {
            this.text = text;
            this.voice = null;
        }
    }
};

const voice = createVoiceService({
    env,
    now: () => Date.now()
});

const started = await voice.stt.start({
    locale: 'fr-FR'
});
await new Promise((resolve) => setTimeout(resolve, 40));
await voice.stt.stop(started.session_id);
const ttsStart = Date.now();
const speaking = await voice.tts.speak('Je lis le prochain mail.', {
    session_id: started.session_id,
    voiceId: 'system-fr'
});
await speaking.promise;
const ttsPlaybackMs = Date.now() - ttsStart;
const cancelling = await voice.tts.speak('Interruption test.', {
    session_id: started.session_id,
    voiceId: 'system-fr'
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
const measured = snapshot?.metrics || {};
measured.tts_playback_ms = Number(measured.tts_playback_ms || 0) || ttsPlaybackMs;
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
