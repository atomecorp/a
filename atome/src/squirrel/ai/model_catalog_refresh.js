import {
    AI_MODEL_CATALOG_TTL_MS,
    buildModelCatalogCacheRecord,
    getEmbeddedModelCatalogPayload,
    readModelCatalogCache,
    writeModelCatalogCache
} from './model_catalog_cache.js';
import {
    AI_MODEL_PROVIDER_REGISTRY,
    getAiModelProviderDefinition
} from './model_catalog_registry.js';
import { loadRuntimeUserProfile } from './profile_loader.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
const BOOTSTRAP_KEY = '__EVE_AI_MODEL_CATALOG_REFRESH__';

const toText = (value) => String(value || '').trim();

const clone = (value) => JSON.parse(JSON.stringify(value));

const unique = (items = []) => Array.from(new Set(items.map((item) => toText(item)).filter(Boolean)));

const createTimeoutController = (timeoutMs) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== 'function') {
        return { controller: null, clear: () => {} };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('model_catalog_timeout'), timeoutMs);
    return {
        controller,
        clear() {
            clearTimeout(timer);
        }
    };
};

const normalizeListedModelId = (value) => {
    const text = toText(value);
    if (!text) return '';
    return text.replace(/^models\//i, '').trim();
};

const shouldKeepModel = (modelId, filter = {}) => {
    const normalized = toText(modelId).toLowerCase();
    if (!normalized) return false;
    if (filter.exclude_preview !== false && (normalized.includes('preview') || normalized.includes('experimental'))) {
        return false;
    }
    if (filter.exclude_deprecated !== false && (normalized.includes('deprecated') || normalized.includes('deprecation'))) {
        return false;
    }
    const excludedModalities = Array.isArray(filter.exclude_modalities) ? filter.exclude_modalities : [];
    if (excludedModalities.some((token) => normalized.includes(String(token).toLowerCase()))) {
        return false;
    }
    return true;
};

const sortModels = (models = [], definition = null) => {
    const recommended = Array.isArray(definition?.recommended_models) ? definition.recommended_models : [];
    const fallback = Array.isArray(definition?.fallback_models) ? definition.fallback_models : [];
    const recommendedIndex = new Map(recommended.map((model, index) => [String(model), index]));
    const fallbackIndex = new Map(fallback.map((model, index) => [String(model), index]));
    return [...models].sort((left, right) => {
        const leftRecommended = recommendedIndex.has(left);
        const rightRecommended = recommendedIndex.has(right);
        if (leftRecommended && rightRecommended) return recommendedIndex.get(left) - recommendedIndex.get(right);
        if (leftRecommended) return -1;
        if (rightRecommended) return 1;
        const leftFallback = fallbackIndex.has(left);
        const rightFallback = fallbackIndex.has(right);
        if (leftFallback && rightFallback) return fallbackIndex.get(left) - fallbackIndex.get(right);
        if (leftFallback) return 1;
        if (rightFallback) return -1;
        return String(left).localeCompare(String(right));
    });
};

export const resolveConfiguredAiProviderKeys = async ({
    loadProfile = loadRuntimeUserProfile
} = {}) => {
    const profileResult = await loadProfile();
    if (!profileResult?.ok) {
        return {
            ok: false,
            error: toText(profileResult?.error) || 'no_profile',
            items: []
        };
    }

    const keys = Array.isArray(profileResult?.profile?.passkeys?.keys)
        ? profileResult.profile.passkeys.keys
        : [];

    return {
        ok: true,
        items: keys
            .map((entry) => ({
                provider: toText(entry?.provider).toLowerCase(),
                model: toText(entry?.model),
                apiKey: toText(entry?.key)
            }))
            .filter((entry) => entry.provider && entry.apiKey && getAiModelProviderDefinition(entry.provider))
    };
};

const listOpenAiStyleModels = async ({
    definition,
    apiKey,
    fetchImpl,
    signal
} = {}) => {
    const response = await fetchImpl(definition.list_models_endpoint, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        },
        ...(signal ? { signal } : {})
    });
    if (!response.ok) {
        throw new Error(`list_models_http_${response.status}`);
    }
    const data = await response.json();
    return unique((Array.isArray(data?.data) ? data.data : []).map((item) => normalizeListedModelId(item?.id)));
};

const listAnthropicModels = async ({
    definition,
    apiKey,
    fetchImpl,
    signal
} = {}) => {
    const response = await fetchImpl(definition.list_models_endpoint, {
        method: 'GET',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        ...(signal ? { signal } : {})
    });
    if (!response.ok) {
        throw new Error(`list_models_http_${response.status}`);
    }
    const data = await response.json();
    return unique((Array.isArray(data?.data) ? data.data : []).map((item) => normalizeListedModelId(item?.id)));
};

const listGoogleModels = async ({
    definition,
    apiKey,
    fetchImpl,
    signal
} = {}) => {
    const endpoint = `${definition.list_models_endpoint}?key=${encodeURIComponent(apiKey)}`;
    const response = await fetchImpl(endpoint, {
        method: 'GET',
        ...(signal ? { signal } : {})
    });
    if (!response.ok) {
        throw new Error(`list_models_http_${response.status}`);
    }
    const data = await response.json();
    return unique((Array.isArray(data?.models) ? data.models : []).map((item) => normalizeListedModelId(item?.name)));
};

