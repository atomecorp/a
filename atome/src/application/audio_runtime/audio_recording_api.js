import { getPlayRecordCore } from './play_record_core.js';
import { createAVLifecycleObject, createUnsupportedCapabilityError, installSharedAVContracts } from './av_contracts.js';
import {
    SAMPLE_ACCURATE_RECORDING_ERROR_CODES,
    SampleAccurateRecordingError,
    normalizeSampleAccurateRecordingResult,
    resolveSampleAccurateRecordingCapability,
    validateSampleAccurateRecordingRequest
} from './sample_accurate_recording.js';

const EXACT_RECORDING_START_TIMEOUT_MS = 4000;
const ACTIVE_RECORDING_STATES = new Set(['starting', 'running', 'stopping']);

const createRecordingLifecycleError = (code, detail = {}) => {
    const error = new Error(code);
    error.code = code;
    error.detail = Object.freeze({ ...detail });
    return error;
};

const stopFailedExactStart = async (core, sessionId, timeoutMs) => {
    let timer = null;
    try {
        return await Promise.race([
            core.recordStop(sessionId),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(createRecordingLifecycleError(
                    'audio_recording_cleanup_timeout', { session_id: sessionId, timeout_ms: timeoutMs }
                )), timeoutMs);
            })
        ]);
    } finally {
        if (timer !== null) clearTimeout(timer);
    }
};

export class AudioRecordingAPI {
    constructor(env = globalThis, core = getPlayRecordCore(env)) {
        this.env = env;
        this.core = core;
        this.sessions = new Map();
        this.av = installSharedAVContracts(env);
    }

