import { toText, detectInterruptCommand } from './home_surface_transcript.js';

export const createHomeVoiceInterruptRuntime = ({
    env,
    state,
    config,
    textOnly,
    locale,
    debugVoice,
    actions,
    view
}) => {
    const resetBargeInDetector = () => {
        state.bargeInPending = false;
        state.bargeInArmAt = 0;
        state.bargeInDetector?.reset?.();
    };

    const clearInterruptRestartTimer = () => {
        if (state.interruptRestartTimer) {
            env.clearTimeout?.(state.interruptRestartTimer);
            state.interruptRestartTimer = null;
        }
    };

    const scheduleInterruptListeningRestart = (delayMs = 120) => {
        clearInterruptRestartTimer();
        if (textOnly || !state.active || !state.speaking || state.listening || state.interruptListening) return;
        state.interruptRestartTimer = env.setTimeout?.(() => {
            state.interruptRestartTimer = null;
            void startInterruptListening();
        }, Math.max(0, delayMs)) || null;
    };

    const stopInterruptListening = async () => {
        clearInterruptRestartTimer();
        if (!state.interruptListening || !state.sessionId || !state.api?.stopListening) {
            state.interruptListening = false;
            state.interruptListeningPromise = null;
            state.interruptCommandPending = false;
            return;
        }
        state.interruptListening = false;
        state.interruptListeningPromise = null;
        try {
            await state.api.stopListening(state.sessionId, { commitPartial: false });
        } catch (_) {
            // Ignore interrupt-listener teardown failures.
        } finally {
            state.interruptCommandPending = false;
        }
    };

    const restartListeningAfterInterruption = (delayMs = config.bargeRestartDelayMs) => {
        actions.clearRestartTimer();
        if (!state.active || state.listening || state.processing || state.speaking) return;
        state.restartTimer = env.setTimeout?.(() => {
            state.restartTimer = null;
            void actions.startListeningLoop();
        }, Math.max(0, delayMs)) || null;
    };

    const handleInterruptTranscript = async (text) => {
        if (!state.active || !state.sessionId || !state.speaking || state.interruptCommandPending) return false;
        const parsed = detectInterruptCommand(text);
        if (!parsed) return false;
        state.interruptCommandPending = true;
        debugVoice('interrupt_command_detected', {
            sessionId: state.sessionId,
            text: parsed.raw,
            command: parsed.command,
            matchedAlias: parsed.matched_alias
        });
        await stopInterruptListening();
        try {
            if (typeof state.api?.interrupt === 'function') {
                await state.api.interrupt(state.sessionId, {
                    utterance: parsed.raw,
                    reason: 'eve_voice_interrupt_command'
                });
            } else if (typeof state.api?.stopSpeaking === 'function') {
                await state.api.stopSpeaking(state.sessionId, {
                    reason: 'eve_voice_interrupt_command'
                });
            }
        } catch (_) {
            // Local state recovery below keeps the turn deterministic.
        } finally {
            state.speaking = false;
            state.processing = false;
            state.interruptCommandPending = false;
            view.updateControls();
            restartListeningAfterInterruption(0);
        }
        return true;
    };

    const startInterruptListening = async () => {
        if (textOnly || !state.active || state.listening || !state.speaking || state.interruptListening) return;
        const sessionId = await actions.ensureSession();
        clearInterruptRestartTimer();
        state.interruptListening = true;
        state.interruptCommandPending = false;
        try {
            const started = await state.api.startListening({
                session_id: sessionId,
                lang: locale(),
                partial: true,
                continuous: true,
                silenceMs: config.interruptSttSilenceMs,
                finalSilenceMs: config.interruptSttFinalSilenceMs,
                maxAlternatives: 3
            });
            const interruptPromise = started?.promise || Promise.resolve(null);
            state.interruptListeningPromise = interruptPromise;
            const result = await interruptPromise;
            if (state.interruptListeningPromise !== interruptPromise) return;
            state.interruptListening = false;
            state.interruptListeningPromise = null;
            const finalText = toText(result?.text);
            if (await handleInterruptTranscript(finalText)) return;
            if (state.active && state.speaking && !state.listening) {
                scheduleInterruptListeningRestart(120);
            }
        } catch (error) {
            state.interruptListening = false;
            state.interruptListeningPromise = null;
            debugVoice('interrupt_listen_failed', {
                sessionId,
                error: error?.message || String(error)
            });
            if (state.active && state.speaking && !state.listening) {
                scheduleInterruptListeningRestart(240);
            }
        }
    };

    const handleBargeInDetected = async () => {
        if (state.bargeInPending || !state.active || !state.speaking || !state.sessionId) return;
        state.bargeInPending = true;
        debugVoice('barge_in_detected', { sessionId: state.sessionId });
        actions.clearRestartTimer();
        try {
            if (state.api?.stopSpeaking) {
                await state.api.stopSpeaking(state.sessionId, { reason: 'eve_voice_barge_in' });
            }
        } catch (_) {
            // Continue toward a fresh listen cycle.
        } finally {
            await stopInterruptListening();
            state.speaking = false;
            view.updateControls();
            resetBargeInDetector();
            restartListeningAfterInterruption();
        }
    };

    return {
        resetBargeInDetector,
        clearInterruptRestartTimer,
        scheduleInterruptListeningRestart,
        stopInterruptListening,
        restartListeningAfterInterruption,
        handleInterruptTranscript,
        startInterruptListening,
        handleBargeInDetected
    };
};
