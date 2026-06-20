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
import {
    DEFAULT_LANG,
    createDeferred,
    debugVoiceService,
    readEnv
} from './service_support.js';
import { resolveSpeechLocale } from './service_speech.js';
import { resolveVoiceProviders } from './service_providers.js';
import { startBrowserRecognition } from './service_browser_stt.js';
import { startTauriRecognition } from './service_tauri_stt.js';
import { settleTtsStop, startSpeechSynthesis } from './service_tts_runtime.js';

export { VOICE_V1_PROVIDER_DECISION, resolveVoiceProviders } from './service_providers.js';

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
    const runtimeContext = {
        env,
        providers,
        sessionRuntime,
        sttSessions,
        ttsSessions
    };

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
                return startTauriRecognition(runtimeContext, session.session_id, options, {
                    provider: selectedProvider
                });
            }
            if (selectedProvider === 'browser_web_speech') {
                return startBrowserRecognition(runtimeContext, session.session_id, options, {
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
                return startSpeechSynthesis(runtimeContext, session.session_id, text, options);
            }
            throw new Error(`Unsupported TTS provider bridge: ${providers.tts.selected}`);
        },
        async stop(sessionId, { reason = 'tts_stop' } = {}) {
            return settleTtsStop(runtimeContext, sessionId, {
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
                    await settleTtsStop(runtimeContext, sessionId, {
                        reason: `local_${parsed.command}`,
                        interruptRuntime: false
                    });
                }
                return sessionRuntime.handleLocalCommand(sessionId, utterance, {
                    intent_id
                });
            }
            if (ttsSessions.has(String(sessionId))) {
                await settleTtsStop(runtimeContext, sessionId, {
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
