import { resolveVoiceCaptureProvider } from '../../application/audio_runtime/runtime_audio_backend.js';
import { DEFAULT_LANG, getSpeechRecognitionCtor, getTauriSttBridge, readEnv } from './service_support.js';

export const VOICE_V1_PROVIDER_DECISION = Object.freeze({
    stt: {
        primary: 'browser_web_speech',
        fallback: 'tauri_plugin_stt',
        partials: true,
        lang: DEFAULT_LANG
    },
    tts: {
        primary: 'local_onnx',
        interruptible: true,
        lang: DEFAULT_LANG
    },
    capture: {
        primary: 'native_audio_recorder'
    }
});

const resolvePreferredSttProvider = (env, {
    hasBrowserRecognition = false,
    hasTauriStt = false
} = {}) => {
    const explicit = String(
        readEnv(env, 'SQUIRREL_STT_PROVIDER')
        || readEnv(env, '__SQUIRREL_STT_PROVIDER__')
        || ''
    ).trim().toLowerCase();

    if (explicit === 'browser' || explicit === 'browser_web_speech' || explicit === 'online') {
        if (hasBrowserRecognition) return 'browser_web_speech';
    }
    if (explicit === 'tauri' || explicit === 'tauri_plugin_stt' || explicit === 'local') {
        if (hasTauriStt) return 'tauri_plugin_stt';
    }

    if (hasTauriStt) return 'tauri_plugin_stt';
    if (hasBrowserRecognition) return 'browser_web_speech';
    return 'unsupported';
};

export const resolveVoiceProviders = (env = globalThis) => {
    const recognitionCtor = getSpeechRecognitionCtor(env);
    const tauriStt = getTauriSttBridge(env);
    const recordStart = readEnv(env, 'record_start');
    const recordStop = readEnv(env, 'record_stop');

    const sttSelected = resolvePreferredSttProvider(env, {
        hasBrowserRecognition: !!recognitionCtor,
        hasTauriStt: !!tauriStt
    });


    const providerHint = resolveVoiceCaptureProvider(env);
    const captureSelected = (() => {
        if (typeof recordStart === 'function' && typeof recordStop === 'function') {
            if (providerHint && providerHint !== 'unsupported') return providerHint;
            return 'native_audio_recorder';
        }
        if (providerHint === 'web_capture_recorder') return providerHint;
        return 'unsupported';
    })();

    return {
        stt: {
            selected: sttSelected,
            preferred: VOICE_V1_PROVIDER_DECISION.stt.primary,
            fallback: VOICE_V1_PROVIDER_DECISION.stt.fallback,
            supports_partials: sttSelected === 'tauri_plugin_stt' || sttSelected === 'browser_web_speech',
            lang: DEFAULT_LANG
        },
        tts: {
            selected: VOICE_V1_PROVIDER_DECISION.tts.primary,
            preferred: VOICE_V1_PROVIDER_DECISION.tts.primary,
            interruptible: true,
            lang: DEFAULT_LANG
        },
        capture: {
            selected: captureSelected,
            preferred: VOICE_V1_PROVIDER_DECISION.capture.primary
        }
    };
};
