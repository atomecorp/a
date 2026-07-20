import {
    getTauriInvoke,
    resolveAudioRuntime,
    resolveVoiceCaptureProvider
} from './runtime_audio_backend.js';
import { installSharedAVContracts } from './av_contracts.js';
import { resolveRecordingUserId } from './record_audio_user_identity.js';
import {
    clearLatestRecordingScopeFrame,
    createTauriRecordingScopePoller,
    rememberRecordingScopeFrame
} from './record_audio_scope_transport.js';
import {
    SAMPLE_ACCURATE_RECORDING_ERROR_CODES,
    SampleAccurateRecordingError,
    normalizeSampleAccurateRecordingResult,
    resolveSampleAccurateRecordingCapability,
    validateSampleAccurateRecordingRequest
} from './sample_accurate_recording.js';

// Unified recorder API (Tauri + AUv3 + browser capture backend)
// Contract:
// - record_start(params) -> Promise<sessionId | exact-session-detail>
// - record_stop(sessionId) -> Promise<payload> or throws
(function () {
    if (typeof window === 'undefined') return;

    const PENDING = new Map();
    let listenersReady = false;
    const av = installSharedAVContracts(window);

    function terminalRecordingError(error, result = null, discarded = false) {
        const terminal = error instanceof Error ? error : new Error(String(error || 'Recording error'));
        terminal.recordingTerminal = true;
        if (result) terminal.recordingResult = result;
        if (discarded) terminal.recordingDiscarded = true;
        return terminal;
    }

    function updateRecordProvider() {
        window.__SQUIRREL_RECORD_PROVIDER__ = resolveVoiceCaptureProvider(window);
        return window.__SQUIRREL_RECORD_PROVIDER__;
    }

    function normalizeSource(raw) {
        const v = (typeof raw === 'string' ? raw : '').trim().toLowerCase();
        if (v === 'plugin' || v === 'plugin_output') return 'plugin';
        if (v === 'plugin_input' || v === 'input') return 'plugin_input';
        return 'mic';
    }

    function detectContext() {
        const runtime = resolveAudioRuntime(window);
        if (runtime.runtime === 'tauri_native') return 'tauri';
        if (runtime.runtime === 'ios_app') return 'ios_app';
        if (runtime.runtime === 'ios_auv3') return 'auv3';
        return 'browser';
    }

    function reportRecordingOverrun(result = {}, entry = {}) {
        const overrunFrames = Number(result?.overrun_frames || result?.overrunFrames || 0);
        if (!Number.isFinite(overrunFrames) || overrunFrames <= 0) return null;
        return av.monitoring.reportStreamOverrun({
            media_kind: 'audio',
            session_id: result.session_id || result.sessionId || entry.sessionId || '',
            stream_id: result.session_id || result.sessionId || entry.sessionId || '',
            provider: result.provider || entry.provider || '',
            overrun_frames: overrunFrames,
            sample_rate: result.sample_rate || result.sampleRate || entry.sampleRate || 0,
            channels: result.channels || entry.channels || 0
        });
    }

    function randomSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return `rec_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function defaultFileName(source) {
        return `${source}_${Date.now()}.wav`;
    }

    function sendNativeMessage(msg) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge) {
            window.webkit.messageHandlers.swiftBridge.postMessage(msg);
            return true;
        }
        return false;
    }

    function ensureListeners() {
        if (listenersReady) return;
        listenersReady = true;
        window.addEventListener('native_audio_recording', (ev) => {
            const detail = ev && ev.detail ? ev.detail : {};
            handleNativeEvent(detail);
        });
    }

    function handleNativeEvent(detail) {
        if (!detail || typeof detail !== 'object') return;
        const type = detail.type || null;
        if (!type) return;
        const sessionId = detail.session_id || detail.sessionId || '';
        if (!sessionId) return;
        if (['audio_scope', 'record_scope'].includes(type)) {
            rememberRecordingScopeFrame(detail, sessionId);
        }
        const entry = PENDING.get(sessionId);
        if (!entry) {
            return;
        }

        if (type === 'record_started') {
            if (entry.start) {
                if (entry.sampleAccurateRequest) {
                    const clockId = String(detail.clock_id || detail.clockId || '').trim();
                    const clockEpoch = String(detail.clock_epoch || detail.clockEpoch || '').trim();
                    const clockReference = String(detail.clock_reference || detail.clockReference || '').trim();
                    const timelineClockId = String(detail.timeline_clock_id || detail.timelineClockId || '').trim();
                    const timelineOriginFrame = detail.timeline_origin_frame ?? detail.timelineOriginFrame;
                    const sampleRate = Number(detail.sample_rate || detail.sampleRate || 0);
                    const expectedRate = Number(entry.sampleAccurateRequest.timeline_sample_rate || 0);
                    if (clockId !== entry.sampleAccurateRequest.clock_id
                        || clockReference !== entry.sampleAccurateRequest.clock_reference
                        || timelineClockId !== entry.sampleAccurateRequest.timeline_clock_id
                        || !Number.isSafeInteger(timelineOriginFrame) || timelineOriginFrame < 0
                        || !clockEpoch || sampleRate !== expectedRate) {
                        const code = sampleRate !== expectedRate
                            ? SAMPLE_ACCURATE_RECORDING_ERROR_CODES.SAMPLE_RATE_MISMATCH
                            : SAMPLE_ACCURATE_RECORDING_ERROR_CODES.CLOCK_MISMATCH;
                        entry.start.reject(new SampleAccurateRecordingError(code, {
                            clock_id: clockId,
                            clock_epoch: clockEpoch,
                            clock_reference: clockReference,
                            timeline_clock_id: timelineClockId,
                            timeline_origin_frame: timelineOriginFrame ?? null,
                            sample_rate: sampleRate
                        }));
                        entry.start = null;
                        sendNativeMessage({ action: 'record_stop', sessionId });
                        return;
                    }
                    entry.sampleAccurateRequest = Object.freeze({
                        ...entry.sampleAccurateRequest,
                        requested_timeline_start_frame: entry.sampleAccurateRequest.timeline_start_frame,
                        timeline_start_frame: timelineOriginFrame,
                        clock_epoch: clockEpoch
                    });
                    entry.start.resolve({ ...detail, session_id: sessionId, provider: entry.provider });
                } else {
                    entry.start.resolve(sessionId);
                }
                entry.start = null;
            }
            return;
        }

        if (type === 'record_done') {
            if (entry.stop) {
                const frameCount = Number(detail.frame_count || detail.frameCount || 0);
                const rawOverrunFrames = detail.overrun_frames ?? detail.overrunFrames;
                const overrunFrames = rawOverrunFrames === undefined ? undefined : Number(rawOverrunFrames);
                const sampleRate = Number(detail.sample_rate || detail.sampleRate || entry.sampleRate || 0);
                const resolved = {
                    ...detail,
                    session_id: sessionId,
                    file_name: detail.file_name || detail.fileName || entry.fileName || null,
                    file_path: detail.file_path || detail.path || null,
                    duration_sec: frameCount > 0 && sampleRate > 0
                        ? frameCount / sampleRate
                        : Number(detail.duration_sec || detail.durationSec || 0),
                    frame_count: frameCount,
                    overrun_frames: Number.isFinite(overrunFrames) ? overrunFrames : undefined,
                    sample_rate: sampleRate,
                    channels: Number(detail.channels || entry.channels || 0),
                    provider: entry.provider || 'native_audio_recorder'
                };
                if (entry.sampleAccurateRequest) {
                    try {
                        resolved.sample_timing = normalizeSampleAccurateRecordingResult(entry.sampleAccurateRequest, resolved);
                    } catch (error) {
                        entry.stop.reject(terminalRecordingError(error, resolved));
                        clearLatestRecordingScopeFrame(sessionId);
                        PENDING.delete(sessionId);
                        return;
                    }
                }
                const monitoring = reportRecordingOverrun(resolved, entry);
                entry.stop.resolve(monitoring ? { ...resolved, monitoring } : resolved);
                entry.stop = null;
            }
            clearLatestRecordingScopeFrame(sessionId);
            PENDING.delete(sessionId);
            return;
        }

        if (type === 'record_error') {
            const error = detail.error || detail.message || 'Recording error';
            const recordingError = entry.sampleAccurateRequest
                ? new SampleAccurateRecordingError(
                    detail.code || SAMPLE_ACCURATE_RECORDING_ERROR_CODES.INVALID_CLOCK,
                    { ...detail, native_error: error }
                )
                : new Error(error);
            if (entry.stop) {
                entry.stop.reject(terminalRecordingError(recordingError, detail, detail.discarded === true));
            } else if (entry.start) {
                entry.start.reject(recordingError);
            }
            clearLatestRecordingScopeFrame(sessionId);
            PENDING.delete(sessionId);
        }
    }

    async function ensureBrowserRecordAudio() {
        if (typeof window.record_audio === 'function') return window.record_audio;
        return (typeof window.record_audio === 'function') ? window.record_audio : null;
    }

    async function record_start(params = {}) {
        ensureListeners();
        updateRecordProvider();
        const context = detectContext();
        const source = normalizeSource(params.source || 'mic');
        const sessionId = params.sessionId || params.session_id || randomSessionId();
        const fileName = (typeof params.fileName === 'string' && params.fileName.trim())
            ? params.fileName.trim()
            : defaultFileName(source);
        const sampleRate = (typeof params.sampleRate === 'number')
            ? params.sampleRate
            : (typeof (params.timeline_sample_rate ?? params.timelineSampleRate) === 'number'
                ? (params.timeline_sample_rate ?? params.timelineSampleRate)
                : null);
        const channels = (typeof params.channels === 'number')
            ? params.channels
            : null;
        const sampleAccurateRequest = params.require_sample_accurate === true || params.requireSampleAccurate === true
            ? validateSampleAccurateRecordingRequest(params)
            : null;
        if (sampleAccurateRequest) {
            const capability = resolveSampleAccurateRecordingCapability(window, params);
            if (!capability.supported) {
                const error = new Error(capability.error);
                error.code = capability.error;
                error.detail = capability;
                throw error;
            }
        }

        if (context === 'tauri' || context === 'ios_app') {
            const invoke = getTauriInvoke(window);
            if (typeof invoke !== 'function') {
                throw new Error(context === 'ios_app'
                    ? 'iOS native audio recorder bridge is not available'
                    : 'Tauri audio engine bridge is not available');
            }
            let userId = params.userId || params.user_id || null;
            if (!userId) {
                userId = await resolveRecordingUserId(window);
            }
            if (!userId) {
                throw new Error('Missing userId for native recording');
            }
            const filePath = (typeof params.filePath === 'string' && params.filePath.trim())
                ? params.filePath.trim()
                : `data/users/${userId}/recordings/${fileName}`;
            const requestedSampleRate = Number(sampleRate) || 0;
            const requestedChannels = Number(channels) || 0;
            await invoke('audio_record_start', {
                sessionId,
                fileName,
                filePath,
                userId,
                sampleRate: requestedSampleRate,
                channels: requestedChannels
            });
            const pendingEntry = {
                provider: 'native_audio_recorder',
                transport: context,
                fileName,
                filePath,
                sampleRate: requestedSampleRate,
                channels: requestedChannels,
                disposeScope: null
            };
            PENDING.set(sessionId, pendingEntry);
            if (context === 'tauri') {
                pendingEntry.disposeScope = createTauriRecordingScopePoller({
                    windowRef: window,
                    invoke,
                    sessionId
                });
            }
            window.__SQUIRREL_RECORD_PROVIDER__ = 'native_audio_recorder';
            return sessionId;
        }

        if (context === 'browser') {
            const recordAudio = await ensureBrowserRecordAudio();
            if (typeof recordAudio !== 'function') {
                throw new Error('Browser capture recorder is not available');
            }
            const ctrl = await recordAudio(fileName, params.path || null, {
                backend: 'webaudio',
                source
            });
            PENDING.set(sessionId, {
                provider: 'web_capture_recorder',
                transport: 'browser',
                fileName,
                ctrl
            });
            window.__SQUIRREL_RECORD_PROVIDER__ = 'web_capture_recorder';
            return sessionId;
        }

        let userId = params.userId || params.user_id || null;
        if (!userId && (context === 'tauri' || context === 'ios_app')) {
            userId = await resolveRecordingUserId(window);
        }

        const msg = {
            action: 'record_start',
            sessionId,
            fileName,
            source,
            sampleRate,
            channels,
            userId,
            clockId: params.clock_id || params.clockId || null,
            clockReference: params.clock_reference || params.clockReference || null,
            timelineClockId: params.timeline_clock_id || params.timelineClockId || null,
            timelineStartFrame: params.timeline_start_frame ?? params.timelineStartFrame ?? null,
            timelineSampleRate: params.timeline_sample_rate ?? params.timelineSampleRate ?? null,
            requireSampleAccurate: !!sampleAccurateRequest
        };

        // Pre-register the PENDING entry BEFORE creating the Promise to avoid
        // a race where the native event fires before the Promise executor runs.
        const pendingEntry = {
            provider: 'native_audio_recorder',
            transport: 'auv3',
            fileName,
            sampleRate: Number(sampleRate) || null,
            channels: Number(channels) || null,
            sampleAccurateRequest,
            start: null,
            stop: null
        };
        PENDING.set(sessionId, pendingEntry);

        return new Promise((resolve, reject) => {
            pendingEntry.start = { resolve, reject };
            if (!sendNativeMessage(msg)) {
                PENDING.delete(sessionId);
                reject(new Error('Native recorder bridge is not available'));
            }
        });
    }

    async function record_stop(sessionId) {
        ensureListeners();
        updateRecordProvider();
        const sid = typeof sessionId === 'string' ? sessionId : '';
        if (!sid) throw new Error('Missing sessionId');

        const entry = PENDING.get(sid);
        if (entry?.transport === 'tauri' || entry?.transport === 'ios_app') {
            const invoke = getTauriInvoke(window);
            if (typeof invoke !== 'function') {
                entry.disposeScope?.();
                clearLatestRecordingScopeFrame(sid);
                PENDING.delete(sid);
                throw new Error(entry.transport === 'ios_app'
                    ? 'iOS native audio recorder bridge is not available'
                    : 'Tauri audio engine bridge is not available');
            }
            try {
                const result = await invoke('audio_record_stop', {
                    sessionId: sid
                });
                const frameCount = Number(result?.frame_count || result?.frameCount || 0);
                const overrunFrames = Number(result?.overrun_frames || result?.overrunFrames || 0);
                const sampleRate = Number(result?.sample_rate || result?.sampleRate || entry.sampleRate || 0);
                const resolved = {
                    session_id: sid,
                    file_name: entry.fileName,
                    file_path: entry.filePath,
                    absolute_file_path: result?.absolute_file_path || result?.file_path || null,
                    duration_sec: frameCount > 0 && sampleRate > 0
                        ? frameCount / sampleRate
                        : Number(result?.duration_sec || 0),
                    frame_count: frameCount,
                    overrun_frames: Number.isFinite(overrunFrames) && overrunFrames > 0 ? overrunFrames : 0,
                    sample_rate: sampleRate,
                    channels: Number(result?.channels || entry.channels || 0),
                    provider: entry.provider
                };
                const monitoring = reportRecordingOverrun(resolved, entry);
                return monitoring ? { ...resolved, monitoring } : resolved;
            } finally {
                entry.disposeScope?.();
                clearLatestRecordingScopeFrame(sid);
                PENDING.delete(sid);
            }
        }

        if (entry?.transport === 'browser') {
            try {
                if (!entry.ctrl || typeof entry.ctrl.stop !== 'function') {
                    throw new Error('Browser capture session is not active');
                }
                const result = await entry.ctrl.stop();
                return {
                    session_id: sid,
                    file_name: entry.fileName,
                    provider: entry.provider,
                    ...(result && typeof result === 'object' ? result : {})
                };
            } finally {
                PENDING.delete(sid);
            }
        }

        const msg = {
            action: 'record_stop',
            sessionId: sid
        };

        return new Promise((resolve, reject) => {
            const pendingEntry = PENDING.get(sid) || {
                provider: 'native_audio_recorder',
                start: null,
                stop: null
            };
            pendingEntry.stop = { resolve, reject };
            PENDING.set(sid, pendingEntry);
            if (!sendNativeMessage(msg)) {
                PENDING.delete(sid);
                reject(new Error('Native recorder bridge is not available'));
            }
        });
    }

    window.record_start = record_start;
    window.record_stop = record_stop;
    updateRecordProvider();
})();
