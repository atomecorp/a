// What the AI client shares: the timeout, the usage shape, the merged abort signal, the schema
// projection. Every provider is reached through atome-server (R-120), never from here.
import { toText } from '../shared/scalars.js';

const DEFAULT_TIMEOUT_MS = 20000;

const normalizeUsage = (usage = {}) => ({
    prompt_tokens: Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0,
    completion_tokens: Number(usage?.completion_tokens ?? usage?.output_tokens) || 0,
    total_tokens: Number.isFinite(Number(usage?.total_tokens))
        ? Number(usage.total_tokens)
        : (
            (Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0)
            + (Number(usage?.completion_tokens ?? usage?.output_tokens) || 0)
        )
});

const createTimeoutController = (timeoutMs) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== 'function') {
        return { controller: null, clear: () => { } };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('provider_timeout'), timeoutMs);
    return {
        controller,
        clear() {
            clearTimeout(timer);
        }
    };
};

const withMergedSignal = ({ signal = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
    const timeout = createTimeoutController(timeoutMs);
    if (!signal && timeout.controller) {
        return {
            signal: timeout.controller.signal,
            clear: timeout.clear
        };
    }
    if (!signal) {
        return {
            signal: null,
            clear: timeout.clear
        };
    }
    if (!timeout.controller) {
        return {
            signal,
            clear: () => { }
        };
    }
    if (typeof AbortController !== 'function') {
        return {
            signal,
            clear: timeout.clear
        };
    }
    const merged = new AbortController();
    const abort = (reason) => {
        if (!merged.signal.aborted) {
            merged.abort(reason);
        }
    };
    const onSignalAbort = () => abort(signal.reason || 'aborted');
    const onTimeoutAbort = () => abort(timeout.controller.signal.reason || 'provider_timeout');
    signal.addEventListener('abort', onSignalAbort, { once: true });
    if (signal.aborted) onSignalAbort();
    timeout.controller.signal.addEventListener('abort', onTimeoutAbort, { once: true });
    return {
        signal: merged.signal,
        clear() {
            signal.removeEventListener('abort', onSignalAbort);
            timeout.controller.signal.removeEventListener('abort', onTimeoutAbort);
            timeout.clear();
        }
    };
};

export {
    DEFAULT_TIMEOUT_MS,
    toText,
    normalizeUsage,
    withMergedSignal
};

// JSON Schema permits omitted array items; OpenAI requires that any-item
// meaning to be explicit. Preserve the canonical schema and its constraints.
export const projectOpenAiSchema = (schema) => {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map(projectOpenAiSchema);
    const projected = { ...schema };
    for (const key of ['properties', '$defs', 'definitions', 'patternProperties']) {
        if (schema[key]) projected[key] = Object.fromEntries(Object.entries(schema[key]).map(([name, value]) => [name, projectOpenAiSchema(value)]));
    }
    for (const key of ['items', 'additionalProperties', 'anyOf', 'oneOf', 'allOf', 'not']) {
        if (Object.hasOwn(schema, key)) projected[key] = projectOpenAiSchema(schema[key]);
    }
    if (schema.type === 'array' && !Object.hasOwn(schema, 'items')) projected.items = {};
    return projected;
};
