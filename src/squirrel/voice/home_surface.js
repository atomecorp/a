import { getEveLocale } from '../../application/eVe/i18n/i18n.js';

const HISTORY_STORAGE_KEY = 'eve_voice_history_v1';
const LEGACY_HISTORY_STORAGE_KEY = 'eve_dilas_voice_history_v1';
const MAX_HISTORY_ITEMS = 80;

const toText = (value) => String(value || '').trim();

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const resolveVoiceApi = (env, explicitApi = null) => explicitApi || env?.Squirrel?.voice || env?.AtomeVoice || env?.atome?.voice || null;

const resolveLocale = () => {
    const locale = toText(getEveLocale?.()) || toText(globalThis?.document?.documentElement?.lang) || 'fr-FR';
    return locale || 'fr-FR';
};

const isEnglish = (locale = '') => toText(locale).toLowerCase().startsWith('en');

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

const loadHistory = (env) => {
    try {
        const raw = env?.localStorage?.getItem(HISTORY_STORAGE_KEY)
            || env?.localStorage?.getItem(LEGACY_HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
    } catch (_) {
        return [];
    }
};

const saveHistory = (env, history) => {
    try {
        env?.localStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY_ITEMS)));
    } catch (_) {
        // Ignore storage failures.
    }
};

const createLabels = (locale) => ({
    title: 'eVe',
    listening: isEnglish(locale) ? 'Listening' : 'J ecoute',
    thinking: isEnglish(locale) ? 'Thinking' : 'Je reflechis',
    speaking: isEnglish(locale) ? 'Speaking' : 'Je parle',
    idle: '',
    unavailable: isEnglish(locale) ? 'Voice unavailable' : 'Voix indisponible',
    stop: isEnglish(locale) ? 'Stop' : 'Stop',
    resume: isEnglish(locale) ? 'Resume listening' : 'Reprendre l ecoute',
    send: isEnglish(locale) ? 'Send' : 'Envoyer',
    placeholder: isEnglish(locale) ? 'Type a message or speak...' : 'Tape un message ou parle...',
    transcriptLabel: isEnglish(locale) ? 'Transcript' : 'Transcription',
    empty: isEnglish(locale) ? 'Start speaking to talk with eVe.' : 'Commence a parler pour discuter avec eVe.',
    user: isEnglish(locale) ? 'You' : 'Vous',
    assistant: 'eVe'
});

const readAssistantText = (response = {}, locale = 'fr-FR') => {
    const direct = toText(response?.reply_text || response?.spoken_reply || response?.assistant_reply);
    if (direct) return direct;

    const results = response?.result?.results;
    if (Array.isArray(results)) {
        const summaries = results
            .map((entry) => toText(entry?.result?.human_summary || entry?.result?.result?.human_summary || entry?.tool_name))
            .filter(Boolean);
        if (summaries.length) return summaries.join('\n');
    }

    const one = toText(response?.result?.human_summary);
    if (one) return one;

    if (response?.ok === true && response?.executed === true) {
        return isEnglish(locale) ? 'Done.' : 'C est fait.';
    }
    return '';
};