export const listRemoteProviderModels = async ({
    providerId,
    apiKey,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
    const definition = getAiModelProviderDefinition(providerId);
    if (!definition) {
        throw new Error('unknown_provider');
    }
    if (typeof fetchImpl !== 'function') {
        throw new Error('provider_fetch_unavailable');
    }
    const merged = createTimeoutController(timeoutMs);
    try {
        let models = [];
        if (definition.request_type === 'anthropic') {
            models = await listAnthropicModels({
                definition,
                apiKey: toText(apiKey),
                fetchImpl,
                signal: merged.controller?.signal || null
            });
        } else if (definition.request_type === 'google') {
            models = await listGoogleModels({
                definition,
                apiKey: toText(apiKey),
                fetchImpl,
                signal: merged.controller?.signal || null
            });
        } else {
            models = await listOpenAiStyleModels({
                definition,
                apiKey: toText(apiKey),
                fetchImpl,
                signal: merged.controller?.signal || null
            });
        }
        return sortModels(
            models.filter((model) => shouldKeepModel(model, definition.filter)),
            definition
        );
    } finally {
        merged.clear();
    }
};

const buildCatalogItem = ({
    definition,
    detectedModels = [],
    source = 'remote',
    error = '',
    stale = false
} = {}) => {
    const detected = unique(detectedModels);
    return {
        provider: definition.id,
        label: definition.label,
        recommended_models: [...definition.recommended_models],
        fallback_models: [...definition.fallback_models],
        detected_models: detected,
        models: sortModels(unique([
            ...definition.recommended_models,
            ...detected,
            ...definition.fallback_models
        ]), definition),
        source,
        stale,
        error: toText(error)
    };
};

export const refreshAiModelCatalog = async ({
    storage = null,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    loadProfile = loadRuntimeUserProfile,
    now = () => new Date().toISOString()
} = {}) => {
    const configured = await resolveConfiguredAiProviderKeys({ loadProfile });
    const configuredByProvider = new Map((configured.items || []).map((entry) => [entry.provider, entry]));
    const items = [];

    for (const definition of Object.values(AI_MODEL_PROVIDER_REGISTRY)) {
        const configuredEntry = configuredByProvider.get(definition.id);
        if (!configuredEntry?.apiKey) {
            items.push(buildCatalogItem({
                definition,
                detectedModels: [],
                source: 'embedded',
                error: 'no_api_key'
            }));
            continue;
        }
        try {
            const detectedModels = await listRemoteProviderModels({
                providerId: definition.id,
                apiKey: configuredEntry.apiKey,
                fetchImpl
            });
            items.push(buildCatalogItem({
                definition,
                detectedModels,
                source: 'remote'
            }));
        } catch (error) {
            items.push(buildCatalogItem({
                definition,
                detectedModels: [],
                source: 'embedded',
                error: toText(error?.message || error),
                stale: true
            }));
        }
    }

    const payload = buildModelCatalogCacheRecord({
        items,
        refreshedAt: toText(now?.()) || new Date().toISOString(),
        source: 'refresh'
    });
    writeModelCatalogCache({ storage, payload });
    return {
        ok: true,
        stale: false,
        payload: clone(payload)
    };
};

export const ensureFreshAiModelCatalog = async ({
    storage = null,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    loadProfile = loadRuntimeUserProfile,
    force = false,
    now = () => new Date().toISOString()
} = {}) => {
    const cached = readModelCatalogCache({ storage });
    if (!force && cached.ok === true && cached.stale === false) {
        return cached;
    }
    return refreshAiModelCatalog({
        storage,
        fetchImpl,
        loadProfile,
        now
    });
};

export const bootstrapAiModelCatalogRefresh = ({
    env = (typeof window !== 'undefined' ? window : globalThis),
    storage = env?.localStorage || null,
    fetchImpl = env?.fetch?.bind(env),
    loadProfile = loadRuntimeUserProfile,
    intervalMs = REFRESH_INTERVAL_MS
} = {}) => {
    if (!env || typeof env !== 'object') return null;
    if (env[BOOTSTRAP_KEY]) return env[BOOTSTRAP_KEY];

    let running = false;
    const run = async ({ force = false } = {}) => {
        if (running) return null;
        running = true;
        try {
            return await ensureFreshAiModelCatalog({
                storage,
                fetchImpl,
                loadProfile,
                force
            });
        } finally {
            running = false;
        }
    };

    void run();

    let intervalId = 0;
    if (typeof env.setInterval === 'function' && Number.isFinite(Number(intervalMs)) && Number(intervalMs) > 0) {
        intervalId = env.setInterval(() => {
            void run();
        }, Number(intervalMs));
    }

    const visibilityHandler = () => {
        if (env.document?.visibilityState === 'visible') {
            void run();
        }
    };
    env.document?.addEventListener?.('visibilitychange', visibilityHandler);

    env[BOOTSTRAP_KEY] = {
        run,
        destroy() {
            if (intervalId && typeof env.clearInterval === 'function') {
                env.clearInterval(intervalId);
            }
            env.document?.removeEventListener?.('visibilitychange', visibilityHandler);
            delete env[BOOTSTRAP_KEY];
        }
    };
    return env[BOOTSTRAP_KEY];
};

export const getEmbeddedAiModelCatalog = () => getEmbeddedModelCatalogPayload();
