import { createWakeCapture } from './wake_capture.js';
import { createWakeDetectorBackend } from './wake_detector.js';

// The voice engine in a plain browser (todo/refonte_assistant_vocal.md §4.2), with the API and the
// events of native_voice_engine.js: the capture is the page's microphone (wake_capture.js), the
// listening path runs in browser_voice_worker.js (Silero + the turn logic shared with the native
// engine), the recognizer is Vosk compiled to WebAssembly (vosk-browser) on the same model, and
// hung up the wake phrase is the existing openWakeWord detector (wake_detector.js).
const VOSK_URL = '/src/assets/vendor/vosk-browser/vosk.js';
const MODEL_URL = '/src/assets/voice/vosk/vosk-model-small-fr-0.22.tar.gz';
const FINAL_RESULT_QUIET_MS = 30;
const UNKNOWN = '[unk]';

export const createBrowserVoiceEngine = ({ env = globalThis, onEvent,
    workerFactory = () => new env.Worker(new URL('./browser_voice_worker.js', import.meta.url), { type: 'module' }),
    wakeBackend = createWakeDetectorBackend({ env }) }) => {
    let model = null, worker = null, capture = null, wake = null, phrases = null, recognizer = null, inputDb = null;

    // A turn's recognizer: fed while the person speaks, read once its final result has arrived.
    const openTurn = () => {
        if (!phrases) throw new Error('voice_phrases_missing');
        const words = [];
        const current = { asked: false, timer: null, done: null };
        const instance = new model.KaldiRecognizer(16000, JSON.stringify([...phrases, UNKNOWN]));
        instance.setWords(true);
        instance.on('result', (message) => {
            words.push(...(message.result.result || []).map(word => ({ word: word.word, conf: word.conf })));
            if (current.asked) { env.clearTimeout(current.timer); current.timer = env.setTimeout(current.done, FINAL_RESULT_QUIET_MS); }
        });
        current.feed = pcm => instance.acceptWaveformFloat(Float32Array.from(pcm, sample => sample / 32768), 16000);
        current.finish = () => new Promise((resolve) => {
            current.done = () => { instance.remove(); resolve(words); };
            current.asked = true;
            instance.retrieveFinalResult();
        });
        return current;
    };

    const close = async (end) => {
        const turn = recognizer;
        recognizer = null;
        if (!turn) return;
        const words = await turn.finish();
        if (end === 'too_long') { onEvent({ type: 'unknown', reason: 'too_long' }); return; }
        const text = words.filter(word => word.word !== UNKNOWN).map(word => word.word).join(' ');
        onEvent(text ? { type: 'phrase', text, words } : { type: 'unknown', reason: 'outside_grammar' });
    };

    const onWorker = ({ data }) => {
        if (data.type === 'error') { onEvent({ type: 'error', code: data.code }); return; }
        if (data.type !== 'actions') return;
        inputDb = data.inputDb;
        for (const action of data.actions) {
            if (action.type === 'speech_start') { recognizer = openTurn(); onEvent({ type: 'speech_start' }); }
            else if (action.type === 'feed') recognizer?.feed(action.pcm);
            else if (action.type === 'close') void close(action.end);
        }
    };

    const startCapture = async () => {
        capture = createWakeCapture({ env, onFrame: samples => worker.postMessage({ type: 'frame', samples }, [samples.buffer]),
            onError: error => onEvent({ type: 'error', code: error.message }) });
        await capture.start();
    };

    const stopWake = async () => { const current = wake; wake = null; await current?.close(); };

    return Object.freeze({
        async start() {
            if (!env.Vosk) await import(VOSK_URL);
            model = await env.Vosk.createModel(MODEL_URL, -1); // -1: no Kaldi logs in the console
            worker = workerFactory();
            await new Promise((resolve, reject) => {
                worker.onmessage = ({ data }) => { if (data.type === 'ready') resolve(); else if (data.type === 'error') reject(new Error(data.code)); };
                worker.postMessage({ type: 'init' });
            });
            worker.onmessage = onWorker;
            await startCapture();
        },
        async stop() {
            await capture?.close(); capture = null;
            await stopWake();
            worker?.terminate(); worker = null;
            model?.terminate(); model = null;
            recognizer = null;
        },
        // The recognizer cannot list its vocabulary here: the phrases are those the native engine
        // checks against the same model (voice_words_out_of_vocabulary).
        async setPhrases(next) { phrases = [...next]; },
        async setSpeaking(speaking) { worker.postMessage({ type: 'speaking', speaking }); },
        async setListening(listening) {
            if (listening === 'wake') {
                await capture?.close(); capture = null;
                worker.postMessage({ type: 'reset' });
                recognizer = null;
                wake = await wakeBackend.create({ onDetection: score => onEvent({ type: 'wake', score }), onError: error => onEvent({ type: 'error', code: error.message }) });
                await wake.start();
            } else if (listening === 'conversation') {
                await stopWake();
                if (!capture) await startCapture();
            } else throw new Error(`voice_listening_invalid:${listening}`);
        },
        // The browser wake detector reads the user's verifier from the vault itself (wake_detector.js).
        async setWakeVerifier() {},
        inputDb: () => inputDb
    });
};
