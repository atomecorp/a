import * as ort from '../../assets/vendor/onnxruntime-web/ort.wasm.min.mjs';
import { encodeFrenchPhonemes } from './french_phoneme_encoder.js';

const MODEL_URL = new URL('../../assets/voice/fr_FR-siwis-medium/fr_FR-siwis-medium.onnx', import.meta.url).href;
const CONFIG_URL = new URL('../../assets/voice/fr_FR-siwis-medium/fr_FR-siwis-medium.onnx.json', import.meta.url).href;
const WASM_ROOT = new URL('../../assets/vendor/onnxruntime-web/', import.meta.url).href;

let configPromise;
let sessionPromise;

const ensureEngine = async () => {
    configPromise ||= fetch(CONFIG_URL).then((response) => {
        if (!response.ok) throw new Error(`local_tts_config_load_failed:${response.status}`);
        return response.json();
    });
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = WASM_ROOT;
    sessionPromise ||= ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
    });
    const [config, session] = await Promise.all([configPromise, sessionPromise]);
    return { config, session };
};

const synthesize = async (text) => {
    const { config, session } = await ensureEngine();
    const encoded = encodeFrenchPhonemes(text, config.phoneme_id_map);
    const ids = BigInt64Array.from(encoded.ids, BigInt);
    const scales = config.inference;
    const feeds = {
        input: new ort.Tensor('int64', ids, [1, ids.length]),
        input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor('float32', Float32Array.from([
            Number(scales.noise_scale),
            Number(scales.length_scale),
            Number(scales.noise_w)
        ]), [3])
    };
    const result = await session.run(feeds);
    const output = result.output || result[session.outputNames[0]];
    if (!output?.data?.length) throw new Error('local_tts_pcm_empty');
    const pcm = Float32Array.from(output.data);
    return { pcm, phonemes: encoded.phonemes, sampleRate: config.audio.sample_rate };
};

self.onmessage = async ({ data }) => {
    const id = data?.id;
    try {
        if (data?.type === 'preload') {
            await ensureEngine();
            self.postMessage({ id, type: 'ready' });
            return;
        }
        if (data?.type !== 'synthesize') throw new Error('local_tts_worker_message_invalid');
        const result = await synthesize(String(data.text || ''));
        self.postMessage({ id, type: 'result', ...result }, [result.pcm.buffer]);
    } catch (error) {
        self.postMessage({ id, type: 'error', error: error?.message || String(error) });
    }
};
