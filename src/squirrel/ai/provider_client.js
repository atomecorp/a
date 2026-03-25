import { loadUserProfile } from '../../application/eVe/APIS/login.js';
import {
    AI_MODEL_PROVIDER_LIST,
    AI_MODEL_PROVIDER_REGISTRY
} from './model_catalog_registry.js';

export const AI_PROVIDER_DEFINITIONS = Object.freeze(Object.fromEntries(
    Object.entries(AI_MODEL_PROVIDER_REGISTRY).map(([key, entry]) => ([key, Object.freeze({
        id: entry.id,
        label: entry.label,
        type: entry.request_type,
        endpoint: entry.completion_endpoint,
        models: Object.freeze([...entry.recommended_models, ...entry.fallback_models])
    })]))
));

export const AI_PROVIDER_LIST = Object.freeze(AI_MODEL_PROVIDER_LIST.map((entry) => Object.freeze({
    id: entry.id,
    label: entry.label,
    models: Object.freeze([...entry.models])
})));

const DEFAULT_TIMEOUT_MS = 20000;

const toText = (value) => String(value || '').trim();

const createTimeoutController = (timeoutMs) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== 'function') {
        return { controller: null, clear: () => {} };
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
            clear: () => {}
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

const readResponseError = async (response) => {
    let rawText = '';
    try {
        rawText = await response.text();
    } catch (_) {
        rawText = '';
    }

    const trimmed = toText(rawText);
    let providerMessage = trimmed;
    let providerCode = '';

    if (trimmed) {
        try {
            const parsed = JSON.parse(trimmed);
            const error = parsed?.error && typeof parsed.error === 'object' ? parsed.error : null;
            providerMessage = toText(error?.message || parsed?.message || trimmed);
            providerCode = toText(error?.code || error?.type || parsed?.code || parsed?.type || '');
        } catch (_) {
            // Keep raw text when the provider did not return JSON.
        }
    }

    const segments = [`HTTP_${response.status}`];
    if (providerCode) segments.push(providerCode);
    if (providerMessage) segments.push(providerMessage);
    return segments.join(' ');
};

const requestOpenAiStyle = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal
} = {}) => {
    const body = {
        model,
        temperature: 0.2,
        messages: [
            { role: 'system', content: String(systemPrompt || '') },
            { role: 'user', content: String(prompt || '') }
        ]
    };

    const response = await fetchImpl(provider.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }

    const data = await response.json();
    return toText(data?.choices?.[0]?.message?.content);
};

const requestAnthropic = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal
} = {}) => {
    const body = {
        model,
        max_tokens: 2048,
        system: String(systemPrompt || ''),
        messages: [{ role: 'user', content: String(prompt || '') }]
    };

    const response = await fetchImpl(provider.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }

    const data = await response.json();
    const parts = Array.isArray(data?.content) ? data.content : [];
    return toText(parts.map((part) => toText(part?.text)).filter(Boolean).join('\n'));
};

