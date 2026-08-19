const SENSITIVE_FIELD = /(?:api.?key|authorization|cookie|credential|password|secret|bearer|access.?token|refresh.?token|id.?token)$/i;
const MAX_DIAGNOSTIC_DEPTH = 6;
const MAX_DIAGNOSTIC_ITEMS = 32;
const MAX_DIAGNOSTIC_TEXT = 4000;

export const sanitizeVoiceDiagnostic = (value, depth = 0, seen = new WeakSet()) => {
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') {
        return value.length > MAX_DIAGNOSTIC_TEXT
            ? `${value.slice(0, MAX_DIAGNOSTIC_TEXT)}…`
            : value;
    }
    if (typeof value !== 'object') return String(value);
    if (depth >= MAX_DIAGNOSTIC_DEPTH) return '[depth-limited]';
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_DIAGNOSTIC_ITEMS)
            .map((entry) => sanitizeVoiceDiagnostic(entry, depth + 1, seen));
    }
    const sanitized = {};
    Object.entries(value).slice(0, MAX_DIAGNOSTIC_ITEMS).forEach(([key, entry]) => {
        sanitized[key] = SENSITIVE_FIELD.test(key)
            ? '[redacted]'
            : sanitizeVoiceDiagnostic(entry, depth + 1, seen);
    });
    return sanitized;
};

// Opt-in, not opt-out. Every voice stage, every microphone level sample and
// every provider round-trip funnels through here, so leaving it on by default
// meant the console was full of `[voice-trace]` lines before the user had done
// anything. Set `window.__EVE_VOICE_DIAGNOSTICS__ = true` to get them back.
export const writeVoiceDiagnostic = (env = globalThis, stage = 'voice.unknown', payload = {}) => {
    if (env?.__EVE_VOICE_DIAGNOSTICS__ !== true) return null;
    const record = {
        at: new Date().toISOString(),
        stage: String(stage || 'voice.unknown'),
        ...sanitizeVoiceDiagnostic(payload)
    };
    const line = `[voice-trace] ${JSON.stringify(record)}`;
    env?.console?.info?.(line);
    env?.webkit?.messageHandlers?.console?.postMessage?.(line);
    const invoke = env?.__TAURI_INTERNALS__?.invoke || env?.__TAURI__?.invoke;
    if (typeof invoke === 'function') {
        try {
            Promise.resolve(invoke('log_from_webview', {
                payload: {
                    level: 'info',
                    source: 'voice_runtime',
                    component: 'voice',
                    request_id: record.trace_id || record.request_id || null,
                    session_id: record.session_id || null,
                    message: record.stage,
                    data: record,
                    timestamp: record.at
                }
            })).catch(() => { });
        } catch (_) { }
    }
    return record;
};

const ensureMetricEntry = (store, sessionId) => {
    if (!store.has(sessionId)) {
        store.set(sessionId, {
            session_id: sessionId,
            marks: {},
            metrics: {}
        });
    }
    return store.get(sessionId);
};

export const createVoiceLatencyTelemetry = ({ env = globalThis } = {}) => {
    const store = new Map();

    const handleEvent = (event) => {
        const sessionId = String(event?.session_id || '').trim();
        if (!sessionId) return;
        const entry = ensureMetricEntry(store, sessionId);
        const at = Number(event?.at || 0);
        const state = event?.payload?.state || null;

        if (event.type === 'voice.capture.state' && state === 'capturing') {
            entry.marks.capture_started_at = at;
        }
        if (event.type === 'voice.capture.state' && state === 'stopped') {
            entry.marks.capture_stopped_at = at;
            if (entry.marks.capture_started_at) {
                entry.metrics.capture_ms = at - entry.marks.capture_started_at;
            }
        }

        if (event.type === 'voice.stt.state' && state === 'listening') {
            entry.marks.stt_started_at = at;
        }
        if (event.type === 'voice.stt.partial' && !entry.marks.stt_first_partial_at) {
            entry.marks.stt_first_partial_at = at;
            if (entry.marks.stt_started_at) {
                entry.metrics.stt_first_partial_ms = at - entry.marks.stt_started_at;
            }
        }
        if (event.type === 'voice.stt.final') {
            entry.marks.stt_final_at = at;
            if (entry.marks.stt_started_at) {
                entry.metrics.stt_final_ms = at - entry.marks.stt_started_at;
            }
        }

        if (event.type === 'voice.tts.state' && state === 'speaking') {
            entry.marks.tts_started_at = at;
        }
        if (event.type === 'voice.tts.state' && state === 'done') {
            entry.marks.tts_stopped_at = at;
            if (entry.marks.tts_started_at) {
                entry.metrics.tts_playback_ms = at - entry.marks.tts_started_at;
            }
        }

        if (event.type === 'voice.cancel.requested' && !entry.marks.cancel_requested_at) {
            entry.marks.cancel_requested_at = at;
        }
        if (event.type === 'voice.command' && !entry.marks.cancel_requested_at) {
            if (['stop', 'cancel', 'summarize', 'reply'].includes(String(event?.payload?.command || ''))) {
                entry.marks.cancel_requested_at = at;
            }
        }
        if (event.type === 'voice.interruption' && entry.marks.cancel_requested_at) {
            entry.marks.cancel_resolved_at = at;
            entry.metrics.cancel_roundtrip_ms = at - entry.marks.cancel_requested_at;
        }
        writeVoiceDiagnostic(env, event.type, {
            session_id: sessionId,
            seq: event?.seq ?? null,
            event_at: at,
            payload: event?.payload || {}
        });
    };

    return {
        attachRuntime(runtime) {
            if (!runtime || typeof runtime.subscribe !== 'function') {
                throw new Error('A voice session runtime with subscribe() is required');
            }
            return runtime.subscribe(handleEvent);
        },
        attachOrchestrator(orchestrator) {
            if (!orchestrator || typeof orchestrator.subscribe !== 'function') {
                throw new Error('A voice orchestrator with subscribe() is required');
            }
            return orchestrator.subscribe((entry) => writeVoiceDiagnostic(env, entry?.type || 'voice.orchestrator', {
                seq: entry?.seq ?? null,
                event_at: entry?.at ?? null,
                payload: entry?.payload || {}
            }));
        },
        trace(stage, payload = {}) {
            return writeVoiceDiagnostic(env, stage, payload);
        },
        snapshot(sessionId) {
            const entry = store.get(String(sessionId || '').trim());
            if (!entry) return null;
            return JSON.parse(JSON.stringify(entry));
        },
        list() {
            return Array.from(store.values()).map((entry) => JSON.parse(JSON.stringify(entry)));
        }
    };
};
