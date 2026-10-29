import { getSessionState } from '../apis/unified/adole_api/session.js';
import {
    buildModelCatalogCacheRecord,
    readModelCatalogCache,
    writeModelCatalogCache
} from './model_catalog_cache.js';
import {
    AI_MODEL_PROVIDER_REGISTRY, listAiKeyProviders,
    getAiModelProviderDefinition
} from './model_catalog_registry.js';
import { loadRuntimeUserProfile } from './profile_loader.js';
import { whenBackgroundAllowed } from '../shared/background_work.js';
import { resolveConfiguredAiProviderCredentials } from './provider_client.js';
import { cloneJson as clone, toText } from '../shared/scalars.js';
import { requestProviderService } from './provider_broker.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
const BOOTSTRAP_KEY = '__EVE_AI_MODEL_CATALOG_REFRESH__';



const unique = (items = []) => Array.from(new Set(items.map((item) => toText(item)).filter(Boolean)));

const createTimeoutController = (timeoutMs) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = DEFAULT_TIMEOUT_MS;
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

export const resolveConfiguredAiProviderKeys = async (options = {}) => {
    const resolved = await resolveConfiguredAiProviderCredentials(options);
    return {
        ...resolved,
        items: (resolved.items || []).map((entry) => ({
            provider: entry.providerId,
            model: entry.model,
            apiKey: entry.apiKey,
            serverManaged: entry.serverManaged === true
        }))
    };
};

export const listRemoteProviderModels = async ({
    providerId, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS,
    providerRequest = requestProviderService, expectedPrincipal = null
} = {}) => {
    const definition = getAiModelProviderDefinition(providerId);
    if (!definition) throw new Error('unknown_provider');
    const { controller, clear } = createTimeoutController(timeoutMs);
    try {
        const result = await bound(Promise.resolve(providerRequest('models', {
            provider: definition.id, ...(definition.id === 'openai' ? {} : { key: toText(apiKey) })
        }, { signal: controller.signal, expectedPrincipal })), controller.signal);
        if (!Array.isArray(result?.data)) throw new Error('provider_catalog_response_invalid');
        return sortModels(unique(result.data.map(item => normalizeListedModelId(item.id)))
            .filter(model => shouldKeepModel(model, definition.filter)), definition);
    } finally { clear(); }
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
        models: source === 'remote'
            ? sortModels(detected, definition)
            : sortModels(unique([
                ...definition.recommended_models,
                ...definition.fallback_models
            ]), definition),
        source,
        stale,
        error: toText(error)
    };
};

const providerJobs = new WeakMap();
const catalogDefinitions = () => listAiKeyProviders().map(provider => getAiModelProviderDefinition(provider.id) || {
    ...provider, recommended_models: [], fallback_models: [], refresh_strategy: 'unavailable'
});
const jobsFor = scope => {
    if (!providerJobs.has(scope)) providerJobs.set(scope, new Map());
    return providerJobs.get(scope);
};
const bound = (promise, signal) => new Promise((resolve, reject) => {
    const aborted = () => reject(new Error('provider_catalog_timeout'));
    if (signal.aborted) return aborted();
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
});

