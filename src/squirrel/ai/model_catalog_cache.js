import {
    AI_MODEL_PROVIDER_REGISTRY,
    listAiModelProviders
} from './model_catalog_registry.js';

const STORAGE_KEY = 'eve_ai_model_catalog_cache_v1';
export const AI_MODEL_CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

const toText = (value) => String(value || '').trim();

const clone = (value) => JSON.parse(JSON.stringify(value));

const isStorageLike = (value) => !!(
    value
    && typeof value.getItem === 'function'
    && typeof value.setItem === 'function'
);

const resolveStorage = (storage = null) => {
    if (isStorageLike(storage)) return storage;
    if (typeof globalThis !== 'undefined' && isStorageLike(globalThis.localStorage)) {
        return globalThis.localStorage;
    }
    return null;
};

const buildEmbeddedCatalogItems = () => {
    const providers = listAiModelProviders();
    return providers.map((entry) => {
        const definition = AI_MODEL_PROVIDER_REGISTRY[entry.id];
        return {
            provider: entry.id,
            label: entry.label,
            recommended_models: [...(definition?.recommended_models || [])],
            fallback_models: [...(definition?.fallback_models || [])],
            detected_models: [],
            models: [...entry.models],
            source: 'embedded',
            stale: false,
            error: ''
        };
    });
};

const buildEmbeddedPayload = () => ({
    version: 1,
    refreshed_at: '',
    expires_at: '',
    ttl_ms: AI_MODEL_CATALOG_TTL_MS,
    source: 'embedded',
    items: buildEmbeddedCatalogItems()
});

const sanitizeEntry = (entry = {}) => ({
    provider: toText(entry.provider),
    label: toText(entry.label),
    recommended_models: Array.isArray(entry.recommended_models) ? entry.recommended_models.map((item) => toText(item)).filter(Boolean) : [],
    fallback_models: Array.isArray(entry.fallback_models) ? entry.fallback_models.map((item) => toText(item)).filter(Boolean) : [],
    detected_models: Array.isArray(entry.detected_models) ? entry.detected_models.map((item) => toText(item)).filter(Boolean) : [],
    models: Array.isArray(entry.models) ? entry.models.map((item) => toText(item)).filter(Boolean) : [],
    source: toText(entry.source) || 'embedded',
    stale: entry.stale === true,
    error: toText(entry.error)
});

const sanitizePayload = (payload = {}) => {
    const items = Array.isArray(payload.items) ? payload.items.map((entry) => sanitizeEntry(entry)).filter((entry) => entry.provider) : [];
    return {
        version: Number.isFinite(Number(payload.version)) ? Number(payload.version) : 1,
        refreshed_at: toText(payload.refreshed_at),
        expires_at: toText(payload.expires_at),
        ttl_ms: Number.isFinite(Number(payload.ttl_ms)) ? Number(payload.ttl_ms) : AI_MODEL_CATALOG_TTL_MS,
        source: toText(payload.source) || 'embedded',
        items
    };
};

const readRawPayload = (storage) => {
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw) return null;
        return sanitizePayload(JSON.parse(raw));
    } catch (_) {
        return null;
    }
};

const writeRawPayload = (storage, payload) => {
    try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(sanitizePayload(payload)));
        return true;
    } catch (_) {
        return false;
    }
};

export const buildModelCatalogCacheRecord = ({
    items = [],
    refreshedAt = new Date().toISOString(),
    ttlMs = AI_MODEL_CATALOG_TTL_MS,
    source = 'remote'
} = {}) => {
    const refreshedTime = Date.parse(refreshedAt);
    const ttl = Number.isFinite(Number(ttlMs)) ? Math.max(1, Number(ttlMs)) : AI_MODEL_CATALOG_TTL_MS;
    const expiresAt = Number.isFinite(refreshedTime)
        ? new Date(refreshedTime + ttl).toISOString()
        : '';
    return sanitizePayload({
        version: 1,
        refreshed_at: toText(refreshedAt),
        expires_at: expiresAt,
        ttl_ms: ttl,
        source,
        items
    });
};

export const readModelCatalogCache = ({
    storage = null
} = {}) => {
    const resolvedStorage = resolveStorage(storage);
    const embedded = buildEmbeddedPayload();
    const cached = resolvedStorage ? readRawPayload(resolvedStorage) : null;
    if (!cached || !Array.isArray(cached.items) || cached.items.length === 0) {
        return {
            ok: true,
            source: 'embedded',
            stale: false,
            payload: clone(embedded)
        };
    }
    const expiresAt = Date.parse(cached.expires_at || '');
    const stale = Number.isFinite(expiresAt) ? expiresAt <= Date.now() : true;
    return {
        ok: true,
        source: cached.source || 'cache',
        stale,
        payload: clone({
            ...cached,
            items: cached.items.map((entry) => ({
                ...entry,
                stale: stale || entry.stale === true
            }))
        })
    };
};

export const writeModelCatalogCache = ({
    storage = null,
    payload
} = {}) => {
    const resolvedStorage = resolveStorage(storage);
    if (!resolvedStorage) return false;
    return writeRawPayload(resolvedStorage, payload);
};

export const getEmbeddedModelCatalogPayload = () => clone(buildEmbeddedPayload());
