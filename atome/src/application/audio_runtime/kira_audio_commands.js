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
const optionalPositiveNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0.001, numeric) : null;
};
const optionalNonNegativeNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

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
        rate: Math.max(0.0001, finiteNumber(source.rate, 1)),
        loopStartSeconds: optionalNonNegativeNumber(source.loopStartSeconds ?? source.loop_start_seconds),
        loopEndSeconds: optionalNonNegativeNumber(source.loopEndSeconds ?? source.loop_end_seconds)
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
            rate: payload.rate,
            loopStartSeconds: payload.loopStartSeconds,
            loopEndSeconds: payload.loopEndSeconds
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
            rate: payload.rate,
            loop_start_seconds: payload.loopStartSeconds,
            loop_end_seconds: payload.loopEndSeconds
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
