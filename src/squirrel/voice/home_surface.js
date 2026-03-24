import { getEveLocale } from '../../application/eVe/i18n/i18n.js';
import { mountVoiceMeter } from './voice_meter.js';
import { createVoiceActivityDetector } from './vad.js';

const HISTORY_STORAGE_KEY = 'eve_voice_history_v1';
const LEGACY_HISTORY_STORAGE_KEY = 'eve_dilas_voice_history_v1';
const MAX_HISTORY_ITEMS = 80;
const DEFAULT_ECHO_COOLDOWN_MS = 1200;
const DEFAULT_BARGE_ARM_DELAY_MS = 700;
const LOW_INFORMATION_TOKENS = new Set([
    'tout',
    'tous',
    'toutes',
    'oui',
    'non',
    'mais',
    'bon',
    'alors',
    'donc',
    'ok',
    'hum',
    'hein'
]);
const AFFIRMATIVE_TOKENS = new Set([
    'oui',
    'ouais',
    'ok',
    'okay',
    'd accord',
    'dac',
    'vas y',
    'continue',
    'continuer'
]);
const NEGATIVE_TOKENS = new Set([
    'non',
    'nan',
    'no',
    'stop',
    'annule',
    'annuler',
    'laisse tomber',
    'pas maintenant'
]);

const toText = (value) => String(value || '').trim();

const normalizeComparisonText = (value = '') => toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyAssistantEcho = ({
    heard = '',
    assistant = '',
    now = Date.now(),
    spokenAt = 0,
    cooldownMs = DEFAULT_ECHO_COOLDOWN_MS
} = {}) => {
    const heardText = normalizeComparisonText(heard);
    const assistantText = normalizeComparisonText(assistant);
    if (!heardText || !assistantText) return false;
    if (now - Number(spokenAt || 0) > cooldownMs) return false;
    if (heardText.length < 4) return false;
    return heardText === assistantText || assistantText.includes(heardText) || heardText.includes(assistantText);
};

const isTranscriptActionable = (value = '') => {
    const normalized = normalizeComparisonText(value);
    if (!normalized) return false;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length >= 2) return true;
    const [first = ''] = words;
    if (!first) return false;
    if (LOW_INFORMATION_TOKENS.has(first)) return false;
    if ([
        'mail', 'mails', 'agenda', 'calendrier', 'contact', 'contacts', 'compte', 'projet',
        'ouvre', 'ouvre', 'lis', 'ajoute', 'cree', 'supprime', 'stop', 'annule', 'suivant',
        'precedent', 'reponds', 'resume'
    ].some((token) => normalized.includes(token))) {
        return true;
    }
    return first.length >= 6;
};

const mergeTranscriptFragments = (prefix = '', next = '') => {
    const left = toText(prefix);
    const right = toText(next);
    if (!left) return right;
    if (!right) return left;
    const normalizedLeft = normalizeComparisonText(left);
    const normalizedRight = normalizeComparisonText(right);
    if (normalizedLeft && normalizedLeft === normalizedRight) return right;
    if (normalizedLeft && normalizedRight && normalizedRight.startsWith(normalizedLeft)) return right;
    return `${left} ${right}`.trim();
};

const isAffirmativeDecision = (value = '') => AFFIRMATIVE_TOKENS.has(normalizeComparisonText(value));

const isNegativeDecision = (value = '') => NEGATIVE_TOKENS.has(normalizeComparisonText(value));

const toDebugPayload = (value) => {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return String(value);
    }
};

const debugVoice = (...args) => {
    try {
        globalThis?.console?.log?.('[eVe:voice]', ...args.map((entry) => (
            typeof entry === 'string' ? entry : toDebugPayload(entry)
        )));
    } catch (_) {
        // Ignore logging failures.
    }
};

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

