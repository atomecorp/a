import {
    DEFAULT_ECHO_COOLDOWN_MS,
    toText
} from './home_surface_transcript.js';

const HISTORY_STORAGE_KEY = 'eve_voice_history_v1';
const LEGACY_HISTORY_STORAGE_KEY = 'eve_dilas_voice_history_v1';
export const MAX_HISTORY_ITEMS = 80;

const DEFAULTS = {
    bargeArmDelayMs: 180,
    bargeRestartDelayMs: 24,
    bargeVadThreshold: 0.045,
    bargeVadMinSpeechFrames: 2,
    bargeVadReleaseFrames: 4,
    fastCommitMs: 1200,
    pauseCommitMs: 4200,
    forceCommitMs: 6500,
    sttSilenceMs: 8000,
    sttFinalSilenceMs: 2400,
    interruptSttSilenceMs: 2600,
    interruptSttFinalSilenceMs: 900
};

export const debugVoice = () => {};

export const resolveVoiceApi = (env, explicitApi = null) => (
    explicitApi || env?.Squirrel?.voice || env?.AtomeVoice || env?.atome?.voice || null
);

const numericSetting = (value, defaultValue, minimum = 0) => (
    Number.isFinite(Number(value)) ? Math.max(minimum, Number(value)) : defaultValue
);

export const resolveHomeVoiceConfig = (env = globalThis) => {
    const fastCommitMs = numericSetting(env?.__EVE_VOICE_FAST_COMMIT_MS, DEFAULTS.fastCommitMs);
    const pauseCommitMs = numericSetting(env?.__EVE_VOICE_PAUSE_COMMIT_MS, DEFAULTS.pauseCommitMs, fastCommitMs);
    const forceCommitMs = numericSetting(env?.__EVE_VOICE_FORCE_COMMIT_MS, DEFAULTS.forceCommitMs, pauseCommitMs);
    return {
        echoCooldownMs: numericSetting(env?.__EVE_VOICE_ECHO_COOLDOWN_MS, DEFAULT_ECHO_COOLDOWN_MS),
        bargeArmDelayMs: numericSetting(env?.__EVE_VOICE_BARGE_ARM_DELAY_MS, DEFAULTS.bargeArmDelayMs),
        bargeRestartDelayMs: numericSetting(env?.__EVE_VOICE_BARGE_RESTART_DELAY_MS, DEFAULTS.bargeRestartDelayMs),
        bargeVadThreshold: numericSetting(env?.__EVE_VOICE_BARGE_VAD_THRESHOLD, DEFAULTS.bargeVadThreshold, 0.005),
        bargeVadMinSpeechFrames: numericSetting(env?.__EVE_VOICE_BARGE_VAD_MIN_FRAMES, DEFAULTS.bargeVadMinSpeechFrames, 1),
        bargeVadReleaseFrames: numericSetting(env?.__EVE_VOICE_BARGE_VAD_RELEASE_FRAMES, DEFAULTS.bargeVadReleaseFrames, 1),
        fastCommitMs,
        pauseCommitMs,
        forceCommitMs,
        sttSilenceMs: numericSetting(env?.__EVE_VOICE_STT_SILENCE_MS, DEFAULTS.sttSilenceMs, forceCommitMs + 500),
        sttFinalSilenceMs: numericSetting(env?.__EVE_VOICE_STT_FINAL_SILENCE_MS, DEFAULTS.sttFinalSilenceMs),
        interruptSttSilenceMs: numericSetting(env?.__EVE_VOICE_INTERRUPT_STT_SILENCE_MS, DEFAULTS.interruptSttSilenceMs),
        interruptSttFinalSilenceMs: numericSetting(
            env?.__EVE_VOICE_INTERRUPT_STT_FINAL_SILENCE_MS,
            DEFAULTS.interruptSttFinalSilenceMs
        )
    };
};

export const loadHomeVoiceHistory = (env) => {
    try {
        const raw = env?.localStorage?.getItem(HISTORY_STORAGE_KEY)
            || env?.localStorage?.getItem(LEGACY_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
    } catch (_) {
        return [];
    }
};

export const saveHomeVoiceHistory = (env, history) => {
    try {
        env?.localStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY_ITEMS)));
    } catch (_) {
        // Ignore storage failures.
    }
};

export const createHomeVoiceState = (env, api) => ({
    api,
    active: false,
    listening: false,
    processing: false,
    speaking: false,
    sessionId: null,
    history: loadHomeVoiceHistory(env),
    transcriptDraft: '',
    errorMessage: '',
    infoMessage: '',
    unsubscribe: () => {},
    listeningPromise: null,
    voiceMeter: null,
    meterRunning: false,
    suppressAutoRestartOnce: false,
    lastAssistantReply: '',
    lastAssistantSpokenAt: 0,
    restartTimer: null,
    bargeInDetector: null,
    bargeInPending: false,
    bargeInArmAt: 0,
    pendingTranscriptPrefix: '',
    lastFailureNotice: '',
    activationPromise: null,
    pendingReadyAnnouncement: false,
    readyAnnouncementTask: null,
    transcriptFastCommitTimer: null,
    transcriptPauseCommitTimer: null,
    transcriptForceCommitTimer: null,
    commitRequested: false,
    interruptListening: false,
    interruptListeningPromise: null,
    interruptRestartTimer: null,
    interruptCommandPending: false
});

export const cloneControllerState = (state, textOnly) => {
    const snapshot = {
        active: state.active,
        listening: state.listening,
        interruptListening: state.interruptListening,
        processing: state.processing,
        speaking: state.speaking,
        textOnly,
        errorMessage: state.errorMessage,
        sessionId: state.sessionId,
        history: state.history,
        meterRunning: state.meterRunning
    };
    if (typeof structuredClone === 'function') return structuredClone(snapshot);
    return JSON.parse(JSON.stringify(snapshot));
};

export const pushHistoryEntry = ({ env, state, renderHistory }, role, text) => {
    const normalized = toText(text);
    if (!normalized) return;
    state.history.push({
        role,
        text: normalized,
        ts: Date.now()
    });
    state.history = state.history.slice(-MAX_HISTORY_ITEMS);
    saveHomeVoiceHistory(env, state.history);
    renderHistory();
};
