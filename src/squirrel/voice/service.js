import { createVoiceSessionRuntime, normalizeLocalVoiceCommand } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import { createVoiceLatencyTelemetry } from './telemetry.js';
import { createVoiceActivityDetector } from './vad.js';
import { createVoiceAiPlanner } from './ai_planner.js';

const DEFAULT_LANG = 'fr-FR';

const toDebugPayload = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
};

const debugVoiceService = (...args) => {
    try {
        globalThis?.console?.log?.('[eVe:voice:service]', ...args.map((entry) => (
            typeof entry === 'string' ? entry : toDebugPayload(entry)
        )));
    } catch (_) {
        // Ignore logging failures.
    }
};

export const VOICE_V1_PROVIDER_DECISION = Object.freeze({
    stt: {
        primary: 'tauri_plugin_stt',
        fallback: 'browser_web_speech',
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
        primary: 'iplug_native_recorder'
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

const createSegment = (text, confidence = null) => ({
    text: String(text || '').trim(),
    ...(Number.isFinite(confidence) ? { confidence } : {})
});

const isPermissionGranted = (permission = null) => permission === 'granted';

const isPermissionDenied = (permission = null) => permission === 'denied';

export const resolveVoiceProviders = (env = globalThis) => {
    const recognitionCtor = getSpeechRecognitionCtor(env);
    const tauriStt = getTauriSttBridge(env);
    const synth = getSpeechSynthesis(env);
    const utteranceCtor = getSpeechSynthesisUtteranceCtor(env);
    const recordStart = readEnv(env, 'record_start');
    const recordStop = readEnv(env, 'record_stop');

    const sttSelected = tauriStt
        ? 'tauri_plugin_stt'
        : (recognitionCtor ? 'browser_web_speech' : 'unsupported');

    const ttsSelected = (synth && utteranceCtor)
        ? 'browser_speech_synthesis'
        : 'unsupported';

    const captureSelected = (typeof recordStart === 'function' && typeof recordStop === 'function')
        ? 'iplug_native_recorder'
        : 'unsupported';

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
    const sttSessions = new Map();
    const ttsSessions = new Map();
    const processingTasks = new Map();
    const telemetry = createVoiceLatencyTelemetry();
    telemetry.attachRuntime(sessionRuntime);
    const resolvedAiPlanner = aiPlanner === null
        ? (((env?.AtomeAI || env?.window?.AtomeAI) && env?.fetch) ? createVoiceAiPlanner({ env }) : null)
        : aiPlanner;
    const orchestrator = createVoiceOrchestrator({
        env,
        sessionRuntime,
        aiPlanner: resolvedAiPlanner
    });

    const resolveResponseLocale = (response = {}, options = {}) => {
        const locale = String(
            options?.lang
            || options?.locale
            || response?.intent?.locale
            || env?.eveI18n?.getLocale?.()
            || env?.document?.documentElement?.lang
            || DEFAULT_LANG
        ).trim();
        return locale || DEFAULT_LANG;
    };

    const maybeSpeakResponse = async (response = {}, options = {}) => {
        const text = String(response?.spoken_reply || response?.reply_text || '').trim();
        if (!text || options?.autoSpeak === false) {
            return response;
        }
        try {
            await tts.speak(text, {
                ...options,
                session_id: options?.session_id,
                lang: resolveResponseLocale(response, options)
            });
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
            locale: options.lang || options.locale || DEFAULT_LANG,
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

    const startBrowserRecognition = (sessionId, options = {}) => {
        const RecognitionCtor = getSpeechRecognitionCtor(env);
        if (!RecognitionCtor) {
            throw new Error('Browser speech recognition is not available');
        }

        const recognition = new RecognitionCtor();
        const deferred = createDeferred();
        const state = {
            session_id: sessionId,
            recognition,
            deferred,
            cancelled: false,
            final_texts: [],
            segments: [],
            confidence: null
        };

        recognition.lang = options.lang || DEFAULT_LANG;
        recognition.interimResults = options.partial !== false;
        recognition.continuous = options.continuous === true;

        recognition.onstart = () => {
            sessionRuntime.startListening(sessionId, {
                lang: recognition.lang,
                partial: recognition.interimResults,
                provider: providers.stt.selected
            });
        };

        recognition.onresult = (event) => {
            let partialText = '';
            const results = Array.from(event?.results || []);
            const startIndex = Number.isFinite(event?.resultIndex) ? event.resultIndex : 0;
            for (let index = startIndex; index < results.length; index += 1) {
                const result = results[index];
                const alternative = result?.[0];
                const text = String(alternative?.transcript || '').trim();
                if (!text) continue;
                const confidence = Number.isFinite(alternative?.confidence) ? alternative.confidence : null;
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
            sttSessions.delete(sessionId);
            const error = String(event?.error || event?.message || 'speech_recognition_error');
            sessionRuntime.interrupt(sessionId, {
                reason: `stt_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        recognition.onend = () => {
            sttSessions.delete(sessionId);
            if (state.cancelled) {
                deferred.resolve({
                    session_id: sessionId,
                    cancelled: true,
                    provider: providers.stt.selected
                });
                return;
            }
            const snapshot = sessionRuntime.getSession(sessionId);
            const finalText = state.final_texts.join(' ').trim()
                || snapshot.transcript.partial
                || snapshot.transcript.final
                || '';
            const result = {
                text: finalText,
                confidence: state.confidence,
                segments: state.segments,
                provider: providers.stt.selected
            };
            sessionRuntime.finalizeListening(sessionId, result);
            deferred.resolve({
                session_id: sessionId,
                ...result
            });
        };

        recognition.start();
        sttSessions.set(sessionId, state);

        return {
            session_id: sessionId,
            provider: providers.stt.selected,
            promise: deferred.promise
        };
    };

    const startTauriRecognition = async (sessionId, options = {}) => {
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
        const silenceMs = Number.isFinite(options.silenceMs) && options.silenceMs >= 0
            ? Number(options.silenceMs)
            : 1200;
        const state = {
            session_id: sessionId,
            bridge,
            deferred,
            cancelled: false,
            settled: false,
            stopReason: null,
            stopRequested: false,
            cleanup: [],
            final_texts: [],
            segments: [],
            confidence: null,
            latest_text: '',
            inactivityTimer: null
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

        const scheduleSilenceStop = () => {
            if (silenceMs <= 0 || state.settled || state.cancelled) return;
            clearInactivityTimer();
            state.inactivityTimer = setTimeout(() => {
                void requestBridgeStop('silence');
            }, silenceMs);
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

        const settleFinal = async (result = {}) => {
            if (state.settled) return;
            state.settled = true;
            clearInactivityTimer();
            const finalText = String(result.text || state.final_texts.join(' ').trim()).trim();
            const payload = {
                text: finalText,
                confidence: result.confidence ?? state.confidence,
                segments: result.segments || state.segments,
                provider: providers.stt.selected
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
                provider: providers.stt.selected,
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
                    lang: options.lang || DEFAULT_LANG,
                    partial: options.partial !== false,
                    provider: providers.stt.selected
                });
                return;
            }
            if (next === 'idle') {
                if (state.cancelled || state.stopReason === 'cancelled' || state.stopReason === 'manual') {
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
            const text = String(result?.transcript || '').trim();
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
                clearInactivityTimer();
                void settleFinal({
                    text,
                    confidence,
                    segments: state.segments,
                    reason: 'final'
                });
                return;
            }
            sessionRuntime.pushPartial(sessionId, {
                text
            });
            scheduleSilenceStop();
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

        await bridge.start({
            language: options.lang || DEFAULT_LANG,
            interimResults: options.partial !== false,
            continuous: options.continuous === true,
            maxDuration: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 0,
            onDevice: options.onDevice === true
        });

        sttSessions.set(sessionId, state);
        return {
            session_id: sessionId,
            provider: providers.stt.selected,
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
        if (options.voiceId && typeof synth.getVoices === 'function') {
            const match = synth.getVoices().find((voice) => voice?.name === options.voiceId || voice?.voiceURI === options.voiceId);
            if (match) utterance.voice = match;
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
            sessionRuntime.interrupt(sessionId, {
                reason: `tts_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        sessionRuntime.startSpeaking(sessionId, {
            text,
            voice_id: options.voiceId || null
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
            ensureSupported('stt', providers.stt.selected);
            const session = ensureSession(options);
            if (providers.stt.selected === 'tauri_plugin_stt') {
                return startTauriRecognition(session.session_id, options);
            }
            if (providers.stt.selected === 'browser_web_speech') {
                return startBrowserRecognition(session.session_id, options);
            }
            throw new Error(`Unsupported STT provider bridge: ${providers.stt.selected}`);
        },
        async stop(sessionId) {
            const state = sttSessions.get(String(sessionId));
            if (!state) {
                return sessionRuntime.getSession(sessionId);
            }
            if (state.bridge && typeof state.bridge.stop === 'function') {
                state.stopReason = 'manual';
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
        async listen(options = {}) {
            const started = await stt.start(options);
            if (Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
                const timeout = setTimeout(() => {
                    stt.stop(started.session_id).catch(() => {});
                }, options.timeoutMs);
                return started.promise.finally(() => clearTimeout(timeout));
            }
            return started.promise;
        }
    };
};
