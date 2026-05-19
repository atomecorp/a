import assert from 'node:assert/strict';

import {
    bootstrapAiModelCatalogRefresh,
    ensureFreshAiModelCatalog,
    listRemoteProviderModels,
    refreshAiModelCatalog,
    resolveConfiguredAiProviderKeys
} from './model_catalog_refresh.js';
import { AI_MODEL_CATALOG_TTL_MS } from './model_catalog_cache.js';

const createStorage = () => {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        }
    };
};

const configured = await resolveConfiguredAiProviderKeys({
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'google', model: 'gemini-2.5-flash', key: 'google-key' },
                        { provider: 'openai', model: 'gpt-5.1', key: 'openai-key' }
                    ]
                }
            }
        };
    }
});
assert.equal(configured.ok, true, 'model catalog refresh should resolve configured provider keys');
assert.equal(configured.items.length, 2, 'model catalog refresh should keep all configured providers with keys');

const googleModels = await listRemoteProviderModels({
    providerId: 'google',
    apiKey: 'google-key',
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return {
                models: [
                    { name: 'models/gemini-2.5-flash' },
                    { name: 'models/gemini-2.5-pro-preview' },
                    { name: 'models/gemini-2.5-pro' }
                ]
            };
        }
    })
});
assert.deepEqual(
    googleModels,
    ['gemini-2.5-pro', 'gemini-2.5-flash'],
    'model catalog refresh should normalize and filter provider model lists'
);

const storage = createStorage();
const refreshedAt = '2026-03-14T12:00:00.000Z';
const refreshResult = await refreshAiModelCatalog({
    storage,
    now: () => refreshedAt,
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'openai', model: 'gpt-5.1', key: 'openai-key' },
                        { provider: 'deepseek', model: 'deepseek-chat', key: 'deepseek-key' }
                    ]
                }
            }
        };
    },
    fetchImpl: async (url) => {
        if (String(url).includes('openai.com')) {
            return {
                ok: true,
                async json() {
                    return {
                        data: [
                            { id: 'gpt-5.1' },
                            { id: 'gpt-5-mini' },
                            { id: 'gpt-5-preview' }
                        ]
                    };
                }
            };
        }
        if (String(url).includes('deepseek.com')) {
            return {
                ok: true,
                async json() {
                    return {
                        data: [
                            { id: 'deepseek-chat' },
                            { id: 'deepseek-reasoner' }
                        ]
                    };
                }
            };
        }
        return {
            ok: false,
            status: 401,
            async json() {
                return {};
            }
        };
    }
});
assert.equal(refreshResult.ok, true, 'model catalog refresh should refresh and persist provider catalogs');
assert.equal(refreshResult.payload.refreshed_at, refreshedAt, 'model catalog refresh should stamp refresh time');
assert.equal(
    Date.parse(refreshResult.payload.expires_at),
    Date.parse(refreshedAt) + AI_MODEL_CATALOG_TTL_MS,
    'model catalog refresh should compute the cache expiration from the TTL'
);
assert.equal(
    refreshResult.payload.items.find((item) => item.provider === 'openai')?.models.includes('gpt-5.1'),
    true,
    'model catalog refresh should merge remote detected models with recommended defaults'
);
assert.equal(
    refreshResult.payload.items.find((item) => item.provider === 'anthropic')?.source,
    'embedded',
    'model catalog refresh should keep embedded entries when no API key is configured for a provider'
);

let fetchCalls = 0;
const cached = await ensureFreshAiModelCatalog({
    storage,
    fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('should_not_fetch_when_cache_is_fresh');
    }
});
assert.equal(cached.stale, false, 'model catalog refresh should consider a fresh cache valid');
assert.equal(fetchCalls, 0, 'model catalog refresh should not fetch remote models when cache is still fresh');

const intervals = [];
let runCalls = 0;
const env = {
    localStorage: createStorage(),
    document: {
        visibilityState: 'hidden',
        addEventListener() {},
        removeEventListener() {}
    },
    setInterval(handler, delay) {
        intervals.push({ handler, delay });
        return intervals.length;
    },
    clearInterval() {},
    fetch: async () => {
        runCalls += 1;
        return {
            ok: true,
            async json() {
                return { data: [] };
            }
        };
    }
};
const controller = bootstrapAiModelCatalogRefresh({
    env,
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [{ provider: 'openai', model: 'gpt-5.1', key: 'openai-key' }]
                }
            }
        };
    }
});
assert.equal(typeof controller?.run, 'function', 'model catalog refresh bootstrap should expose a manual run handle');
assert.equal(intervals.length, 1, 'model catalog refresh bootstrap should register a periodic interval');
assert.equal(intervals[0].delay, 60 * 60 * 1000, 'model catalog refresh bootstrap should poll periodically every hour');

await new Promise((resolve) => setTimeout(resolve, 0));
await controller.run({ force: true });
assert.equal(runCalls >= 1, true, 'model catalog refresh bootstrap should execute the refresh pipeline through the environment fetch');

console.log('model_catalog_refresh: ok');