export const mountHomeVoiceSurface = async ({
    env = globalThis,
    host,
    voiceApi = null
} = {}) => {
    if (!env?.document || !host) return null;
    if (host.__eveHomeVoiceSurfaceController) return host.__eveHomeVoiceSurfaceController;

    const api = resolveVoiceApi(env, voiceApi);
    const doc = env.document;
    const state = {
        api,
        active: false,
        listening: false,
        processing: false,
        speaking: false,
        sessionId: null,
        history: loadHistory(env),
        transcriptDraft: '',
        unsubscribe: () => {},
        listeningPromise: null
    };

    const locale = () => resolveLocale();
    const labels = () => createLabels(locale());

    const root = createElement(doc, 'section', {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        marginBottom: '12px',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        color: 'var(--eve-text, #e8edf2)'
    }, {
        'data-role': 'eve-voice-surface'
    });

    const header = createElement(doc, 'div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
    });

    const titleWrap = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
    });
    const title = createElement(doc, 'div', {
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '0.03em',
        textTransform: 'uppercase'
    }, { text: labels().title });
    const status = createElement(doc, 'div', {
        fontSize: '11px',
        opacity: '0.8'
    }, { text: labels().idle });
    titleWrap.append(title, status);

    const controls = createElement(doc, 'div', {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    });

    const actionButton = createElement(doc, 'button', {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.06)',
        color: '#f8fafc',
        borderRadius: '10px',
        minWidth: '88px',
        height: '34px',
        padding: '0 12px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer'
    }, { type: 'button', 'data-role': 'eve-voice-action', text: labels().stop });

    const sendButton = createElement(doc, 'button', {
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.06)',
        color: '#f8fafc',
        borderRadius: '10px',
        minWidth: '88px',
        height: '34px',
        padding: '0 12px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: 'pointer'
    }, { type: 'button', 'data-role': 'eve-voice-send', text: labels().send });

    controls.append(actionButton, sendButton);
    header.append(titleWrap, controls);

    const transcriptLine = createElement(doc, 'div', {
        minHeight: '18px',
        fontSize: '11px',
        opacity: '0.82'
    }, {
        'data-role': 'eve-voice-transcript',
        text: ''
    });

    const history = createElement(doc, 'div', {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minHeight: '140px',
        maxHeight: '240px',
        overflowY: 'auto',
        padding: '4px 2px'
    }, {
        'data-role': 'eve-voice-history'
    });

    const composer = createElement(doc, 'div', {
        display: 'flex',
        gap: '8px',
        alignItems: 'stretch'
    });
    const input = createElement(doc, 'textarea', {
        flex: '1 1 auto',
        minHeight: '62px',
        maxHeight: '160px',
        resize: 'vertical',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        color: '#f8fafc',
        padding: '10px',
        fontSize: '12px',
        boxSizing: 'border-box'
    }, {
        'data-role': 'eve-voice-input',
        placeholder: labels().placeholder
    });
    composer.append(input);

    root.append(header, transcriptLine, history, composer);
    host.prepend(root);

    const persistHistory = () => saveHistory(env, state.history);

    const setStatus = (value) => {
        status.textContent = value;
    };

    const renderTranscript = () => {
        const text = toText(state.transcriptDraft);
        transcriptLine.textContent = text ? `${labels().transcriptLabel}: ${text}` : '';
    };

    const renderHistory = () => {
        history.innerHTML = '';
        const items = state.history.length ? state.history : [{
            role: 'assistant',
            text: labels().empty,
            ts: Date.now()
        }];
        items.forEach((entry) => {
            const isUser = entry.role === 'user';
            const bubble = createElement(doc, 'div', {
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '92%'
            });
            const meta = createElement(doc, 'div', {
                fontSize: '10px',
                opacity: '0.7',
                textAlign: isUser ? 'right' : 'left'
            }, {
                text: isUser ? labels().user : labels().assistant
            });
            const body = createElement(doc, 'div', {
                padding: '10px 12px',
                borderRadius: '14px',
                background: isUser
                    ? 'linear-gradient(135deg, rgba(15,118,110,0.85), rgba(8,145,178,0.8))'
                    : 'rgba(255,255,255,0.06)',
                color: '#f8fafc',
                border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.4',
                fontSize: '12px'
            }, {
                text: toText(entry.text)
            });
            bubble.append(meta, body);
            history.appendChild(bubble);
        });
        history.scrollTop = history.scrollHeight;
    };

    const updateControls = () => {
        const activeLabels = labels();
        title.textContent = activeLabels.title;
        input.setAttribute('placeholder', activeLabels.placeholder);
        sendButton.textContent = activeLabels.send;

        actionButton.style.display = state.active ? 'inline-flex' : 'none';
        if (state.listening || state.processing || state.speaking) {
            actionButton.textContent = activeLabels.stop;
            actionButton.style.background = 'linear-gradient(135deg, #b91c1c, #dc2626)';
        } else {
            actionButton.textContent = activeLabels.resume;
            actionButton.style.background = 'linear-gradient(135deg, #0f766e, #155e75)';
        }

        if (state.processing) {
            setStatus(activeLabels.thinking);
            return;
        }
        if (state.speaking) {
            setStatus(activeLabels.speaking);
            return;
        }
        if (state.listening) {
            setStatus(activeLabels.listening);
            return;
        }
        setStatus(activeLabels.idle);
    };

    const pushEntry = (role, text) => {
        const normalized = toText(text);
        if (!normalized) return;
        state.history.push({
            role,
            text: normalized,
            ts: Date.now()
        });
        state.history = state.history.slice(-MAX_HISTORY_ITEMS);
        persistHistory();
        renderHistory();
    };

    const ensureSession = async () => {
        if (state.sessionId) return state.sessionId;
        if (!state.api || typeof state.api.ensureReady !== 'function') {
            updateControls();
            setStatus(labels().unavailable);
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

    const startListeningLoop = async () => {
        if (!state.active || state.listening || state.processing || state.speaking) return;
        const sessionId = await ensureSession();
        state.listening = true;
        state.transcriptDraft = '';
        renderTranscript();
        updateControls();
        try {
            const started = await state.api.startListening({
                session_id: sessionId,
                lang: locale(),
                partial: true
            });
            state.listeningPromise = started?.promise || Promise.resolve(null);
            const result = await state.listeningPromise;
            state.listening = false;
            updateControls();
            const text = toText(result?.text);
            state.transcriptDraft = '';
            renderTranscript();
            if (text) {
                await runUtterance(text);
            } else if (state.active) {
                void startListeningLoop();
            }
        } catch (_) {
            state.listening = false;
            state.transcriptDraft = '';
            renderTranscript();
            updateControls();
        }
    };

    const stopListeningLoop = async () => {
        if (!state.listening || !state.sessionId || !state.api?.stopListening) return;
        try {
            await state.api.stopListening(state.sessionId);
        } catch (_) {
            // Ignore manual stop failures.
        } finally {
            state.listening = false;
            updateControls();
        }
    };

    const runUtterance = async (text) => {
        const normalized = toText(text);
        if (!normalized) return;
        await ensureSession();
        pushEntry('user', normalized);
        state.processing = true;
        state.transcriptDraft = '';
        renderTranscript();
        updateControls();
        try {
            const response = await state.api.executeUtterance(normalized, {
                session_id: state.sessionId,
                locale: locale()
            });
            const assistantText = readAssistantText(response, locale());
            if (assistantText) {
                pushEntry('assistant', assistantText);
            }
        } catch (_) {
            const fallback = isEnglish(locale()) ? 'The AI is not responding.' : "L'IA ne repond pas.";
            pushEntry('assistant', fallback);
        } finally {
            state.processing = false;
            updateControls();
            if (state.active) {
                void startListeningLoop();
            }
        }
    };

    const bindRuntime = async () => {
        if (!state.api || typeof state.api.ensureReady !== 'function') return;
        await state.api.ensureReady();
        if (typeof state.api.subscribe !== 'function') return;
        state.unsubscribe = state.api.subscribe((event) => {
            if (state.sessionId && event.session_id !== state.sessionId) return;
            if (!state.sessionId && event.session_id) {
                state.sessionId = event.session_id;
            }
            if (event.type === 'voice.stt.partial' || event.type === 'voice.stt.final') {
                state.transcriptDraft = toText(event.payload?.text);
                renderTranscript();
            }
            if (event.type === 'voice.tts.state') {
                const next = toText(event.payload?.state);
                state.speaking = next === 'speaking';
                if (next === 'done' || next === 'interrupted') {
                    state.speaking = false;
                }
                updateControls();
            }
            if (event.type === 'voice.processing.state') {
                const next = toText(event.payload?.state);
                state.processing = next === 'processing';
                if (next === 'done' || next === 'failed' || next === 'interrupted') {
                    state.processing = false;
                }
                updateControls();
            }
            if (event.type === 'voice.cancel.requested') {
                state.listening = false;
                state.speaking = false;
                state.processing = false;
                updateControls();
            }
        });
    };

    actionButton.addEventListener('click', async () => {
        if (!state.active) {
            state.active = true;
        }
        if (state.listening) {
            await stopListeningLoop();
            return;
        }
        if (state.processing && state.sessionId && state.api?.interrupt) {
            try {
                await state.api.interrupt(state.sessionId, { reason: 'eve_panel_stop' });
            } catch (_) { }
            state.processing = false;
        }
        if (state.speaking && state.sessionId && state.api?.stopSpeaking) {
            try {
                await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_stop' });
            } catch (_) { }
            state.speaking = false;
        }
        updateControls();
        if (!state.listening && !state.processing && !state.speaking) {
            void startListeningLoop();
        }
    });

    sendButton.addEventListener('click', async () => {
        const text = toText(input.value);
        if (!text) return;
        input.value = '';
        state.active = true;
        if (state.listening) {
            await stopListeningLoop();
        }
        await runUtterance(text);
    });

    input.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendButton.click();
        }
    });

    renderHistory();
    renderTranscript();
    updateControls();
    await bindRuntime();

    const controller = {
        root,
        activate() {
            state.active = true;
            void startListeningLoop();
        },
        async deactivate() {
            state.active = false;
            if (state.listening) {
                await stopListeningLoop();
            }
            if (state.sessionId && state.api?.stopSpeaking) {
                try {
                    await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_close' });
                } catch (_) { }
            }
            state.speaking = false;
            state.processing = false;
            state.transcriptDraft = '';
            renderTranscript();
            updateControls();
        },
        refreshLabels() {
            updateControls();
            renderTranscript();
            renderHistory();
        },
        getState() {
            return cloneValue({
                active: state.active,
                listening: state.listening,
                processing: state.processing,
                speaking: state.speaking,
                sessionId: state.sessionId,
                history: state.history
            });
        },
        destroy() {
            try { state.unsubscribe(); } catch (_) { }
            root.remove();
            delete host.__eveHomeVoiceSurfaceController;
        }
    };

    host.__eveHomeVoiceSurfaceController = controller;
    return controller;
};
