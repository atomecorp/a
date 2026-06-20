import {
    toText,
    mergeTranscriptFragments,
    isLikelyAssistantEcho,
    isTranscriptActionable,
    isAffirmativeDecision,
    isNegativeDecision
} from './home_surface_transcript.js';
import {
    localizeDownloadProgress,
    localizeFragmentPrompt,
    localizeTextOnlyInfo
} from './home_surface_i18n.js';

const scheduleListenRestart = ({ env, state, delayMs, startListeningLoop }) => {
    if (!state.active) return;
    state.restartTimer = env.setTimeout?.(() => {
        state.restartTimer = null;
        void startListeningLoop();
    }, delayMs) || null;
};

export const createHomeVoiceListeningRuntime = ({
    env,
    state,
    config,
    textOnly,
    locale,
    debugVoice,
    actions,
    view
}) => {
    const clearRestartTimer = () => {
        if (state.restartTimer) {
            env.clearTimeout?.(state.restartTimer);
            state.restartTimer = null;
        }
    };

    const stopListeningLoop = async (options = {}) => {
        if (!state.listening || !state.sessionId || !state.api?.stopListening) return;
        try {
            await state.api.stopListening(state.sessionId, options);
        } catch (_) {
            // Ignore manual stop failures.
        } finally {
            state.listening = false;
            view.updateControls();
        }
    };

    const handleResolvedListening = async ({ sessionId, text, result, startListeningLoop }) => {
        const mergedText = mergeTranscriptFragments(state.pendingTranscriptPrefix, text);
        debugVoice('listen_resolved', {
            sessionId,
            text: mergedText || text,
            cancelled: result?.cancelled === true,
            reason: result?.reason || null
        });
        state.transcriptDraft = '';
        view.renderTranscript();
        if (isLikelyAssistantEcho({
            heard: mergedText || text,
            assistant: state.lastAssistantReply,
            spokenAt: state.lastAssistantSpokenAt,
            cooldownMs: config.echoCooldownMs
        })) {
            debugVoice('listen_echo_ignored', { sessionId, text: mergedText || text });
            scheduleListenRestart({ env, state, delayMs: config.echoCooldownMs, startListeningLoop });
            return;
        }
        const decision = {
            affirmative: isAffirmativeDecision(mergedText),
            negative: isNegativeDecision(mergedText)
        };
        if (await actions.handleDecisionUtterance(mergedText, decision)) return;
        if (mergedText && !isTranscriptActionable(mergedText)) {
            state.pendingTranscriptPrefix = mergedText;
            view.setInfo(localizeFragmentPrompt(locale()));
            scheduleListenRestart({ env, state, delayMs: 0, startListeningLoop });
            return;
        }
        if (mergedText) {
            state.pendingTranscriptPrefix = '';
            await actions.runUtterance(mergedText);
            return;
        }
        if (state.suppressAutoRestartOnce) {
            state.suppressAutoRestartOnce = false;
            return;
        }
        scheduleListenRestart({ env, state, delayMs: 0, startListeningLoop });
    };

    const startListeningLoop = async () => {
        if (textOnly) return;
        clearRestartTimer();
        actions.clearInterruptRestartTimer();
        if (!state.active || state.listening || state.processing || state.speaking) return;
        if (state.interruptListening) await actions.stopInterruptListening();
        const sessionId = await actions.ensureSession();
        debugVoice('start_listening', { sessionId, locale: locale() });
        state.listening = true;
        state.commitRequested = false;
        state.transcriptDraft = '';
        state.lastFailureNotice = '';
        actions.clearTranscriptCommitTimers();
        view.setError('');
        view.setInfo('');
        view.renderTranscript();
        view.updateControls();
        try {
            const started = await state.api.startListening({
                session_id: sessionId,
                lang: locale(),
                partial: true,
                continuous: true,
                silenceMs: config.sttSilenceMs,
                finalSilenceMs: config.sttFinalSilenceMs,
                maxAlternatives: 5
            });
            state.listeningPromise = started?.promise || Promise.resolve(null);
            const result = await state.listeningPromise;
            state.listening = false;
            state.commitRequested = false;
            actions.clearTranscriptCommitTimers();
            view.updateControls();
            await handleResolvedListening({
                sessionId,
                text: toText(result?.text),
                result,
                startListeningLoop
            });
        } catch (error) {
            debugVoice('listen_failed', {
                sessionId,
                error: error?.message || String(error)
            });
            state.listening = false;
            state.commitRequested = false;
            state.transcriptDraft = '';
            actions.clearTranscriptCommitTimers();
            clearRestartTimer();
            view.renderTranscript();
            await actions.announceListenFailure(error);
            view.updateControls();
        }
    };

    const bindRuntime = async () => {
        if (!state.api || typeof state.api.ensureReady !== 'function') {
            debugVoice('runtime_bind_skipped', {
                hasApi: !!state.api,
                hasEnsureReady: typeof state.api?.ensureReady === 'function'
            });
            return;
        }
        debugVoice('runtime_bind_start');
        const ready = await state.api.ensureReady();
        const providers = ready?.providers || state.api.providers;
        debugVoice('runtime_ready', {
            stt: providers?.stt?.selected || null,
            tts: providers?.tts?.selected || null,
            capture: providers?.capture?.selected || null
        });
        if (textOnly) {
            view.setInfo(localizeTextOnlyInfo(locale()));
            view.updateControls();
        } else if (providers?.stt?.selected === 'unsupported') {
            view.setError('unsupported_stt');
            view.updateControls();
        }
        if (typeof state.api.subscribe !== 'function') {
            debugVoice('runtime_subscribe_unavailable');
            return;
        }
        debugVoice('runtime_subscribe_attached');
        state.unsubscribe = state.api.subscribe((event) => {
            if (state.sessionId && event.session_id !== state.sessionId) return;
            if (!state.sessionId && event.session_id) state.sessionId = event.session_id;
            if (event.type === 'voice.stt.state') {
                const next = toText(event.payload?.state);
                debugVoice('voice.stt.state', { sessionId: event.session_id, state: next });
                if (next === 'listening' && state.pendingReadyAnnouncement) {
                    void actions.announceReadyAndRestartListening();
                }
            }
            if (event.type === 'voice.stt.partial' || event.type === 'voice.stt.final') {
                const transcriptText = toText(event.payload?.text);
                if (state.interruptListening && state.speaking) {
                    debugVoice(event.type, { sessionId: event.session_id, text: transcriptText, mode: 'interrupt_only' });
                    void actions.handleInterruptTranscript(transcriptText);
                    return;
                }
                state.transcriptDraft = transcriptText;
                debugVoice(event.type, { sessionId: event.session_id, text: state.transcriptDraft });
                view.renderTranscript();
                actions.scheduleTranscriptCommitEvaluation();
            }
            if (event.type === 'voice.stt.download_progress') {
                debugVoice('voice.stt.download_progress', {
                    sessionId: event.session_id,
                    status: event.payload?.status || null,
                    model: event.payload?.model || null,
                    progress: event.payload?.progress ?? null
                });
                view.setInfo(localizeDownloadProgress(event.payload, locale()));
                view.updateControls();
            }
            if (event.type === 'voice.tts.state') {
                const next = toText(event.payload?.state);
                debugVoice('voice.tts.state', { sessionId: event.session_id, state: next });
                state.speaking = next === 'speaking';
                if (next === 'speaking') {
                    actions.clearTranscriptCommitTimers();
                    state.bargeInArmAt = Date.now() + config.bargeArmDelayMs;
                    state.bargeInPending = false;
                    state.bargeInDetector?.reset?.();
                    void actions.startInterruptListening();
                }
                if (next === 'done' || next === 'failed' || next === 'interrupted') {
                    state.speaking = false;
                    void actions.stopInterruptListening();
                    actions.resetBargeInDetector();
                }
                view.updateControls();
            }
            if (event.type === 'voice.processing.state') {
                const next = toText(event.payload?.state);
                debugVoice('voice.processing.state', { sessionId: event.session_id, state: next });
                state.processing = next === 'processing';
                if (next === 'done' || next === 'failed' || next === 'interrupted') state.processing = false;
                view.updateControls();
            }
            if (event.type === 'voice.cancel.requested') {
                debugVoice('voice.cancel.requested', {
                    sessionId: event.session_id,
                    source: event.payload?.source || null
                });
                state.listening = false;
                state.speaking = false;
                state.processing = false;
                state.commitRequested = false;
                actions.clearTranscriptCommitTimers();
                actions.clearInterruptRestartTimer();
                void actions.stopInterruptListening();
                actions.resetBargeInDetector();
                view.updateControls();
            }
        });
    };

    return {
        clearRestartTimer,
        startListeningLoop,
        stopListeningLoop,
        bindRuntime
    };
};
