// The Kira backend's live part: the direct path (atome-audio-engine direct.rs,
// native only — the Web hosts it in eVe/core/media_engine/direct_path_web.js)
// and the instruments a mix strip plays (atome_mix_graph::instrument_command):
// native engines decode a sample from its path, the Web engine takes the PCM
// the page decoded ({ left, right, sampleRate }). The Web engine sleeps when it
// has nothing to render (BUG-068): `wake` and `hold` are its demands.

// How long a woken context may take to run its clock again.
const WAKE_LIMIT_MS = 2000;

// Settles once the context runs and its output clock has moved past `from`:
// a clock read before that would carry the instant it froze at.
const contextRunningPast = (context, from) => new Promise((resolve, reject) => {
    const asked = globalThis.performance.now();
    const check = () => {
        if (context.state === 'running' && context.getOutputTimestamp().contextTime > from) return resolve(true);
        if (globalThis.performance.now() - asked > WAKE_LIMIT_MS) return reject(new Error('audio_engine_wake_timeout'));
        globalThis.setTimeout(check, 4);
    };
    check();
});

// The engine woken (`resumed`: its context's resume, when it slept); settles
// once its clock runs. Native engines never sleep.
const settleWake = (engine, resumed) => {
    if (!engine) return Promise.resolve(true);
    const context = engine.audio_shared_context();
    if (!resumed && context.state === 'running') return Promise.resolve(true);
    const from = context.currentTime;
    return Promise.resolve(resumed).then(() => contextRunningPast(context, from));
};

// `readEngine`: the Web engine once its audio manager runs, else null.
export const createKiraLiveMethods = ({ invoke, ensureRuntimeMode, readWasm, readEngine }) => ({
    // A demand on the Web engine before reading its clock or playing on its context.
    wake() {
        const engine = readEngine();
        return settleWake(engine, engine ? engine.audio_wake() : null);
    },

    // { owner, on }: an owner playing on the Web engine's context itself (the direct
    // path, a live input, a recording) holds it awake until it lets go.
    hold(arg) {
        const owner = String((arg && arg.owner) || '');
        if (!owner) return Promise.reject(new Error('audio_engine_hold_needs_an_owner'));
        const wasm = readWasm();
        const resumed = wasm ? wasm.audio_hold(owner, arg.on === true) : null;
        return arg.on === true ? settleWake(readEngine(), resumed) : Promise.resolve(true);
    },

    direct_apply(program) {
        return ensureRuntimeMode({ audioManager: true }).then(function () {
            return invoke('audio_direct_apply', { program: program }).then(function (r) { return r && r.strips; });
        });
    },

    direct_levels() {
        return invoke('audio_direct_levels', {}).then(function (r) { return (r && r.levels) || []; });
    },

    direct_cut_tail(moduleId) {
        return invoke('audio_direct_cut_tail', { moduleId: moduleId });
    },

    direct_module_state(moduleId) {
        return invoke('audio_direct_module_state', { moduleId: moduleId }).then(function (r) { return r ? r.state : null; });
    },

    direct_measure_latency(deviceName) {
        return ensureRuntimeMode({ audioManager: true }).then(function () {
            return invoke('audio_direct_measure_latency', { deviceName: deviceName || null }).then(function (r) { return r && r.round_trip; });
        });
    },

    // Answers the sample's shape: { frames, sample_rate, channels, streamed } (a long WAV streams
    // natively from its heads; the Web holds the decoded PCM whole).
    instrument_sample_load(arg) {
        var sampleId = String((arg && arg.sampleId) || '');
        if (!sampleId) return Promise.reject(new Error('instrument_sample_load needs a sampleId'));
        return ensureRuntimeMode({ audioManager: true }).then(function () {
            var wasm = readWasm();
            if (!wasm) {
                return invoke('audio_instrument_sample_load', { sampleId: sampleId, path: String(arg.path || '') }).then(function (r) {
                    return { frames: r.frames, sample_rate: r.sample_rate, channels: r.channels, streamed: r.streamed === true };
                });
            }
            if (!arg.left) throw new Error('instrument_sample_load on the Web needs the decoded left channel');
            wasm.audio_instrument_sample_load(sampleId, Float32Array.from(arg.left), arg.right ? Float32Array.from(arg.right) : undefined, Number(arg.sampleRate));
            return { frames: arg.left.length, sample_rate: Number(arg.sampleRate), channels: arg.right ? 2 : 1, streamed: false };
        });
    },

    // Answers the instrument's rendered frames for a `clock` command, the fired command markers
    // ({ actions, dropped, stale, starved, failures? }) for `drain_actions`, else null.
    instrument(command) {
        return ensureRuntimeMode({ audioManager: true }).then(function () {
            var wasm = readWasm();
            if (wasm) return wasm.audio_instrument(command) ?? null;
            return invoke('audio_instrument', { command: command }).then(function (r) { return r ? (r.drained || r.frame) : null; });
        });
    }
});
