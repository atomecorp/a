// Extracted from session_runtime.js: voice-session constants + stateless helpers (clone/id/utterance/local-command/window-event/task/snapshot/intent helpers).

const DEFAULT_UI_EVENT_NAME = 'squirrel:voice';
const DEFAULT_MCP_EVENT_NAME = 'squirrel:voice:mcp';
const DEFAULT_SOURCE_LAYER = 'voice_session_runtime';
const DEFAULT_LOCALE = 'fr-FR';
const HISTORY_LIMIT = 120;

const VOICE_SESSION_PHASES = Object.freeze([
    'created',
    'capturing',
    'captured',
    'listening',
    'processing',
    'speaking',
    'interrupted',
    'completed',
    'cancelled',
    'failed'
]);

const VOICE_LOCAL_COMMANDS = Object.freeze({
    STOP: 'stop',
    NEXT: 'next',
    PREVIOUS: 'previous',
    CANCEL: 'cancel',
    SUMMARIZE: 'summarize',
    REPLY: 'reply'
});

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const defaultIdFactory = (prefix = 'voice') => {
    if (globalThis?.crypto?.randomUUID) {
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeUtterance = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const detectLocalCommand = (utterance) => {
    const normalized = normalizeUtterance(utterance);
    if (!normalized) return null;

    const matchers = [
        {
            command: VOICE_LOCAL_COMMANDS.STOP,
            aliases: ['stop', 'arrete', 'arret', 'ca suffit', 'suffit', 'stoppe'],
            mode: 'includes'
        },
        {
            command: VOICE_LOCAL_COMMANDS.NEXT,
            aliases: ['suivant', 'au suivant', 'passe au suivant', 'passe suivant', 'next'],
            mode: 'exact'
        },
        {
            command: VOICE_LOCAL_COMMANDS.PREVIOUS,
            aliases: ['precedent', 'precedente', 'au precedent', 'passe au precedent', 'retour', 'reviens'],
            mode: 'exact'
        },
        {
            command: VOICE_LOCAL_COMMANDS.CANCEL,
            aliases: ['annule', 'annuler', 'annulation', 'cancel'],
            mode: 'includes'
        },
        {
            command: VOICE_LOCAL_COMMANDS.SUMMARIZE,
            aliases: ['resume', 'resumer', 'plus court', 'plus bref', 'fais court'],
            mode: 'exact'
        },
        {
            command: VOICE_LOCAL_COMMANDS.REPLY,
            aliases: ['reponds', 'repond', 'reply'],
            mode: 'exact'
        }
    ];

    for (const matcher of matchers) {
        const alias = matcher.aliases.find((entry) => {
            if (!normalized || !entry) return false;
            if (matcher.mode === 'exact') return normalized === entry;
            return ` ${normalized} `.includes(` ${entry} `);
        });
        if (alias) {
            return {
                command: matcher.command,
                normalized,
                matched_alias: alias,
                raw: String(utterance || '')
            };
        }
    }

    return null;
};

const dispatchWindowEvent = (name, detail) => {
    if (!name || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (_) {
        // Ignore browser-less or restricted environments.
    }
};

const newTaskState = () => ({
    state: 'idle',
    started_at: null,
    ended_at: null,
    stop_reason: null
});

const normalizeBoundIntentContext = (intent = {}, meta = {}) => {
    const utterance = intent?.utterance && typeof intent.utterance === 'object'
        ? intent.utterance
        : { raw: intent?.utterance || '' };
    const execution = intent?.execution && typeof intent.execution === 'object'
        ? intent.execution
        : {};
    return {
        intent_id: intent?.intent_id ? String(intent.intent_id) : null,
        type: intent?.type ? String(intent.type) : 'ambiguous',
        domain: intent?.domain ? String(intent.domain) : 'unknown',
        action: intent?.action ? String(intent.action) : 'unknown',
        status: intent?.status ? String(intent.status) : 'ambiguous',
        utterance: {
            raw: utterance?.raw ? String(utterance.raw) : '',
            normalized: utterance?.normalized ? String(utterance.normalized) : normalizeUtterance(utterance?.raw || '')
        },
        entities: intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {},
        requested_capabilities: Array.isArray(intent?.requested_capabilities)
            ? intent.requested_capabilities.map((entry) => String(entry))
            : [],
        execution: {
            target: execution?.target ? String(execution.target) : 'none',
            confirmation_required: execution?.confirmation_required === true,
            toolchain: Array.isArray(execution?.toolchain) ? cloneValue(execution.toolchain) : []
        },
        followups: intent?.followups && typeof intent.followups === 'object' ? cloneValue(intent.followups) : {},
        meta: meta && typeof meta === 'object' ? cloneValue(meta) : {}
    };
};

const resolveActiveEntityHint = (intent = {}) => {
    const domain = String(intent?.domain || '').trim();
    const entities = intent?.entities && typeof intent.entities === 'object' ? intent.entities : {};
    if (domain === 'mail') {
        return entities.current_message_id || entities.message_id || null;
    }
    if (domain === 'contacts') {
        return entities.current_contact_id || entities.contact_id || null;
    }
    if (domain === 'calendar') {
        return entities.current_event_id || entities.event_id || null;
    }
    if (domain === 'atome') {
        return entities.current_atome_id || entities.atome_id || null;
    }
    return null;
};

const newSessionSnapshot = ({
    sessionId,
    traceId,
    intentId,
    locale,
    createdAt,
    actor = {},
    sourceLayer = DEFAULT_SOURCE_LAYER,
    uiEventName = DEFAULT_UI_EVENT_NAME,
    mcpEventName = DEFAULT_MCP_EVENT_NAME
}) => ({
    session_id: sessionId,
    trace_id: traceId,
    intent_id: intentId,
    locale,
    phase: 'created',
    actor: { ...(actor && typeof actor === 'object' ? actor : {}) },
    source: {
        type: 'voice',
        layer: sourceLayer,
        session_id: sessionId
    },
    events: {
        ui: uiEventName,
        mcp: mcpEventName
    },
    transcript: {
        partial: null,
        final: null,
        lang: locale,
        confidence: null,
        segments: [],
        partials: []
    },
    capture: {
        ...newTaskState(),
        result: null
    },
    stt: {
        ...newTaskState(),
        provider: null
    },
    processing: {
        ...newTaskState(),
        step: null,
        meta: null
    },
    playback: {
        ...newTaskState(),
        text: null,
        voice_id: null
    },
    conversation: {
        status: 'ready',
        last_user_text: null,
        last_assistant_text: null,
        last_command: null,
        interruption_reason: null,
        interrupted_from_phase: null,
        interrupted_at: null,
        pending_followup: null,
        followup_consumed_at: null,
        resume_available: false,
        active_intent: null,
        intent_history: []
    },
    metrics: {
        created_at: createdAt,
        updated_at: createdAt,
        last_event_at: createdAt
    },
    last_error: null
});

const markTask = (task, nextState, now, extras = {}) => {
    task.state = nextState;
    if (nextState !== 'idle' && !task.started_at) {
        task.started_at = now;
    }
    if (nextState === 'stopped' || nextState === 'done' || nextState === 'cancelled' || nextState === 'failed') {
        task.ended_at = now;
    }
    Object.assign(task, extras);
    return task;
};


export {
    DEFAULT_UI_EVENT_NAME, DEFAULT_MCP_EVENT_NAME, DEFAULT_SOURCE_LAYER, DEFAULT_LOCALE, HISTORY_LIMIT, VOICE_SESSION_PHASES, VOICE_LOCAL_COMMANDS, cloneValue, defaultIdFactory, normalizeUtterance, detectLocalCommand, dispatchWindowEvent, newTaskState, normalizeBoundIntentContext, resolveActiveEntityHint, newSessionSnapshot, markTask
};
