import { collectSpeechHints, applyHintedSpeechCorrections, resolveSpeechLocale } from './service_speech.js';
import {
    DEFAULT_LANG,
    DEFAULT_STT_FINAL_SILENCE_MS,
    DEFAULT_STT_MAX_ALTERNATIVES,
    DEFAULT_STT_SILENCE_MS,
    createDeferred,
    createSegment,
    debugVoiceService,
    getTauriSttBridge,
    isPermissionDenied,
    isPermissionGranted,
    wait
} from './service_support.js';

export const startTauriRecognition = async (context, sessionId, options = {}, {
        provider = 'tauri_plugin_stt'
    } = {}) => {
        const bridge = getTauriSttBridge(context.env);
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
        const speechHints = collectSpeechHints(context.env, context.sessionRuntime, sessionId, options);
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
            settleCancelled: null,
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
            context.sttSessions.delete(sessionId);
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
            context.sessionRuntime.finalizeListening(sessionId, payload);
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
        state.settleCancelled = settleStopped;

        const settleError = async (error) => {
            if (state.settled) return;
            state.settled = true;
            clearInactivityTimer();
            await cleanup();
            const message = String(error?.message || error?.code || error || 'tauri_stt_error');
            context.sessionRuntime.interrupt(sessionId, {
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
                context.sessionRuntime.startListening(sessionId, {
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
                context.sessionRuntime.pushPartial(sessionId, {
                    text: combinedText
                });
                scheduleSilenceStop(finalSilenceMs);
                return;
            }
            context.sessionRuntime.pushPartial(sessionId, {
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
                context.sessionRuntime.publishEvent(sessionId, 'voice.stt.download_progress', {
                    status: String(progress?.status || '').trim() || 'downloading',
                    model: String(progress?.model || '').trim() || null,
                    progress: Number.isFinite(Number(progress?.progress)) ? Number(progress.progress) : null
                });
            }));
        }

        context.sttSessions.set(sessionId, state);
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
