import { toText } from './home_surface_transcript.js';
import {
    classifyVoiceError,
    isEnglish,
    localizeDeclineLine,
    localizeExecutionError,
    localizeNoResultLine,
    localizeReadyLine,
    localizeVoiceError,
    resolveUserFirstName
} from './home_surface_i18n.js';
import { pushHistoryEntry } from './home_surface_state.js';
import { readAssistantText } from './home_surface_response.js';

export const createHomeVoiceTurnRuntime = ({
    env,
    state,
    config,
    textOnly,
    locale,
    labels,
    debugVoice,
    actions,
    view
}) => {
    const pushEntry = (role, text) => pushHistoryEntry({
        env,
        state,
        renderHistory: view.renderHistory
    }, role, text);

    const rememberAssistantReply = (text = '', spokenAt = 0) => {
        const normalized = toText(text);
        if (!normalized) return;
        state.lastAssistantReply = normalized;
        state.lastAssistantSpokenAt = spokenAt;
    };

    const ensureSession = async () => {
        if (state.sessionId) return state.sessionId;
        if (!state.api || typeof state.api.ensureReady !== 'function') {
            view.updateControls();
            view.setStatus(labels().unavailable);
            view.setError('voice_api_unavailable');
            throw new Error('voice_api_unavailable');
        }
        await state.api.ensureReady();
        const session = await state.api.createSession({
            locale: locale(),
            actor: { id: 'eve_voice_panel' },
            source_layer: 'eve_voice_panel'
        });
        state.sessionId = session.session_id;
        return state.sessionId;
    };

    const speakAssistantLine = async (text, {
        pushHistoryEntry: shouldPushHistory = true,
        rememberReply = false
    } = {}) => {
        const normalized = toText(text);
        if (!normalized) return false;
        debugVoice('assistant_text', normalized);
        if (shouldPushHistory) pushEntry('assistant', normalized);
        if (rememberReply) rememberAssistantReply(normalized, 0);
        if (!state.api?.speak) return false;
        await ensureSession();
        try {
            const started = await state.api.speak(normalized, {
                session_id: state.sessionId,
                lang: locale()
            });
            await (started?.promise || Promise.resolve(started));
            if (rememberReply) rememberAssistantReply(normalized, Date.now());
            return true;
        } catch (_) {
            return false;
        }
    };

    const announceListenFailure = async (error) => {
        const code = classifyVoiceError(error);
        view.setError(code);
        const failureNotice = localizeVoiceError(code, locale());
        if (!failureNotice || state.lastFailureNotice === failureNotice) return;
        state.lastFailureNotice = failureNotice;
        pushEntry('assistant', failureNotice);
        await speakAssistantLine(failureNotice, {
            pushHistoryEntry: false,
            rememberReply: false
        });
    };

    const applyExecutionResponse = async (response = {}, debugEvent = 'execute_utterance:response') => {
        debugVoice(debugEvent, {
            sessionId: state.sessionId,
            ok: response?.ok === true,
            executed: response?.executed === true,
            error: response?.error || null,
            reply_text: toText(response?.reply_text || response?.spoken_reply || response?.confirmation_prompt || '')
        });
        const directAssistantText = toText(
            response?.reply_text
            || response?.spoken_reply
            || response?.assistant_reply
            || response?.confirmation_prompt
        );
        const assistantText = directAssistantText
            || readAssistantText(response, locale())
            || localizeExecutionError(response?.error, locale());
        if (assistantText) {
            debugVoice('assistant_text', assistantText);
            pushEntry('assistant', assistantText);
            rememberAssistantReply(assistantText, Date.now());
            if (!directAssistantText) {
                await speakAssistantLine(assistantText, {
                    pushHistoryEntry: false,
                    rememberReply: true
                });
            }
        }
        view.setInfo('');
        return assistantText;
    };

    const getSessionSnapshot = async () => {
        if (!state.sessionId || typeof state.api?.getSession !== 'function') return null;
        try {
            return await state.api.getSession(state.sessionId);
        } catch (_) {
            return null;
        }
    };

    const clearConfirmationContext = (activeIntent = null) => {
        if (!activeIntent || typeof state.api?.runtime?.bindIntentContext !== 'function' || !state.sessionId) return;
        try {
            state.api.runtime.bindIntentContext(state.sessionId, {
                ...activeIntent,
                execution: {
                    ...(activeIntent.execution && typeof activeIntent.execution === 'object' ? activeIntent.execution : {}),
                    confirmation_required: false
                }
            }, { phase: 'confirmation_declined' });
        } catch (_) {
            // Ignore stale session context updates.
        }
    };

    const finishTurnAndMaybeRestart = () => {
        state.processing = false;
        view.updateControls();
        if (!state.active) return;
        const delay = state.lastAssistantReply ? config.echoCooldownMs : 0;
        state.restartTimer = env.setTimeout?.(() => {
            state.restartTimer = null;
            void actions.startListeningLoop();
        }, delay) || null;
    };

    const announceReadyAndRestartListening = async () => {
        if (textOnly || !state.active) return;
        if (state.readyAnnouncementTask) return state.readyAnnouncementTask;
        state.pendingReadyAnnouncement = false;
        state.readyAnnouncementTask = (async () => {
            state.suppressAutoRestartOnce = true;
            if (state.listening) await actions.stopListeningLoop();
            await speakAssistantLine(localizeReadyLine(locale(), resolveUserFirstName(env)), {
                pushHistoryEntry: true,
                rememberReply: true
            });
            if (state.active && !state.listening && !state.processing && !state.speaking) {
                void actions.startListeningLoop();
            }
        })().finally(() => {
            state.readyAnnouncementTask = null;
        });
        return state.readyAnnouncementTask;
    };

    const handleDecisionUtterance = async (text, decision) => {
        if (!decision?.affirmative && !decision?.negative) return false;
        const snapshot = await getSessionSnapshot();
        const pendingFollowup = toText(snapshot?.conversation?.pending_followup);
        const resumeAvailable = snapshot?.conversation?.resume_available === true;
        const activeIntent = snapshot?.conversation?.active_intent || null;
        const confirmationRequired = activeIntent?.execution?.confirmation_required === true;
        if (!pendingFollowup && !resumeAvailable && !confirmationRequired) return false;

        actions.clearRestartTimer();
        state.pendingTranscriptPrefix = '';
        pushEntry('user', toText(text));
        state.processing = true;
        state.transcriptDraft = '';
        view.renderTranscript();
        view.updateControls();
        try {
            let response = null;
            if (decision.affirmative) {
                if ((pendingFollowup || resumeAvailable) && typeof state.api?.executeFollowup === 'function') {
                    response = await state.api.executeFollowup(state.sessionId, { locale: locale() });
                }
                if (!response && confirmationRequired && typeof state.api?.executeIntent === 'function') {
                    const confirmation = activeIntent?.context?.voice_confirmation || activeIntent?.confirmation || null;
                    response = await state.api.executeIntent(activeIntent, {
                        session_id: state.sessionId,
                        locale: locale(),
                        confirmation,
                        idempotency_key: confirmation?.idempotency_key || ''
                    });
                }
            } else {
                if ((pendingFollowup || resumeAvailable) && typeof state.api?.takePendingFollowup === 'function') {
                    state.api.takePendingFollowup(state.sessionId, {
                        nextPhase: 'completed',
                        allowResume: false
                    });
                }
                if (confirmationRequired) clearConfirmationContext(activeIntent);
                response = {
                    ok: true,
                    executed: false,
                    transport: 'none',
                    reply_text: localizeDeclineLine(locale())
                };
            }
            if (response) await applyExecutionResponse(response, 'execute_followup:response');
        } catch (_) {
            const errorText = isEnglish(locale()) ? 'The AI is not responding.' : "L'IA ne repond pas.";
            pushEntry('assistant', errorText);
            rememberAssistantReply(errorText, Date.now());
        } finally {
            finishTurnAndMaybeRestart();
        }
        return true;
    };

    const runUtterance = async (text) => {
        const normalized = toText(text);
        if (!normalized) return;
        actions.clearRestartTimer();
        state.pendingTranscriptPrefix = '';
        state.lastFailureNotice = '';
        await ensureSession();
        debugVoice('execute_utterance:start', {
            sessionId: state.sessionId,
            text: normalized,
            locale: locale()
        });
        view.setError('');
        pushEntry('user', normalized);
        state.processing = true;
        state.transcriptDraft = '';
        view.renderTranscript();
        view.updateControls();
        try {
            const response = await state.api.executeUtterance(normalized, {
                session_id: state.sessionId,
                locale: locale()
            });
            const assistantText = await applyExecutionResponse(response, 'execute_utterance:response');
            if (!assistantText) {
                await speakAssistantLine(localizeNoResultLine(locale()), {
                    pushHistoryEntry: true,
                    rememberReply: true
                });
            }
        } catch (_) {
            debugVoice('execute_utterance:failed', { sessionId: state.sessionId });
            const errorText = isEnglish(locale()) ? 'The AI is not responding.' : "L'IA ne repond pas.";
            pushEntry('assistant', errorText);
            rememberAssistantReply(errorText, Date.now());
        } finally {
            finishTurnAndMaybeRestart();
        }
    };

    return {
        pushEntry,
        rememberAssistantReply,
        ensureSession,
        speakAssistantLine,
        announceListenFailure,
        applyExecutionResponse,
        getSessionSnapshot,
        clearConfirmationContext,
        finishTurnAndMaybeRestart,
        announceReadyAndRestartListening,
        handleDecisionUtterance,
        runUtterance
    };
};