    createRecordingSession(input = {}) {
        const sampleAccurateRequest = input.require_sample_accurate === true || input.requireSampleAccurate === true
            ? validateSampleAccurateRecordingRequest(input)
            : null;
        const capability = sampleAccurateRequest
            ? resolveSampleAccurateRecordingCapability(this.env, input)
            : null;
        if (capability && !capability.supported) {
            throw new SampleAccurateRecordingError(capability.error, capability);
        }
        const clock = sampleAccurateRequest
            ? Object.freeze({
                id: input.clockId || input.clock_id,
                kind: 'engine_sample_frames',
                sample_rate: input.timeline_sample_rate ?? input.timelineSampleRate
            })
            : this.av.clocks.requireClock(input.clockId || input.clock_id || 'default');
        const session = createAVLifecycleObject({
            id: input.sessionId || input.session_id || input.id || '',
            runtimeBackend: this.core.runtime()?.recording || 'audio.recording',
            ownerUserId: input.ownerUserId || input.owner_user_id || null,
            projectId: input.projectId || input.project_id || null,
            clockId: clock.id,
            traceId: input.traceId || input.trace_id || ''
        });
        const next = Object.freeze({
            ...session,
            media_kind: 'audio',
            clock,
            source: input.source || 'mic',
            sample_accurate_request: sampleAccurateRequest,
            options: { ...input }
        });
        const existing = this.sessions.get(next.id);
        if (existing && ACTIVE_RECORDING_STATES.has(existing.state)) {
            throw createRecordingLifecycleError('audio_recording_session_active', { session_id: next.id });
        }
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
        if (ACTIVE_RECORDING_STATES.has(session.state)) {
            throw createRecordingLifecycleError('audio_recording_already_started', { session_id: session.id });
        }
        this.#store({ ...session, state: 'starting', updated_at: new Date().toISOString() });
        const timeoutMs = Number.isFinite(input.timeoutMs ?? session.options.timeoutMs)
            ? Math.max(1, Math.round(input.timeoutMs ?? session.options.timeoutMs))
            : EXACT_RECORDING_START_TIMEOUT_MS;
        let startTimer = null;
        let nativeSessionId = '';
        let nativeStarted = false;
        let timedOut = false;
        let started;
        try {
            const startPromise = this.core.recordStart({
                ...session.options,
                ...input,
                sessionId: session.id,
                session_id: session.id
            });
            started = session.sample_accurate_request
                ? await Promise.race([
                    startPromise,
                    new Promise((_, reject) => {
                        startTimer = setTimeout(() => {
                            timedOut = true;
                            reject(new SampleAccurateRecordingError('audio_recording_start_timeout', {
                                session_id: session.id,
                                timeout_ms: timeoutMs
                            }));
                        }, timeoutMs);
                    })
                ])
                : await startPromise;
            nativeSessionId = typeof started === 'string'
                ? started
                : String(started?.session_id || started?.sessionId || '').trim();
            if (!nativeSessionId) throw createRecordingLifecycleError('audio_recording_session_id_missing');
            nativeStarted = true;
        } catch (error) {
            let cleanupError = null;
            if (session.sample_accurate_request && (timedOut || nativeStarted)) {
                try {
                    await stopFailedExactStart(this.core, nativeSessionId || session.id, timeoutMs);
                } catch (stopError) {
                    if (stopError?.recordingTerminal !== true) cleanupError = stopError;
                }
            }
            this.#store({
                ...session,
                state: cleanupError ? 'running' : session.state,
                native_session_id: cleanupError ? (nativeSessionId || session.id) : session.native_session_id,
                updated_at: new Date().toISOString()
            });
            if (cleanupError) {
                throw createRecordingLifecycleError(error?.code || 'audio_recording_start_failed', {
                    ...(error?.detail || {}),
                    cleanup_error: String(cleanupError?.message || cleanupError)
                });
            }
            throw error;
        } finally {
            if (startTimer !== null) clearTimeout(startTimer);
        }
        const startedClockEpoch = String(started?.clock_epoch || started?.clockEpoch || '').trim();
        const startedTimelineClockId = String(started?.timeline_clock_id || started?.timelineClockId || '').trim();
        const startedTimelineOriginFrame = started?.timeline_origin_frame ?? started?.timelineOriginFrame;
        if (session.sample_accurate_request && (
            !startedClockEpoch
            || startedTimelineClockId !== session.sample_accurate_request.timeline_clock_id
            || !Number.isSafeInteger(startedTimelineOriginFrame)
            || startedTimelineOriginFrame < 0
        )) {
            const error = new SampleAccurateRecordingError(SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CLOCK_MISMATCH, {
                clock_epoch: startedClockEpoch || null,
                timeline_clock_id: startedTimelineClockId || null,
                timeline_origin_frame: startedTimelineOriginFrame ?? null
            });
            try {
                await stopFailedExactStart(this.core, nativeSessionId, timeoutMs);
                this.#store({ ...session, state: session.state, updated_at: new Date().toISOString() });
            } catch (cleanupError) {
                if (cleanupError?.recordingTerminal === true) {
                    this.#store({ ...session, state: session.state, updated_at: new Date().toISOString() });
                    throw error;
                }
                this.#store({ ...session, state: 'running', native_session_id: nativeSessionId });
                throw createRecordingLifecycleError(error.code, {
                    ...error.detail,
                    cleanup_error: String(cleanupError?.message || cleanupError)
                });
            }
            throw error;
        }
        const sampleAccurateRequest = session.sample_accurate_request
            ? Object.freeze({
                ...session.sample_accurate_request,
                requested_timeline_start_frame: session.sample_accurate_request.timeline_start_frame,
                timeline_start_frame: startedTimelineOriginFrame,
                clock_epoch: startedClockEpoch
            })
            : null;
        const next = this.#store({
            ...session,
            state: 'running',
            native_session_id: nativeSessionId,
            sample_accurate_request: sampleAccurateRequest,
            updated_at: new Date().toISOString()
        });
        return { ok: true, session: next, result: started };
    }

    async stopRecordingSession(input = {}) {
        const session = this.#resolveSession(input);
        if (!session) return { ok: false, error: 'recording_session_not_found' };
        if (session.state === 'stopping') return { ok: false, error: 'audio_recording_stop_in_progress' };
        if (session.state !== 'running' && session.state !== 'stop_failed') {
            return { ok: false, error: 'audio_recording_not_running' };
        }
        const sessionId = session.native_session_id || input.sessionId || input.session_id || input.id || session.id;
        let result = session.stop_result || null;
        if (!result) {
            this.#store({ ...session, state: 'stopping', updated_at: new Date().toISOString() });
            try {
                result = await this.core.recordStop(sessionId);
            } catch (error) {
                this.#store({
                    ...session,
                    state: error?.recordingTerminal === true ? 'failed' : 'running',
                    updated_at: new Date().toISOString()
                });
                throw error;
            }
        }
        let sampleTiming = null;
        try {
            sampleTiming = session.sample_accurate_request
                ? normalizeSampleAccurateRecordingResult(session.sample_accurate_request, result)
                : null;
        } catch (error) {
            error.recordingTerminal = true;
            error.recordingResult = result;
            this.#store({ ...session, state: 'failed', stop_result: null, updated_at: new Date().toISOString() });
            throw error;
        }
        const next = session ? this.#store({
            ...session,
            state: 'completed',
            stop_result: null,
            sample_timing: sampleTiming,
            updated_at: new Date().toISOString()
        }) : null;
        return { ok: true, session: next, result, sample_timing: sampleTiming };
    }

    discardRecordingSession(input = {}) {
        const session = this.#resolveSession(input);
        if (!session) return { ok: false, error: 'recording_session_not_found' };
        if (ACTIVE_RECORDING_STATES.has(session.state)) {
            return { ok: false, error: 'audio_recording_session_active', session };
        }
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
        if (ACTIVE_RECORDING_STATES.has(session.state)) {
            return { ok: false, error: 'audio_recording_session_active', session };
        }
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