const looksLikeInternalToolSummary = (value = '') => {
    const normalized = normalizeComparisonText(value);
    if (!normalized) return false;
    if (/^(mail|calendar|contact|contacts|bank|atome|mtrack)[\s:./_-]/.test(normalized)) return true;
    return /^(list|read|search|next unread|summarize|draft|send|create|update|delete|open|ensure|share|export|import|push|grant|publish|alter|move|crop)\b/.test(normalized)
        && /(mail|calendar|contact|contacts|bank|atome|mtrack|event|events|draft|user|users|source|sources)\b/.test(normalized);
};

const localizeVoiceError = (code = '', locale = 'fr-FR') => {
    const english = isEnglish(locale);
    switch (toText(code)) {
    case 'unsupported_stt':
    case 'voice_stt_backend_unavailable':
    case 'browser_speech_recognition_unavailable':
        return english
            ? 'Voice recognition is unavailable here. Do you want to continue by typing?'
            : 'La reconnaissance vocale est indisponible ici. Veux-tu continuer par ecrit ?';
    case 'browser_speech_permission_check_failed':
    case 'browser_speech_service_not_allowed':
        return english
            ? 'Voice recognition permission checks failed here. Do you want to continue by typing?'
            : 'La verification du service vocal a echoue ici. Veux-tu continuer par ecrit ?';
    case 'microphone_unavailable':
        return english
            ? 'Microphone access is unavailable.'
            : 'L acces au micro est indisponible.';
    case 'audio_context_unavailable':
        return english
            ? 'Audio visualization is unavailable here.'
            : 'La visualisation audio est indisponible ici.';
    case 'voice_api_unavailable':
        return english
            ? 'The voice runtime is unavailable.'
            : 'Le moteur vocal est indisponible.';
    default:
        return english
            ? 'Voice input is unavailable right now. Do you want to continue by typing?'
            : 'L entree vocale est indisponible pour le moment. Veux-tu continuer par ecrit ?';
    }
};

const localizeExecutionError = (code = '', locale = 'fr-FR') => {
    const english = isEnglish(locale);
    switch (toText(code)) {
    case 'no_ai_key_configured':
        return english ? 'No AI key is configured.' : "Aucune cle IA n'est configuree.";
    case 'provider_timeout':
    case 'provider_auth_failed':
    case 'provider_unreachable':
    case 'provider_invalid_response':
    case 'voice_agent_bridge_unavailable':
    case 'voice_execution_bridge_unavailable':
    case 'voice_toolchain_empty':
        return english ? 'The AI is not responding.' : "L'IA ne repond pas.";
    case 'mail_connector_unavailable':
        return english ? 'I do not have access to your mail here yet.' : "Je n'ai pas encore acces a tes mails ici.";
    default:
        return '';
    }
};

const localizeFragmentPrompt = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? 'I only heard part of the sentence. Continue.'
        : "Je n'ai entendu qu'un fragment. Continue."
);

const localizeDownloadProgress = ({ status = 'downloading', model = '', progress = null } = {}, locale = 'fr-FR') => {
    const english = isEnglish(locale);
    const normalizedStatus = toText(status) || 'downloading';
    const modelName = toText(model);
    const suffix = Number.isFinite(Number(progress)) ? ` ${Math.max(0, Math.min(100, Math.round(Number(progress))))}%` : '';
    if (normalizedStatus === 'ready' || normalizedStatus === 'done' || normalizedStatus === 'completed') {
        return english ? 'Voice model ready.' : 'Modele vocal pret.';
    }
    if (normalizedStatus === 'error' || normalizedStatus === 'failed') {
        return english ? 'Voice model download failed.' : 'Le telechargement du modele vocal a echoue.';
    }
    const base = english ? 'Downloading voice model' : 'Telechargement du modele vocal';
    return `${base}${modelName ? ` ${modelName}` : ''}${suffix}`;
};

