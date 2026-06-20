import { mountVoiceMeter } from './voice_meter.js';
import { createVoiceActivityDetector } from './vad.js';
import { toText } from './home_surface_transcript.js';
import {
    resolveLocale,
    createLabels,
    localizeClosingLine,
    localizeTextOnlyReadyLine,
    resolveUserFirstName
} from './home_surface_i18n.js';
import {
    cloneControllerState,
    createHomeVoiceState,
    debugVoice,
    resolveHomeVoiceConfig,
    resolveVoiceApi
} from './home_surface_state.js';
import { mountHomeVoiceView } from './home_surface_view.js';
import { createHomeVoiceTranscriptRuntime } from './home_surface_transcript_runtime.js';
import { createHomeVoiceInterruptRuntime } from './home_surface_interrupt_runtime.js';
import { createHomeVoiceTurnRuntime } from './home_surface_turn_runtime.js';
import { createHomeVoiceListeningRuntime } from './home_surface_listening_runtime.js';
import { createHomeVoiceMeterRuntime } from './home_surface_meter_runtime.js';

export const mountHomeVoiceSurface = async ({
    env = globalThis,
    host,
    voiceApi = null,
    voiceMeterFactory = mountVoiceMeter,
    textOnly = false
} = {}) => {
    if (!env?.document || !host) return null;
    if (host.__eveHomeVoiceSurfaceController) return host.__eveHomeVoiceSurfaceController;

    const api = resolveVoiceApi(env, voiceApi);
    debugVoice('surface_mount', {
        hasApi: !!api,
        hasEnsureReady: typeof api?.ensureReady === 'function',
        hasSubscribe: typeof api?.subscribe === 'function'
    });

    const state = createHomeVoiceState(env, api);
    const config = resolveHomeVoiceConfig(env);
    const locale = () => resolveLocale();
    const labels = () => createLabels(locale());
    const actions = {};
    const context = {
        env,
        host,
        state,
        config,
        textOnly,
        locale,
        labels,
        debugVoice,
        actions
    };

    const view = mountHomeVoiceView({
        doc: env.document,
        host,
        state,
        textOnly,
        labels,
        locale
    });
    context.view = view;

    Object.assign(actions, createHomeVoiceTranscriptRuntime(context));
    Object.assign(actions, createHomeVoiceInterruptRuntime(context));
    Object.assign(actions, createHomeVoiceTurnRuntime(context));
    Object.assign(actions, createHomeVoiceListeningRuntime(context));
    Object.assign(actions, createHomeVoiceMeterRuntime({
        ...context,
        voiceMeterFactory,
        createVoiceActivityDetector
    }));

    view.actionButton.addEventListener('click', async () => {
        if (!state.active) state.active = true;
        if (textOnly) {
            if (state.speaking && state.sessionId && state.api?.stopSpeaking) {
                await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_stop' });
                state.speaking = false;
                view.updateControls();
            }
            return;
        }
        if (state.listening) {
            state.suppressAutoRestartOnce = true;
            await actions.stopListeningLoop();
            return;
        }
        if (state.speaking && state.sessionId && state.api?.stopSpeaking) {
            await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_stop' });
            state.speaking = false;
        }
        if (state.processing) {
            view.updateControls();
            return;
        }
        view.updateControls();
        if (!state.listening && !state.processing && !state.speaking) {
            void actions.startListeningLoop();
        }
    });

    view.sendButton.addEventListener('click', async () => {
        const text = toText(view.input.value);
        if (!text) return;
        view.input.value = '';
        state.active = true;
        if (state.listening) {
            state.suppressAutoRestartOnce = true;
            await actions.stopListeningLoop();
        }
        await actions.runUtterance(text);
    });

    view.input.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            view.sendButton.click();
        }
    });

    view.renderHistory();
    view.renderNotice();
    view.renderTranscript();
    view.updateControls();
    await actions.bindRuntime();

    const controller = {
        root: view.root,
        activate() {
            if (state.activationPromise) return state.activationPromise;
            if (state.active) return Promise.resolve();
            state.active = true;
            state.activationPromise = (async () => {
                await actions.startVoiceMeter();
                if (textOnly) {
                    await actions.speakAssistantLine(localizeTextOnlyReadyLine(locale(), resolveUserFirstName(env)), {
                        pushHistoryEntry: true,
                        rememberReply: true
                    });
                    return;
                }
                if (state.active) {
                    void actions.announceReadyAndRestartListening();
                }
            })().finally(() => {
                state.activationPromise = null;
            });
            return state.activationPromise;
        },
        async deactivate() {
            state.active = false;
            actions.clearRestartTimer();
            actions.clearInterruptRestartTimer();
            actions.clearTranscriptCommitTimers();
            if (state.listening) await actions.stopListeningLoop();
            await actions.stopInterruptListening();
            if (state.sessionId && state.api?.stopSpeaking) {
                await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_close' });
            }
            state.speaking = false;
            state.processing = false;
            state.transcriptDraft = '';
            actions.resetBargeInDetector();
            view.renderTranscript();
            await actions.speakAssistantLine(localizeClosingLine(locale()), {
                pushHistoryEntry: true,
                rememberReply: false
            });
            await actions.stopVoiceMeter();
            view.updateControls();
        },
        refreshLabels() {
            view.updateControls();
            view.renderNotice();
            view.renderTranscript();
            view.renderHistory();
        },
        getState() {
            return cloneControllerState(state, textOnly);
        },
        destroy() {
            state.unsubscribe();
            actions.clearRestartTimer();
            actions.clearInterruptRestartTimer();
            actions.clearTranscriptCommitTimers();
            actions.resetBargeInDetector();
            void actions.stopInterruptListening();
            void actions.stopVoiceMeter();
            view.root.remove();
            delete host.__eveHomeVoiceSurfaceController;
        }
    };

    host.__eveHomeVoiceSurfaceController = controller;
    return controller;
};
