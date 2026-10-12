import * as ort from '../../assets/vendor/onnxruntime-web/ort.wasm.min.mjs';
import { createWakeFeatureStream } from './wake_features.js';
import { deserializeWakeClassifier, scoreWakeWindow } from './wake_classifier.js';

const ASSET_ROOT = '/src/assets/voice/wake/';
const WASM_ROOT = '/src/assets/vendor/onnxruntime-web/';

// One worker holds the only ONNX Runtime instance of the wake owner for its whole life:
// a second instance beside it runs out of memory on iPhone. Detection and enrollment
// are modes of the same engine, switched by `configure`.
let sessions = null, base = null, policy = null;
let stream = null, verifier = null, collecting = false, active = false, streak = 0;

const load = async (name) => {
    const response = await fetch(ASSET_ROOT + name);
    if (!response.ok) throw new Error('wake_model_missing');
    return name.endsWith('.json') ? response.json() : new Uint8Array(await response.arrayBuffer());
};

const init = async () => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = WASM_ROOT;
    const [mel, embedding, model] = await Promise.all([load('melspectrogram.onnx'), load('embedding_model.onnx'), load('eve_ecoute_moi.json')]);
    const options = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    sessions = { melSession: await ort.InferenceSession.create(mel, options),
        embeddingSession: await ort.InferenceSession.create(embedding, options) };
    base = deserializeWakeClassifier(model);
    policy = model.policy;
};

// Every session starts from an empty history. Detection skips the embedding in silence;
// enrollment needs every window, silence included.
const configure = ({ verifier: personal, collect }) => {
    collecting = collect === true;
    verifier = personal ? deserializeWakeClassifier(personal) : null;
    stream = createWakeFeatureStream({ ort, ...sessions, silenceGate: !collecting });
    streak = 0;
    active = true;
};

// Base model first; a personal verifier, when enrolled, decides every candidate it gates.
const decide = (window) => {
    const baseScore = scoreWakeWindow(base, window);
    if (!verifier) return { baseScore, score: baseScore };
    return { baseScore, score: baseScore >= policy.verifierGate ? scoreWakeWindow(verifier, window) : 0 };
};

const frame = async (samples) => {
    if (!active) return;
    const window = await stream.push(samples);
    if (!window) return;
    const { baseScore, score } = decide(window);
    if (collecting) { self.postMessage({ type: 'window', window, baseScore }, [window.buffer]); return; }
    // The verifier is a logistic regression with its own calibration, hence its own threshold.
    streak = score >= (verifier ? policy.verifierThreshold : policy.threshold) ? streak + 1 : 0;
    if (streak === policy.consecutive) self.postMessage({ type: 'detected', score });
};

const handle = async (data) => {
    if (data.type === 'init') { await init(); self.postMessage({ type: 'ready' }); }
    else if (data.type === 'configure') { configure(data); self.postMessage({ type: 'configured' }); }
    else if (data.type === 'idle') active = false;
    else if (data.type === 'frame') await frame(data.samples);
    else throw new Error('wake_detector_message_invalid');
};

// The feature stream is stateful: messages are processed strictly in arrival order.
// More than 2 s of pending audio means inference cannot keep up on this device.
const MAX_PENDING_FRAMES = 25;
let queue = Promise.resolve(), pendingFrames = 0;
self.onmessage = ({ data }) => {
    if (data.type === 'frame' && ++pendingFrames > MAX_PENDING_FRAMES) {
        pendingFrames -= 1;
        self.postMessage({ type: 'error', error: 'wake_capture_overrun' });
        return;
    }
    queue = queue.then(() => handle(data)).finally(() => { if (data.type === 'frame') pendingFrames -= 1; }).catch((error) => {
        self.postMessage({ type: 'error', error: String(error?.message || '').startsWith('wake_') ? error.message : 'wake_engine_failed' });
    });
};
