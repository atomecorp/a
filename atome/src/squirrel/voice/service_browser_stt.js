import { collectSpeechHints, applyHintedSpeechCorrections, resolveSpeechLocale, selectBestSpeechCandidate } from './service_speech.js';
import { DEFAULT_LANG, DEFAULT_STT_MAX_ALTERNATIVES, createDeferred, createSegment, getSpeechRecognitionCtor, normalizeErrorMessage } from './service_support.js';

export const startBrowserRecognition = (context, sessionId, options = {}, {
        provider = 'browser_web_speech'
    } = {}) => {
        const RecognitionCtor = getSpeechRecognitionCtor(context.env);
        if (!RecognitionCtor) {
            throw new Error('Browser speech recognition is not available');
        }

        const recognition = new RecognitionCtor();
        const deferred = createDeferred();
        // A conversation (`onUtterance`) keeps one recognition open and receives each
        // sentence as it ends: a recognition that stops and starts again hears nothing
        // for a while on WebKit (iOS), so a conversation never cuts it between sentences.
        const onUtterance = typeof options.onUtterance === 'function' ? options.onUtterance : null;
        const speechHints = collectSpeechHints(context.env, context.sessionRuntime, sessionId, options);
        const resolvedLang = resolveSpeechLocale(options.lang || options.locale || DEFAULT_LANG);
        const maxAlternatives = Number.isFinite(Number(options.maxAlternatives))
            ? Math.max(1, Number(options.maxAlternatives))
            : DEFAULT_STT_MAX_ALTERNATIVES;
        const silenceMs = Number.isFinite(Number(options.silenceMs))
            ? Math.max(250, Number(options.silenceMs))
            : 8000;
        const finalSilenceMs = Number.isFinite(Number(options.finalSilenceMs))
            ? Math.max(100, Number(options.finalSilenceMs))
            : 2400;
        const state = {
            session_id: sessionId,
            recognition,
            deferred,
            settled: false,
            cancelled: false,
            final_texts: [],
            segments: [],
            confidence: null,
            speechHints,
            endpointTimer: null
        };

        const clearEndpointTimer = () => {
            if (state.endpointTimer === null) return;
            const clear = context.env?.clearTimeout?.bind(context.env) || globalThis.clearTimeout.bind(globalThis);
            clear(state.endpointTimer);
            state.endpointTimer = null;
        };
        const scheduleEndpoint = (delayMs) => {
            clearEndpointTimer();
            const schedule = context.env?.setTimeout?.bind(context.env) || globalThis.setTimeout.bind(globalThis);
            state.endpointTimer = schedule(() => {
                state.endpointTimer = null;
                if (state.settled || state.cancelled) return;
                try {
                    recognition.stop();
                } catch (_) {
                    // The recognition host may already be ending.
                }
            }, delayMs);
        };

        recognition.lang = resolvedLang;
        recognition.interimResults = options.partial !== false;
        recognition.continuous = options.continuous === true || !!onUtterance;
        recognition.maxAlternatives = maxAlternatives;

        recognition.onstart = () => {
            context.sessionRuntime.startListening(sessionId, {
                lang: recognition.lang,
                partial: recognition.interimResults,
                provider
            });
        };

        recognition.onresult = (event) => {
            if (state.muted) return;
            let partialText = '';
            let receivedFinal = false;
            let utterance = '';
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
                if (result?.isFinal && onUtterance) {
                    utterance = utterance ? `${utterance} ${text}` : text;
                } else if (result?.isFinal) {
                    receivedFinal = true;
                    state.final_texts.push(text);
                    state.segments.push(createSegment(text, confidence));
                    if (confidence !== null) {
                        state.confidence = confidence;
                    }
                } else {
                    partialText = partialText ? `${partialText} ${text}` : text;
                }
            }
            if (partialText || utterance) {
                context.sessionRuntime.pushPartial(sessionId, {
                    text: partialText || utterance
                });
            }
            if (onUtterance) {
                if (utterance) onUtterance({ text: applyHintedSpeechCorrections(utterance, state.speechHints) });
                return;
            }
            if (receivedFinal) scheduleEndpoint(finalSilenceMs);
            else if (partialText) scheduleEndpoint(silenceMs);
        };

        recognition.onerror = (event) => {
            if (state.settled) return;
            // Silence heard, or the end of a cancelled listening, is not a failure:
            // the session ends as it would have, empty or cancelled. WebKit (iOS)
            // reports silence as `aborted` with the message « No speech detected ».
            if (event?.error === 'no-speech' || state.cancelled
                || (event?.error === 'aborted' && /no speech/i.test(String(event?.message || '')))) {
                settleEnded();
                return;
            }
            state.settled = true;
            clearEndpointTimer();
            context.sttSessions.delete(sessionId);
            const error = normalizeErrorMessage(event) || 'speech_recognition_error';
            context.sessionRuntime.interrupt(sessionId, {
                reason: `stt_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        function settleEnded() {
            if (state.settled) return;
            state.settled = true;
            clearEndpointTimer();
            context.sttSessions.delete(sessionId);
            if (state.cancelled) {
                deferred.resolve({
                    session_id: sessionId,
                    cancelled: true,
                    provider
                });
                return;
            }
            const snapshot = context.sessionRuntime.getSession(sessionId);
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
            context.sessionRuntime.finalizeListening(sessionId, result);
            deferred.resolve({
                session_id: sessionId,
                ...result
            });
        }
        recognition.onend = settleEnded;

        context.sttSessions.set(sessionId, state);
        try {
            recognition.start();
        } catch (error) {
            state.settled = true;
            clearEndpointTimer();
            context.sttSessions.delete(sessionId);
            const message = normalizeErrorMessage(error) || 'speech_recognition_error';
            context.sessionRuntime.interrupt(sessionId, {
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