const classifyVoiceError = (error) => {
    const raw = toText(error?.code || error?.message || error);
    if (!raw) return 'voice_input_unavailable';
    if (raw === 'microphone_unavailable') return raw;
    if (raw === 'audio_context_unavailable') return raw;
    if (raw === 'voice_api_unavailable') return raw;
    if (/Speech recognition service permission check has failed/i.test(raw)) return 'browser_speech_permission_check_failed';
    if (/service-not-allowed|not-allowed/i.test(raw)) return 'browser_speech_service_not_allowed';
    if (/Voice stt backend is not available/i.test(raw)) return 'voice_stt_backend_unavailable';
    if (/Browser speech recognition is not available/i.test(raw)) return 'browser_speech_recognition_unavailable';
    return raw;
};

const resolveUserFirstName = (env) => {
    const raw = toText(env?.__currentUser?.name || env?.window?.__currentUser?.name || '');
    if (!raw) return '';
    return raw.split(/\s+/).filter(Boolean)[0] || '';
};

const localizeReadyLine = (locale = 'fr-FR', userName = '') => {
    if (isEnglish(locale)) {
        return userName ? `Hi ${userName}, I'm listening.` : 'Hi, what do you want?';
    }
    return userName ? `Salut ${userName}, je t ecoute.` : 'Salut, que veux-tu ?';
};

const localizeClosingLine = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? "I'm heading out. Call me if you need me."
        : "Je m'en vais, rappelle-moi si tu as besoin."
);

const localizeTextOnlyReadyLine = (locale = 'fr-FR', userName = '') => {
    if (isEnglish(locale)) {
        return userName ? `Hi ${userName}, type what you want and I will answer out loud.` : 'Hi, type what you want and I will answer out loud.';
    }
    return userName ? `Salut ${userName}, ecris-moi ce que tu veux et je te repondrai a voix haute.` : 'Salut, ecris-moi ce que tu veux et je te repondrai a voix haute.';
};

const localizeTextOnlyInfo = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? 'Text mode only. Type your request below.'
        : 'Mode texte uniquement. Ecris ta demande ci-dessous.'
);

const localizeDeclineLine = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? "Okay, I will stop here."
        : "D'accord, j'en reste la."
);

