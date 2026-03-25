const TRACE_STORAGE_KEY = 'eve_ai_trace_store_v1';
const MAX_TRACES = 200;

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const toIso = () => new Date().toISOString();

const makeId = (prefix = 'trace') => {
    if (globalThis?.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const createAiTraceStore = ({
    env = globalThis,
    storageKey = TRACE_STORAGE_KEY
} = {}) => {
    let inMemory = [];

    const read = () => {
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (!localStorage || typeof localStorage.getItem !== 'function') return cloneValue(inMemory);
            const raw = localStorage.getItem(storageKey);
            if (!raw) return cloneValue(inMemory);
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return cloneValue(inMemory);
            inMemory = parsed.slice(-MAX_TRACES);
            return cloneValue(inMemory);
        } catch (_) {
            return cloneValue(inMemory);
        }
    };

    const write = (entries = []) => {
        inMemory = Array.isArray(entries) ? entries.slice(-MAX_TRACES) : [];
        try {
            const localStorage = env?.localStorage || env?.window?.localStorage || null;
            if (localStorage && typeof localStorage.setItem === 'function') {
                localStorage.setItem(storageKey, JSON.stringify(inMemory));
            }
        } catch (_) {
            // Keep in-memory fallback.
        }
        return cloneValue(inMemory);
    };

    return {
        startTrace(payload = {}) {
            const traces = read();
            const trace = {
                request_id: String(payload.request_id || makeId('request')),
                trace_id: String(payload.trace_id || makeId('trace')),
                started_at: toIso(),
                finished_at: null,
                input: cloneValue(payload.input || {}),
                identity_resolution: cloneValue(payload.identity_resolution || null),
                llm_call: cloneValue(payload.llm_call || null),
                autonomy_decision: cloneValue(payload.autonomy_decision || null),
                execution: [],
                response: null,
                total_latency_ms: null
            };
            traces.push(trace);
            write(traces);
            return cloneValue(trace);
        },

        appendExecution(traceId, step = {}) {
            const traces = read();
            const target = traces.find((entry) => entry.trace_id === traceId);
            if (!target) return null;
            target.execution = Array.isArray(target.execution) ? target.execution : [];
            target.execution.push(cloneValue(step));
            write(traces);
            return cloneValue(target);
        },

        finishTrace(traceId, payload = {}) {
            const traces = read();
            const target = traces.find((entry) => entry.trace_id === traceId);
            if (!target) return null;
            target.finished_at = toIso();
            target.response = cloneValue(payload.response || null);
            target.total_latency_ms = Number.isFinite(Number(payload.total_latency_ms))
                ? Number(payload.total_latency_ms)
                : target.total_latency_ms;
            if (payload.llm_call) target.llm_call = cloneValue(payload.llm_call);
            if (payload.identity_resolution) target.identity_resolution = cloneValue(payload.identity_resolution);
            if (payload.autonomy_decision) target.autonomy_decision = cloneValue(payload.autonomy_decision);
            write(traces);
            return cloneValue(target);
        },

        list({ limit = 20 } = {}) {
            const traces = read();
            const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 20;
            return traces.slice(-size).map((entry) => cloneValue(entry));
        }
    };
};
