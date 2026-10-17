import { createTtsRuntime } from './tts_runtime.js';

// Every sentence eVe speaks on her own — startup, ready, farewell, assistant and
// voice-activation messages — is the Siwis voice, rendered ahead of time by
// `scripts/generate_voice_lines.mjs`: the app never runs a second ONNX engine
// next to the wake detector (out of memory on iPhone), and the voice is the same
// one from the first word on. A sentence is found by its exact text, so a
// changed translation without a regenerated line is reported, never spoken
// by another voice.
export const VOICE_LINES_ROOT = 'assets/voice/lines_fr';
const LINE_SESSION = '__eve_voice_line';

// The generator writes canonical PCM16 WAV: walk the chunks to `data`.
const decodeWav = (buffer) => {
    const view = new DataView(buffer);
    for (let offset = 12; offset + 8 <= view.byteLength;) {
        const size = view.getUint32(offset + 4, true);
        if (view.getUint32(offset, false) === 0x64617461) {
            return Float32Array.from({ length: size / 2 }, (_, index) => view.getInt16(offset + 8 + index * 2, true) / 32768);
        }
        offset += 8 + size + (size % 2);
    }
    throw new Error('voice_line_audio_invalid');
};

export const createVoiceLinePlayer = ({ env = globalThis, audio, fetchImpl = (url) => env.fetch(url) } = {}) => {
    const base = `/src/${VOICE_LINES_ROOT}/`;
    let index = null;
    const prepared = new Map();
    const readIndex = () => (index ||= fetchImpl(`${base}index.json`).then(response => {
        if (!response.ok) throw new Error('voice_lines_index_unavailable');
        return response.json();
    }).catch(error => { index = null; throw error; }));
    const load = async (text) => {
        const { sampleRate, lines } = await readIndex();
        const line = lines[text];
        if (!line) throw new Error('voice_line_missing');
        const response = await fetchImpl(base + line.file);
        if (!response.ok) throw new Error('voice_line_audio_unavailable');
        return { pcm: decodeWav(await response.arrayBuffer()), sampleRate, phonemes: [...line.phonemes] };
    };
    const runtime = createTtsRuntime({ env, audio, provider: 'voice_line',
        synthesize: text => prepared.get(text) || load(text) });
    return Object.freeze({
        // Keeps a sentence decoded for an instant first word (the startup and ready lines).
        prepare(text) {
            if (!prepared.has(text)) prepared.set(text, load(text).catch(error => { prepared.delete(text); throw error; }));
            return prepared.get(text);
        },
        // One sentence at a time: a new one replaces the one being spoken.
        say: text => runtime.speak(LINE_SESSION, text),
        stop: () => runtime.stop(LINE_SESSION, 'voice_line_stop'),
        subscribeFrames: listener => runtime.subscribeFrames(listener)
    });
};

// The single player of the page: the assistant and voice activation share it,
// so eVe never speaks two sentences at once.
export const getVoiceLinePlayer = (env = globalThis, audio) => (env.__eveVoiceLines ||= createVoiceLinePlayer({ env, audio }));
