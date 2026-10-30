import * as ort from '../../assets/vendor/onnxruntime-web/ort.wasm.min.mjs';
import initAudioWasm, { VoiceConversation } from '../../wasm/squirrel_audio_wasm.js';

// The browser side of the voice engine's listening path: Silero VAD (onnxruntime-web) scores each
// 32 ms frame and the turn logic shared with the native engine (atome-voice-turns, compiled into
// squirrel_audio_wasm) decides what the recognizer hears. Actions go back to the page, which owns
// the Vosk recognizer (vosk-browser).
const SILERO_URL = '/src/assets/voice/vad/silero_vad.onnx';
const WASM_ROOT = '/src/assets/vendor/onnxruntime-web/';
const FRAME = 512;
const CONTEXT = 64;

let session = null, conversation = null, recording = false;
let state = new Float32Array(256), context = new Float32Array(CONTEXT), pending = new Float32Array(0);

const resetSilero = () => { state = new Float32Array(256); context = new Float32Array(CONTEXT); };

const init = async () => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = WASM_ROOT;
    const response = await fetch(SILERO_URL);
    if (!response.ok) throw new Error(`voice_vad_model_missing:${response.status}`);
    session = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    await initAudioWasm();
    conversation = new VoiceConversation();
};

const probability = async (frame) => {
    const input = new Float32Array(CONTEXT + FRAME);
    input.set(context); input.set(frame, CONTEXT);
    const result = await session.run({
        input: new ort.Tensor('float32', input, [1, CONTEXT + FRAME]),
        state: new ort.Tensor('float32', state, [2, 1, 128]),
        sr: new ort.Tensor('int64', BigInt64Array.from([16000n]), [1])
    });
    state = new Float32Array(result.stateN.data);
    context = frame.slice(FRAME - CONTEXT);
    return result.output.data[0];
};

// 16 kHz samples in int16 scale (the capture's frames), cut into Silero frames in [-1, 1].
// `record`: the engine's test mode (todo/refonte_assistant_vocal.md §18.7); a closed turn then
// carries its take ({ pcm, cuts }, voice-turns `Take`).
const frames = async (samples, record) => {
    if (record !== recording) { conversation.setRecording(record); recording = record; }
    const merged = new Float32Array(pending.length + samples.length);
    merged.set(pending); merged.set(samples, pending.length);
    let offset = 0;
    const actions = [];
    for (; offset + FRAME <= merged.length; offset += FRAME) {
        const frame = merged.slice(offset, offset + FRAME).map(sample => sample / 32768);
        if (!conversation.listen(frame)) continue;
        for (const action of conversation.push(frame, await probability(frame))) {
            if (action.type === 'close' && recording) action.take = conversation.takeRecording();
            actions.push(action);
        }
    }
    pending = merged.slice(offset);
    const buffers = actions.flatMap(action => [action.pcm?.buffer, action.take?.pcm.buffer, action.take?.cuts.buffer]).filter(Boolean);
    self.postMessage({ type: 'actions', actions, inputDb: conversation.inputDb() }, buffers);
};

const handle = async (data) => {
    if (data.type === 'init') { await init(); self.postMessage({ type: 'ready' }); }
    else if (data.type === 'frame') await frames(data.samples, data.record === true);
    else if (data.type === 'speaking') { if (conversation.setSpeaking(data.speaking)) resetSilero(); }
    else if (data.type === 'reset') { conversation.reset(); resetSilero(); pending = new Float32Array(0); }
    else throw new Error('voice_worker_message_invalid');
};

// Frames are stateful: messages are handled strictly in arrival order.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
    queue = queue.then(() => handle(data)).catch((error) => {
        self.postMessage({ type: 'error', code: String(error?.message || 'voice_worker_failed') });
    });
};