export const refreshAiModelCatalog = async ({
    storage = null, fetchImpl, loadProfile = loadRuntimeUserProfile,
    securityApi = null, providerRequest = requestProviderService,
    env = globalThis, now = () => new Date().toISOString(),
    providers = null, invalidate = false, timeoutMs = DEFAULT_TIMEOUT_MS,
    principal = () => getSessionState()?.user?.id || null
} = {}) => {
    const profile = await loadProfile();
    const userId = toText(profile?.userId || profile?.user_id);
    if (!profile?.ok || !userId) return { ok: false, error: 'ai_profile_user_id_missing' };
    const owner = principal();
    if (owner && owner !== userId) return { ok: false, error: 'provider_principal_changed' };
    const current = () => !owner || principal() === owner;
    const jobs = jobsFor(storage || env);
    const selected = catalogDefinitions().filter(def => !providers || providers.includes(def.id));
    const metadata = profile.profile?.passkeys?.keys || [];
    const results = await Promise.all(selected.map(definition => {
        const jobKey = `${userId}:${definition.id}`;
        const priorJob = jobs.get(jobKey);
        if (priorJob && !invalidate) return priorJob.promise;
        priorJob?.controller.abort();
        const { controller, clear } = createTimeoutController(timeoutMs);
        const job = { controller, promise: null };
        const request = (action, payload, options = {}) => providerRequest(action, payload,
            { ...options, expectedPrincipal: userId, signal: controller.signal });
        let configured = null;
        const run = async () => {
            if (definition.refresh_strategy === 'unavailable') {
                const status = await request('credential.status', { provider: definition.id });
                if (typeof status?.configured !== 'boolean') throw new Error('provider_credential_status_invalid');
                configured = status.configured;
                throw new Error(configured ? 'provider_catalog_unavailable' : 'no_api_key');
            }
            const credential = await resolveConfiguredAiProviderKeys({ securityApi, env, providerRequest: request,
                loadProfile: async () => ({ ...profile, profile: { ...profile.profile, passkeys: {
                    ...profile.profile?.passkeys, keys: [metadata.find(item => item.provider === definition.id) || { provider: definition.id }]
                } } }) });
            const entry = credential.items?.[0];
            if (!entry) throw new Error(credential.errors?.[definition.id] || credential.error || 'no_api_key');
            configured = true;
            const models = await listRemoteProviderModels({ providerId: definition.id, apiKey: entry.apiKey,
                providerRequest: request, timeoutMs, expectedPrincipal: userId });
            return { ...buildCatalogItem({ definition, detectedModels: models }), configured,
                verification: 'verified', checked_at: toText(now()), last_success_at: toText(now()),
                credential_verification: 'verified', credential_checked_at: toText(now()) };
        };
        job.promise = Promise.resolve().then(async () => {
            let item;
            try { item = await bound(run(), controller.signal); }
            catch (error) {
                const previous = readModelCatalogCache({ storage, userId }).payload.items.find(entry => entry.provider === definition.id);
                const code = /^(provider_|no_api_key|ai_vault_)|^(invalid_api_key|authentication_error|permission_denied|rate_limit_exceeded|insufficient_quota)$/.test(error?.message || '') ? error.message : 'provider_catalog_failed';
                item = { ...buildCatalogItem({ definition, detectedModels: previous?.detected_models,
                    source: previous?.source === 'remote' ? 'remote' : 'embedded', error: code, stale: true }),
                    configured: code === 'no_api_key' ? false : configured ?? previous?.configured ?? null,
                    verification: code === 'no_api_key' ? 'missing' : 'unavailable',
                    checked_at: toText(now()), last_success_at: previous?.last_success_at || '',
                    credential_verification: configured !== null || code === 'no_api_key' ? 'verified' : 'unavailable',
                    credential_checked_at: configured !== null || code === 'no_api_key' ? toText(now()) : previous?.credential_checked_at || '' };
            }
            if (!current() || jobs.get(jobKey) !== job) return null;
            // Each provider publishes independently; a slow sibling cannot delay this cache.
            const latest = readModelCatalogCache({ storage, userId }).payload.items;
            const items = latest.some(entry => entry.provider === item.provider)
                ? latest.map(entry => entry.provider === item.provider ? item : entry) : [...latest, item];
            const payload = buildModelCatalogCacheRecord({ items, refreshedAt: toText(now()), source: 'refresh' });
            return { item, cacheSaved: writeModelCatalogCache({ storage, payload, userId }) };
        }).finally(() => { clear(); if (jobs.get(jobKey) === job) jobs.delete(jobKey); });
        jobs.set(jobKey, job);
        return job.promise;
    }));
    if (!current()) return { ok: false, error: 'provider_principal_changed' };
    const cached = readModelCatalogCache({ storage, userId });
    const cacheSaved = results.every(result => !result || result.cacheSaved);
    return { ok: cacheSaved, error: cacheSaved ? '' : 'model_catalog_cache_write_failed',
        stale: results.some(result => result?.item?.stale), payload: clone(cached.payload) };
};

export const ensureFreshAiModelCatalog = async ({
    storage = null,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    loadProfile = loadRuntimeUserProfile,
    securityApi = null, providerRequest = requestProviderService,
    env = globalThis,
    force = false,
    now = () => new Date().toISOString()
} = {}) => {
    const profile = await loadProfile();
    const cached = readModelCatalogCache({ storage, userId: profile?.userId || profile?.user_id });
    if (!force && cached.ok === true && cached.source !== 'embedded' && cached.stale === false) {
        return cached;
    }
    return refreshAiModelCatalog({
        storage,
        fetchImpl,
        loadProfile: async () => profile,
        securityApi, providerRequest,
        env,
        now
    });
};

export const bootstrapAiModelCatalogRefresh = ({
    env = (typeof window !== 'undefined' ? window : globalThis),
    storage = env?.localStorage || null,
    fetchImpl = env?.fetch?.bind(env),
    loadProfile = loadRuntimeUserProfile,
    securityApi = null, providerRequest = requestProviderService,
    intervalMs = REFRESH_INTERVAL_MS
} = {}) => {
    if (!env || typeof env !== 'object') return null;
    if (env[BOOTSTRAP_KEY]) return env[BOOTSTRAP_KEY];

    let running = false;
    const run = async ({ force = false } = {}) => {
        if (running) return null;
        running = true;
        try {
            // A background refresh (launch, interval): it asks every provider at once.
            await whenBackgroundAllowed();
            return await ensureFreshAiModelCatalog({
                storage,
                fetchImpl,
                loadProfile,
                securityApi, providerRequest,
                env,
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
