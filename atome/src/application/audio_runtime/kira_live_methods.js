// The Kira backend's live part: the direct path (atome-audio-engine direct.rs,
// native only — the Web hosts it in eVe/core/media_engine/direct_path_web.js)
// and the instruments a mix strip plays (atome_mix_graph::instrument_command):
// native engines decode a sample from its path, the Web engine takes the PCM
// the page decoded ({ left, right, sampleRate }).

export const createKiraLiveMethods = ({ invoke, ensureRuntimeMode, readWasm }) => ({
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

    // Answers the sample's shape: { frames, sample_rate, channels }.
    instrument_sample_load(arg) {
        var sampleId = String((arg && arg.sampleId) || '');
        if (!sampleId) return Promise.reject(new Error('instrument_sample_load needs a sampleId'));
        return ensureRuntimeMode({ audioManager: true }).then(function () {
            var wasm = readWasm();
            if (!wasm) {
                return invoke('audio_instrument_sample_load', { sampleId: sampleId, path: String(arg.path || '') }).then(function (r) {
                    return { frames: r.frames, sample_rate: r.sample_rate, channels: r.channels };
                });
            }
            if (!arg.left) throw new Error('instrument_sample_load on the Web needs the decoded left channel');
            wasm.audio_instrument_sample_load(sampleId, Float32Array.from(arg.left), arg.right ? Float32Array.from(arg.right) : undefined, Number(arg.sampleRate));
            return { frames: arg.left.length, sample_rate: Number(arg.sampleRate), channels: arg.right ? 2 : 1 };
        });
    },

    // Answers the instrument's rendered frames for a `clock` command, the fired command markers
    // ({ actions, dropped, stale }) for `drain_actions`, else null.
    instrument(command) {
        return ensureRuntimeMode({ audioManager: true }).then(function () {
            var wasm = readWasm();
            if (wasm) return wasm.audio_instrument(command) ?? null;
            return invoke('audio_instrument', { command: command }).then(function (r) { return r ? (r.drained || r.frame) : null; });
        });
    }
});
