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
    actorId = 'eve_voice_assistant'
} = {}) => {
    if (!voiceApi || typeof voiceApi.ensureReady !== 'function') {
        throw new Error('voice_assistant_api_required');
    }
    [
        'cancelListening', 'createSession', 'executeUtterance', 'interrupt',
        'speak', 'startListening', 'stopSpeaking', 'subscribe'
    ].forEach((method) => {
        if (typeof voiceApi[method] !== 'function') throw new Error(`voice_assistant_api_method_required:${method}`);
    });
    if (!String(openingGreeting || '').trim()) throw new Error('voice_assistant_opening_greeting_required');
    if (!String(touchResponse || '').trim()) throw new Error('voice_assistant_touch_response_required');
    if (!String(closingGreeting || '').trim()) throw new Error('voice_assistant_closing_greeting_required');
    const listeners = new Set();
    let openPromise = null;
    let sessionPromise = null;
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

    const listenLoop = async (generation) => {
        while (state.active && state.generation === generation) {
            setPhase('listening');
            const heard = await awaitOperation(voiceApi.startListening({
                session_id: state.sessionId,
                lang: locale,
                partial: true,
                continuous: true,
                silenceMs: 8000,
                finalSilenceMs: 2400,
                maxAlternatives: 5
            }));
            if (!state.active || state.generation !== generation) return;
            const text = String(heard?.text || '').trim();
            if (!text) continue;
            setPhase('processing');
            await voiceApi.executeUtterance(text, {
                session_id: state.sessionId,
                locale,
                lang: locale,
                autoSpeak: true,
                engine: 'local_onnx'
            });
        }
    };

    const bindVoiceEvents = () => {
        state.unsubscribe();
        state.unsubscribe = voiceApi.subscribe((event) => {
            if (!state.active || event?.session_id !== state.sessionId) return;
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
                await voiceApi.ensureReady();
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

    const speak = async (text, generation) => {
        setPhase('speaking');
        await awaitOperation(voiceApi.speak(String(text), {
            session_id: state.sessionId,
            lang: locale,
            engine: 'local_onnx'
        }));
        return state.active && state.generation === generation;
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
                if (!await speak(openingGreeting, generation)) return cloneState(state);
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
        if (!await speak(touchResponse, generation)) return cloneState(state);
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
                    await speak(closingGreeting, generation);
                }
            } finally {
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
