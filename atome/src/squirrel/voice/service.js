import { createVoiceSessionRuntime, normalizeLocalVoiceCommand } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceLatencyTelemetry } from './telemetry.js';
import { createVoiceActivityDetector } from './vad.js';
import { createVoiceAiPlanner } from './ai_planner.js';
import {
    buildStartupBriefing,
    evaluateProactiveNotifications,
    coalesceProactiveNotifications
} from '../ai/proactive_scheduler.js';
import { createProactiveStateStore } from '../ai/proactive_state_store.js';
import { resolveVoiceCaptureProvider } from '../../application/audio_runtime/runtime_audio_backend.js';

const DEFAULT_LANG = 'fr-FR';
const DEFAULT_STT_SILENCE_MS = 8000;
const DEFAULT_STT_FINAL_SILENCE_MS = 2400;
const DEFAULT_STT_MAX_ALTERNATIVES = 5;
const COMMON_SPEECH_HINTS = Object.freeze([
    'Atome',
    'eVe',
    'Mtrack',
    'Jean-Eric'
]);

const toDebugPayload = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
};

const debugVoiceService = (...args) => {
    void args;
};

export const VOICE_V1_PROVIDER_DECISION = Object.freeze({
    stt: {
        primary: 'browser_web_speech',
        fallback: 'tauri_plugin_stt',
        partials: true,
        lang: DEFAULT_LANG
    },
    tts: {
        primary: 'browser_speech_synthesis',
        fallback: 'tauri_native_tts',
        interruptible: true,
        lang: DEFAULT_LANG
    },
    capture: {
        primary: 'native_audio_recorder'
    }
});

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const getSpeechRecognitionCtor = (env) => readEnv(env, 'SpeechRecognition') || readEnv(env, 'webkitSpeechRecognition') || null;

const getSpeechSynthesisUtteranceCtor = (env) => readEnv(env, 'SpeechSynthesisUtterance') || null;

const getSpeechSynthesis = (env) => readEnv(env, 'speechSynthesis') || null;

const normalizeVoiceLocale = (value = '') => String(value || '').trim().replace('_', '-').toLowerCase();

