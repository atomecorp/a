import { PANEL_ID, createVoicePanelView } from './panel_view.js';
import { createVoiceProbeController } from './panel_probe.js';

const readLocalStorage = (env, key) => {
    try {
        return env?.localStorage?.getItem(key) || '';
    } catch (_) {
        return '';
    }
};

export const shouldEnableVoicePanel = (env = window) => {
    if (!env || typeof env !== 'object') return false;
    if (env.__ATOME_VOICE_PANEL__ === false) return false;
    if (env.__ATOME_VOICE_PANEL__ === true) return true;

    const stored = readLocalStorage(env, 'atome_voice_panel');
    if (stored === '1' || stored === 'true') return true;

    try {
        const url = new URL(env.location?.href || 'http://localhost');
        if (url.searchParams.get('voicepanel') === '1') return true;
        if (url.searchParams.get('voicepanel') === '0') return false;
    } catch (_) {
        // ignore URL parsing errors
    }

    return false;
};

const truncate = (value, limit = 18) => {
    const text = String(value || '');
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 3)}...`;
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const inferFallbackSuggestions = (intent = {}) => {
    const normalized = String(intent?.utterance?.normalized || '').trim();
    const suggestions = [];
    if (normalized.includes('mail') || normalized.includes('message')) {
        suggestions.push('Lis mes mails');
        suggestions.push('Reponds au message courant');
    }
    if (normalized.includes('agenda') || normalized.includes('calendrier') || normalized.includes('rendez vous')) {
        suggestions.push('Quels sont mes rendez-vous demain');
        suggestions.push('Ajoute un rendez-vous demain a 15h avec Paul');
    }
    if (normalized.includes('compte') || normalized.includes('depense') || normalized.includes('banque')) {
        suggestions.push('Ou en est mon compte');
        suggestions.push('Ou ai-je le plus depense cette semaine');
    }
    if (suggestions.length === 0) {
        suggestions.push('Lis mes mails');
        suggestions.push('Quels sont mes rendez-vous demain');
    }
    return Array.from(new Set(suggestions)).slice(0, 3);
};

const resolveVoiceApi = (env, explicitApi = null) => explicitApi || env?.Squirrel?.voice || env?.AtomeVoice || env?.atome?.voice || null;

export const mountVoicePanel = async ({
    env = window,
    voiceApi = null,
    force = false
} = {}) => {
    if (!env?.document || !env.document.body) return null;
    if (!force && !shouldEnableVoicePanel(env)) return null;
    if (env.document.getElementById(PANEL_ID)) {
        return env.__ATOME_VOICE_PANEL_CONTROLLER__ || null;
    }

    const api = resolveVoiceApi(env, voiceApi);
    if (!api || typeof api.ensureReady !== 'function') {
        env.console?.warn?.('[voice.panel] Voice API not available');
        return null;
    }

    const doc = env.document;
    const state = {
        open: false,
        currentSessionId: null,
        listening: false,
        recording: false,
        lastFollowup: null,
        unsubscribe: () => { }
    };

    const {
        launcher,
        panel,
        providersLine,
        phaseLine,
        sessionLine,
        followupLine,
        statusLine,
        probeLine,
        transcript,
        fallback,
        input,
        commandInput,
        closeButton,
        newSessionButton,
        listenButton,
        speakButton,
        stopButton,
        captureButton,
        commandButton,
        followupButton,
        intentButton,
        probeButton,
        appendLog
    } = createVoicePanelView(doc);
    doc.body.append(launcher, panel);

    const setOpen = (value) => {
        state.open = value === true;
        panel.style.display = state.open ? 'flex' : 'none';
        launcher.textContent = state.open ? 'Hide' : 'Mic';
    };

    const setStatus = (text) => {
        statusLine.textContent = `status: ${text}`;
    };

    const renderFallback = (intent = null) => {
        if (!intent || intent.status !== 'ambiguous') {
            fallback.style.display = 'none';
            fallback.textContent = '';
            return;
        }
        const suggestions = inferFallbackSuggestions(intent);
        fallback.style.display = 'block';
        fallback.textContent = `Intent ambigu.\nSuggestions:\n- ${suggestions.join('\n- ')}`;
    };

    const ensureSession = async () => {
        if (state.currentSessionId) {
            return state.currentSessionId;
        }
        const session = await api.createSession({
            locale: 'fr-FR',
            actor: { id: 'voice_panel' },
            source_layer: 'voice_panel_ui'
        });
        state.currentSessionId = session.session_id;
        sessionLine.textContent = `session: ${truncate(session.session_id, 16)}`;
        appendLog(`session created ${truncate(session.session_id, 16)}`, '#8fd3ff');
        return state.currentSessionId;
    };

    const refreshSnapshot = async () => {
        if (!state.currentSessionId || typeof api.getSession !== 'function') return;
        try {
            const snapshot = await api.getSession(state.currentSessionId);
            phaseLine.textContent = `phase: ${snapshot.phase}`;
            followupLine.textContent = `followup: ${snapshot.conversation?.pending_followup || 'none'}`;
            const partial = snapshot.transcript?.partial || '';
            const final = snapshot.transcript?.final || '';
            transcript.textContent = partial || final || 'No transcript yet.';
        } catch (_) {
            // Ignore stale session refresh failures.
        }
    };

    const bindRuntime = async () => {
        const service = await api.ensureReady();
        providersLine.textContent = `providers: stt=${service.providers.stt.selected} tts=${service.providers.tts.selected} capture=${service.providers.capture.selected}`;
        state.unsubscribe = api.subscribe((event) => {
            if (!state.currentSessionId) {
                state.currentSessionId = event.session_id;
                sessionLine.textContent = `session: ${truncate(event.session_id, 16)}`;
            }
            if (event.session_id !== state.currentSessionId) return;
            phaseLine.textContent = `phase: ${event.type.replace(/^voice\./, '')}`;
            if (event.type === 'voice.stt.partial') {
                transcript.textContent = event.payload?.text || '';
            }
            if (event.type === 'voice.stt.final') {
                transcript.textContent = event.payload?.text || '';
            }
            if (event.type === 'voice.followup.queued') {
                state.lastFollowup = event.payload?.followup || null;
                followupLine.textContent = `followup: ${state.lastFollowup || 'none'}`;
            }
            if (event.type === 'voice.followup.ready') {
                state.lastFollowup = null;
                followupLine.textContent = 'followup: none';
            }
            if (event.type === 'voice.capture.state') {
                state.recording = event.payload?.state === 'capturing';
                captureButton.textContent = state.recording ? 'Stop Rec' : 'Capture';
            }
            if (event.type === 'voice.stt.state') {
                state.listening = event.payload?.state === 'listening';
                listenButton.textContent = state.listening ? 'Stop Mic' : 'Listen';
            }
            appendLog(`${event.type} ${event.payload?.state || event.payload?.command || ''}`.trim(), '#c7d2fe');
        });
        await refreshSnapshot();
    };

    const probeController = createVoiceProbeController({
        env,
        api,
        probeLine,
        input,
        ensureSession,
        getSessionId: () => state.currentSessionId,
        setStatus,
        appendLog
    });

    launcher.addEventListener('click', () => setOpen(!state.open));
    closeButton.addEventListener('click', () => setOpen(false));

    newSessionButton.addEventListener('click', async () => {
        state.currentSessionId = null;
        await ensureSession();
        await refreshSnapshot();
    });

    listenButton.addEventListener('click', async () => {
        try {
            const sessionId = await ensureSession();
            if (state.listening && typeof api.stopListening === 'function') {
                setStatus('stopping listen');
                await api.stopListening(sessionId);
            } else if (typeof api.startListening === 'function') {
                setStatus('listening');
                const started = await api.startListening({
                    session_id: sessionId,
                    lang: 'fr-FR',
                    partial: true,
                    maxAlternatives: 5
                });
                started?.promise
                    ?.then(async () => {
                        state.listening = false;
                        listenButton.textContent = 'Listen';
                        await refreshSnapshot();
                    })
                    ?.catch((error) => {
                        appendLog(`listen error: ${error?.message || error}`, '#fca5a5');
                    });
            } else {
                setStatus('listen unavailable');
            }
        } catch (error) {
            appendLog(`listen failed: ${error?.message || error}`, '#fca5a5');
            setStatus('listen failed');
        }
    });

    speakButton.addEventListener('click', async () => {
        try {
            const sessionId = await ensureSession();
            setStatus('speaking');
            await api.speak(input.value || 'Message de test.', {
                session_id: sessionId,
                voiceId: 'system-fr'
            });
        } catch (error) {
            appendLog(`speak failed: ${error?.message || error}`, '#fca5a5');
            setStatus('speak failed');
        }
    });

    stopButton.addEventListener('click', async () => {
        if (!state.currentSessionId) return;
        try {
            setStatus('stopping');
            await api.stopSpeaking(state.currentSessionId, {
                reason: 'voice_panel_stop'
            });
            await probeController.refreshLatency();
            await refreshSnapshot();
        } catch (error) {
            appendLog(`stop failed: ${error?.message || error}`, '#fca5a5');
        }
    });

    captureButton.addEventListener('click', async () => {
        try {
            const sessionId = await ensureSession();
            if (state.recording) {
                setStatus('stopping capture');
                await api.stopCapture(sessionId);
            } else {
                setStatus('capturing');
                await api.startCapture({
                    session_id: sessionId,
                    source: 'mic'
                });
            }
            await refreshSnapshot();
        } catch (error) {
            appendLog(`capture failed: ${error?.message || error}`, '#fca5a5');
            setStatus('capture failed');
        }
    });

    commandButton.addEventListener('click', async () => {
        try {
            const sessionId = await ensureSession();
            const utterance = String(commandInput.value || '').trim();
            if (!utterance) return;
            setStatus(`cmd ${utterance}`);
            const result = await api.interrupt(sessionId, {
                utterance
            });
            await probeController.noteCommand(result);
            await refreshSnapshot();
        } catch (error) {
            appendLog(`command failed: ${error?.message || error}`, '#fca5a5');
        }
    });

    followupButton.addEventListener('click', async () => {
        if (!state.currentSessionId) return;
        try {
            const followup = typeof api.executeFollowup === 'function'
                ? await api.executeFollowup(state.currentSessionId)
                : await api.takePendingFollowup(state.currentSessionId);
            appendLog(`followup: ${followup?.intent?.action || followup?.followup || 'none'}`, '#8fd3ff');
            renderFallback(followup?.intent || null);
            await refreshSnapshot();
        } catch (error) {
            appendLog(`followup failed: ${error?.message || error}`, '#fca5a5');
        }
    });

    intentButton.addEventListener('click', async () => {
        try {
            const sessionId = await ensureSession();
            if (typeof api.planUtterance !== 'function') {
                setStatus('intent unavailable');
                return;
            }
            const planned = await api.planUtterance(input.value || '', {
                session_id: sessionId
            });
            renderFallback(planned);
            appendLog(`intent: ${planned?.domain || 'unknown'} / ${planned?.action || 'unknown'}`, planned?.status === 'ambiguous' ? '#f59e0b' : '#8fd3ff');
            setStatus(planned?.status || 'planned');
        } catch (error) {
            appendLog(`intent failed: ${error?.message || error}`, '#fca5a5');
            setStatus('intent failed');
        }
    });

    probeButton.addEventListener('click', async () => {
        try {
            await probeController.run();
            await refreshSnapshot();
        } catch (error) {
            appendLog(`probe result: ${error?.message || error}`, '#f59e0b');
            await refreshSnapshot();
        }
    });

    setOpen(false);
    await bindRuntime();
    env.__ATOME_VOICE_PANEL_CONTROLLER__ = {
        launcher,
        panel,
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!state.open),
        getState: () => cloneValue({
            currentSessionId: state.currentSessionId,
            listening: state.listening,
            recording: state.recording,
            lastFollowup: state.lastFollowup,
            probe: probeController.snapshot()
        }),
        destroy: () => {
            state.unsubscribe();
            launcher.remove();
            panel.remove();
            delete env.__ATOME_VOICE_PANEL_CONTROLLER__;
        }
    };
    return env.__ATOME_VOICE_PANEL_CONTROLLER__;
};

export const bootstrapVoicePanel = ({
    env = window,
    voiceApi = null,
    force = false
} = {}) => {
    if (!env?.document) return null;
    const mount = () => mountVoicePanel({ env, voiceApi, force }).catch((error) => {
        env.console?.warn?.('[voice.panel] mount failed:', error?.message || error);
    });

    if (env.document.body) {
        mount();
    } else {
        env.addEventListener('DOMContentLoaded', mount, { once: true });
        env.addEventListener('squirrel:ready', mount, { once: true });
    }
    return true;
};
