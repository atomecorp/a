import {
    AI_MODEL_PROVIDER_LIST,
    AI_MODEL_PROVIDER_REGISTRY
} from './model_catalog_registry.js';
import { loadRuntimeUserProfile } from './profile_loader.js';
import {
    DEFAULT_TIMEOUT_MS,
    toText,
    normalizeUsage,
    withMergedSignal,
    shouldUseLocalAiProxy,
    requestViaLocalAiProxy,
    requestOpenAiStyle,
    requestAnthropic,
    requestGoogle
} from './provider_client_transport.js';

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

const containsAny = (haystack = '', needles = []) => needles.some((needle) => haystack.includes(needle));

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
    loadProfile = loadRuntimeUserProfile
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

    const classify = (code) => code;

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
