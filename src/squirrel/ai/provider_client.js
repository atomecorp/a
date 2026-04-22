import { loadUserProfile } from '../../application/eVe/domains/user/profile_api.js';
import { buildLocalApiUrl, isTauri } from '../apis/serverUrls.js';
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
const LOCAL_AI_PROXY_PATH = '/api/eve/ai/provider-completion';

const toText = (value) => String(value || '').trim();
const containsAny = (haystack = '', needles = []) => needles.some((needle) => haystack.includes(needle));
const normalizeUsage = (usage = {}) => ({
    prompt_tokens: Number.isFinite(Number(usage?.prompt_tokens)) ? Number(usage.prompt_tokens) : 0,
    completion_tokens: Number.isFinite(Number(usage?.completion_tokens)) ? Number(usage.completion_tokens) : 0,
    total_tokens: Number.isFinite(Number(usage?.total_tokens))
        ? Number(usage.total_tokens)
        : (
            (Number.isFinite(Number(usage?.prompt_tokens)) ? Number(usage.prompt_tokens) : 0)
            + (Number.isFinite(Number(usage?.completion_tokens)) ? Number(usage.completion_tokens) : 0)
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
    let rawBody = '';
    try {
        rawBody = await response.text();
    } catch (_) {
        rawBody = '';
    }

    const trimmed = toText(rawBody);
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
    return {
        display: segments.join(' '),
        http_status: response.status,
        provider_code: providerCode,
        provider_message: providerMessage,
        raw_body: rawBody
    };
};

const createProviderHttpError = (info) => {
    const error = new Error(info.display);
    error.http_status = info.http_status;
    error.provider_code = info.provider_code;
    error.provider_message = info.provider_message;
    error.raw_body = info.raw_body;
    return error;
};

const shouldUseLocalAiProxy = ({ preferLocalProxy } = {}) => {
    if (preferLocalProxy === false) return false;
    if (preferLocalProxy === true) return true;
    return isTauri();
};

const requestViaLocalAiProxy = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
    const proxyUrl = buildLocalApiUrl(LOCAL_AI_PROXY_PATH);
    if (!proxyUrl) {
        throw new Error('provider_local_proxy_unavailable');
    }

    const response = await fetchImpl(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            provider_id: provider?.id || '',
            provider_type: provider?.type || '',
            completion_endpoint: provider?.endpoint || '',
            model: toText(model) || provider?.models?.[0] || '',
            prompt: String(prompt || ''),
            system_prompt: String(systemPrompt || ''),
            api_key: toText(apiKey),
            timeout_ms: Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
        }),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    return {
        text: toText(data?.text),
        usage: normalizeUsage(data?.usage || {})
    };
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
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    return {
        text: toText(data?.choices?.[0]?.message?.content),
        usage: normalizeUsage(data?.usage || {})
    };
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
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    const parts = Array.isArray(data?.content) ? data.content : [];
    return {
        text: toText(parts.map((part) => toText(part?.text)).filter(Boolean).join('\n')),
        usage: normalizeUsage({
            prompt_tokens: data?.usage?.input_tokens,
            completion_tokens: data?.usage?.output_tokens
        })
    };
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
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    return {
        text: toText(parts.map((part) => toText(part?.text)).filter(Boolean).join('\n')),
        usage: normalizeUsage({
            prompt_tokens: data?.usageMetadata?.promptTokenCount,
            completion_tokens: data?.usageMetadata?.candidatesTokenCount,
            total_tokens: data?.usageMetadata?.totalTokenCount
        })
    };
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

    // Structured data from createProviderHttpError, falls back to string parsing
    const httpStatus = error?.http_status || null;
    const providerCode = toText(error?.provider_code || '').toLowerCase();
    const providerMessage = toText(error?.provider_message || '').toLowerCase();
    const rawBody = toText(error?.raw_body || '');
    const hasStructuredData = !!providerCode;

    const isHttp429 = httpStatus === 429 || lower.includes('http_429') || lower.includes(' 429');
    const isHttp402 = httpStatus === 402 || lower.includes('http_402') || lower.includes(' 402');

    // Truly explicit hard-quota signals — use exact providerCode when structured,
    // fall back to string scanning only when unstructured
    const HARD_QUOTA_SIGNALS = [
        'insufficient_quota',
        'insufficient_balance',
        'billing_hard_limit_reached',
        'hard_limit_reached'
    ];
    const hasHardQuotaSignal = hasStructuredData
        ? HARD_QUOTA_SIGNALS.includes(providerCode)
        : HARD_QUOTA_SIGNALS.some((signal) => lower.includes(signal));

    // Ambiguous quota signals — on a 429 these default to rate_limited
    const SOFT_QUOTA_SIGNALS = [
        'quota_exceeded',
        'quota exceeded',
        'credit balance too low',
        'credit balance is too low',
        'credits exhausted',
        'credits are exhausted',
        'usage limit reached',
        'monthly budget exceeded'
    ];
    const hasSoftQuotaSignal = hasStructuredData
        ? SOFT_QUOTA_SIGNALS.includes(providerCode)
        : containsAny(lower, SOFT_QUOTA_SIGNALS);

    const hasRateLimitSignal = containsAny(lower, [
        'too many requests',
        'rate limit',
        'rate_limit',
        'rate-limited',
        'requests rate limit exceeded',
        'resource_exhausted'
    ]);

    const hasBillingSignal = containsAny(lower, [
        'payment required',
        'plan inactive',
        'billing_not_active',
        'account_not_active'
    ]);

    const diagnostics = {
        provider_code: toText(error?.provider_code || ''),
        provider_message: toText(error?.provider_message || ''),
        raw_body: rawBody
    };

    const classify = (code) => {
        // Log raw provider data + final decision for debugging
        if (typeof console?.warn === 'function') {
            console.warn(
                '[eVe:ai] normalizeAiProviderError',
                JSON.stringify({
                    classified_as: code,
                    raw_message: raw,
                    http_status: httpStatus,
                    provider_code: providerCode,
                    provider_message: providerMessage,
                    has_structured_data: hasStructuredData,
                    flags: {
                        isHttp429,
                        isHttp402,
                        hasHardQuotaSignal,
                        hasSoftQuotaSignal,
                        hasRateLimitSignal,
                        hasBillingSignal
                    }
                })
            );
        }
        return code;
    };

    if (!raw || lower === 'provider_timeout' || lower.includes('timeout') || lower.includes('aborted')) {
        return {
            code: classify('provider_timeout'),
            message: raw || 'provider_timeout',
            user_message: "L'IA ne repond pas.",
            ...diagnostics
        };
    }

    if (lower.includes('no_ai_key_configured') || lower.includes('no_keys') || lower.includes('no_profile')) {
        return {
            code: classify('no_ai_key_configured'),
            message: raw,
            user_message: "Aucune cle IA n'est configuree.",
            ...diagnostics
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
            code: classify('provider_auth_failed'),
            message: raw,
            user_message: "L'IA ne repond pas.",
            ...diagnostics
        };
    }

    // Hard quota signals — truly explicit, even on 429
    if (hasHardQuotaSignal) {
        return {
            code: classify('provider_quota_exceeded'),
            message: raw,
            user_message: "L'IA a atteint sa limite de quota ou de credits.",
            ...diagnostics
        };
    }

    // 429 or rate-limit signal — even if soft/ambiguous quota keywords appear
    if (isHttp429 || hasRateLimitSignal) {
        return {
            code: classify('provider_rate_limited'),
            message: raw,
            user_message: "L'IA est temporairement limitee.",
            ...diagnostics
        };
    }

    // Soft quota signals WITHOUT 429 — likely genuine quota exhaustion
    if (hasSoftQuotaSignal) {
        return {
            code: classify('provider_quota_exceeded'),
            message: raw,
            user_message: "L'IA a atteint sa limite de quota ou de credits.",
            ...diagnostics
        };
    }

    if (isHttp402 || hasBillingSignal) {
        return {
            code: classify('provider_billing_issue'),
            message: raw,
            user_message: "L'acces API de l'IA est bloque par un probleme de facturation ou de configuration.",
            ...diagnostics
        };
    }

    if (lower.includes('invalid_json')) {
        return {
            code: classify('provider_invalid_response'),
            message: raw,
            user_message: "L'IA ne repond pas.",
            ...diagnostics
        };
    }

    return {
        code: classify('provider_unreachable'),
        message: raw,
        user_message: "L'IA ne repond pas.",
        ...diagnostics
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
    signal = null,
    preferLocalProxy
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
        if (shouldUseLocalAiProxy({ preferLocalProxy })) {
            return await requestViaLocalAiProxy({
                provider,
                model: toText(model) || provider.models?.[0] || '',
                prompt,
                apiKey: toText(apiKey),
                systemPrompt,
                fetchImpl,
                signal: merged.signal,
                timeoutMs
            });
        }

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
    const completion = await requestProviderCompletion(options);
    const text = toText(completion?.text);
    const parsed = extractJsonResponse(text);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('invalid_json_response');
    }
    return {
        text,
        parsed,
        usage: normalizeUsage(completion?.usage || {})
    };
};
