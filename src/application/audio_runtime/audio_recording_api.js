import { getPlayRecordCore } from './play_record_core.js';
import { createAVLifecycleObject, createUnsupportedCapabilityError, installSharedAVContracts } from './av_contracts.js';

export class AudioRecordingAPI {
    constructor(env = globalThis, core = getPlayRecordCore(env)) {
        this.env = env;
        this.core = core;
        this.sessions = new Map();
        installSharedAVContracts(env);
    }

    createRecordingSession(input = {}) {
        const session = createAVLifecycleObject({
            id: input.sessionId || input.session_id || input.id || '',
            runtimeBackend: this.core.runtime()?.recording || 'audio.recording',
            ownerUserId: input.ownerUserId || input.owner_user_id || null,
            projectId: input.projectId || input.project_id || null,
            clockId: input.clockId || input.clock_id || 'default',
            traceId: input.traceId || input.trace_id || ''
        });
        const next = Object.freeze({
            ...session,
            media_kind: 'audio',
            source: input.source || 'mic',
            options: { ...input }
        });
        this.sessions.set(next.id, next);
        return { ok: true, session: next };
    }

    prepareRecordingSession(input = {}) {
        return this.#transition(input, 'prepared');
    }

    armRecordingSession(input = {}) {
        return this.#transition(input, 'armed');
    }

    async startRecordingSession(input = {}) {
        const session = this.#resolveSession(input) || this.createRecordingSession(input).session;
        const started = await this.core.recordStart({
            ...session.options,
            ...input,
            sessionId: session.id,
            session_id: session.id
        });
        const next = this.#store({ ...session, state: 'running', native_session_id: started, updated_at: new Date().toISOString() });
        return { ok: true, session: next, result: started };
    }

    async stopRecordingSession(input = {}) {
        const session = this.#resolveSession(input);
        const sessionId = input.sessionId || input.session_id || input.id || session?.native_session_id || session?.id || '';
        const result = await this.core.recordStop(sessionId);
        const next = session ? this.#store({ ...session, state: 'completed', updated_at: new Date().toISOString() }) : null;
        return { ok: true, session: next, result };
    }

    discardRecordingSession(input = {}) {
        const session = this.#resolveSession(input);
        if (!session) return { ok: false, error: 'recording_session_not_found' };
        this.sessions.delete(session.id);
        return { ok: true, session: { ...session, state: 'disposed' } };
    }

    configureFormat(input = {}) {
        throw createUnsupportedCapabilityError({
            capability: 'recording_format_configuration',
            mediaKind: 'audio',
            backend: this.core.runtime()?.recording || 'unknown'
        });
    }

    #resolveSession(input = {}) {
        const id = typeof input === 'string'
            ? input
            : (input.sessionId || input.session_id || input.id || '');
        return this.sessions.get(String(id || '').trim()) || null;
    }

    #transition(input = {}, state = 'created') {
        const session = this.#resolveSession(input);
        if (!session) return { ok: false, error: 'recording_session_not_found' };
        return { ok: true, session: this.#store({ ...session, state, updated_at: new Date().toISOString() }) };
    }

    #store(session) {
        const next = Object.freeze(session);
        this.sessions.set(next.id, next);
        return next;
    }
}

export const getAudioRecordingAPI = (env = globalThis) => {
    if (!env.__SQUIRREL_AUDIO_RECORDING_API__) {
        Object.defineProperty(env, '__SQUIRREL_AUDIO_RECORDING_API__', {
            value: new AudioRecordingAPI(env),
            configurable: false,
            enumerable: false,
            writable: false
        });
    }
    return env.__SQUIRREL_AUDIO_RECORDING_API__;
};