const localizeNoResultLine = (locale = 'fr-FR') => (
    isEnglish(locale)
        ? 'I could not produce a usable answer for that request yet.'
        : "Je n'ai pas encore pu produire une reponse exploitable pour cette demande."
);

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
    const direct = toText(
        response?.reply_text
        || response?.spoken_reply
        || response?.assistant_reply
        || response?.confirmation_prompt
    );
    if (direct) return direct;

    const results = response?.result?.results;
    if (Array.isArray(results)) {
        const summaries = results
            .map((entry) => toText(entry?.result?.human_summary || entry?.result?.result?.human_summary))
            .filter(Boolean)
            .filter((entry) => !looksLikeInternalToolSummary(entry));
        if (summaries.length) return summaries.join('\n');
    }

    const one = toText(response?.result?.human_summary);
    if (one && !looksLikeInternalToolSummary(one)) return one;

    if (response?.ok === true && response?.executed === true) {
        return isEnglish(locale) ? 'Done.' : 'C est fait.';
    }
    return '';
};

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
        errorMessage: '',
        infoMessage: '',
        unsubscribe: () => {},
        listeningPromise: null,
        voiceMeter: null,
        meterRunning: false,
        suppressAutoRestartOnce: false,
        lastAssistantReply: '',
        lastAssistantSpokenAt: 0,
        restartTimer: null,
        bargeInDetector: null,
        bargeInPending: false,
        bargeInArmAt: 0,
        pendingTranscriptPrefix: '',
        lastFailureNotice: '',
        activationPromise: null
    };

    const locale = () => resolveLocale();
    const labels = () => createLabels(locale());
    const echoCooldownMs = Number.isFinite(Number(env?.__EVE_VOICE_ECHO_COOLDOWN_MS))
        ? Math.max(0, Number(env.__EVE_VOICE_ECHO_COOLDOWN_MS))
        : DEFAULT_ECHO_COOLDOWN_MS;
    const bargeArmDelayMs = Number.isFinite(Number(env?.__EVE_VOICE_BARGE_ARM_DELAY_MS))
        ? Math.max(0, Number(env.__EVE_VOICE_BARGE_ARM_DELAY_MS))
        : DEFAULT_BARGE_ARM_DELAY_MS;

    const resetBargeInDetector = () => {
        state.bargeInPending = false;
        state.bargeInArmAt = 0;
        state.bargeInDetector?.reset?.();
    };

    const handleBargeInDetected = async () => {
        if (state.bargeInPending || !state.active || !state.speaking || !state.sessionId) return;
        state.bargeInPending = true;
        debugVoice('barge_in_detected', {
            sessionId: state.sessionId
        });
        clearRestartTimer();
        try {
            if (state.api?.stopSpeaking) {
                await state.api.stopSpeaking(state.sessionId, { reason: 'eve_voice_barge_in' });
            }
        } catch (_) {
            // Ignore stop failures and continue toward a fresh listen cycle.
        } finally {
            state.speaking = false;
            updateControls();
            resetBargeInDetector();
            if (state.active && !state.listening && !state.processing) {
                const timer = env.setTimeout?.(() => {
                    state.restartTimer = null;
                    void startListeningLoop();
                }, 80) || null;
                state.restartTimer = timer;
            }
        }
    };

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
        gap: '4px',
        flex: '1 1 auto',
        minWidth: '0'
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
    const meterCanvas = createElement(doc, 'canvas', {
        width: '116px',
        height: '26px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        display: 'block'
    }, {
        'data-role': 'eve-voice-meter',
        'aria-hidden': 'true'
    });
    titleWrap.append(title, status, meterCanvas);

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

    const noticeLine = createElement(doc, 'div', {
        minHeight: '18px',
        fontSize: '11px',
        color: 'rgba(251, 113, 133, 0.96)'
    }, {
        'data-role': 'eve-voice-notice',
        text: ''
    });

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

    root.append(header, noticeLine, transcriptLine, history, composer);
    host.prepend(root);

    const persistHistory = () => saveHistory(env, state.history);

    const clearRestartTimer = () => {
        if (state.restartTimer) {
            env.clearTimeout?.(state.restartTimer);
            state.restartTimer = null;
        }
    };

    const rememberAssistantReply = (text = '', spokenAt = 0) => {
        const normalized = toText(text);
        if (!normalized) return;
        state.lastAssistantReply = normalized;
        state.lastAssistantSpokenAt = spokenAt;
    };

    const speakAssistantLine = async (text, {
        pushHistoryEntry = true,
        rememberReply = false
    } = {}) => {
        const normalized = toText(text);
        if (!normalized) return false;
        debugVoice('assistant_text', normalized);
        if (pushHistoryEntry) {
            pushEntry('assistant', normalized);
        }
        if (rememberReply) {
            rememberAssistantReply(normalized, 0);
        }
        if (!state.api?.speak) return false;
        await ensureSession();
        try {
            const started = await state.api.speak(normalized, {
                session_id: state.sessionId,
                lang: locale()
            });
            await (started?.promise || Promise.resolve(started));
            if (rememberReply) {
                rememberAssistantReply(normalized, Date.now());
            }
            return true;
        } catch (_) {
            return false;
        }
    };

    const announceListenFailure = async (error) => {
        const code = classifyVoiceError(error);
        setError(code);
        const failureNotice = localizeVoiceError(code, locale());
        if (!failureNotice || state.lastFailureNotice === failureNotice) return;
        state.lastFailureNotice = failureNotice;
        pushEntry('assistant', failureNotice);
        await speakAssistantLine(failureNotice, {
            pushHistoryEntry: false,
            rememberReply: false
        });
    };

    const setStatus = (value) => {
        status.textContent = value;
    };

    const renderNotice = () => {
        const message = toText(state.errorMessage) || toText(state.infoMessage);
        noticeLine.textContent = message;
        noticeLine.style.color = state.errorMessage
            ? 'rgba(251, 113, 133, 0.96)'
            : 'rgba(191, 219, 254, 0.96)';
    };

    const setError = (codeOrMessage = '') => {
        state.errorMessage = codeOrMessage
            ? localizeVoiceError(codeOrMessage, locale())
            : '';
        renderNotice();
    };

    const setInfo = (message = '') => {
        state.infoMessage = toText(message);
        renderNotice();
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
                fontSize: '12px',
                cursor: 'text',
                userSelect: 'text',
                webkitUserSelect: 'text',
                pointerEvents: 'auto'
            }, {
                text: toText(entry.text),
                'data-role': 'eve-voice-history-entry'
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

        actionButton.style.display = (textOnly ? state.speaking : state.active) ? 'inline-flex' : 'none';
        actionButton.disabled = false;
        actionButton.style.opacity = '1';
        actionButton.style.cursor = 'pointer';

        if (textOnly && !state.speaking) {
            actionButton.style.display = 'none';
        } else if (state.processing && !state.listening && !state.speaking) {
            actionButton.textContent = activeLabels.thinking;
            actionButton.style.background = 'rgba(255,255,255,0.08)';
            actionButton.disabled = true;
            actionButton.style.opacity = '0.72';
            actionButton.style.cursor = 'default';
        } else if (state.listening || state.speaking) {
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
        if (state.errorMessage) {
            setStatus(activeLabels.unavailable);
            return;
        }
        setStatus(activeLabels.idle);
    };

    const startVoiceMeter = async () => {
        if (textOnly) return;
        if (!state.voiceMeter && typeof voiceMeterFactory === 'function') {
            state.voiceMeter = voiceMeterFactory({
                env,
                canvas: meterCanvas,
                onFrame: (frame) => {
                    if (!state.bargeInDetector) return;
                    if (!state.active || !state.speaking || state.listening || state.processing) {
                        state.bargeInDetector.reset();
                        return;
                    }
                    if (Date.now() < state.bargeInArmAt) return;
                    const next = state.bargeInDetector.push(frame);
                    if (next?.state === 'speech') {
                        void handleBargeInDetected();
                    }
                }
            });
        }
        if (!state.voiceMeter?.start || state.meterRunning) return;
        if (!state.bargeInDetector) {
            state.bargeInDetector = createVoiceActivityDetector({
                threshold: 0.08,
                minSpeechFrames: 4,
                releaseFrames: 5
            });
        }
        try {
            await state.voiceMeter.start();
            state.meterRunning = true;
        } catch (error) {
            state.meterRunning = false;
            setError(classifyVoiceError(error));
            updateControls();
        }
    };

    const stopVoiceMeter = async () => {
        if (textOnly) return;
        if (!state.voiceMeter?.stop) return;
        try {
            await state.voiceMeter.stop();
        } catch (_) {
            // Ignore meter teardown failures.
        } finally {
            state.meterRunning = false;
        }
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

    const logExecutionResponse = (response = {}, debugEvent = 'execute_utterance:response') => {
        debugVoice(debugEvent, {
            sessionId: state.sessionId,
            ok: response?.ok === true,
            executed: response?.executed === true,
            error: response?.error || null,
            reply_text: toText(response?.reply_text || response?.spoken_reply || response?.confirmation_prompt || '')
        });
    };

    const applyExecutionResponse = async (response = {}, debugEvent = 'execute_utterance:response') => {
        logExecutionResponse(response, debugEvent);
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
        setInfo('');
        return assistantText;
    };

    const ensureSession = async () => {
        if (state.sessionId) return state.sessionId;
        if (!state.api || typeof state.api.ensureReady !== 'function') {
            updateControls();
            setStatus(labels().unavailable);
            setError('voice_api_unavailable');
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
            }, {
                phase: 'confirmation_declined'
            });
        } catch (_) {
            // Ignore stale session context updates.
        }
    };

    const finishTurnAndMaybeRestart = () => {
        state.processing = false;
        updateControls();
        if (state.active) {
            const delay = state.lastAssistantReply ? echoCooldownMs : 0;
            const timer = env.setTimeout?.(() => {
                state.restartTimer = null;
                void startListeningLoop();
            }, delay) || null;
            state.restartTimer = timer;
        }
    };

    const handleDecisionUtterance = async (text) => {
        const normalized = toText(text);
        const affirmative = isAffirmativeDecision(normalized);
        const negative = isNegativeDecision(normalized);
        if (!affirmative && !negative) return false;

        const snapshot = await getSessionSnapshot();
        const pendingFollowup = toText(snapshot?.conversation?.pending_followup);
        const resumeAvailable = snapshot?.conversation?.resume_available === true;
        const activeIntent = snapshot?.conversation?.active_intent || null;
        const confirmationRequired = activeIntent?.execution?.confirmation_required === true;
        if (!pendingFollowup && !resumeAvailable && !confirmationRequired) return false;

        clearRestartTimer();
        state.pendingTranscriptPrefix = '';
        pushEntry('user', normalized);
        state.processing = true;
        state.transcriptDraft = '';
        renderTranscript();
        updateControls();

        try {
            let response = null;
            if (affirmative) {
                if ((pendingFollowup || resumeAvailable) && typeof state.api?.executeFollowup === 'function') {
                    response = await state.api.executeFollowup(state.sessionId, {
                        locale: locale()
                    });
                }
                if (!response && confirmationRequired && typeof state.api?.executeIntent === 'function') {
                    response = await state.api.executeIntent(activeIntent, {
                        session_id: state.sessionId,
                        locale: locale(),
                        confirmed: true
                    });
                }
            } else {
                if ((pendingFollowup || resumeAvailable) && typeof state.api?.takePendingFollowup === 'function') {
                    state.api.takePendingFollowup(state.sessionId, {
                        nextPhase: 'completed',
                        allowResume: false
                    });
                }
                if (confirmationRequired) {
                    clearConfirmationContext(activeIntent);
                }
                response = {
                    ok: true,
                    executed: false,
                    transport: 'none',
                    reply_text: localizeDeclineLine(locale())
                };
            }

            if (response) {
                await applyExecutionResponse(response, 'execute_followup:response');
            }
        } catch (_) {
            const fallback = isEnglish(locale()) ? 'The AI is not responding.' : "L'IA ne repond pas.";
            pushEntry('assistant', fallback);
            rememberAssistantReply(fallback, Date.now());
        } finally {
            finishTurnAndMaybeRestart();
        }
        return true;
    };

    const startListeningLoop = async () => {
        if (textOnly) return;
        clearRestartTimer();
        if (!state.active || state.listening || state.processing || state.speaking) return;
        const sessionId = await ensureSession();
        debugVoice('start_listening', { sessionId, locale: locale() });
        state.listening = true;
        state.transcriptDraft = '';
        state.lastFailureNotice = '';
        setError('');
        setInfo('');
        renderTranscript();
        updateControls();
        try {
            const started = await state.api.startListening({
                session_id: sessionId,
                lang: locale(),
                partial: true,
                continuous: true,
                silenceMs: 900,
                finalSilenceMs: 320,
                maxAlternatives: 3
            });
            state.listeningPromise = started?.promise || Promise.resolve(null);
            const result = await state.listeningPromise;
            state.listening = false;
            updateControls();
            const text = toText(result?.text);
            const mergedText = mergeTranscriptFragments(state.pendingTranscriptPrefix, text);
            debugVoice('listen_resolved', {
                sessionId,
                text: mergedText || text,
                cancelled: result?.cancelled === true,
                reason: result?.reason || null
            });
            state.transcriptDraft = '';
            renderTranscript();
            if (isLikelyAssistantEcho({
                heard: mergedText || text,
                assistant: state.lastAssistantReply,
                spokenAt: state.lastAssistantSpokenAt,
                cooldownMs: echoCooldownMs
            })) {
                debugVoice('listen_echo_ignored', {
                    sessionId,
                    text: mergedText || text
                });
                if (state.active) {
                    const timer = env.setTimeout?.(() => {
                        state.restartTimer = null;
                        void startListeningLoop();
                    }, echoCooldownMs) || null;
                    state.restartTimer = timer;
                }
            } else if (await handleDecisionUtterance(mergedText)) {
                return;
            } else if (mergedText && !isTranscriptActionable(mergedText)) {
                state.pendingTranscriptPrefix = mergedText;
                setInfo(localizeFragmentPrompt(locale()));
                if (state.active) {
                    const timer = env.setTimeout?.(() => {
                        state.restartTimer = null;
                        void startListeningLoop();
                    }, 0) || null;
                    state.restartTimer = timer;
                }
            } else if (mergedText) {
                state.pendingTranscriptPrefix = '';
                await runUtterance(mergedText);
            } else if (state.suppressAutoRestartOnce) {
                state.suppressAutoRestartOnce = false;
            } else if (state.active) {
                const timer = env.setTimeout?.(() => {
                    state.restartTimer = null;
                    void startListeningLoop();
                }, 0) || null;
                state.restartTimer = timer;
            }
        } catch (error) {
            debugVoice('listen_failed', {
                sessionId,
                error: error?.message || String(error)
            });
            state.listening = false;
            state.transcriptDraft = '';
            clearRestartTimer();
            renderTranscript();
            await announceListenFailure(error);
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
        clearRestartTimer();
        state.pendingTranscriptPrefix = '';
        state.lastFailureNotice = '';
        await ensureSession();
        debugVoice('execute_utterance:start', {
            sessionId: state.sessionId,
            text: normalized,
            locale: locale()
        });
        setError('');
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
            const assistantText = await applyExecutionResponse(response, 'execute_utterance:response');
            if (!assistantText) {
                await speakAssistantLine(localizeNoResultLine(locale()), {
                    pushHistoryEntry: true,
                    rememberReply: true
                });
            }
        } catch (_) {
            debugVoice('execute_utterance:failed', {
                sessionId: state.sessionId
            });
            const fallback = isEnglish(locale()) ? 'The AI is not responding.' : "L'IA ne repond pas.";
            pushEntry('assistant', fallback);
            rememberAssistantReply(fallback, Date.now());
        } finally {
            finishTurnAndMaybeRestart();
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
            setInfo(localizeTextOnlyInfo(locale()));
            updateControls();
        } else if (providers?.stt?.selected === 'unsupported') {
            setError('unsupported_stt');
            updateControls();
        }
        if (typeof state.api.subscribe !== 'function') {
            debugVoice('runtime_subscribe_unavailable');
            return;
        }
        debugVoice('runtime_subscribe_attached');
        state.unsubscribe = state.api.subscribe((event) => {
            if (state.sessionId && event.session_id !== state.sessionId) return;
            if (!state.sessionId && event.session_id) {
                state.sessionId = event.session_id;
            }
            if (event.type === 'voice.stt.partial' || event.type === 'voice.stt.final') {
                state.transcriptDraft = toText(event.payload?.text);
                debugVoice(event.type, {
                    sessionId: event.session_id,
                    text: state.transcriptDraft
                });
                renderTranscript();
            }
            if (event.type === 'voice.stt.download_progress') {
                debugVoice('voice.stt.download_progress', {
                    sessionId: event.session_id,
                    status: event.payload?.status || null,
                    model: event.payload?.model || null,
                    progress: event.payload?.progress ?? null
                });
                setInfo(localizeDownloadProgress(event.payload, locale()));
                updateControls();
            }
            if (event.type === 'voice.tts.state') {
                const next = toText(event.payload?.state);
                debugVoice('voice.tts.state', {
                    sessionId: event.session_id,
                    state: next
                });
                state.speaking = next === 'speaking';
                if (next === 'speaking') {
                    state.bargeInArmAt = Date.now() + bargeArmDelayMs;
                    state.bargeInPending = false;
                    state.bargeInDetector?.reset?.();
                }
                if (next === 'done' || next === 'interrupted') {
                    state.speaking = false;
                    resetBargeInDetector();
                }
                updateControls();
            }
            if (event.type === 'voice.processing.state') {
                const next = toText(event.payload?.state);
                debugVoice('voice.processing.state', {
                    sessionId: event.session_id,
                    state: next
                });
                state.processing = next === 'processing';
                if (next === 'done' || next === 'failed' || next === 'interrupted') {
                    state.processing = false;
                }
                updateControls();
            }
            if (event.type === 'voice.cancel.requested') {
                debugVoice('voice.cancel.requested', {
                    sessionId: event.session_id,
                    source: event.payload?.source || null
                });
                state.listening = false;
                state.speaking = false;
                state.processing = false;
                resetBargeInDetector();
                updateControls();
            }
        });
    };

    actionButton.addEventListener('click', async () => {
        if (!state.active) {
            state.active = true;
        }
        if (textOnly) {
            if (state.speaking && state.sessionId && state.api?.stopSpeaking) {
                try {
                    await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_stop' });
                } catch (_) { }
                state.speaking = false;
                updateControls();
            }
            return;
        }
        if (state.listening) {
            state.suppressAutoRestartOnce = true;
            await stopListeningLoop();
            return;
        }
        if (state.speaking && state.sessionId && state.api?.stopSpeaking) {
            try {
                await state.api.stopSpeaking(state.sessionId, { reason: 'eve_panel_stop' });
            } catch (_) { }
            state.speaking = false;
        }
        if (state.processing) {
            updateControls();
            return;
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
            state.suppressAutoRestartOnce = true;
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
    renderNotice();
    renderTranscript();
    updateControls();
    await bindRuntime();

    const controller = {
        root,
        activate() {
            if (state.activationPromise) return state.activationPromise;
            if (state.active) return Promise.resolve();
            state.active = true;
            state.activationPromise = (async () => {
                await startVoiceMeter();
                const readyLine = textOnly
                    ? localizeTextOnlyReadyLine(locale(), resolveUserFirstName(env))
                    : localizeReadyLine(locale(), resolveUserFirstName(env));
                await speakAssistantLine(readyLine, {
                    pushHistoryEntry: true,
                    rememberReply: true
                });
                if (state.active && !textOnly) {
                    await startListeningLoop();
                }
            })().finally(() => {
                state.activationPromise = null;
            });
            return state.activationPromise;
        },
        async deactivate() {
            state.active = false;
            clearRestartTimer();
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
            resetBargeInDetector();
            renderTranscript();
            await speakAssistantLine(localizeClosingLine(locale()), {
                pushHistoryEntry: true,
                rememberReply: false
            });
            await stopVoiceMeter();
            updateControls();
        },
        refreshLabels() {
            updateControls();
            renderNotice();
            renderTranscript();
            renderHistory();
        },
        getState() {
            return cloneValue({
                active: state.active,
                listening: state.listening,
                processing: state.processing,
                speaking: state.speaking,
                textOnly,
                errorMessage: state.errorMessage,
                sessionId: state.sessionId,
                history: state.history,
                meterRunning: state.meterRunning
            });
        },
        destroy() {
        try { state.unsubscribe(); } catch (_) { }
            clearRestartTimer();
            resetBargeInDetector();
            void stopVoiceMeter();
            root.remove();
            delete host.__eveHomeVoiceSurfaceController;
        }
    };

    host.__eveHomeVoiceSurfaceController = controller;
    return controller;
};
