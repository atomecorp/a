import { resolvePreferredSpeechVoice } from './service_speech.js';
import { DEFAULT_LANG, createDeferred, getSpeechSynthesis, getSpeechSynthesisUtteranceCtor } from './service_support.js';

export const settleTtsStop = async (context, sessionId, {
        reason = 'tts_stop',
        interruptRuntime = true
    } = {}) => {
        const synth = getSpeechSynthesis(context.env);
        if (synth && typeof synth.cancel === 'function') {
            synth.cancel();
        }
        const state = context.ttsSessions.get(String(sessionId));
        if (state && !state.settled) {
            state.settled = true;
            context.ttsSessions.delete(String(sessionId));
            context.sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', {
                source: 'tts'
            });
            if (interruptRuntime) {
                context.sessionRuntime.interrupt(sessionId, { reason });
            }
            state.deferred.resolve({
                session_id: sessionId,
                provider: context.providers.tts.selected,
                stopped: true
            });
            return state.deferred.promise;
        }
        if (interruptRuntime) {
            context.sessionRuntime.publishEvent(sessionId, 'voice.cancel.requested', {
                source: 'tts'
            });
            context.sessionRuntime.interrupt(sessionId, { reason });
        }
        return {
            session_id: sessionId,
            provider: context.providers.tts.selected,
            stopped: true
        };
    };

export const startSpeechSynthesis = (context, sessionId, text, options = {}) => {
        const synth = getSpeechSynthesis(context.env);
        const UtteranceCtor = getSpeechSynthesisUtteranceCtor(context.env);
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
            context.ttsSessions.delete(sessionId);
            context.sessionRuntime.finishSpeaking(sessionId, {
                reason: 'done'
            });
            deferred.resolve({
                session_id: sessionId,
                provider: context.providers.tts.selected,
                text
            });
        };

        utterance.onerror = (event) => {
            if (state.settled) return;
            state.settled = true;
            context.ttsSessions.delete(sessionId);
            const error = String(event?.error || event?.message || 'speech_synthesis_error');
            if (/canceled|cancelled|interrupted/i.test(error)) {
                context.sessionRuntime.finishSpeaking(sessionId, {
                    reason: 'interrupted'
                });
                deferred.resolve({
                    session_id: sessionId,
                    provider: context.providers.tts.selected,
                    stopped: true,
                    reason: error
                });
                return;
            }
            context.sessionRuntime.interrupt(sessionId, {
                reason: `tts_error:${error}`
            });
            deferred.reject(new Error(error));
        };

        context.sessionRuntime.startSpeaking(sessionId, {
            text,
            voice_id: selectedVoice?.voiceURI || selectedVoice?.name || options.voiceId || null
        });
        if (typeof synth.cancel === 'function') {
            synth.cancel();
        }
        synth.speak(utterance);
        context.ttsSessions.set(sessionId, state);

        return {
            session_id: sessionId,
            provider: context.providers.tts.selected,
            promise: deferred.promise
        };
    };
