import { getTauriInvoke } from '../../application/audio_runtime/runtime_audio_backend.js';

// The native voice engine (atome-audio-engine `voice`, todo/refonte_assistant_vocal.md §4): the
// host owns the microphone and the recognition; JavaScript sends the screen's phrases and eVe's
// speaking state, and receives events — speech_start, phrase { text, words }, unknown { reason },
// wake { score }, error { code }. Same commands on the Tauri desktop app and the iOS app.
const MODELS_ROOT = 'atome/src/assets/voice';
const POLL_MS = 80;

// `recording()`: the test mode (todo/refonte_assistant_vocal.md §18.7), sent with each read; while on,
// each closed turn is followed by { type: 'take', pcm, cuts }, the samples the engine scored.
export const createNativeVoiceEngine = ({ env = globalThis, onEvent, recording = () => false }) => {
    const invoke = getTauriInvoke(env);
    if (!invoke) throw new Error('voice_engine_native_unavailable');
    let timer = null, running = false, inputDb = null;

    const fail = (code) => { running = false; onEvent({ type: 'error', code }); };
    const poll = async () => {
        timer = null;
        if (!running) return;
        let read;
        try { read = await invoke('audio_voice_read', { record: recording() }); }
        catch (error) { fail(String(error?.message || error)); return; }
        if (!running) return;
        inputDb = read?.input_db ?? null;
        for (const event of read?.events || []) onEvent(event);
        for (const take of read?.takes || []) onEvent({ type: 'take', pcm: Float32Array.from(take.pcm), cuts: take.cuts });
        if (read?.overrun) onEvent({ type: 'error', code: 'voice_capture_overrun' });
        if (read?.active === false) { fail('voice_session_stopped'); return; }
        timer = env.setTimeout(poll, POLL_MS);
    };

    return Object.freeze({
        async start() {
            await invoke('audio_voice_start', { modelsRoot: MODELS_ROOT });
            running = true;
            void poll();
        },
        async stop() {
            running = false;
            if (timer !== null) env.clearTimeout(timer);
            timer = null;
            await invoke('audio_voice_stop', {});
        },
        // Phrases of the current screen, every word in the recognizer's vocabulary.
        setPhrases: phrases => invoke('audio_voice_set_phrases', { phrases }),
        setSpeaking: speaking => invoke('audio_voice_set_speaking', { speaking }),
        // 'conversation' (turns) or 'wake' (hung up: only « Ève, écoute-moi »).
        setListening: listening => invoke('audio_voice_set_listening', { listening }),
        setWakeVerifier: verifier => invoke('audio_voice_set_wake_verifier', { verifier }),
        inputDb: () => inputDb
    });
};
