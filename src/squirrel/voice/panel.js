const PANEL_ID = 'squirrel-voice-panel';
const LAUNCHER_ID = 'squirrel-voice-launcher';
const LOG_LIMIT = 24;

const isTauriLikeEnv = (env) => {
    if (!env || typeof env !== 'object') return false;
    if (env.__SQUIRREL_FORCE_FASTIFY__ === true) return false;
    if (env.__SQUIRREL_FORCE_TAURI_RUNTIME__ === true) return true;
    const protocol = env.location?.protocol || '';
    const host = env.location?.hostname || '';
    if (protocol === 'tauri:' || protocol === 'asset:' || protocol === 'ipc:' || host === 'tauri.localhost') return true;
    const hasTauriInvoke = !!(env.__TAURI_INTERNALS__ && typeof env.__TAURI_INTERNALS__.invoke === 'function');
    if (hasTauriInvoke) return true;
    const hasTauriObjects = !!(env.__TAURI__ || env.__TAURI_INTERNALS__);
    if (!hasTauriObjects) return false;
    if (typeof env.navigator !== 'undefined' && /tauri/i.test(env.navigator.userAgent || '')) return true;
    return false;
};

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

const createElement = (doc, tag, style = {}, attrs = {}) => {
    const node = doc.createElement(tag);
    Object.assign(node.style, style);
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (key === 'text') {
            node.textContent = String(value);
            return;
        }
        node.setAttribute(key, String(value));
    });
    return node;
};

