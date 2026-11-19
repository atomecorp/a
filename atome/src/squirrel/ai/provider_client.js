import {
    AI_MODEL_PROVIDER_REGISTRY
} from './model_catalog_registry.js';
import { loadRuntimeUserProfile } from './profile_loader.js';
import { requestProviderService } from './provider_broker.js';
import { requireAssistantEngine } from './assistant_engine.js';
import { normalizeAssistantPreferences } from '../voice/wake_preferences.js';
import {
    DEFAULT_TIMEOUT_MS,
    toText,
    normalizeUsage,
    withMergedSignal
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

const containsAny = (haystack = '', needles = []) => needles.some((needle) => haystack.includes(needle));

export const aiProviderVaultEntryId = ({ userId, providerId } = {}) => {
    const principal = toText(userId);
    const provider = toText(providerId).toLowerCase();
    if (!principal) throw new Error('ai_profile_user_id_missing');
    if (!AI_PROVIDER_DEFINITIONS[provider]) throw new Error('unknown_provider');
    return `ai.provider.${encodeURIComponent(principal)}.${provider}`;
};

// The OpenAI key lives in the account's server-side provider entry; a key an earlier
// version left on this device joins it when the profile loads (device_secret_transfer).
export const resolveOpenAiCredentialStatus = async ({
    userId, providerRequest = requestProviderService
} = {}) => {
    aiProviderVaultEntryId({ userId, providerId: 'openai' });
    const status = await providerRequest('credential.status', {}, { expectedPrincipal: userId });
    if (typeof status?.configured !== 'boolean') throw new Error('provider_credential_status_invalid');
    return status;
};

// The account's AI access: OpenAI's platform key, held by the server. A key a person stored
// earlier for another provider stays in their vault, unused: every provider is reached through
// atome-server on the platform's keys (R-120).
export const resolveConfiguredAiProviderCredentials = async ({
    loadProfile = loadRuntimeUserProfile,
    providerRequest = requestProviderService
} = {}) => {
    const profileResult = await loadProfile();
    if (!profileResult?.ok) {
        return { ok: false, error: toText(profileResult?.error) || 'no_profile', items: [] };
    }
    const userId = toText(profileResult.userId || profileResult.user_id);
    if (!userId) return { ok: false, error: 'ai_profile_user_id_missing', items: [] };
    const metadata = Array.isArray(profileResult?.profile?.passkeys?.keys)
        ? profileResult.profile.passkeys.keys
        : [];
    const entry = metadata.find((item) => toText(item?.provider).toLowerCase() === 'openai');
    const activeProviderIds = entry?.active === true ? ['openai'] : [];
    if (!entry) return { ok: true, userId, items: [], activeProviderIds };
    let status;
    try { status = await resolveOpenAiCredentialStatus({ userId, providerRequest }); }
    catch (error) { return { ok: true, userId, items: [], activeProviderIds, errors: { openai: error.message } }; }
    const items = status.configured ? [{
        providerId: 'openai', active: entry.active === true, provider: AI_PROVIDER_DEFINITIONS.openai,
        model: toText(entry.model) || AI_PROVIDER_DEFINITIONS.openai.models[0],
        entryId: aiProviderVaultEntryId({ userId, providerId: 'openai' }), serverManaged: true
    }] : [];
    return { ok: true, userId, items, activeProviderIds, errors: {} };
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

export const resolveActiveAiProviderConfig = async ({
    loadProfile = loadRuntimeUserProfile,
    providerRequest = requestProviderService
} = {}) => {
    const resolved = await resolveConfiguredAiProviderCredentials({ loadProfile, providerRequest });
    if (!resolved?.ok) return { ok: false, error: resolved?.error || 'no_ai_key_configured' };
    const activeProviderIds = Array.isArray(resolved.activeProviderIds) ? resolved.activeProviderIds : [];
    if (activeProviderIds.length > 1) return { ok: false, error: 'ai_active_provider_ambiguous' };
    if (!activeProviderIds.length) return { ok: false, error: 'no_active_ai_provider' };
    const entry = resolved.items.find((item) => item.active === true);
    if (!entry) return { ok: false, providerId: activeProviderIds[0], error: resolved.errors?.[activeProviderIds[0]] || 'ai_active_provider_key_missing' };
    return {
        ok: true,
        ...entry,
        source: 'profile.passkeys.keys.active+server_vault'
    };
};

export const normalizeAiProviderError = (error) => {
    const raw = toText(error?.message || error);
    const lower = raw.toLowerCase();

    // Structured data from createProviderHttpError, falls back to string parsing
    const httpStatus = error?.http_status || null;
    const providerCode = toText(error?.provider_code || '').toLowerCase();
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
        'hard_limit_reached',
        'exceeded your current quota'
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
            user_message: "Le fournisseur IA n'a pas répondu en 20 secondes. Vérifie la connexion puis réessaie.",
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
            user_message: "La clé IA configurée a été refusée. Vérifie le fournisseur actif et sa clé.",
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
            user_message: "Le fournisseur IA a renvoyé une réponse invalide. Réessaie ou choisis un autre modèle.",
            ...diagnostics
        };
    }

    return {
        code: classify('provider_unreachable'),
        message: raw,
        user_message: "Le fournisseur IA est inaccessible. Vérifie le réseau et sa configuration.",
        ...diagnostics
    };
};

// The one code a failed assistant request is told by. A code names its cause and
// stays itself (`insufficient_quota` is the person's own key credit,
// `provider_shared_quota_exceeded` eVe's shared credit); a raw text (a transport
// or runtime exception) is classified once here; a failure with no cause at all
// is `provider_cause_missing`.
const FAILURE_CODE = /^[A-Za-z][A-Za-z0-9_]*$/;
export const providerFailureCode = (error) => {
    const message = toText(error?.message ?? error);
    if (!message) return 'provider_cause_missing';
    return FAILURE_CODE.test(message) ? message : normalizeAiProviderError(error).code;
};

// A text answer from atome-server's `chat` (R-120): the server picks the model among the
// platform's (Not Diamond, weighed by the person's « Économie ↔ Qualité »), reserves and pays it on
// the ledger. No provider is ever reached from the client.
export const requestProviderCompletion = async ({
    prompt,
    systemPrompt = '',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal = null,
    env = globalThis,
    providerRequest = requestProviderService
} = {}) => {
    requireAssistantEngine(env);
    const merged = withMergedSignal({ signal, timeoutMs });
    try {
        const data = await providerRequest('chat', {
            instructions: String(systemPrompt || ''),
            input: String(prompt || ''),
            tradeoff: normalizeAssistantPreferences(env?.__eveProfilePreferences?.assistant).tradeoff
        }, { signal: merged.signal });
        if (typeof data?.text !== 'string') throw new Error('provider_invalid_response');
        return { text: data.text, provider: data.provider, model: data.model, usage: normalizeUsage(data.usage) };
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
        provider: completion.provider,
        model: completion.model,
        usage: normalizeUsage(completion?.usage || {})
    };
};

// The assistant's conversation (Responses with its tools) on atome-server; execution still passes
// through the conversation's canonical MCP policies and confirmations.
export const requestConversationResponse = async (action, payload, options = {}) => {
    options.signal?.throwIfAborted();
    return requestProviderService(action, payload, options);
};
