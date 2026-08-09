import { resolveHomeVoiceConfig } from './home_surface_state.js';
import {
    detectInterruptCommand,
    isClearlyCompleteCommand,
    isLikelyAssistantEcho,
    isTranscriptActionable,
    mergeTranscriptFragments,
    toText
} from './home_surface_transcript.js';

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
    let interruptTurn = null;
    let lastAssistantReply = '';
    let lastAssistantSpokenAt = 0;
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
        if (!state.active || state.phase !== 'listening' || commitRequested || interruptTurn) return;
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
        if (state.phase !== 'listening' || commitRequested || interruptTurn) return;
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

    const triggerBargeIn = (value) => {
        if (!interruptTurn || interruptTurn.triggered || Date.now() < interruptTurn.armAt) return;
        const text = toText(value);
        if (!text || isLikelyAssistantEcho({
            heard: text,
            assistant: lastAssistantReply,
            spokenAt: lastAssistantSpokenAt,
            cooldownMs: voiceConfig.echoCooldownMs
        })) return;
        const command = detectInterruptCommand(text);
        if (!command && !isTranscriptActionable(text)) return;
        interruptTurn.triggered = true;
        interruptTurn.resolve({
            kind: 'barge',
            command,
            text: command ? '' : text
        });
    };

    const listenLoop = async (generation, queuedText = '') => {
        let nextText = toText(queuedText);
        while (state.active && state.generation === generation) {
            if (!nextText) {
                transcriptDraft = '';
                commitRequested = false;
                setPhase('listening');
                const heard = await awaitOperation(voiceApi.startListening({
                    session_id: state.sessionId,
                    lang: locale,
                    partial: true,
                    continuous: true,
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
            const reply = toText(execution?.spoken_reply || execution?.reply_text);
            if (reply && state.active && state.generation === generation) {
                nextText = await speak(reply, generation, { allowBargeIn: true });
            }
        }
    };

    const bindVoiceEvents = () => {
        state.unsubscribe();
        state.unsubscribe = voiceApi.subscribe((event) => {
            if (!state.active || event?.session_id !== state.sessionId) return;
            if (event.type === 'voice.stt.partial' || event.type === 'voice.stt.final') {
                const text = toText(event.payload?.text);
                if (interruptTurn) triggerBargeIn(text);
                else {
                    transcriptDraft = text;
                    scheduleTranscriptCommit();
                }
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

    const speak = async (text, generation, { allowBargeIn = false } = {}) => {
        setPhase('speaking');
        lastAssistantReply = toText(text);
        lastAssistantSpokenAt = Date.now();
        const startedSpeech = await voiceApi.speak(lastAssistantReply, {
            session_id: state.sessionId,
            lang: locale,
            engine: 'local_onnx'
        });
        const speechPromise = Promise.resolve(startedSpeech?.promise || startedSpeech);
        if (!allowBargeIn) {
            await speechPromise;
            return '';
        }
        const completedImmediately = await Promise.race([
            speechPromise.then(() => true, () => true),
            new Promise((resolve) => (env.setTimeout || globalThis.setTimeout)(() => resolve(false), 0))
        ]);
        if (completedImmediately || !state.active || state.generation !== generation) return '';
        let resolveBarge;
        const bargePromise = new Promise((resolve) => { resolveBarge = resolve; });
        interruptTurn = {
            armAt: Date.now() + voiceConfig.bargeArmDelayMs,
            resolve: resolveBarge,
            triggered: false
        };
        let interruptListening = null;
        try {
            interruptListening = await voiceApi.startListening({
                session_id: state.sessionId,
                lang: locale,
                partial: true,
                continuous: true,
                silenceMs: voiceConfig.interruptSttSilenceMs,
                finalSilenceMs: voiceConfig.interruptSttFinalSilenceMs,
                maxAlternatives: 3
            });
        } catch (_) {
            interruptTurn = null;
            await speechPromise;
            return '';
        }
        const outcome = await Promise.race([
            speechPromise.then(() => ({ kind: 'speech' }), () => ({ kind: 'speech' })),
            bargePromise
        ]);
        if (outcome.kind === 'speech') {
            interruptTurn = null;
            await voiceApi.stopListening(state.sessionId, { commitPartial: false, reason: 'assistant_reply_done' })
                .catch(() => { });
            return '';
        }
        await Promise.allSettled([
            voiceApi.stopSpeaking(state.sessionId, { reason: 'assistant_barge_in' }),
            voiceApi.stopListening(state.sessionId, { commitPartial: true, reason: 'assistant_barge_in' })
        ]);
        const heard = await Promise.resolve(interruptListening?.promise).catch(() => null);
        interruptTurn = null;
        if (outcome.command || !state.active || state.generation !== generation) return '';
        return mergeTranscriptFragments(outcome.text, toText(heard?.text));
    };

    const startListenLoop = (generation, queuedText = '') => {
        void listenLoop(generation, queuedText).catch((error) => {
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
                const queuedText = await speak(openingGreeting, generation, { allowBargeIn: true });
                if (!state.active || state.generation !== generation) return cloneState(state);
                startListenLoop(generation, queuedText);
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
        const queuedText = await speak(touchResponse, generation, { allowBargeIn: true });
        if (!state.active || state.generation !== generation) return cloneState(state);
        startListenLoop(generation, queuedText);
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
                    await speak(closingGreeting, generation, { allowBargeIn: false });
                }
            } finally {
                clearTranscriptTimers();
                interruptTurn = null;
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
