const TRACE_STORAGE_KEY = 'eve_ai_trace_store_v1';
const MAX_TRACES = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const toIso = () => new Date().toISOString();
const toTimestamp = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const toFiniteNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const percentile = (values = [], ratio = 0.5) => {
    const sorted = values
        .map((value) => toFiniteNumber(value, NaN))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);
    if (!sorted.length) return null;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((sorted.length * ratio)) - 1));
    return sorted[index];
};

const shouldIncludeTrace = (trace = {}, filters = {}) => {
    if (!trace || typeof trace !== 'object') return false;
    const input = trace.input && typeof trace.input === 'object' ? trace.input : {};
    const response = trace.response && typeof trace.response === 'object' ? trace.response : {};
    const llmCall = trace.llm_call && typeof trace.llm_call === 'object' ? trace.llm_call : {};
    const sinceMs = Number.isFinite(Number(filters.since_ms)) ? Number(filters.since_ms) : null;
    const sinceDays = Number.isFinite(Number(filters.since_days)) ? Number(filters.since_days) : null;
    const sinceCutoff = sinceMs !== null
        ? Date.now() - sinceMs
        : (sinceDays !== null ? Date.now() - (sinceDays * DAY_MS) : null);
    if (sinceCutoff !== null && toTimestamp(trace.started_at) < sinceCutoff) return false;
    if (filters.ok === true && response.ok !== true) return false;
    if (filters.failed === true && response.ok === true) return false;
    if (filters.transport && String(response.transport || '').trim() !== String(filters.transport).trim()) return false;
    if (filters.modality && String(input.modality || '').trim() !== String(filters.modality).trim()) return false;
    if (filters.provider && String(llmCall.provider || '').trim() !== String(filters.provider).trim()) return false;
    if (filters.target && String(llmCall.target || '').trim() !== String(filters.target).trim()) return false;
    return true;
};

const incrementBucket = (map, key, updater) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    const current = map[normalizedKey] || updater(null);
    map[normalizedKey] = updater(current);
};

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
        },

        query(filters = {}) {
            const traces = read().filter((entry) => shouldIncludeTrace(entry, filters));
            const size = Number.isFinite(Number(filters.limit)) ? Math.max(1, Math.round(Number(filters.limit))) : traces.length;
            return traces.slice(-size).map((entry) => cloneValue(entry));
        },

        metrics(filters = {}) {
            const traces = read().filter((entry) => shouldIncludeTrace(entry, filters));
            const latencies = traces
                .map((entry) => toFiniteNumber(entry.total_latency_ms, NaN))
                .filter((value) => Number.isFinite(value));
            const perTool = {};
            const perDomain = {};
            let clarificationCount = 0;
            let recoveryCount = 0;
            let promptTokens = 0;
            let completionTokens = 0;

            for (const trace of traces) {
                const autonomy = trace.autonomy_decision && typeof trace.autonomy_decision === 'object'
                    ? trace.autonomy_decision
                    : {};
                if (autonomy.confirmation_required === true) clarificationCount += 1;

                const llmCall = trace.llm_call && typeof trace.llm_call === 'object' ? trace.llm_call : {};
                promptTokens += toFiniteNumber(llmCall.prompt_tokens, 0);
                completionTokens += toFiniteNumber(llmCall.completion_tokens, 0);

                const steps = Array.isArray(trace.execution) ? trace.execution : [];
                for (const step of steps) {
                    const toolName = String(step.tool_name || step.tool_id || '').trim();
                    const domain = String(step.domain || toolName.split('.')[0] || '').trim();
                    const succeeded = step.ok !== false && step.status !== 'ERROR';
                    if (step.recovery_action) recoveryCount += 1;
                    incrementBucket(perTool, toolName, (current) => ({
                        tool_name: toolName,
                        calls: Number(current?.calls || 0) + 1,
                        successes: Number(current?.successes || 0) + (succeeded ? 1 : 0),
                        failures: Number(current?.failures || 0) + (succeeded ? 0 : 1)
                    }));
                    incrementBucket(perDomain, domain, (current) => ({
                        domain,
                        calls: Number(current?.calls || 0) + 1,
                        successes: Number(current?.successes || 0) + (succeeded ? 1 : 0),
                        failures: Number(current?.failures || 0) + (succeeded ? 0 : 1)
                    }));
                }
            }

            return {
                trace_count: traces.length,
                latency_ms: {
                    p50: percentile(latencies, 0.5),
                    p95: percentile(latencies, 0.95),
                    p99: percentile(latencies, 0.99)
                },
                clarification_rate: traces.length ? clarificationCount / traces.length : 0,
                recovery_rate: traces.length ? recoveryCount / traces.length : 0,
                token_usage: {
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: promptTokens + completionTokens
                },
                per_tool: Object.values(perTool).sort((left, right) => left.tool_name.localeCompare(right.tool_name)),
                per_domain: Object.values(perDomain).sort((left, right) => left.domain.localeCompare(right.domain))
            };
        }
    };
};
