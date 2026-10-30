// Free dictation through the connected assistant (R-013 Q12, todo/refonte_assistant_vocal.md §8):
// the microphone's 16 kHz capture (wake_capture.js) is kept while the person speaks, ends after
// a silence (or Arrêter), and is transcribed by the assistant's provider (`transcription`, the
// same request as assistant_media_session.js). No partial text: the words come at the end. A
// dictation where nobody spoke sends nothing and writes nothing. Errors are the session's own.
import { createWakeCapture } from './wake_capture.js';
import { createVoiceActivityDetector } from './vad.js';
import { pcm16WavBytes } from './tts_pcm_analysis.js';
import { WAKE_SAMPLE_RATE } from './wake_features.js';
import { resolveSpeechLocale } from './service_speech.js';
import { requestProviderService, encodeProviderFile } from '../ai/provider_broker.js';
import { OPENAI_MODALITY_MODELS } from '../ai/model_catalog_registry.js';
import { DEFAULT_LANG, DEFAULT_STT_FINAL_SILENCE_MS, DEFAULT_STT_SILENCE_MS, createDeferred, createSegment } from './service_support.js';

// The provider takes one file of 20 MB at most: 16-bit mono at 16 kHz, ten minutes are 19.2 MB.
const MAX_SECONDS = 600;

export const startAssistantTranscription = async (context, sessionId, options = {}, {
    provider = 'assistant_transcription', capture = createWakeCapture, request = requestProviderService
} = {}) => {
    const { env, sessionRuntime, sttSessions } = context;
    const lang = resolveSpeechLocale(options.lang || options.locale || DEFAULT_LANG);
    const silenceMs = Number(options.silenceMs) > 0 ? Number(options.silenceMs) : DEFAULT_STT_SILENCE_MS;
    const finalSilenceMs = Number(options.finalSilenceMs) > 0 ? Number(options.finalSilenceMs) : DEFAULT_STT_FINAL_SILENCE_MS;
    const vad = createVoiceActivityDetector();
    const deferred = createDeferred();
    const chunks = [];
    let samples = 0, spoke = false, quietMs = 0, microphone = null;
    const state = { session_id: sessionId, deferred, settled: false, cancelled: false, bridge: null };

    const fail = (error) => {
        if (state.settled) return;
        state.settled = true;
        sttSessions.delete(sessionId);
        sessionRuntime.interrupt(sessionId, { reason: `stt_error:${error.message}` });
        deferred.reject(error);
    };
    const transcribe = async () => {
        const pcm = new Float32Array(samples);
        chunks.reduce((offset, chunk) => { pcm.set(chunk, offset); return offset + chunk.length; }, 0);
        const wav = new env.Blob([pcm16WavBytes(pcm, WAKE_SAMPLE_RATE)], { type: 'audio/wav' });
        const result = await request('transcription', { model: OPENAI_MODALITY_MODELS.transcription, language: lang.split('-')[0],
            files: [{ field: 'file', name: 'dictation.wav', mime: 'audio/wav', base64: await encodeProviderFile(wav, env) }] });
        return String(result?.text || '').trim();
    };
    // The end, whatever brought it: silence, the length limit, Arrêter or a cancel.
    let ending = null;
    const finish = () => {
        ending ||= (async () => {
            await microphone?.close();
            if (state.cancelled) {
                state.settled = true;
                sttSessions.delete(sessionId);
                deferred.resolve({ session_id: sessionId, cancelled: true, provider });
                return;
            }
            const text = spoke ? await transcribe() : '';
            if (state.settled) return;
            state.settled = true;
            sttSessions.delete(sessionId);
            const result = { text, confidence: null, segments: text ? [createSegment(text)] : [], provider };
            sessionRuntime.finalizeListening(sessionId, result);
            deferred.resolve({ session_id: sessionId, ...result });
        })().catch(fail);
        return ending;
    };
    const onFrame = (frame) => {
        if (state.settled || ending) return;
        const chunk = Float32Array.from(frame, sample => sample / 32768);
        chunks.push(chunk);
        samples += chunk.length;
        const heard = vad.push(chunk);
        spoke ||= heard.state === 'speech';
        quietMs = heard.above_threshold ? 0 : quietMs + (chunk.length / WAKE_SAMPLE_RATE) * 1000;
        const elapsedMs = (samples / WAKE_SAMPLE_RATE) * 1000;
        if ((spoke && quietMs >= finalSilenceMs) || (!spoke && elapsedMs >= silenceMs) || elapsedMs >= MAX_SECONDS * 1000) void finish();
    };

    state.bridge = { stop: finish };
    microphone = capture({ env, onFrame, onError: error => { void microphone.close(); fail(error); } });
    // A microphone that does not open fails the start itself; nothing is listening yet.
    await microphone.start();
    sttSessions.set(sessionId, state);
    sessionRuntime.startListening(sessionId, { lang, partial: false, provider });
    return { session_id: sessionId, provider, promise: deferred.promise };
};
