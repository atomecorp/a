import { resolveHomeVoiceConfig } from './home_surface_state.js';
import {
    isClearlyCompleteCommand,
    isLikelyAssistantEcho,
    isTranscriptActionable,
    mergeTranscriptFragments,
    toText
} from './home_surface_transcript.js';
import { writeVoiceDiagnostic } from './telemetry.js';

const cloneState = (state) => ({
    active: state.active,
    error: state.error,
    phase: state.phase,
    sessionId: state.sessionId
});

const awaitOperation = async (operation) => {
    const result = await operation;
    return result?.promise ? result.promise : result;
};

export const createVoiceAssistantSessionController = ({
    voiceApi,
    openingGreeting,
    touchResponse,
    closingGreeting,
    locale = 'fr-FR',
    actorId = 'eve_voice_assistant',
    executionTransport = 'mcp',
    env = globalThis
} = {}) => {
    if (!voiceApi || typeof voiceApi.ensureReady !== 'function') {
        throw new Error('voice_assistant_api_required');
    }
    [
        'cancelListening', 'createSession', 'executeUtterance', 'interrupt',
        'speak', 'startListening', 'stopListening', 'stopSpeaking', 'subscribe'
    ].forEach((method) => {
        if (typeof voiceApi[method] !== 'function') throw new Error(`voice_assistant_api_method_required:${method}`);
    });
    if (!String(openingGreeting || '').trim()) throw new Error('voice_assistant_opening_greeting_required');
    if (!String(touchResponse || '').trim()) throw new Error('voice_assistant_touch_response_required');
    if (!String(closingGreeting || '').trim()) throw new Error('voice_assistant_closing_greeting_required');
    const listeners = new Set();
    const voiceConfig = resolveHomeVoiceConfig(env);
    let openPromise = null;
    let sessionPromise = null;
    let transcriptDraft = '';
    let pendingTranscriptPrefix = '';
    let commitRequested = false;
    let transcriptTimers = [];
    let lastAssistantReply = '';
    let lastAssistantSpokenAt = 0;
    let listeningAllowedAt = 0;
    const state = {
        active: false,
        error: '',
        generation: 0,
        phase: 'closed',
        sessionId: null,
        closePromise: null,
        unsubscribe: () => { }
    };

    const notify = () => {
        const snapshot = cloneState(state);
        listeners.forEach((listener) => listener(snapshot));
        return snapshot;
    };

    const setPhase = (phase, error = '') => {
        state.phase = phase;
        state.error = error;
        return notify();
    };

    const traceEndpointDecision = (purpose, result = {}, transcript = '') => {
        writeVoiceDiagnostic(env, 'voice.endpointing.decision', {
            session_id: state.sessionId,
            purpose,
            reason: toText(result?.reason) || 'provider_final',
            transcript: toText(transcript),
            transcript_length: toText(transcript).length,
            silence_ms: Number.isFinite(Number(result?.silence_ms)) ? Number(result.silence_ms) : null,
            text_stable_ms: Number.isFinite(Number(result?.text_stable_ms)) ? Number(result.text_stable_ms) : null,
            transcript_stable: result?.transcript_stable === true
        });
    };

    const stopActiveChannels = async (reason) => {
        if (!state.sessionId) return;
        await Promise.allSettled([
            voiceApi.cancelListening(state.sessionId),
            voiceApi.stopSpeaking(state.sessionId, { reason }),
            voiceApi.interrupt(state.sessionId, { reason })
        ]);
    };

    const clearTranscriptTimers = () => {
        transcriptTimers.forEach((timer) => env.clearTimeout?.(timer));
        transcriptTimers = [];
    };

    const requestTranscriptCommit = async (force, reason) => {
        if (!state.active || state.phase !== 'listening' || commitRequested) return;
        const text = mergeTranscriptFragments(pendingTranscriptPrefix, transcriptDraft);
        if (!text || (!force && !isTranscriptActionable(text))) return;
        commitRequested = true;
        clearTranscriptTimers();
        try {
            await voiceApi.stopListening(state.sessionId, { commitPartial: true, reason });
        } catch (_) {
            commitRequested = false;
        }
    };

    const scheduleTranscriptCommit = () => {
        if (state.phase !== 'listening' || commitRequested) return;
        const text = mergeTranscriptFragments(pendingTranscriptPrefix, transcriptDraft);
        if (!text) return;
        clearTranscriptTimers();
        if (isClearlyCompleteCommand(text)) {
            transcriptTimers.push(env.setTimeout?.(
                () => void requestTranscriptCommit(false, 'fast_pause'),
                voiceConfig.fastCommitMs
            ));
        }
        transcriptTimers.push(env.setTimeout?.(
            () => void requestTranscriptCommit(false, 'pause'),
            voiceConfig.pauseCommitMs
        ));
        transcriptTimers.push(env.setTimeout?.(
            () => void requestTranscriptCommit(true, 'force_pause'),
            voiceConfig.forceCommitMs
        ));
        transcriptTimers = transcriptTimers.filter(Boolean);
    };

    const waitForAcousticDrain = async (generation) => {
        const delayMs = Math.max(0, listeningAllowedAt - Date.now());
        if (delayMs > 0) {
            writeVoiceDiagnostic(env, 'voice.duplex.guard', {
                session_id: state.sessionId,
                state: 'listening_delayed',
                delay_ms: delayMs,
                reason: 'tts_acoustic_drain'
            });
            await new Promise((resolve) => (env.setTimeout || globalThis.setTimeout)(resolve, delayMs));
        }
        if (!state.active || state.generation !== generation) return false;
        writeVoiceDiagnostic(env, 'voice.duplex.guard', {
            session_id: state.sessionId,
            state: 'listening_allowed',
            delay_ms: 0,
            reason: 'tts_inactive'
        });
        return true;
    };

    const listenLoop = async (generation) => {
        let nextText = '';
        while (state.active && state.generation === generation) {
            if (!nextText) {
                if (!await waitForAcousticDrain(generation)) return;
                transcriptDraft = '';
                commitRequested = false;
                setPhase('listening');
                const heard = await awaitOperation(voiceApi.startListening({
                    session_id: state.sessionId,
                    lang: locale,
                    partial: true,
                    continuous: true,
                    purpose: 'user_turn',
                    silenceMs: voiceConfig.sttSilenceMs,
                    finalSilenceMs: voiceConfig.sttFinalSilenceMs,
                    maxAlternatives: 5
                }));
                clearTranscriptTimers();
                commitRequested = false;
                nextText = mergeTranscriptFragments(
                    pendingTranscriptPrefix,
                    toText(heard?.text) || transcriptDraft
                );
                traceEndpointDecision('user_turn', heard, nextText);
            }
            if (!state.active || state.generation !== generation) return;
            if (!nextText) continue;
            if (isLikelyAssistantEcho({
                heard: nextText,
                assistant: lastAssistantReply,
                spokenAt: lastAssistantSpokenAt,
                cooldownMs: voiceConfig.echoCooldownMs
            })) {
                nextText = '';
                continue;
            }
            if (!isTranscriptActionable(nextText)) {
                pendingTranscriptPrefix = nextText;
                nextText = '';
                continue;
            }
            pendingTranscriptPrefix = '';
            setPhase('processing');
            const execution = await voiceApi.executeUtterance(nextText, {
                session_id: state.sessionId,
                locale,
                lang: locale,
                autoSpeak: false,
                engine: 'local_onnx',
                execution_transport: executionTransport
            });
            nextText = '';
            if (execution?.ok !== true) {
                const failureCode = toText(execution?.error || execution?.code) || 'voice_request_failed';
                const failureReply = toText(execution?.spoken_reply || execution?.reply_text);
                if (failureReply && state.active && state.generation === generation) {
                    await speak(failureReply);
                }
                throw new Error(failureCode);
            }
            const reply = toText(execution?.spoken_reply || execution?.reply_text);
            if (reply && state.active && state.generation === generation) {
                nextText = await speak(reply);
            }
        }
    };

    const bindVoiceEvents = () => {
        state.unsubscribe();
        state.unsubscribe = voiceApi.subscribe((event) => {
            if (!state.active || event?.session_id !== state.sessionId) return;
            if (event.type === 'voice.stt.partial' || event.type === 'voice.stt.final') {
                const text = toText(event.payload?.text);
                transcriptDraft = text;
                scheduleTranscriptCommit();
            }
            if (event.type === 'voice.tts.state') {
                const next = String(event.payload?.state || '');
                if (next === 'speaking') setPhase('speaking');
            } else if (event.type === 'voice.processing.state') {
                const next = String(event.payload?.state || '');
                if (next === 'processing') setPhase('processing');
            }
        });
    };

    const createSession = async (generation) => {
        if (!sessionPromise) {
            sessionPromise = (async () => {
                const service = await voiceApi.ensureReady();
                const bridgeKind = service?.orchestrator?.bridge?.kind || voiceApi.orchestrator?.bridge?.kind || '';
                if (executionTransport === 'mcp' && bridgeKind !== 'mcp') {
                    throw new Error('voice_mcp_bridge_unavailable');
                }
                return voiceApi.createSession({
                    locale,
                    actor: { id: actorId },
                    source_layer: 'eve_voice_assistant'
                });
            })().catch((error) => {
                sessionPromise = null;
                throw error;
            });
        }
        const session = await sessionPromise;
        if (state.generation !== generation) return false;
        sessionPromise = null;
        state.sessionId = session.session_id;
        bindVoiceEvents();
        return true;
    };

    const speak = async (text) => {
        setPhase('speaking');
        lastAssistantReply = toText(text);
        lastAssistantSpokenAt = Date.now();
        listeningAllowedAt = Number.POSITIVE_INFINITY;
        writeVoiceDiagnostic(env, 'voice.duplex.guard', {
            session_id: state.sessionId,
            state: 'tts_only',
            delay_ms: null,
            reason: 'prevent_playback_echo'
        });
        const startedSpeech = await voiceApi.speak(lastAssistantReply, {
            session_id: state.sessionId,
            lang: locale,
            engine: 'local_onnx'
        });
        const speechPromise = Promise.resolve(startedSpeech?.promise || startedSpeech);
        await speechPromise;
        lastAssistantSpokenAt = Date.now();
        listeningAllowedAt = lastAssistantSpokenAt + voiceConfig.acousticDrainMs;
        return '';
    };

    const startListenLoop = (generation) => {
        void listenLoop(generation).catch((error) => {
            if (!state.active || state.generation !== generation) return;
            setPhase('error', error?.message || String(error));
        });
    };

    const open = () => {
        if (openPromise) return openPromise;
        if (state.active) return cloneState(state);
        openPromise = (async () => {
            state.active = true;
            const generation = ++state.generation;
            setPhase('opening');
            try {
                if (!await createSession(generation) || !state.active) return cloneState(state);
                await speak(openingGreeting);
                if (!state.active || state.generation !== generation) return cloneState(state);
                startListenLoop(generation);
                return cloneState(state);
            } catch (error) {
                if (state.generation !== generation) return cloneState(state);
                state.active = false;
                setPhase('error', error?.message || String(error));
                throw error;
            }
        })().finally(() => { openPromise = null; });
        return openPromise;
    };

    const respond = async () => {
        if (!state.active || !state.sessionId) throw new Error('voice_assistant_session_not_ready');
        const generation = ++state.generation;
        await stopActiveChannels('assistant_touch_response');
        if (!state.active || state.generation !== generation) return cloneState(state);
        await speak(touchResponse);
        if (!state.active || state.generation !== generation) return cloneState(state);
        startListenLoop(generation);
        return cloneState(state);
    };

    const close = async ({ reason = 'assistant_closed', speakFarewell = true } = {}) => {
        if (!state.active && state.phase === 'closed' && (state.generation > 0 || !speakFarewell)) {
            return cloneState(state);
        }
        if (state.closePromise) return state.closePromise;
        state.closePromise = (async () => {
            const generation = ++state.generation;
            state.active = true;
            try {
                if (openPromise) await openPromise;
                if (speakFarewell && !state.sessionId && !await createSession(generation)) {
                    return cloneState(state);
                }
                await stopActiveChannels(reason);
                if (speakFarewell && state.active && state.sessionId) {
                    await speak(closingGreeting);
                }
            } finally {
                clearTranscriptTimers();
                state.active = false;
                state.unsubscribe();
                state.unsubscribe = () => { };
                state.sessionId = null;
                sessionPromise = null;
                setPhase('closed');
            }
            return cloneState(state);
        })().finally(() => { state.closePromise = null; });
        return state.closePromise;
    };

    const subscribe = (listener) => {
        if (typeof listener !== 'function') return () => { };
        listeners.add(listener);
        listener(cloneState(state));
        return () => listeners.delete(listener);
    };

    return Object.freeze({ close, getState: () => cloneState(state), open, respond, subscribe });
};
