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
    greeting,
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
    if (!String(greeting || '').trim()) throw new Error('voice_assistant_greeting_required');
    const listeners = new Set();
    const state = {
        active: false,
        error: '',
        generation: 0,
        phase: 'closed',
        sessionId: null,
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

    const open = async () => {
        if (state.active) return cloneState(state);
        state.active = true;
        const generation = ++state.generation;
        setPhase('opening');
        try {
            await voiceApi.ensureReady();
            const session = await voiceApi.createSession({
                locale,
                actor: { id: actorId },
                source_layer: 'eve_voice_assistant'
            });
            if (!state.active || state.generation !== generation) return cloneState(state);
            state.sessionId = session.session_id;
            bindVoiceEvents();
            setPhase('speaking');
            await awaitOperation(voiceApi.speak(String(greeting || ''), {
                session_id: state.sessionId,
                lang: locale,
                engine: 'local_onnx'
            }));
            if (!state.active || state.generation !== generation) return cloneState(state);
            void listenLoop(generation).catch((error) => {
                if (!state.active || state.generation !== generation) return;
                setPhase('error', error?.message || String(error));
            });
            return cloneState(state);
        } catch (error) {
            state.active = false;
            setPhase('error', error?.message || String(error));
            throw error;
        }
    };

    const close = async ({ reason = 'assistant_closed' } = {}) => {
        if (!state.active && state.phase === 'closed') return cloneState(state);
        state.active = false;
        state.generation += 1;
        state.unsubscribe();
        state.unsubscribe = () => { };
        await stopActiveChannels(reason);
        state.sessionId = null;
        return setPhase('closed');
    };

    const subscribe = (listener) => {
        if (typeof listener !== 'function') return () => { };
        listeners.add(listener);
        listener(cloneState(state));
        return () => listeners.delete(listener);
    };

    return Object.freeze({ close, getState: () => cloneState(state), open, subscribe });
};
