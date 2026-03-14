import assert from 'node:assert/strict';

import {
    AI_MODEL_CATALOG_TTL_MS,
    buildModelCatalogCacheRecord,
    getEmbeddedModelCatalogPayload,
    readModelCatalogCache,
    writeModelCatalogCache
} from './model_catalog_cache.js';

const storage = (() => {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        }
    };
})();

const embedded = readModelCatalogCache({ storage });
assert.equal(embedded.ok, true, 'model catalog cache should read successfully without prior cache');
assert.equal(embedded.source, 'embedded', 'model catalog cache should fall back to embedded data when cache is empty');
assert.equal(embedded.payload.items.length > 0, true, 'model catalog cache should expose embedded provider entries');

const refreshedAt = '2026-03-14T10:00:00.000Z';
const payload = buildModelCatalogCacheRecord({
    refreshedAt,
    source: 'remote',
    items: [{
        provider: 'openai',
        label: 'OpenAI',
        recommended_models: ['gpt-5.1'],
        fallback_models: ['gpt-4o'],
        detected_models: ['gpt-5.1', 'gpt-5-mini'],
        models: ['gpt-5.1', 'gpt-5-mini', 'gpt-4o']
    }]
});
assert.equal(payload.ttl_ms, AI_MODEL_CATALOG_TTL_MS, 'model catalog cache should stamp the default TTL into cache records');
assert.equal(
    Date.parse(payload.expires_at),
    Date.parse(refreshedAt) + AI_MODEL_CATALOG_TTL_MS,
    'model catalog cache should compute the expiration timestamp from refresh time + TTL'
);

assert.equal(writeModelCatalogCache({ storage, payload }), true, 'model catalog cache should persist to storage');
const cached = readModelCatalogCache({ storage });
assert.equal(cached.source, 'remote', 'model catalog cache should preserve the cache source');
assert.equal(cached.stale, false, 'fresh cache should not be marked stale');
assert.deepEqual(
    cached.payload.items[0].models,
    ['gpt-5.1', 'gpt-5-mini', 'gpt-4o'],
    'model catalog cache should restore persisted models'
);

const embeddedPayload = getEmbeddedModelCatalogPayload();
embeddedPayload.items[0].models.push('tampered');
const embeddedAgain = getEmbeddedModelCatalogPayload();
assert.equal(
    embeddedAgain.items[0].models.includes('tampered'),
    false,
    'embedded catalog payload should be cloned on access'
);

console.log('model_catalog_cache: ok');
