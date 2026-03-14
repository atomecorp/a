import assert from 'node:assert/strict';

import {
    AI_MODEL_PROVIDER_LIST,
    AI_MODEL_PROVIDER_REGISTRY,
    getAiModelProviderDefinition,
    listAiModelProviders
} from './model_catalog_registry.js';

assert.deepEqual(
    AI_MODEL_PROVIDER_REGISTRY.openai.recommended_models,
    ['gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
    'model catalog registry should expose the refreshed OpenAI recommended models'
);
assert.deepEqual(
    AI_MODEL_PROVIDER_REGISTRY.google.recommended_models,
    ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    'model catalog registry should expose the refreshed Google recommended models'
);
assert.equal(
    getAiModelProviderDefinition('deepseek')?.list_models_endpoint,
    'https://api.deepseek.com/models',
    'model catalog registry should keep the official DeepSeek list models endpoint'
);
assert.equal(
    AI_MODEL_PROVIDER_LIST.find((entry) => entry.id === 'anthropic')?.models.includes('claude-sonnet-4'),
    true,
    'model catalog provider list should flatten recommended models for UI consumption'
);

const cloned = listAiModelProviders();
cloned[0].models.push('tampered');
assert.equal(
    AI_MODEL_PROVIDER_LIST[0].models.includes('tampered'),
    false,
    'listAiModelProviders should return cloned data, not mutate the registry'
);

console.log('model_catalog_registry: ok');