const requestGoogle = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal
} = {}) => {
    const url = `${provider.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
        systemInstruction: {
            parts: [{ text: String(systemPrompt || '') }]
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: String(prompt || '') }]
            }
        ]
    };

    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw new Error(await readResponseError(response));
    }

    const data = await response.json();
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    return toText(parts.map((part) => toText(part?.text)).filter(Boolean).join('\n'));
};

export const extractJsonResponse = (text) => {
    const trimmed = toText(text);
    if (!trimmed) return null;
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = fenced ? fenced[1] : trimmed;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
        return JSON.parse(raw.slice(start, end + 1));
    } catch (_) {
        return null;
    }
};

export const resolveFirstAiProviderConfig = async ({
    loadProfile = loadUserProfile
} = {}) => {
    const profileResult = await loadProfile();
    if (!profileResult?.ok) {
        return {
            ok: false,
            error: toText(profileResult?.error) || 'no_profile'
        };
    }

    const keys = Array.isArray(profileResult?.profile?.passkeys?.keys)
        ? profileResult.profile.passkeys.keys
        : [];

    const entry = keys.find((item) => {
        const providerId = toText(item?.provider);
        const apiKey = toText(item?.key);
        return providerId && apiKey && AI_PROVIDER_DEFINITIONS[providerId];
    });

    if (!entry) {
        return {
            ok: false,
            error: 'no_ai_key_configured'
        };
    }

    const providerId = toText(entry.provider);
    const provider = AI_PROVIDER_DEFINITIONS[providerId];
    const model = toText(entry.model) || provider.models?.[0] || '';
    const apiKey = toText(entry.key);

    return {
        ok: true,
        providerId,
        provider,
        model,
        apiKey,
        source: 'profile.passkeys.keys.first'
    };
};

export const normalizeAiProviderError = (error) => {
    const raw = toText(error?.message || error);
    const lower = raw.toLowerCase();

    if (!raw || lower === 'provider_timeout' || lower.includes('timeout') || lower.includes('aborted')) {
        return {
            code: 'provider_timeout',
            message: raw || 'provider_timeout',
            user_message: "L'IA ne repond pas."
        };
    }

    if (lower.includes('no_ai_key_configured') || lower.includes('no_keys') || lower.includes('no_profile')) {
        return {
            code: 'no_ai_key_configured',
            message: raw,
            user_message: "Aucune cle IA n'est configuree."
        };
    }

    if (
        lower.includes('401')
        || lower.includes('403')
        || lower.includes('unauthorized')
        || lower.includes('authentication')
        || lower.includes('invalid api key')
        || lower.includes('incorrect api key')
    ) {
        return {
            code: 'provider_auth_failed',
            message: raw,
            user_message: "L'IA ne repond pas."
        };
    }

    if (
        lower.includes('insufficient_quota')
        || lower.includes('quota')
        || lower.includes('billing')
        || lower.includes('credits')
        || lower.includes('credit balance')
        || lower.includes('hard_limit')
    ) {
        return {
            code: 'provider_quota_exceeded',
            message: raw,
            user_message: "L'IA a atteint sa limite de quota ou de credits."
        };
    }

    if (
        lower.includes('429')
        || lower.includes('too many requests')
        || lower.includes('rate limit')
        || lower.includes('rate_limit')
    ) {
        return {
            code: 'provider_rate_limited',
            message: raw,
            user_message: "L'IA est temporairement limitee."
        };
    }

    if (lower.includes('invalid_json')) {
        return {
            code: 'provider_invalid_response',
            message: raw,
            user_message: "L'IA ne repond pas."
        };
    }

    return {
        code: 'provider_unreachable',
        message: raw,
        user_message: "L'IA ne repond pas."
    };
};

export const requestProviderCompletion = async ({
    providerId,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl = globalThis.fetch?.bind(globalThis),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal = null
} = {}) => {
    if (typeof fetchImpl !== 'function') {
        throw new Error('provider_fetch_unavailable');
    }

    const provider = AI_PROVIDER_DEFINITIONS[toText(providerId)];
    if (!provider) {
        throw new Error('unknown_provider');
    }

    const merged = withMergedSignal({ signal, timeoutMs });
    try {
        if (provider.type === 'openai') {
            return await requestOpenAiStyle({
                provider,
                model: toText(model) || provider.models?.[0] || '',
                prompt,
                apiKey: toText(apiKey),
                systemPrompt,
                fetchImpl,
                signal: merged.signal
            });
        }

        if (provider.type === 'anthropic') {
            return await requestAnthropic({
                provider,
                model: toText(model) || provider.models?.[0] || '',
                prompt,
                apiKey: toText(apiKey),
                systemPrompt,
                fetchImpl,
                signal: merged.signal
            });
        }

        if (provider.type === 'google') {
            return await requestGoogle({
                provider,
                model: toText(model) || provider.models?.[0] || '',
                prompt,
                apiKey: toText(apiKey),
                systemPrompt,
                fetchImpl,
                signal: merged.signal
            });
        }

        throw new Error('unsupported_provider');
    } finally {
        merged.clear();
    }
};

export const requestProviderJsonCompletion = async (options = {}) => {
    const text = await requestProviderCompletion(options);
    const parsed = extractJsonResponse(text);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('invalid_json_response');
    }
    return {
        text,
        parsed
    };
};