const stripDiacritics = (value = '') => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeSpeechText = (value = '') => stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactSpeechText = (value = '') => normalizeSpeechText(value)
    .replace(/[\s'-]+/g, '')
    .trim();

const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveSpeechLocale = (value = '') => {
    const normalized = normalizeVoiceLocale(value);
    if (!normalized) return DEFAULT_LANG;
    if (normalized === 'fr') return 'fr-FR';
    if (normalized === 'en') return 'en-US';
    const [language = '', region = ''] = normalized.split('-');
    if (!language) return DEFAULT_LANG;
    if (!region) {
        if (language === 'fr') return 'fr-FR';
        if (language === 'en') return 'en-US';
        return language;
    }
    return `${language}-${region.toUpperCase()}`;
};

const appendSpeechHintsFromValue = (target, value, depth = 0) => {
    if (depth > 2 || value == null) return;
    if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value || '').trim();
        if (text.length >= 2 && text.length <= 80) {
            target.add(text);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.slice(0, 10).forEach((entry) => appendSpeechHintsFromValue(target, entry, depth + 1));
        return;
    }
    if (typeof value === 'object') {
        const preferredKeys = [
            'name', 'title', 'label', 'subject', 'organization', 'project', 'project_name',
            'query_text', 'reply_target', 'participant_hint', 'tool_name', 'tool_id', 'atome_id'
        ];
        preferredKeys.forEach((key) => {
            if (key in value) appendSpeechHintsFromValue(target, value[key], depth + 1);
        });
    }
};

const collectSpeechHints = (env, sessionRuntime, sessionId, options = {}) => {
    const hints = new Set(COMMON_SPEECH_HINTS);
    appendSpeechHintsFromValue(hints, options?.speechHints);
    appendSpeechHintsFromValue(hints, readEnv(env, '__EVE_VOICE_SPEECH_HINTS'));
    appendSpeechHintsFromValue(hints, readEnv(env, '__currentUser')?.name || readEnv(env, '__currentUser')?.first_name);

    const workingMemory = sessionRuntime?.workingMemory || null;
    if (workingMemory) {

        appendSpeechHintsFromValue(hints, workingMemory.getSessionPreferences?.());


        appendSpeechHintsFromValue(hints, workingMemory.listActiveEntities?.());

        for (const domain of ['atome', 'mail', 'contacts', 'calendar']) {

            appendSpeechHintsFromValue(hints, workingMemory.getCurrentItem?.(domain));

        }
    }

    if (sessionRuntime && sessionId) {

        const snapshot = sessionRuntime.getSession(sessionId);
        appendSpeechHintsFromValue(hints, snapshot?.conversation?.active_intent);
        appendSpeechHintsFromValue(hints, snapshot?.conversation?.last_user_text);

    }

    return Array.from(hints)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .slice(0, 64);
};

const applyHintedSpeechCorrections = (value = '', hints = []) => {
    let text = String(value || '').trim();
    if (!text) return text;

    const normalizedHints = Array.isArray(hints) ? hints : [];
    for (const hint of normalizedHints) {
        const canonical = String(hint || '').trim();
        if (!canonical) continue;
        const hintNormalized = normalizeSpeechText(canonical);
        if (hintNormalized === 'mtrack') {
            text = text.replace(/\bm[\s'-]*track\b/gi, canonical);
            continue;
        }
        if (hintNormalized === 'atome') {
            text = text.replace(/\batom(?:e)?\b/gi, canonical);
            continue;
        }
        if (hintNormalized === 'eve') {
            text = text.replace(/\beve\b/gi, canonical);
            continue;
        }
        const tokens = canonical.split(/[\s'-]+/).map((entry) => entry.trim()).filter(Boolean);
        if (tokens.length >= 2 || /[-']/.test(canonical)) {
            const pattern = new RegExp(`\\b${tokens.map((entry) => escapeRegExp(entry)).join("[\\s'’_\\-]*")}\\b`, 'gi');
            text = text.replace(pattern, canonical);
        }
    }
    return text.replace(/\s+/g, ' ').trim();
};

const scoreSpeechCandidate = (candidate = {}, hints = []) => {
    const text = String(candidate?.text || '').trim();
    if (!text) return Number.NEGATIVE_INFINITY;
    const normalized = normalizeSpeechText(text);
    const compact = compactSpeechText(text);
    let score = Number.isFinite(candidate?.confidence) ? Number(candidate.confidence) : 0;
    let matchedHints = 0;
    for (const hint of Array.isArray(hints) ? hints : []) {
        const hintText = String(hint || '').trim();
        if (!hintText) continue;
        const hintNormalized = normalizeSpeechText(hintText);
        const hintCompact = compactSpeechText(hintText);
        if (!hintNormalized) continue;
        if (normalized === hintNormalized || compact === hintCompact) {
            score += 0.85;
            matchedHints += 1;
            continue;
        }
        if (normalized.includes(hintNormalized) || hintNormalized.includes(normalized)) {
            score += 0.5;
            matchedHints += 1;
            continue;
        }
        if (hintCompact && (compact.includes(hintCompact) || hintCompact.includes(compact))) {
            score += 0.34;
            matchedHints += 1;
        }
    }
    if (matchedHints > 1) score += Math.min(0.3, matchedHints * 0.08);
    return score;
};

const selectBestSpeechCandidate = (candidates = [], hints = []) => {
    const normalizedCandidates = Array.isArray(candidates)
        ? candidates
            .map((entry) => ({
                text: applyHintedSpeechCorrections(entry?.text || '', hints),
                confidence: Number.isFinite(entry?.confidence) ? Number(entry.confidence) : null
            }))
            .filter((entry) => entry.text)
        : [];
    if (!normalizedCandidates.length) {
        return {
            text: '',
            confidence: null
        };
    }
    let best = normalizedCandidates[0];
    let bestScore = scoreSpeechCandidate(best, hints);
    for (const candidate of normalizedCandidates.slice(1)) {
        const score = scoreSpeechCandidate(candidate, hints);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
};

const resolvePreferredSpeechVoice = (synth, {
    lang = DEFAULT_LANG,
    voiceId = null
} = {}) => {
    if (!synth || typeof synth.getVoices !== 'function') return null;
    const voices = synth.getVoices();
    if (!Array.isArray(voices) || !voices.length) return null;

    if (voiceId) {
        const explicit = voices.find((voice) => voice?.name === voiceId || voice?.voiceURI === voiceId);
        if (explicit) return explicit;
    }

    const normalizedLang = normalizeVoiceLocale(lang);
    const langRoot = normalizedLang.split('-')[0] || normalizedLang;
    const preferredNames = langRoot === 'fr'
        ? ['thomas', 'amelie', 'aurelie', 'marie', 'remy', 'audrey', 'super', 'premium', 'enhanced']
        : ['premium', 'enhanced', 'natural', 'neural'];

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const voice of voices) {
        const voiceLocale = normalizeVoiceLocale(voice?.lang);
        const voiceName = String(voice?.name || '').toLowerCase();
        const voiceUri = String(voice?.voiceURI || '').toLowerCase();
        let score = 0;

        if (voiceLocale === normalizedLang) score += 120;
        else if (voiceLocale.startsWith(`${langRoot}-`)) score += 90;
        else if (voiceLocale === langRoot) score += 75;

        if (voice?.localService === true) score += 20;
        if (voice?.default === true) score += 8;

        for (const keyword of preferredNames) {
            if (voiceName.includes(keyword) || voiceUri.includes(keyword)) {
                score += 12;
            }
        }

        if (voiceName.includes('compact') || voiceUri.includes('compact')) score -= 6;
        if (voiceName.includes('novelty') || voiceUri.includes('novelty')) score -= 20;

        if (score > bestScore) {
            bestScore = score;
            best = voice;
        }
    }

    return best;
};

const getTauriSttBridge = (env) => {
    const tauri = readEnv(env, '__TAURI__');
    if (tauri?.stt && typeof tauri.stt.start === 'function') {
        return tauri.stt;
    }
    const internals = readEnv(env, '__TAURI_INTERNALS__');
    if (internals?.stt && typeof internals.stt.start === 'function') {
        return internals.stt;
    }
    return null;
};

const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const wait = (ms = 0) => new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
});

const createSegment = (text, confidence = null) => ({
    text: String(text || '').trim(),
    ...(Number.isFinite(confidence) ? { confidence } : {})
});

const isPermissionGranted = (permission = null) => permission === 'granted';

const isPermissionDenied = (permission = null) => permission === 'denied';

const normalizeErrorMessage = (error) => String(error?.message || error?.code || error || '').trim();

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
    const synth = getSpeechSynthesis(env);
    const utteranceCtor = getSpeechSynthesisUtteranceCtor(env);
    const recordStart = readEnv(env, 'record_start');
    const recordStop = readEnv(env, 'record_stop');

    const sttSelected = resolvePreferredSttProvider(env, {
        hasBrowserRecognition: !!recognitionCtor,
        hasTauriStt: !!tauriStt
    });

    const ttsSelected = (synth && utteranceCtor)
        ? 'browser_speech_synthesis'
        : 'unsupported';

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
            selected: ttsSelected,
            preferred: VOICE_V1_PROVIDER_DECISION.tts.primary,
            fallback: VOICE_V1_PROVIDER_DECISION.tts.fallback,
            interruptible: ttsSelected === 'browser_speech_synthesis',
            lang: DEFAULT_LANG
        },
        capture: {
            selected: captureSelected,
            preferred: VOICE_V1_PROVIDER_DECISION.capture.primary
        }
    };
};

export const createVoiceService = ({
    env = globalThis,
    sessionRuntime = createVoiceSessionRuntime(),
    aiPlanner = null
} = {}) => {
    const providers = resolveVoiceProviders(env);
    debugVoiceService('providers_resolved', {
        stt: providers?.stt?.selected || null,
        tts: providers?.tts?.selected || null,
        capture: providers?.capture?.selected || null
    });
    const sttSessions = new Map();
    const ttsSessions = new Map();
    const processingTasks = new Map();
    const telemetry = createVoiceLatencyTelemetry();
    telemetry.attachRuntime(sessionRuntime);
    const resolvedAiPlanner = aiPlanner === null
        ? ((env?.fetch || env?.window?.fetch) ? createVoiceAiPlanner({ env }) : null)
        : aiPlanner;
    const proactiveState = createProactiveStateStore({ env });
    const orchestrator = createVoiceOrchestrator({
        env,
        sessionRuntime,
        aiPlanner: resolvedAiPlanner
    });

    // Prefer already-registered connectors and avoid importing heavy business
    // bootstraps in headless or incomplete hosts.
    const existingToolRouter = typeof orchestrator.ensureExistingToolRouter === 'function'
        ? orchestrator.ensureExistingToolRouter({
            workingMemory: sessionRuntime?.workingMemory ?? null
        })
        : null;
    const hasExplicitConnectorHost = !!(
        env?.Squirrel?.mail
        || env?.Squirrel?.contacts
        || env?.Squirrel?.calendar
        || env?.atome?.mail
        || env?.atome?.contacts
        || env?.atome?.calendar
        || env?.window?.Squirrel?.mail
        || env?.window?.atome?.mail
    );

    if (!existingToolRouter && hasExplicitConnectorHost && typeof orchestrator.initToolRouter === 'function') {
        orchestrator.initToolRouter({
            workingMemory: sessionRuntime?.workingMemory ?? null
        }).catch(() => { });
    }

    const resolveResponseLocale = (response = {}, options = {}) => {
        const locale = resolveSpeechLocale(
            options?.lang
            || options?.locale
            || response?.intent?.locale
            || env?.eveI18n?.getLocale?.()
            || env?.document?.documentElement?.lang
            || DEFAULT_LANG
        );
        return locale || DEFAULT_LANG;
    };

    const maybeSpeakResponse = async (response = {}, options = {}) => {
        const text = String(response?.spoken_reply || response?.reply_text || '').trim();
        if (!text || options?.autoSpeak === false) {
            return response;
        }
        try {
            const started = await tts.speak(text, {
                ...options,
                session_id: options?.session_id,
                lang: resolveResponseLocale(response, options)
            });
            await (started?.promise || Promise.resolve(started));
        } catch (_) {
            // Keep the orchestration result even if the reply could not be spoken.
        }
        return response;
    };

    const ensureSession = (options = {}) => {
        const sessionId = String(options.session_id || options.sessionId || '').trim();
        if (sessionId) {
            return sessionRuntime.getSession(sessionId);
        }
        return sessionRuntime.createSession({
            locale: resolveSpeechLocale(options.lang || options.locale || DEFAULT_LANG),
            actor: options.actor || {},
            source_layer: options.source_layer || 'voice_session_service'
        });
    };

    const ensureSupported = (kind, selected) => {
        if (!selected || selected === 'unsupported') {
            throw new Error(`Voice ${kind} backend is not available`);
        }
    };

    const settleTtsStop = async (sessionId, {
        reason = 'tts_stop',
        interruptRuntime = true
    } = {}) => {
        const synth = getSpeechSynthesis(env);
        if (synth && typeof synth.cancel === 'function') {
            synth.cancel();
        }
        const state = ttsSessions.get(String(sessionId));
        if (state && !state.settled) {
            state.settled = true;
            ttsSessions.delete(String(sessionId));
            sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', {
                source: 'tts'
            });
            if (interruptRuntime) {
                sessionRuntime.interrupt(sessionId, { reason });
            }
            state.deferred.resolve({
                session_id: sessionId,
                provider: providers.tts.selected,
                stopped: true
            });
            return state.deferred.promise;
        }
        if (interruptRuntime) {
            sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', {
                source: 'tts'
            });
            sessionRuntime.interrupt(sessionId, { reason });
        }
        return {
            session_id: sessionId,
            provider: providers.tts.selected,
            stopped: true
        };
    };

    const startBrowserRecognition = (sessionId, options = {}, {
        provider = 'browser_web_speech'
    } = {}) => {
        const RecognitionCtor = getSpeechRecognitionCtor(env);
        if (!RecognitionCtor) {
            throw new Error('Browser speech recognition is not available');
        }

        const recognition = new RecognitionCtor();
        const deferred = createDeferred();
        const speechHints = collectSpeechHints(env, sessionRuntime, sessionId, options);
        const resolvedLang = resolveSpeechLocale(options.lang || options.locale || DEFAULT_LANG);
        const maxAlternatives = Number.isFinite(Number(options.maxAlternatives))
            ? Math.max(1, Number(options.maxAlternatives))
            : DEFAULT_STT_MAX_ALTERNATIVES;
        const state = {
            session_id: sessionId,
            recognition,
            deferred,
            settled: false,
            cancelled: false,
            final_texts: [],
            segments: [],
            confidence: null,
            speechHints
        };

        recognition.lang = resolvedLang;
        recognition.interimResults = options.partial !== false;
        recognition.continuous = options.continuous === true;
        recognition.maxAlternatives = maxAlternatives;

        recognition.onstart = () => {
            sessionRuntime.startListening(sessionId, {
                lang: recognition.lang,
                partial: recognition.interimResults,
                provider
            });
        };

        recognition.onresult = (event) => {
            let partialText = '';
            const results = Array.from(event?.results || []);
            const startIndex = Number.isFinite(event?.resultIndex) ? event.resultIndex : 0;
            for (let index = startIndex; index < results.length; index += 1) {
                const result = results[index];
                const alternatives = Array.from(result || [])
                    .map((alternative) => ({
                        text: String(alternative?.transcript || '').trim(),
                        confidence: Number.isFinite(alternative?.confidence) ? alternative.confidence : null
                    }))
                    .filter((entry) => entry.text);
                const selected = selectBestSpeechCandidate(alternatives, state.speechHints);
                const text = String(selected?.text || '').trim();
                if (!text) continue;
                const confidence = Number.isFinite(selected?.confidence) ? selected.confidence : null;
                if (result?.isFinal) {
                    state.final_texts.push(text);
                    state.segments.push(createSegment(text, confidence));
                    if (confidence !== null) {
                        state.confidence = confidence;
                    }
                } else {
                    partialText = partialText ? `${partialText} ${text}` : text;
                }
            }
            if (partialText) {
                sessionRuntime.pushPartial(sessionId, {
                    text: partialText
                });
            }
        };

        recognition.onerror = (event) => {
            if (state.settled) return;
            state.settled = true;
            sttSessions.delete(sessionId);
            const error = normalizeErrorMessage(event) || 'speech_recognition_error';
            sessionRuntime.interrupt(sessionId, {
                reason: `stt_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        recognition.onend = () => {
            if (state.settled) return;
            state.settled = true;
            sttSessions.delete(sessionId);
            if (state.cancelled) {
                deferred.resolve({
                    session_id: sessionId,
                    cancelled: true,
                    provider
                });
                return;
            }
            const snapshot = sessionRuntime.getSession(sessionId);
            const finalText = applyHintedSpeechCorrections(
                state.final_texts.join(' ').trim()
                || snapshot.transcript.partial
                || snapshot.transcript.final
                || '',
                state.speechHints
            );
            const result = {
                text: finalText,
                confidence: state.confidence,
                segments: state.segments,
                provider
            };
            sessionRuntime.finalizeListening(sessionId, result);
            deferred.resolve({
                session_id: sessionId,
                ...result
            });
        };

        sttSessions.set(sessionId, state);
        try {
            recognition.start();
        } catch (error) {
            state.settled = true;
            sttSessions.delete(sessionId);
            const message = normalizeErrorMessage(error) || 'speech_recognition_error';
            sessionRuntime.interrupt(sessionId, {
                reason: `stt_error:${message}`
            });
            throw error;
        }

        return {
            session_id: sessionId,
            provider,
            promise: deferred.promise
        };
    };

    const startTauriRecognition = async (sessionId, options = {}, {
        provider = 'tauri_plugin_stt'
    } = {}) => {
        const bridge = getTauriSttBridge(env);
        if (!bridge) {
            throw new Error('Tauri STT bridge is not available');
        }
        if (typeof bridge.onResult !== 'function'
            || typeof bridge.onStateChange !== 'function'
            || typeof bridge.onError !== 'function') {
            throw new Error('Tauri STT events are not available');
        }

        if (typeof bridge.checkPermission === 'function') {
            const permissions = await bridge.checkPermission();
            const microphone = permissions?.microphone || 'unknown';
            const speechRecognition = permissions?.speechRecognition || 'unknown';
            if (isPermissionDenied(microphone) || isPermissionDenied(speechRecognition)) {
                if (typeof bridge.requestPermission === 'function') {
                    const requested = await bridge.requestPermission();
                    const nextMicrophone = requested?.microphone || microphone;
                    const nextSpeechRecognition = requested?.speechRecognition || speechRecognition;
                    if (!isPermissionGranted(nextMicrophone) || !isPermissionGranted(nextSpeechRecognition)) {
                        throw new Error('permission_denied');
                    }
                } else {
                    throw new Error('permission_denied');
                }
            }
        }

        const deferred = createDeferred();
        const speechHints = collectSpeechHints(env, sessionRuntime, sessionId, options);
        const resolvedLang = resolveSpeechLocale(options.lang || options.locale || DEFAULT_LANG);
        const maxAlternatives = Number.isFinite(Number(options.maxAlternatives))
            ? Math.max(1, Number(options.maxAlternatives))
            : DEFAULT_STT_MAX_ALTERNATIVES;
        const silenceMs = Number.isFinite(options.silenceMs) && options.silenceMs >= 0
            ? Number(options.silenceMs)
            : DEFAULT_STT_SILENCE_MS;
        const finalSilenceMs = Number.isFinite(options.finalSilenceMs) && options.finalSilenceMs >= 0
            ? Number(options.finalSilenceMs)
            : Math.min(silenceMs, DEFAULT_STT_FINAL_SILENCE_MS);
        const state = {
            session_id: sessionId,
            bridge,
            deferred,
            cancelled: false,
            settled: false,
            recoveringStart: false,
            stopReason: null,
            stopRequested: false,
            cleanup: [],
            final_texts: [],
            segments: [],
            confidence: null,
            latest_text: '',
            inactivityTimer: null,
            speechHints
        };

        const clearInactivityTimer = () => {
            if (state.inactivityTimer) {
                clearTimeout(state.inactivityTimer);
                state.inactivityTimer = null;
            }
        };

        const requestBridgeStop = async (reason = 'manual') => {
            if (state.stopRequested || typeof bridge.stop !== 'function') return;
            state.stopRequested = true;
            state.stopReason = state.stopReason || reason;
            debugVoiceService('tauri_stt.stop_requested', { sessionId, reason: state.stopReason });
            try {
                await bridge.stop();
            } catch (_) {
                // Ignore native stop failures and let listeners settle from existing events.
            }
        };

        const scheduleSilenceStop = (delayMs = silenceMs) => {
            if (delayMs <= 0 || state.settled || state.cancelled) return;
            clearInactivityTimer();
            state.inactivityTimer = setTimeout(() => {
                void requestBridgeStop('silence');
            }, delayMs);
        };

        const cleanup = async () => {
            clearInactivityTimer();
            await Promise.allSettled(
                state.cleanup.map(async (unlisten) => {
                    if (typeof unlisten === 'function') {
                        return unlisten();
                    }
                    return null;
                })
            );
            state.cleanup = [];
            sttSessions.delete(sessionId);
        };

        const startBridgeWithRecovery = async () => {
            try {
                await bridge.start({
                    language: resolvedLang,
                    interimResults: options.partial !== false,
                    continuous: options.continuous !== false,
                    maxDuration: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 0,
                    maxAlternatives,
                    onDevice: options.onDevice === true
                });
            } catch (error) {
                const message = String(error?.message || error || '');
                if (!/already listening/i.test(message)) {
                    throw error;
                }
                debugVoiceService('tauri_stt.recover_already_listening', {
                    sessionId
                });
                state.recoveringStart = true;
                if (typeof bridge.stop === 'function') {
                    try {
                        await bridge.stop();
                    } catch (_) {
                        // Ignore recovery stop failures and retry once anyway.
                    }
                }
                await wait(80);
                await bridge.start({
                    language: resolvedLang,
                    interimResults: options.partial !== false,
                    continuous: options.continuous !== false,
                    maxDuration: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 0,
                    maxAlternatives,
                    onDevice: options.onDevice === true
                });
                state.recoveringStart = false;
            }
        };

        const settleFinal = async (result = {}) => {
            if (state.settled) return;
            state.settled = true;
            clearInactivityTimer();
            const finalText = String(result.text || state.final_texts.join(' ').trim()).trim();
            const payload = {
                text: finalText,
                confidence: result.confidence ?? state.confidence,
                segments: result.segments || state.segments,
                provider
            };
            if (result.skipStop !== true) {
                await requestBridgeStop(result.reason || 'final');
            }
            sessionRuntime.finalizeListening(sessionId, payload);
            await cleanup();
            deferred.resolve({
                session_id: sessionId,
                ...payload
            });
        };

        const settleStopped = async () => {
            if (state.settled) return;
            state.settled = true;
            clearInactivityTimer();
            await cleanup();
            deferred.resolve({
                session_id: sessionId,
                provider,
                cancelled: true,
                reason: state.stopReason || 'stopped',
                text: ''
            });
        };

        const settleError = async (error) => {
            if (state.settled) return;
            state.settled = true;
            clearInactivityTimer();
            await cleanup();
            const message = String(error?.message || error?.code || error || 'tauri_stt_error');
            sessionRuntime.interrupt(sessionId, {
                reason: `stt_error:${message}`
            });
            deferred.reject(new Error(message));
        };

        state.cleanup.push(await bridge.onStateChange((event = {}) => {
            const next = String(event?.state || '').trim();
            debugVoiceService('tauri_stt.state', {
                sessionId,
                state: next,
                stopReason: state.stopReason || null,
                cancelled: state.cancelled === true
            });
            if (next === 'listening') {
                sessionRuntime.startListening(sessionId, {
                    lang: resolvedLang,
                    partial: options.partial !== false,
                    provider
                });
                return;
            }
            if (next === 'idle') {
                if (state.recoveringStart) {
                    debugVoiceService('tauri_stt.idle_ignored_during_recovery', {
                        sessionId
                    });
                    return;
                }
                if (state.cancelled || state.stopReason === 'cancelled' || state.stopReason === 'manual') {
                    void settleStopped();
                    return;
                }
                if (state.stopReason === 'commit') {
                    const committedText = String(state.final_texts.join(' ').trim() || state.latest_text || '').trim();
                    if (committedText) {
                        void settleFinal({
                            text: committedText,
                            confidence: state.confidence,
                            segments: state.segments,
                            skipStop: true,
                            reason: 'commit'
                        });
                        return;
                    }
                    void settleStopped();
                    return;
                }
                const fallbackText = String(state.final_texts.join(' ').trim() || state.latest_text || '').trim();
                if (fallbackText) {
                    void settleFinal({
                        text: fallbackText,
                        confidence: state.confidence,
                        segments: state.segments,
                        skipStop: true,
                        reason: state.stopReason || 'idle'
                    });
                    return;
                }
                void settleStopped();
            }
        }));

        state.cleanup.push(await bridge.onResult((result = {}) => {
            const text = applyHintedSpeechCorrections(String(result?.transcript || '').trim(), state.speechHints);
            if (!text) return;
            state.latest_text = text;
            const confidence = Number.isFinite(result?.confidence) ? result.confidence : null;
            debugVoiceService('tauri_stt.result', {
                sessionId,
                text,
                isFinal: result?.isFinal === true,
                confidence
            });
            if (result?.isFinal) {
                state.final_texts.push(text);
                state.segments.push(createSegment(text, confidence));
                if (confidence !== null) {
                    state.confidence = confidence;
                }
                const combinedText = String(state.final_texts.join(' ').trim() || text).trim();
                sessionRuntime.pushPartial(sessionId, {
                    text: combinedText
                });
                scheduleSilenceStop(finalSilenceMs);
                return;
            }
            sessionRuntime.pushPartial(sessionId, {
                text
            });
            scheduleSilenceStop(silenceMs);
        }));

        state.cleanup.push(await bridge.onError((error = {}) => {
            debugVoiceService('tauri_stt.error', {
                sessionId,
                error: error?.message || error?.code || String(error)
            });
            void settleError(error);
        }));

        if (typeof bridge.onDownloadProgress === 'function') {
            state.cleanup.push(await bridge.onDownloadProgress((progress = {}) => {
                debugVoiceService('tauri_stt.download_progress', {
                    sessionId,
                    status: String(progress?.status || '').trim() || 'downloading',
                    model: String(progress?.model || '').trim() || null,
                    progress: Number.isFinite(Number(progress?.progress)) ? Number(progress.progress) : null
                });
                sessionRuntime.publishEvent(sessionId, 'voice.stt.download_progress', {
                    status: String(progress?.status || '').trim() || 'downloading',
                    model: String(progress?.model || '').trim() || null,
                    progress: Number.isFinite(Number(progress?.progress)) ? Number(progress.progress) : null
                });
            }));
        }

        sttSessions.set(sessionId, state);
        try {
            await startBridgeWithRecovery();
        } catch (error) {
            await cleanup();
            throw error;
        }
        return {
            session_id: sessionId,
            provider,
            promise: deferred.promise
        };
    };

    const startSpeechSynthesis = (sessionId, text, options = {}) => {
        const synth = getSpeechSynthesis(env);
        const UtteranceCtor = getSpeechSynthesisUtteranceCtor(env);
        if (!synth || !UtteranceCtor) {
            throw new Error('System speech synthesis is not available');
        }

        const utterance = new UtteranceCtor(text);
        utterance.lang = options.lang || DEFAULT_LANG;
        if (typeof options.rate === 'number') utterance.rate = options.rate;
        if (typeof options.pitch === 'number') utterance.pitch = options.pitch;
        if (typeof options.volume === 'number') utterance.volume = options.volume;
        const selectedVoice = resolvePreferredSpeechVoice(synth, {
            lang: utterance.lang,
            voiceId: options.voiceId || null
        });
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        const deferred = createDeferred();
        const state = {
            session_id: sessionId,
            utterance,
            deferred,
            settled: false
        };

        utterance.onend = () => {
            if (state.settled) return;
            state.settled = true;
            ttsSessions.delete(sessionId);
            sessionRuntime.finishSpeaking(sessionId, {
                reason: 'done'
            });
            deferred.resolve({
                session_id: sessionId,
                provider: providers.tts.selected,
                text
            });
        };

        utterance.onerror = (event) => {
            if (state.settled) return;
            state.settled = true;
            ttsSessions.delete(sessionId);
            const error = String(event?.error || event?.message || 'speech_synthesis_error');
            if (/canceled|cancelled|interrupted/i.test(error)) {
                sessionRuntime.finishSpeaking(sessionId, {
                    reason: 'interrupted'
                });
                deferred.resolve({
                    session_id: sessionId,
                    provider: providers.tts.selected,
                    stopped: true,
                    reason: error
                });
                return;
            }
            sessionRuntime.interrupt(sessionId, {
                reason: `tts_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        sessionRuntime.startSpeaking(sessionId, {
            text,
            voice_id: selectedVoice?.voiceURI || selectedVoice?.name || options.voiceId || null
        });
        if (typeof synth.cancel === 'function') {
            synth.cancel();
        }
        synth.speak(utterance);
        ttsSessions.set(sessionId, state);

        return {
            session_id: sessionId,
            provider: providers.tts.selected,
            promise: deferred.promise
        };
    };

    const capture = {
        async start(options = {}) {
            ensureSupported('capture', providers.capture.selected);
            const session = ensureSession(options);
            sessionRuntime.startCapture(session.session_id, {
                source: options.source || 'mic'
            });
            const recordStart = readEnv(env, 'record_start');
            await recordStart({
                sessionId: session.session_id,
                source: options.source || 'mic',
                sampleRate: options.sampleRate,
                channels: options.channels,
                fileName: options.fileName,
                userId: options.userId
            });
            return {
                session_id: session.session_id,
                provider: providers.capture.selected
            };
        },
        async stop(sessionId) {
            ensureSupported('capture', providers.capture.selected);
            const recordStop = readEnv(env, 'record_stop');
            const result = await recordStop(sessionId);
            sessionRuntime.stopCapture(sessionId, result || {});
            return {
                session_id: sessionId,
                provider: providers.capture.selected,
                ...(result && typeof result === 'object' ? result : {})
            };
        },
        async cancel(sessionId) {
            sessionRuntime.cancelCapture(sessionId, 'capture_cancelled');
            return {
                session_id: sessionId,
                cancelled: true,
                provider: providers.capture.selected
            };
        }
    };

    const stt = {
        async start(options = {}) {
            const selectedProvider = providers.stt.selected;
            ensureSupported('stt', selectedProvider);
            const session = ensureSession(options);
            if (selectedProvider === 'tauri_plugin_stt') {
                return startTauriRecognition(session.session_id, options, {
                    provider: selectedProvider
                });
            }
            if (selectedProvider === 'browser_web_speech') {
                return startBrowserRecognition(session.session_id, options, {
                    provider: selectedProvider
                });
            }
            throw new Error(`Unsupported STT provider bridge: ${selectedProvider}`);
        },
        async stop(sessionId, options = {}) {
            const state = sttSessions.get(String(sessionId));
            if (!state) {
                return sessionRuntime.getSession(sessionId);
            }
            const commitPartial = options?.commitPartial === true;
            if (state.bridge && typeof state.bridge.stop === 'function') {
                state.stopReason = commitPartial ? 'commit' : 'manual';
                state.stopRequested = true;
                await state.bridge.stop();
                return state.deferred.promise;
            }
            state.recognition.stop();
            return state.deferred.promise;
        },
        async cancel(sessionId) {
            const state = sttSessions.get(String(sessionId));
            if (!state) {
                return {
                    session_id: sessionId,
                    cancelled: true
                };
            }
            state.cancelled = true;
            state.stopReason = 'cancelled';
            if (state.bridge && typeof state.bridge.stop === 'function') {
                await state.bridge.stop();
                sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', {
                    source: 'stt'
                });
                sessionRuntime.interrupt(sessionId, {
                    reason: 'stt_cancel'
                });
                return state.deferred.promise;
            }
            if (typeof state.recognition.abort === 'function') {
                state.recognition.abort();
            } else {
                state.recognition.stop();
            }
            sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', {
                source: 'stt'
            });
            sessionRuntime.interrupt(sessionId, {
                reason: 'stt_cancel'
            });
            return state.deferred.promise;
        }
    };

    const tts = {
        async speak(text, options = {}) {
            ensureSupported('tts', providers.tts.selected);
            const session = ensureSession(options);
            if (providers.tts.selected === 'browser_speech_synthesis') {
                return startSpeechSynthesis(session.session_id, text, options);
            }
            throw new Error(`Unsupported TTS provider bridge: ${providers.tts.selected}`);
        },
        async stop(sessionId, { reason = 'tts_stop' } = {}) {
            return settleTtsStop(sessionId, {
                reason,
                interruptRuntime: true
            });
        }
    };

    return {
        runtime: sessionRuntime,
        orchestrator,
        providers,
        telemetry,
        vad: {
            create(sessionId, options = {}) {
                return createVoiceActivityDetector({
                    ...options,
                    sessionRuntime,
                    session_id: sessionId
                });
            }
        },
        capture,
        stt,
        tts,
        processing: {
            async run(sessionId, executor, payload = {}) {
                if (typeof executor !== 'function') {
                    throw new Error('voice.processing.run requires an executor function');
                }
                sessionRuntime.startProcessing(sessionId, payload);
                const signal = sessionRuntime.getAbortSignal(sessionId, 'processing');
                const context = sessionRuntime.buildInvocationContext(sessionId);
                const deferred = createDeferred();
                const state = {
                    session_id: sessionId,
                    signal,
                    context,
                    deferred,
                    settled: false
                };
                processingTasks.set(String(sessionId), state);

                Promise.resolve()
                    .then(() => executor({
                        session_id: sessionId,
                        signal,
                        context,
                        payload
                    }))
                    .then((result) => {
                        if (state.settled) return;
                        state.settled = true;
                        processingTasks.delete(String(sessionId));
                        const snapshot = sessionRuntime.getSession(sessionId);
                        if (!['interrupted', 'cancelled', 'failed'].includes(snapshot.phase)) {
                            sessionRuntime.finishProcessing(sessionId, {
                                reason: 'done'
                            });
                        }
                        deferred.resolve({
                            session_id: sessionId,
                            aborted: false,
                            context,
                            result
                        });
                    })
                    .catch((error) => {
                        if (state.settled) return;
                        state.settled = true;
                        processingTasks.delete(String(sessionId));
                        if (signal?.aborted) {
                            deferred.resolve({
                                session_id: sessionId,
                                aborted: true,
                                reason: signal.reason || 'aborted',
                                context
                            });
                            return;
                        }
                        sessionRuntime.publishEvent(sessionId, 'voice.processing.error', {
                            message: error?.message || String(error)
                        });
                        deferred.reject(error);
                    });

                return {
                    session_id: sessionId,
                    signal,
                    context,
                    promise: deferred.promise
                };
            },
            get(sessionId) {
                const state = processingTasks.get(String(sessionId));
                if (!state) return null;
                return {
                    session_id: state.session_id,
                    signal: state.signal,
                    context: state.context,
                    promise: state.deferred.promise
                };
            }
        },
        async interrupt(sessionId, {
            utterance = null,
            reason = 'voice_interrupt',
            intent_id = null
        } = {}) {
            const parsed = utterance ? normalizeLocalVoiceCommand(utterance) : null;
            if (parsed) {
                if (ttsSessions.has(String(sessionId))) {
                    await settleTtsStop(sessionId, {
                        reason: `local_${parsed.command}`,
                        interruptRuntime: false
                    });
                }
                return sessionRuntime.handleLocalCommand(sessionId, utterance, {
                    intent_id
                });
            }
            if (ttsSessions.has(String(sessionId))) {
                await settleTtsStop(sessionId, {
                    reason,
                    interruptRuntime: false
                });
            }
            return sessionRuntime.interrupt(sessionId, { reason, utterance });
        },
        takePendingFollowup(sessionId, options = {}) {
            return sessionRuntime.consumePendingFollowup(sessionId, options);
        },
        planUtterance(utterance, options = {}) {
            return orchestrator.planUtterance(utterance, options);
        },
        listTraces(options = {}) {
            return typeof orchestrator.listTraces === 'function' ? orchestrator.listTraces(options) : [];
        },
        queryTraces(options = {}) {
            return typeof orchestrator.queryTraces === 'function' ? orchestrator.queryTraces(options) : [];
        },
        traceMetrics(options = {}) {
            return typeof orchestrator.traceMetrics === 'function' ? orchestrator.traceMetrics(options) : {};
        },
        listPendingMutations(options = {}) {
            return typeof orchestrator.listPendingMutations === 'function' ? orchestrator.listPendingMutations(options) : [];
        },
        flushPendingMutations(options = {}) {
            return typeof orchestrator.flushPendingMutations === 'function'
                ? orchestrator.flushPendingMutations(options)
                : Promise.resolve({ processed: 0, failed: 0, remaining: 0 });
        },
        async executeIntent(intent, options = {}) {
            const response = await orchestrator.executeIntent(intent, options);
            return maybeSpeakResponse(response, options);
        },
        async executeUtterance(utterance, options = {}) {
            const response = await orchestrator.executeUtterance(utterance, options);
            return maybeSpeakResponse(response, options);
        },
        planFollowup(sessionId, options = {}) {
            return orchestrator.planSessionFollowup(sessionId, options);
        },
        async executeFollowup(sessionId, options = {}) {
            const response = await orchestrator.executeSessionFollowup(sessionId, options);
            return maybeSpeakResponse(response, {
                ...options,
                session_id: sessionId
            });
        },
        proactive: {
            async buildStartupBriefing(options = {}) {
                if (!orchestrator.toolRouter && typeof orchestrator.initToolRouter === 'function') {
                    await orchestrator.initToolRouter({
                        workingMemory: sessionRuntime?.workingMemory ?? null
                    }).catch(() => null);
                }
                return buildStartupBriefing({
                    toolRouter: orchestrator.toolRouter,
                    persistentMemory: orchestrator.persistentMemory,
                    proactiveState,
                    locale: options.locale || options.lang || DEFAULT_LANG
                });
            },
            evaluateNotifications(options = {}) {
                return evaluateProactiveNotifications({
                    ...options,
                    persistentMemory: orchestrator.persistentMemory,
                    proactiveState
                });
            },
            coalesceNotifications(triggers = [], options = {}) {
                return coalesceProactiveNotifications(triggers, options);
            },
            getState() {
                return proactiveState.load();
            },
            setEnabled(enabled) {
                return proactiveState.setEnabled(enabled);
            },
            setStartupBriefingEnabled(enabled) {
                return proactiveState.setStartupBriefingEnabled(enabled);
            },
            recordDelivery(domain, at = new Date()) {
                return proactiveState.recordDelivery(domain, at);
            },
            snoozeDomain(domain, until) {
                return proactiveState.snoozeDomain(domain, until);
            },
            dismissTrigger(triggerKey = '') {
                if (orchestrator.persistentMemory?.recordDismissFeedback) {
                    orchestrator.persistentMemory.recordDismissFeedback(triggerKey);
                }
                return {
                    ok: true,
                    trigger_key: String(triggerKey || '').trim()
                };
            }
        },
        async listen(options = {}) {
            const started = await stt.start(options);
            if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
                const timeout = setTimeout(() => {
                    stt.stop(started.session_id).catch(() => { });
                }, options.timeoutMs);
                return started.promise.finally(() => clearTimeout(timeout));
            }
            return started.promise;
        }
    };
};
