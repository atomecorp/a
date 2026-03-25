import { createWorkingMemory } from './working_memory.js';

const DEFAULT_UI_EVENT_NAME = 'squirrel:voice';
const DEFAULT_MCP_EVENT_NAME = 'squirrel:voice:mcp';
const DEFAULT_SOURCE_LAYER = 'voice_session_runtime';
const DEFAULT_LOCALE = 'fr-FR';
const HISTORY_LIMIT = 120;

export const VOICE_SESSION_PHASES = Object.freeze([
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

export const VOICE_LOCAL_COMMANDS = Object.freeze({
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

class VoiceSessionRuntime {
    constructor({
        now = Date.now,
        idFactory = defaultIdFactory,
        uiEventName = DEFAULT_UI_EVENT_NAME,
        mcpEventName = DEFAULT_MCP_EVENT_NAME,
        uiSink = null,
        mcpSink = null
    } = {}) {
        this.now = typeof now === 'function' ? now : Date.now;
        this.idFactory = typeof idFactory === 'function' ? idFactory : defaultIdFactory;
        this.uiEventName = uiEventName;
        this.mcpEventName = mcpEventName;
        this.uiSink = typeof uiSink === 'function' ? uiSink : null;
        this.mcpSink = typeof mcpSink === 'function' ? mcpSink : null;
        this.listeners = new Set();
        this.sessions = new Map();
        this.workingMemory = createWorkingMemory({ now: this.now });
    }

    subscribe(listener) {
        if (typeof listener !== 'function') {
            return () => { };
        }
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    createSession(options = {}) {
        const createdAt = this.now();
        const sessionId = String(options.session_id || this.idFactory('voice_session'));
        const traceId = String(options.trace_id || this.idFactory('voice_trace'));
        const intentId = String(options.intent_id || this.idFactory('voice_intent'));
        const locale = String(options.locale || DEFAULT_LOCALE);

        const record = {
            data: newSessionSnapshot({
                sessionId,
                traceId,
                intentId,
                locale,
                createdAt,
                actor: options.actor,
                sourceLayer: options.source_layer || DEFAULT_SOURCE_LAYER,
                uiEventName: this.uiEventName,
                mcpEventName: this.mcpEventName
            }),
            controllers: new Map(),
            history: [],
            seq: 0
        };

        this.sessions.set(sessionId, record);
        if (this.workingMemory?.setSessionPreference) {
            this.workingMemory.setSessionPreference('locale', locale);
        }
        this.#emit(record, 'voice.session.created', {
            session_id: sessionId,
            locale
        });
        return this.getSession(sessionId);
    }

    listSessions({ includeClosed = true } = {}) {
        const sessions = Array.from(this.sessions.values()).map((record) => this.#snapshot(record));
        if (includeClosed) return sessions;
        return sessions.filter((entry) => !['cancelled', 'completed', 'failed'].includes(entry.phase));
    }

    getSession(sessionId) {
        const record = this.#getRecord(sessionId);
        return this.#snapshot(record);
    }

    getHistory(sessionId) {
        const record = this.#getRecord(sessionId);
        return cloneValue(record.history);
    }

    getActiveIntent(sessionId) {
        const record = this.#getRecord(sessionId);
        return cloneValue(record.data.conversation.active_intent);
    }

    publishEvent(sessionId, type, payload = {}) {
        const record = this.#getRecord(sessionId);
        return this.#emit(record, type, payload);
    }

    bindIntentContext(sessionId, intent = {}, meta = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        const boundIntent = normalizeBoundIntentContext(intent, meta);
        const currentIntentId = String(record.data.conversation.active_intent?.intent_id || '');
        const nextIntentId = String(boundIntent.intent_id || '');
        if (record.data.conversation.active_intent && currentIntentId && currentIntentId !== nextIntentId) {
            record.data.conversation.intent_history.push(cloneValue(record.data.conversation.active_intent));
            if (record.data.conversation.intent_history.length > 12) {
                record.data.conversation.intent_history.splice(0, record.data.conversation.intent_history.length - 12);
            }
        }
        record.data.conversation.active_intent = boundIntent;
        if (this.workingMemory?.setSessionPreference) {
            this.workingMemory.setSessionPreference('locale', record.data.locale);
        }
        const activeEntityId = resolveActiveEntityHint(boundIntent);
        if (activeEntityId && this.workingMemory?.setActiveEntity) {
            this.workingMemory.setActiveEntity(boundIntent.domain, activeEntityId);
        }
        this.#touch(record, now);
        this.#emit(record, 'voice.intent.bound', {
            intent_id: boundIntent.intent_id,
            domain: boundIntent.domain,
            action: boundIntent.action,
            execution_target: boundIntent.execution.target
        });
        return this.#snapshot(record);
    }

    startCapture(sessionId, meta = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#openController(record, 'capture');
        record.data.phase = 'capturing';
        markTask(record.data.capture, 'capturing', now, {
            ended_at: null,
            stop_reason: null,
            result: null,
            meta: meta && typeof meta === 'object' ? { ...meta } : {}
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.capture.state', {
            state: 'capturing',
            meta: record.data.capture.meta || null
        });
        return this.#snapshot(record);
    }

    stopCapture(sessionId, result = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#closeController(record, 'capture');
        record.data.phase = 'captured';
        markTask(record.data.capture, 'stopped', now, {
            stop_reason: 'stopped',
            result: result && typeof result === 'object' ? { ...result } : {}
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.capture.state', {
            state: 'stopped',
            result: record.data.capture.result
        });
        return this.#snapshot(record);
    }

    cancelCapture(sessionId, reason = 'cancelled') {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#abortController(record, 'capture', reason);
        record.data.phase = 'cancelled';
        markTask(record.data.capture, 'cancelled', now, {
            stop_reason: reason
        });
        record.data.conversation.status = 'cancelled';
        this.#touch(record, now);
        this.#emit(record, 'voice.capture.state', {
            state: 'cancelled',
            reason
        });
        return this.#snapshot(record);
    }

    startListening(sessionId, options = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#openController(record, 'stt');
        record.data.phase = 'listening';
        record.data.transcript.lang = String(options.lang || record.data.locale || DEFAULT_LOCALE);
        markTask(record.data.stt, 'listening', now, {
            ended_at: null,
            stop_reason: null,
            provider: options.provider ? String(options.provider) : null,
            partial: options.partial === true
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.stt.state', {
            state: 'listening',
            provider: record.data.stt.provider,
            lang: record.data.transcript.lang
        });
        return this.#snapshot(record);
    }

    pushPartial(sessionId, payload = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        const text = String(payload.text || '').trim();
        record.data.transcript.partial = text || null;
        if (text) {
            record.data.transcript.partials.push({
                text,
                confidence: Number.isFinite(payload.confidence) ? payload.confidence : null,
                at: now
            });
        }
        this.#touch(record, now);
        this.#emit(record, 'voice.stt.partial', {
            text: record.data.transcript.partial,
            confidence: Number.isFinite(payload.confidence) ? payload.confidence : null
        });
        return this.#snapshot(record);
    }

    finalizeListening(sessionId, result = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#closeController(record, 'stt');
        record.data.phase = 'processing';
        markTask(record.data.stt, 'done', now, {
            stop_reason: 'final'
        });
        record.data.transcript.partial = null;
        record.data.transcript.final = result?.text ? String(result.text) : '';
        record.data.transcript.confidence = Number.isFinite(result?.confidence) ? result.confidence : null;
        record.data.transcript.segments = Array.isArray(result?.segments) ? cloneValue(result.segments) : [];
        record.data.conversation.last_user_text = record.data.transcript.final || null;
        this.#touch(record, now);
        this.#emit(record, 'voice.stt.final', {
            text: record.data.transcript.final,
            confidence: record.data.transcript.confidence,
            segments: record.data.transcript.segments
        });
        return this.#snapshot(record);
    }

    startProcessing(sessionId, payload = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#openController(record, 'processing');
        record.data.phase = 'processing';
        markTask(record.data.processing, 'processing', now, {
            ended_at: null,
            stop_reason: null,
            step: payload.step ? String(payload.step) : null,
            meta: payload && typeof payload === 'object' ? { ...payload } : {}
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.processing.state', {
            state: 'processing',
            step: record.data.processing.step
        });
        return this.#snapshot(record);
    }

    finishProcessing(sessionId, payload = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#closeController(record, 'processing');
        markTask(record.data.processing, 'done', now, {
            stop_reason: payload.reason ? String(payload.reason) : 'done'
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.processing.state', {
            state: 'done',
            reason: record.data.processing.stop_reason
        });
        return this.#snapshot(record);
    }

    startSpeaking(sessionId, payload = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#openController(record, 'tts');
        record.data.phase = 'speaking';
        record.data.playback.text = payload?.text ? String(payload.text) : null;
        record.data.playback.voice_id = payload?.voice_id ? String(payload.voice_id) : null;
        record.data.conversation.last_assistant_text = record.data.playback.text;
        if (this.workingMemory?.appendTurn && (record.data.conversation.last_user_text || record.data.playback.text)) {
            const activeIntent = record.data.conversation.active_intent || null;
            this.workingMemory.appendTurn({
                user: record.data.conversation.last_user_text || '',
                assistant: record.data.playback.text || '',
                domain: activeIntent?.domain || null,
                action: activeIntent?.action || null,
                meta: {
                    intent_id: activeIntent?.intent_id || null,
                    session_id: record.data.session_id
                }
            });
        }
        markTask(record.data.playback, 'speaking', now, {
            ended_at: null,
            stop_reason: null
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.tts.state', {
            state: 'speaking',
            text: record.data.playback.text,
            voice_id: record.data.playback.voice_id
        });
        return this.#snapshot(record);
    }

    finishSpeaking(sessionId, payload = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        this.#closeController(record, 'tts');
        record.data.phase = 'completed';
        markTask(record.data.playback, 'done', now, {
            stop_reason: payload.reason ? String(payload.reason) : 'done'
        });
        record.data.conversation.status = 'ready';
        record.data.conversation.pending_followup = null;
        record.data.conversation.resume_available = false;
        this.#touch(record, now);
        this.#emit(record, 'voice.tts.state', {
            state: 'done',
            reason: record.data.playback.stop_reason
        });
        return this.#snapshot(record);
    }

    buildInvocationContext(sessionId, overrides = {}) {
        const record = this.#getRecord(sessionId);
        const sourceLayer = String(overrides?.source_layer || record.data.source.layer || DEFAULT_SOURCE_LAYER);
        return {
            trace_id: record.data.trace_id,
            intent_id: record.data.intent_id,
            source: {
                type: 'voice',
                layer: sourceLayer,
                session_id: record.data.session_id,
                phase: record.data.phase,
                command: record.data.conversation.last_command || null
            },
            active_intent: record.data.conversation.active_intent
                ? {
                    intent_id: record.data.conversation.active_intent.intent_id,
                    domain: record.data.conversation.active_intent.domain,
                    action: record.data.conversation.active_intent.action,
                    execution_target: record.data.conversation.active_intent.execution?.target || 'none'
                }
                : null
        };
    }

    getAbortSignal(sessionId, channel = 'processing') {
        const record = this.#getRecord(sessionId);
        return record.controllers.get(String(channel))?.signal || null;
    }

    handleLocalCommand(sessionId, utterance, meta = {}) {
        const parsed = detectLocalCommand(utterance);
        if (!parsed) {
            return {
                matched: false,
                command: null,
                session: this.getSession(sessionId)
            };
        }

        const record = this.#getRecord(sessionId);
        const now = this.now();
        record.data.intent_id = String(meta.intent_id || this.idFactory('voice_intent'));
        record.data.conversation.last_command = parsed.command;
        record.data.conversation.last_user_text = parsed.raw;
        this.#touch(record, now);
        this.#emit(record, 'voice.command', {
            command: parsed.command,
            utterance: parsed.raw,
            matched_alias: parsed.matched_alias
        });

        if (parsed.command === VOICE_LOCAL_COMMANDS.CANCEL) {
            return this.cancelSession(sessionId, {
                reason: 'local_cancel',
                utterance: parsed.raw
            });
        }

        const interruption = this.interrupt(sessionId, {
            reason: 'local_command',
            command: parsed.command,
            utterance: parsed.raw
        });

        if (parsed.command === VOICE_LOCAL_COMMANDS.NEXT) {
            this.#queueFollowup(record, 'next_item', now);
        } else if (parsed.command === VOICE_LOCAL_COMMANDS.PREVIOUS) {
            this.#queueFollowup(record, 'previous_item', now);
        } else if (parsed.command === VOICE_LOCAL_COMMANDS.SUMMARIZE) {
            this.#queueFollowup(record, 'summarize_current', now);
        } else if (parsed.command === VOICE_LOCAL_COMMANDS.REPLY) {
            this.#queueFollowup(record, 'reply_current', now);
        }

        this.#touch(record, now);
        return {
            matched: true,
            command: parsed.command,
            interruption,
            followup: record.data.conversation.pending_followup,
            context: this.buildInvocationContext(sessionId),
            session: this.#snapshot(record)
        };
    }

    consumePendingFollowup(sessionId, { nextPhase = 'processing', allowResume = true } = {}) {
        const record = this.#getRecord(sessionId);
        const followup = record.data.conversation.pending_followup
            || ((allowResume === true && record.data.conversation.resume_available) ? 'resume_interrupted' : null);
        if (!followup) return null;
        const now = this.now();
        record.data.phase = nextPhase;
        record.data.conversation.pending_followup = null;
        record.data.conversation.followup_consumed_at = now;
        record.data.conversation.status = 'ready';
        record.data.conversation.resume_available = false;
        record.data.intent_id = this.idFactory('voice_intent');
        this.#touch(record, now);
        this.#emit(record, 'voice.followup.ready', {
            followup,
            next_phase: nextPhase
        });
        return {
            followup,
            context: this.buildInvocationContext(sessionId),
            active_intent: cloneValue(record.data.conversation.active_intent),
            session: this.#snapshot(record)
        };
    }

    interrupt(sessionId, { reason = 'interrupted', command = null, utterance = null } = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        const previousPhase = record.data.phase;
        const abortedChannels = this.#abortAll(record, reason);

        if (previousPhase === 'capturing') {
            markTask(record.data.capture, 'cancelled', now, { stop_reason: reason });
        }
        if (previousPhase === 'listening') {
            markTask(record.data.stt, 'cancelled', now, { stop_reason: reason });
        }
        if (record.data.processing.state === 'processing') {
            markTask(record.data.processing, 'cancelled', now, { stop_reason: reason });
        }
        if (record.data.playback.state === 'speaking') {
            markTask(record.data.playback, 'cancelled', now, { stop_reason: reason });
        }

        record.data.phase = 'interrupted';
        record.data.conversation.status = 'interrupted';
        record.data.conversation.interruption_reason = reason;
        record.data.conversation.interrupted_from_phase = previousPhase;
        record.data.conversation.interrupted_at = now;
        record.data.conversation.resume_available = previousPhase === 'speaking' || previousPhase === 'processing';
        record.data.conversation.last_command = command;
        if (utterance) {
            record.data.conversation.last_user_text = utterance;
        }
        this.#touch(record, now);
        this.#emit(record, 'voice.interruption', {
            reason,
            command,
            previous_phase: previousPhase,
            aborted_channels: abortedChannels
        });

        return {
            session_id: record.data.session_id,
            previous_phase: previousPhase,
            aborted_channels: abortedChannels,
            session: this.#snapshot(record)
        };
    }

    cancelSession(sessionId, { reason = 'cancelled', utterance = null } = {}) {
        const record = this.#getRecord(sessionId);
        const now = this.now();
        const abortedChannels = this.#abortAll(record, reason);
        record.data.phase = 'cancelled';
        record.data.conversation.status = 'cancelled';
        record.data.conversation.interruption_reason = reason;
        record.data.conversation.pending_followup = null;
        record.data.conversation.resume_available = false;
        if (utterance) {
            record.data.conversation.last_user_text = utterance;
        }
        markTask(record.data.capture, record.data.capture.state === 'capturing' ? 'cancelled' : record.data.capture.state, now, {
            stop_reason: record.data.capture.state === 'capturing' ? reason : record.data.capture.stop_reason
        });
        markTask(record.data.stt, record.data.stt.state === 'listening' ? 'cancelled' : record.data.stt.state, now, {
            stop_reason: record.data.stt.state === 'listening' ? reason : record.data.stt.stop_reason
        });
        markTask(record.data.processing, record.data.processing.state === 'processing' ? 'cancelled' : record.data.processing.state, now, {
            stop_reason: record.data.processing.state === 'processing' ? reason : record.data.processing.stop_reason
        });
        markTask(record.data.playback, record.data.playback.state === 'speaking' ? 'cancelled' : record.data.playback.state, now, {
            stop_reason: record.data.playback.state === 'speaking' ? reason : record.data.playback.stop_reason
        });
        this.#touch(record, now);
        this.#emit(record, 'voice.session.cancelled', {
            reason,
            aborted_channels: abortedChannels
        });
        return {
            matched: true,
            command: VOICE_LOCAL_COMMANDS.CANCEL,
            aborted_channels: abortedChannels,
            context: this.buildInvocationContext(sessionId),
            session: this.#snapshot(record)
        };
    }

    #getRecord(sessionId) {
        const key = String(sessionId || '').trim();
        const record = this.sessions.get(key);
        if (!record) {
            throw new Error(`Unknown voice session: ${key}`);
        }
        return record;
    }

    #snapshot(record) {
        const data = cloneValue(record.data);
        data.history = cloneValue(record.history);
        data.active_channels = Array.from(record.controllers.keys());
        if (this.workingMemory?.snapshot) {
            data.working_memory = this.workingMemory.snapshot();
        }
        return data;
    }

    #touch(record, at) {
        record.data.metrics.updated_at = at;
        record.data.metrics.last_event_at = at;
    }

    #queueFollowup(record, kind, at) {
        record.data.conversation.pending_followup = kind;
        record.data.conversation.resume_available = false;
        this.#emit(record, 'voice.followup.queued', {
            followup: kind
        }, at);
    }

    #openController(record, channel) {
        const key = String(channel);
        this.#abortController(record, key, 'replaced');
        const controller = new AbortController();
        record.controllers.set(key, controller);
        return controller;
    }

    #closeController(record, channel) {
        record.controllers.delete(String(channel));
    }

    #abortController(record, channel, reason) {
        const key = String(channel);
        const controller = record.controllers.get(key);
        if (!controller) return false;
        try {
            controller.abort(reason);
        } catch (_) {
            controller.abort();
        }
        record.controllers.delete(key);
        return true;
    }

    #abortAll(record, reason) {
        const aborted = [];
        for (const key of Array.from(record.controllers.keys())) {
            if (this.#abortController(record, key, reason)) {
                aborted.push(key);
            }
        }
        return aborted;
    }

    #emit(record, type, payload = {}, at = this.now()) {
        record.seq += 1;
        const event = {
            seq: record.seq,
            type,
            at,
            session_id: record.data.session_id,
            trace_id: record.data.trace_id,
            intent_id: record.data.intent_id,
            source: 'voice',
            source_layer: record.data.source.layer,
            payload: cloneValue(payload)
        };

        record.history.push(event);
        if (record.history.length > HISTORY_LIMIT) {
            record.history.splice(0, record.history.length - HISTORY_LIMIT);
        }

        for (const listener of this.listeners) {
            listener(event);
        }
        if (this.uiSink) this.uiSink(event);
        if (this.mcpSink) this.mcpSink(event);
        dispatchWindowEvent(this.uiEventName, event);
        dispatchWindowEvent(this.mcpEventName, event);
        return event;
    }
}

export const normalizeLocalVoiceCommand = detectLocalCommand;

export const createVoiceSessionRuntime = (options = {}) => new VoiceSessionRuntime(options);

export { VoiceSessionRuntime, createWorkingMemory };
