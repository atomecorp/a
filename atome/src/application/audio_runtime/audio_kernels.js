// The page's offline audio kernels — waveform peaks, attacks, loops, an edit's
// render, auto-sampled takes, WAV and FLAC files, cue tones — live in Rust
// (atome/engines/audio-kernels, step 7 of the Rust-first study: each measured
// faster there than the JS it replaced, temp/step7_compute/). They reach the page
// through squirrel_audio_wasm, the module the Kira backend plays with. This file
// loads that module, once, and hands it out; it also holds the one kernel measured
// faster here (`peakOf`: copying a sound into the module costs more than reading it).
const MODULE_URL = '/wasm/squirrel_audio_wasm.js';
const BINARY_URL = '/wasm/squirrel_audio_wasm_bg.wasm';
let kernels = null;
let loading = null;

const bytesOf = async (binary) => {
    if (typeof binary !== 'string') return binary;
    const response = await globalThis.fetch(binary);
    if (!response.ok) throw new Error(`audio_kernels_load_failed:${response.status}`);
    return response.arrayBuffer();
};

/**
 * Loads the module once and resolves it. `moduleUrl` and `binary` (its URL, or its
 * bytes where no URL serves it, as in a Node probe) name another copy of it.
 */
export const loadAudioKernels = ({ moduleUrl = MODULE_URL, binary = BINARY_URL } = {}) => {
    loading ||= import(moduleUrl)
        .then(async (mod) => {
            mod.initSync({ module: await bytesOf(binary) });
            kernels = mod;
            return mod;
        })
        .catch((error) => {
            loading = null;
            throw error;
        });
    return loading;
};

/** The loaded module; whoever reads PCM loads it first (`loadAudioKernels`). */
export const audioKernels = () => {
    if (!kernels) throw new Error('audio_kernels_not_loaded');
    return kernels;
};

/** The highest absolute sample of `channels` (0 for silence). */
export const peakOf = (channels) => {
    let peak = 0;
    for (const channel of channels) {
        for (let index = 0; index < channel.length; index += 1) {
            const level = Math.abs(channel[index]);
            if (level > peak) peak = level;
        }
    }
    return peak;
};
