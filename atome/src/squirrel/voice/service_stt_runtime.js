import { debugVoiceService, getTauriSttBridge } from './service_support.js';

export const createVoiceSttRuntime = ({
    providers,
    sessionRuntime,
    sttSessions,
    ensureSession,
    ensureSupported,
    inputMeter,
    runtimeContext,
    startBrowserRecognition,
    startTauriRecognition
} = {}) => ({
    async prepare({ lang = 'fr-FR' } = {}) {
        const selectedProvider = providers.stt.selected;
        ensureSupported('stt', selectedProvider);
        if (selectedProvider !== 'tauri_plugin_stt') {
            return { ready: true, provider: selectedProvider };
        }
        const bridge = getTauriSttBridge(runtimeContext.env);
        if (typeof bridge?.prepare !== 'function') throw new Error('native_stt_prepare_unavailable');
        const startedAt = Date.now();
        debugVoiceService('stt.model.prepare.start', { provider: selectedProvider, lang }, runtimeContext.env);
        try {
            await bridge.prepare(lang);
            const result = { ready: true, provider: selectedProvider, lang, elapsed_ms: Date.now() - startedAt };
            debugVoiceService('stt.model.prepare.ready', result, runtimeContext.env);
            return result;
        } catch (error) {
            debugVoiceService('stt.model.prepare.failed', {
                provider: selectedProvider,
                lang,
                elapsed_ms: Date.now() - startedAt,
                error: error?.message || String(error)
            }, runtimeContext.env);
            throw error;
        }
    },
    async start(options = {}) {
        const selectedProvider = providers.stt.selected;
        ensureSupported('stt', selectedProvider);
        const session = ensureSession(options);
        // Native STT provides the canonical microphone stream, so subscribe
        // before it starts. Browser Web Speech starts immediately while its
        // separate permission-bound meter initializes asynchronously.
        const inputMeterReady = inputMeter.start(session.session_id, {
            purpose: options.purpose || 'user_turn'
        });
        if (selectedProvider === 'tauri_plugin_stt') await inputMeterReady;
        try {
            const started = selectedProvider === 'tauri_plugin_stt'
                ? await startTauriRecognition(runtimeContext, session.session_id, options, { provider: selectedProvider })
                : selectedProvider === 'browser_web_speech'
                    ? await startBrowserRecognition(runtimeContext, session.session_id, options, { provider: selectedProvider })
                    : (() => { throw new Error(`Unsupported STT provider bridge: ${selectedProvider}`); })();
            return {
                ...started,
                promise: Promise.resolve(started?.promise).finally(() => inputMeter.stop(session.session_id))
            };
        } catch (error) {
            await inputMeter.stop(session.session_id);
            throw error;
        }
    },
    async stop(sessionId, options = {}) {
        const state = sttSessions.get(String(sessionId));
        if (!state) {
            await inputMeter.stop(sessionId);
            return sessionRuntime.getSession(sessionId);
        }
        const commitPartial = options?.commitPartial === true;
        if (state.bridge?.stop) {
            state.stopReason = commitPartial ? 'commit' : 'manual';
            state.stopRequested = true;
            await state.bridge.stop();
        } else {
            state.recognition.stop();
        }
        return state.deferred.promise.finally(() => inputMeter.stop(sessionId));
    },
    async cancel(sessionId) {
        const state = sttSessions.get(String(sessionId));
        if (!state) {
            await inputMeter.stop(sessionId);
            return { session_id: sessionId, cancelled: true };
        }
        state.cancelled = true;
        state.stopReason = 'cancelled';
        if (state.bridge?.stop) {
            await state.bridge.stop();
        } else if (typeof state.recognition.abort === 'function') {
            state.recognition.abort();
        } else {
            state.recognition.stop();
        }
        sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', { source: 'stt' });
        sessionRuntime.interrupt(sessionId, { reason: 'stt_cancel' });
        await state.settleCancelled?.();
        return state.deferred.promise.finally(() => inputMeter.stop(sessionId));
    }
});
