import assert from 'node:assert/strict';

import {
    extractJsonResponse,
    normalizeAiProviderError,
    requestProviderCompletion,
    resolveFirstAiProviderConfig
} from './provider_client.js';

const selected = await resolveFirstAiProviderConfig({
    async loadProfile() {
        return {
            ok: true,
            profile: {
                passkeys: {
                    keys: [
                        { provider: 'deepseek', model: 'deepseek-chat', key: 'first-key' },
                        { provider: 'openai', model: 'gpt-4o-mini', key: 'second-key' }
                    ]
                }
            }
        };
    }
});

assert.equal(selected.ok, true, 'provider client should resolve a configured key');
assert.equal(selected.providerId, 'deepseek', 'provider client should keep the first configured key from the panel order');
assert.equal(selected.apiKey, 'first-key', 'provider client should return the first configured key value');

const requests = [];
await assert.rejects(
    requestProviderCompletion({
        providerId: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'first-key',
        prompt: 'bonjour',
        systemPrompt: 'json only',
        fetchImpl: async (...args) => {
            requests.push(args);
            return {
                ok: false,
                status: 401,
                async text() {
                    return 'Unauthorized';
                }
            };
        }
    }),
    /Unauthorized/
);
assert.equal(requests.length, 1, 'provider client should attempt a single provider request without fallback');

const normalized = normalizeAiProviderError(new Error('Unauthorized'));
assert.equal(normalized.code, 'provider_auth_failed', 'auth failures should be normalized for the voice layer');

const rateLimited = normalizeAiProviderError(new Error('HTTP_429 rate_limit_exceeded Too many requests'));
assert.equal(rateLimited.code, 'provider_rate_limited', '429 provider errors should be normalized as rate limits');

const quotaExceeded = normalizeAiProviderError(new Error('HTTP_429 insufficient_quota billing hard_limit reached'));
assert.equal(quotaExceeded.code, 'provider_quota_exceeded', 'quota failures should be normalized separately from transient rate limits');

const parsed = extractJsonResponse('```json\n{"reply":"ok","actions":[]}\n```');
assert.deepEqual(parsed, { reply: 'ok', actions: [] }, 'provider client should parse fenced JSON replies');

console.log('provider_client: ok');
