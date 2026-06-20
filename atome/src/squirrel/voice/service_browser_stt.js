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
        const speechHints = collectSpeechHints(context.env, context.sessionRuntime, sessionId, options);
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
            context.sessionRuntime.startListening(sessionId, {
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
                context.sessionRuntime.pushPartial(sessionId, {
                    text: partialText
                });
            }
        };

        recognition.onerror = (event) => {
            if (state.settled) return;
            state.settled = true;
            context.sttSessions.delete(sessionId);
            const error = normalizeErrorMessage(event) || 'speech_recognition_error';
            context.sessionRuntime.interrupt(sessionId, {
                reason: `stt_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        recognition.onend = () => {
            if (state.settled) return;
            state.settled = true;
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
        };

        context.sttSessions.set(sessionId, state);
        try {
            recognition.start();
        } catch (error) {
            state.settled = true;
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