const createButton = (doc, label, background = '#2c3642') => {
    const button = createElement(doc, 'button', {
        border: '1px solid rgba(255,255,255,0.12)',
        background,
        color: '#f6f8fa',
        borderRadius: '8px',
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '600'
    }, {
        type: 'button',
        text: label
    });
    return button;
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
    if (normalized.includes('mtrack') || normalized.includes('montage') || normalized.includes('timeline')) {
        suggestions.push('Ouvre Mtrack');
        suggestions.push('Lance la lecture');
    }
    if (suggestions.length === 0) {
        suggestions.push('Ouvre Mtrack');
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
        probe: {
            status: 'idle',
            speech_stopped: false,
            processing_aborted: false,
            new_command_accepted: false,
            speaking_settled: false,
            processing_settled: false,
            cancel_latency_ms: null
        },
        unsubscribe: () => {}
    };

    const launcher = createElement(doc, 'button', {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        width: '52px',
        height: '52px',
        borderRadius: '999px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'linear-gradient(135deg, #0f766e, #155e75)',
        color: '#f8fafc',
        zIndex: '9999',
        cursor: 'pointer',
        boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
        fontWeight: '700',
        letterSpacing: '0.02em'
    }, {
        id: LAUNCHER_ID,
        type: 'button',
        'aria-label': 'Open voice panel',
        text: 'Mic'
    });

    const panel = createElement(doc, 'div', {
        position: 'fixed',
        right: '16px',
        bottom: '80px',
        width: '340px',
        minHeight: '260px',
        maxHeight: '78vh',
        display: 'none',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px',
        borderRadius: '18px',
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(17, 24, 39, 0.98))',
        boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        color: '#e5edf5',
        fontFamily: 'Menlo, Consolas, monospace',
        zIndex: '9999',
        overflow: 'hidden'
    }, {
        id: PANEL_ID
    });

    const header = createElement(doc, 'div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px'
    });

    const titleWrap = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
    });
    const title = createElement(doc, 'div', {
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '0.04em',
        textTransform: 'uppercase'
    }, { text: 'Voice Runtime' });
    const providersLine = createElement(doc, 'div', {
        fontSize: '11px',
        color: '#9fb2c7'
    }, { text: 'providers: loading...' });
    titleWrap.append(title, providersLine);

    const closeButton = createButton(doc, 'Close', '#1f2937');
    closeButton.style.padding = '5px 8px';
    closeButton.style.fontSize = '11px';
    header.append(titleWrap, closeButton);

    const meta = createElement(doc, 'div', {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        fontSize: '11px',
        color: '#c6d3df'
    });
    const phaseLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-phase', text: 'phase: idle' });
    const sessionLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-session', text: 'session: none' });
    const followupLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-followup', text: 'followup: none' });
    const statusLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-status', text: 'status: ready' });
    const probeLine = createElement(doc, 'div', {}, { 'data-test-id': 'voice-panel-probe', text: 'probe: idle' });
    meta.append(phaseLine, sessionLine, followupLine, statusLine, probeLine);

    const transcript = createElement(doc, 'div', {
        minHeight: '66px',
        maxHeight: '120px',
        overflowY: 'auto',
        padding: '10px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '12px',
        lineHeight: '1.45',
        whiteSpace: 'pre-wrap'
    }, { 'data-test-id': 'voice-panel-transcript', text: 'No transcript yet.' });

    const fallback = createElement(doc, 'div', {
        display: 'none',
        minHeight: '44px',
        padding: '10px',
        borderRadius: '12px',
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.26)',
        fontSize: '11px',
        lineHeight: '1.45',
        whiteSpace: 'pre-wrap',
        color: '#fde68a'
    }, { 'data-test-id': 'voice-panel-fallback', text: '' });

    const input = createElement(doc, 'textarea', {
        minHeight: '56px',
        resize: 'vertical',
        width: '100%',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        color: '#f8fafc',
        padding: '10px',
        fontSize: '12px',
        boxSizing: 'border-box'
    }, {
        'data-test-id': 'voice-panel-input'
    });
    input.value = 'Je lis un message de test qui pourra etre interrompu.';

    const commandInput = createElement(doc, 'input', {
        width: '100%',
        height: '34px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        color: '#f8fafc',
        padding: '0 10px',
        fontSize: '12px',
        boxSizing: 'border-box'
    }, {
        type: 'text',
        placeholder: 'Commande locale: stop, passe au suivant, resume...',
        'data-test-id': 'voice-panel-command-input'
    });
    commandInput.value = 'passe au suivant';

    const row1 = createElement(doc, 'div', {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px'
    });
    const newSessionButton = createButton(doc, 'New', '#334155');
    const listenButton = createButton(doc, 'Listen', '#0f766e');
    const speakButton = createButton(doc, 'Speak', '#1d4ed8');
    const stopButton = createButton(doc, 'Stop', '#b91c1c');
    row1.append(newSessionButton, listenButton, speakButton, stopButton);

    const row2 = createElement(doc, 'div', {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '8px'
    });
    const captureButton = createButton(doc, 'Capture', '#7c3aed');
    const commandButton = createButton(doc, 'Send Cmd', '#0f766e');
    const followupButton = createButton(doc, 'Followup', '#475569');
    const intentButton = createButton(doc, 'Intent', '#92400e');
    const probeButton = createButton(doc, 'Probe', '#7c2d12');
    row2.append(captureButton, commandButton, followupButton, intentButton, probeButton);

    const log = createElement(doc, 'div', {
        minHeight: '96px',
        maxHeight: '180px',
        overflowY: 'auto',
        padding: '8px',
        borderRadius: '12px',
        background: 'rgba(2, 6, 23, 0.72)',
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '11px',
        lineHeight: '1.4'
    }, { 'data-test-id': 'voice-panel-log' });

    panel.append(header, meta, transcript, fallback, input, commandInput, row1, row2, log);
    doc.body.append(launcher, panel);

    const appendLog = (message, color = '#d3dde8') => {
        const line = createElement(doc, 'div', {
            color,
            marginBottom: '4px'
        }, {
            text: `[${new Date().toLocaleTimeString()}] ${message}`
        });
        log.prepend(line);
        while (log.childNodes.length > LOG_LIMIT) {
            log.removeChild(log.lastChild);
        }
    };

    const setOpen = (value) => {
        state.open = value === true;
        panel.style.display = state.open ? 'flex' : 'none';
        launcher.textContent = state.open ? 'Hide' : 'Mic';
    };

    const setStatus = (text) => {
        statusLine.textContent = `status: ${text}`;
    };

    const syncProbeLine = () => {
        const probe = state.probe || {};
        const latency = Number.isFinite(probe.cancel_latency_ms) ? `${Math.round(probe.cancel_latency_ms)}ms` : 'n/a';
        probeLine.textContent = `probe: ${probe.status || 'idle'} stop=${probe.speech_stopped ? 'yes' : 'no'} abort=${probe.processing_aborted ? 'yes' : 'no'} next=${probe.new_command_accepted ? 'yes' : 'no'} cancel=${latency}`;
    };

    const refreshProbeLatency = async () => {
        if (!state.currentSessionId || typeof api.telemetry?.snapshot !== 'function') return;
        const snapshot = api.telemetry.snapshot(state.currentSessionId);
        const latency = snapshot?.metrics?.cancel_roundtrip_ms;
        if (Number.isFinite(latency)) {
            state.probe.cancel_latency_ms = latency;
            syncProbeLine();
        }
    };

    const maybeFinalizeProbe = async () => {
        if (state.probe.status === 'running' || state.probe.status === 'awaiting_command') {
            if (state.probe.speaking_settled && state.probe.processing_settled) {
                state.probe.status = state.probe.new_command_accepted ? 'validated' : 'awaiting_command';
                if (state.probe.status === 'validated') {
                    await refreshProbeLatency();
                    setStatus('probe validated');
                    appendLog('probe validated', '#8fd3ff');
                } else {
                    setStatus('probe awaiting command');
                }
                syncProbeLine();
            }
        }
    };

    const markProbeFailed = (message) => {
        state.probe.status = 'failed';
        syncProbeLine();
        setStatus('probe failed');
        appendLog(`probe failed: ${message}`, '#fca5a5');
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

    const runProbe = async () => {
        const sessionId = await ensureSession();
        state.probe = {
            status: 'running',
            speech_stopped: false,
            processing_aborted: false,
            new_command_accepted: false,
            speaking_settled: false,
            processing_settled: false,
            cancel_latency_ms: null
        };
        syncProbeLine();
        setStatus('probe running');
        appendLog('interrupt probe started', '#f59e0b');
        const processing = await api.runProcessing(sessionId, ({ signal }) => new Promise((resolve, reject) => {
            const timer = env.setTimeout(() => resolve({ ok: true }), 12000);
            signal?.addEventListener?.('abort', () => {
                env.clearTimeout(timer);
                reject(new Error(String(signal.reason || 'aborted')));
            }, { once: true });
        }), {
            step: 'voice_panel_probe'
        });
        processing?.promise
            ?.then(async (result) => {
                state.probe.processing_settled = true;
                state.probe.processing_aborted = result?.aborted === true;
                appendLog(`probe processing ${state.probe.processing_aborted ? 'aborted' : 'completed'}`, state.probe.processing_aborted ? '#8fd3ff' : '#f59e0b');
                await maybeFinalizeProbe();
            })
            ?.catch((error) => {
                markProbeFailed(error?.message || error);
            });
        const speaking = await api.speak(input.value || 'Message de test.', {
            session_id: sessionId,
            voiceId: 'system-fr'
        });
        speaking?.promise
            ?.then(async (result) => {
                state.probe.speaking_settled = true;
                state.probe.speech_stopped = result?.stopped === true;
                appendLog(`probe speech ${state.probe.speech_stopped ? 'stopped' : 'completed'}`, state.probe.speech_stopped ? '#8fd3ff' : '#f59e0b');
                await maybeFinalizeProbe();
            })
            ?.catch((error) => {
                markProbeFailed(error?.message || error);
            });
    };

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
            await refreshProbeLatency();
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
            if (state.probe.status === 'running' || state.probe.status === 'awaiting_command') {
                state.probe.new_command_accepted = result?.matched === true && !!result?.command && String(result.command) !== 'stop';
                await maybeFinalizeProbe();
            }
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
            await runProbe();
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
            probe: state.probe
        }),
        destroy: () => {
            try { state.unsubscribe(); } catch (_) { }
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

if (typeof window !== 'undefined' && shouldEnableVoicePanel(window)) {
    bootstrapVoicePanel({ env: window });
}
