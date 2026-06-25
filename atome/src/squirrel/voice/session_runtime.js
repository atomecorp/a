import { createWorkingMemory } from './working_memory.js';
import {
    DEFAULT_UI_EVENT_NAME,
    DEFAULT_MCP_EVENT_NAME,
    DEFAULT_SOURCE_LAYER,
    DEFAULT_LOCALE,
    HISTORY_LIMIT,
    cloneValue,
    defaultIdFactory,
    dispatchWindowEvent,
    normalizeBoundIntentContext,
    resolveActiveEntityHint,
    newSessionSnapshot,
    VOICE_SESSION_PHASES,
    VOICE_LOCAL_COMMANDS,
    detectLocalCommand
} from './session_runtime_support.js';
import { sessionCaptureMethods } from './session_runtime_capture.js';
import { sessionInvocationMethods } from './session_runtime_invocation.js';

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
        this._emit(record, 'voice.session.created', {
            session_id: sessionId,
            locale
        });
        return this.getSession(sessionId);
    }

    listSessions({ includeClosed = true } = {}) {
        const sessions = Array.from(this.sessions.values()).map((record) => this._snapshot(record));
        if (includeClosed) return sessions;
        return sessions.filter((entry) => !['cancelled', 'completed', 'failed'].includes(entry.phase));
    }

    getSession(sessionId) {
        const record = this._getRecord(sessionId);
        return this._snapshot(record);
    }

    getHistory(sessionId) {
        const record = this._getRecord(sessionId);
        return cloneValue(record.history);
    }

    getActiveIntent(sessionId) {
        const record = this._getRecord(sessionId);
        return cloneValue(record.data.conversation.active_intent);
    }

    publishEvent(sessionId, type, payload = {}) {
        const record = this._getRecord(sessionId);
        return this._emit(record, type, payload);
    }

    bindIntentContext(sessionId, intent = {}, meta = {}) {
        const record = this._getRecord(sessionId);
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
        this._touch(record, now);
        this._emit(record, 'voice.intent.bound', {
            intent_id: boundIntent.intent_id,
            domain: boundIntent.domain,
            action: boundIntent.action,
            execution_target: boundIntent.execution.target
        });
        return this._snapshot(record);
    }

    _getRecord(sessionId) {
        const key = String(sessionId || '').trim();
        const record = this.sessions.get(key);
        if (!record) {
            throw new Error(`Unknown voice session: ${key}`);
        }
        return record;
    }

    _snapshot(record) {
        const data = cloneValue(record.data);
        data.history = cloneValue(record.history);
        data.active_channels = Array.from(record.controllers.keys());
        if (this.workingMemory?.snapshot) {
            data.working_memory = this.workingMemory.snapshot();
        }
        return data;
    }

    _touch(record, at) {
        record.data.metrics.updated_at = at;
        record.data.metrics.last_event_at = at;
    }

    _queueFollowup(record, kind, at) {
        record.data.conversation.pending_followup = kind;
        record.data.conversation.resume_available = false;
        this._emit(record, 'voice.followup.queued', {
            followup: kind
        }, at);
    }

    _openController(record, channel) {
        const key = String(channel);
        this._abortController(record, key, 'replaced');
        const controller = new AbortController();
        record.controllers.set(key, controller);
        return controller;
    }

    _closeController(record, channel) {
        record.controllers.delete(String(channel));
    }

    _abortController(record, channel, reason) {
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

    _abortAll(record, reason) {
        const aborted = [];
        for (const key of Array.from(record.controllers.keys())) {
            if (this._abortController(record, key, reason)) {
                aborted.push(key);
            }
        }
        return aborted;
    }

    _emit(record, type, payload = {}, at = this.now()) {
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

Object.assign(VoiceSessionRuntime.prototype, sessionCaptureMethods, sessionInvocationMethods);

export { VOICE_SESSION_PHASES, VOICE_LOCAL_COMMANDS };
export const normalizeLocalVoiceCommand = detectLocalCommand;
export const createVoiceSessionRuntime = (options = {}) => new VoiceSessionRuntime(options);
export { VoiceSessionRuntime, createWorkingMemory };
