import { getTauriInvoke } from './runtime_audio_backend.js';

export const KIRA_AUDIO_COMMANDS = Object.freeze({
    PLAY_INSTANCE: 'audio_play_instance',
    STOP_INSTANCE: 'audio_stop_instance'
});

const safeString = (value) => String(value ?? '').trim();
const finiteNumber = (value, defaultValue = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : defaultValue;
};
// An absent value stays absent: `Number(null)` is 0, which turned "play to
// the end" (`durationSeconds: null`) into a 1 ms play — silent playback on iOS.
const optionalNumber = (value) => (
    value === null || value === undefined || value === '' ? NaN : Number(value)
);
const optionalPositiveNumber = (value) => {
    const numeric = optionalNumber(value);
    return Number.isFinite(numeric) ? Math.max(0.001, numeric) : null;
};
const optionalNonNegativeNumber = (value) => {
    const numeric = optionalNumber(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

// The timeline window of a scheduled voice, rendered on every frame by the
// engine (atome-mix-graph `VoiceEnvelope`): null when absent or empty.
export const normalizeKiraVoiceEnvelope = (input) => {
    if (!input || typeof input !== 'object') return null;
    const durationSeconds = Number(input.durationSeconds ?? input.duration_seconds);
    if (!(durationSeconds > 0) || !Number.isFinite(durationSeconds)) return null;
    return {
        offsetSeconds: Math.max(0, finiteNumber(input.offsetSeconds ?? input.offset_seconds, 0)),
        durationSeconds,
        fadeInSeconds: Math.max(0, finiteNumber(input.fadeInSeconds ?? input.fade_in_seconds, 0)),
        fadeOutSeconds: Math.max(0, finiteNumber(input.fadeOutSeconds ?? input.fade_out_seconds, 0)),
        // Where a loop pass stops the voice before the clip's end.
        endSeconds: optionalNonNegativeNumber(input.endSeconds ?? input.end_seconds),
        // A cell's attack (from the clip time its cell started) and release (to the voice's end).
        attackStartSeconds: finiteNumber(input.attackStartSeconds ?? input.attack_start_seconds, 0),
        attackSeconds: Math.max(0, finiteNumber(input.attackSeconds ?? input.attack_seconds, 0)),
        releaseSeconds: Math.max(0, finiteNumber(input.releaseSeconds ?? input.release_seconds, 0))
    };
};

export const normalizeKiraPlayInstancePayload = (input = {}) => {
    const source = input && typeof input === 'object' ? input : {};
    const assetId = safeString(source.assetId || source.asset_id || source.id || source.clipId || source.clip_id);
    const voiceId = safeString(source.voiceId || source.voice_id || assetId);
    return {
        assetId,
        voiceId,
        startSeconds: Math.max(0, finiteNumber(source.startSeconds ?? source.start_seconds ?? source.start, 0)),
        durationSeconds: optionalPositiveNumber(source.durationSeconds ?? source.duration_seconds ?? source.duration),
        gain: clamp(source.gain ?? 1, 0.000001, 16),
        pan: clamp(source.pan ?? 0, -1, 1),
        rate: Math.max(0.0001, finiteNumber(source.rate, 1)),
        loopStartSeconds: optionalNonNegativeNumber(source.loopStartSeconds ?? source.loop_start_seconds),
        loopEndSeconds: optionalNonNegativeNumber(source.loopEndSeconds ?? source.loop_end_seconds),
        // Mixer strip whose sub-track plays the voice (`<track_id>:audio`).
        stripId: safeString(source.stripId ?? source.strip_id) || null
    };
};

export const normalizeKiraStopInstancePayload = (input = {}) => ({
    voiceId: safeString(
        typeof input === 'string'
            ? input
            : ((input && typeof input === 'object')
                ? (input.voiceId || input.voice_id || input.id || input.clipId || input.clip_id)
                : '')
    )
});

export const buildTauriKiraAudioPayload = (command = '', input = {}) => {
    const normalizedCommand = safeString(command);
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.PLAY_INSTANCE) {
        const payload = normalizeKiraPlayInstancePayload(input);
        return {
            assetId: payload.assetId,
            voiceId: payload.voiceId,
            startSeconds: payload.startSeconds,
            durationSeconds: payload.durationSeconds,
            gain: payload.gain,
            pan: payload.pan,
            rate: payload.rate,
            loopStartSeconds: payload.loopStartSeconds,
            loopEndSeconds: payload.loopEndSeconds,
            stripId: payload.stripId
        };
    }
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.STOP_INSTANCE) {
        const payload = normalizeKiraStopInstancePayload(input);
        return { voiceId: payload.voiceId };
    }
    return input && typeof input === 'object' ? { ...input } : {};
};

export const buildFacadeKiraAudioPayload = (command = '', input = {}) => {
    const normalizedCommand = safeString(command);
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.PLAY_INSTANCE) {
        const payload = normalizeKiraPlayInstancePayload(input);
        return {
            asset_id: payload.assetId,
            voice_id: payload.voiceId,
            start_seconds: payload.startSeconds,
            duration_seconds: payload.durationSeconds,
            gain: payload.gain,
            pan: payload.pan,
            rate: payload.rate,
            loop_start_seconds: payload.loopStartSeconds,
            loop_end_seconds: payload.loopEndSeconds,
            strip_id: payload.stripId
        };
    }
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.STOP_INSTANCE) {
        const payload = normalizeKiraStopInstancePayload(input);
        return { voice_id: payload.voiceId };
    }
    return input && typeof input === 'object' ? { ...input } : {};
};

export const resolveKiraFacadeMethod = (command = '') => {
    const normalizedCommand = safeString(command);
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.PLAY_INSTANCE) return 'play_instance';
    if (normalizedCommand === KIRA_AUDIO_COMMANDS.STOP_INSTANCE) return 'stop_instance';
    return '';
};

export const invokeTauriKiraAudioCommand = async ({
    command = '',
    payload = {},
    env = globalThis,
    unavailableError = 'kira_tauri_audio_invoke_unavailable'
} = {}) => {
    const invoke = getTauriInvoke(env);
    if (typeof invoke !== 'function') {
        throw new Error(unavailableError);
    }
    return await invoke(safeString(command), buildTauriKiraAudioPayload(command, payload));
};

export const invokeKiraAudioCommand = async ({
    bridge = null,
    command = '',
    payload = {},
    env = globalThis,
    facade = null,
    unavailablePrefix = 'kira'
} = {}) => {
    const normalizedCommand = safeString(command);
    const kiraBackend = safeString(bridge?.kira_backend).toLowerCase();
    if (kiraBackend === 'tauri' || kiraBackend === 'native_invoke') {
        return await invokeTauriKiraAudioCommand({
            command: normalizedCommand,
            payload,
            env,
            unavailableError: `${unavailablePrefix}_tauri_audio_invoke_unavailable`
        });
    }
    if (kiraBackend === 'wasm') {
        const squirrelAudio = facade || env?.Squirrel?.av?.audio || null;
        const facadeMethod = resolveKiraFacadeMethod(normalizedCommand);
        if (!facadeMethod || typeof squirrelAudio?.[facadeMethod] !== 'function') {
            throw new Error(`${unavailablePrefix}_wasm_audio_method_unavailable:${normalizedCommand || 'unknown'}`);
        }
        return await squirrelAudio[facadeMethod](buildFacadeKiraAudioPayload(normalizedCommand, payload));
    }
    throw new Error(`${unavailablePrefix}_kira_backend_unavailable:${kiraBackend || 'unknown'}`);
};
