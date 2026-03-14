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

export const createVoiceLatencyTelemetry = () => {
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
    };

    return {
        attachRuntime(runtime) {
            if (!runtime || typeof runtime.subscribe !== 'function') {
                throw new Error('A voice session runtime with subscribe() is required');
            }
            return runtime.subscribe(handleEvent);
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
