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

const billingIssue = normalizeAiProviderError(new Error('HTTP_402 billing_not_active project billing disabled'));
assert.equal(billingIssue.code, 'provider_billing_issue', 'billing/configuration failures should be separated from exhausted quota');

const ambiguous429Billing = normalizeAiProviderError(new Error('HTTP_429 billing project temporarily throttled'));
assert.equal(ambiguous429Billing.code, 'provider_rate_limited', 'generic 429 failures should stay rate-limited unless quota is explicit');

// Structured data tests — simulate createProviderHttpError (real Axum proxy path)
const structuredRateLimit = (() => {
    const err = new Error('HTTP_429 rate_limit_exceeded Too many requests');
    err.http_status = 429;
    err.provider_code = 'rate_limit_exceeded';
    err.provider_message = 'Too many requests';
    err.raw_body = '{"error":{"code":"rate_limit_exceeded","message":"Too many requests"}}';
    return normalizeAiProviderError(err);
})();
assert.equal(structuredRateLimit.code, 'provider_rate_limited', 'structured 429 rate_limit_exceeded should be rate_limited');

const structuredQuota = (() => {
    const err = new Error('HTTP_429 insufficient_quota Your balance is insufficient');
    err.http_status = 429;
    err.provider_code = 'insufficient_quota';
    err.provider_message = 'Your balance is insufficient';
    err.raw_body = '{"error":{"code":"insufficient_quota","message":"Your balance is insufficient"}}';
    return normalizeAiProviderError(err);
})();
assert.equal(structuredQuota.code, 'provider_quota_exceeded', 'structured 429 with insufficient_quota code should be quota_exceeded');

const structured429AmbiguousText = (() => {
    const err = new Error('HTTP_429 rate_limit_exceeded You exceeded your current quota');
    err.http_status = 429;
    err.provider_code = 'rate_limit_exceeded';
    err.provider_message = 'You exceeded your current quota';
    err.raw_body = '{"error":{"code":"rate_limit_exceeded","message":"You exceeded your current quota"}}';
    return normalizeAiProviderError(err);
})();
assert.equal(structured429AmbiguousText.code, 'provider_rate_limited', 'structured 429 with rate_limit code should ignore quota keywords in message text');

const parsed = extractJsonResponse('```json\n{"reply":"ok","actions":[]}\n```');
assert.deepEqual(parsed, { reply: 'ok', actions: [] }, 'provider client should parse fenced JSON replies');

const completed = await requestProviderCompletion({
    providerId: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'test-key',
    prompt: 'bonjour',
    systemPrompt: 'json only',
    fetchImpl: async () => ({
        ok: true,
        async json() {
            return {
                choices: [{ message: { content: 'ok' } }],
                usage: {
                    prompt_tokens: 11,
                    completion_tokens: 7,
                    total_tokens: 18
                }
            };
        }
    })
});

assert.equal(completed.text, 'ok', 'provider client should keep completion text');
assert.equal(completed.usage.total_tokens, 18, 'provider client should expose provider token usage when available');

const previousWindow = globalThis.window;
globalThis.window = {
    __TAURI_INTERNALS__: { invoke() { } },
    location: { protocol: 'http:' },
    ATOME_LOCAL_HTTP_PORT: 3000
};

const proxiedRequests = [];
const proxied = await requestProviderCompletion({
    providerId: 'openai',
    model: 'gpt-4o-mini',
    apiKey: 'test-key',
    prompt: 'hello',
    systemPrompt: 'json only',
    fetchImpl: async (url, options = {}) => {
        proxiedRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    text: 'proxied-ok',
                    usage: {
                        prompt_tokens: 3,
                        completion_tokens: 2,
                        total_tokens: 5
                    }
                };
            }
        };
    }
});

assert.equal(proxiedRequests.length, 1, 'tauri mode should proxy a single completion request through the local Axum route');
assert.equal(proxiedRequests[0].url, 'http://127.0.0.1:3000/api/eve/ai/provider-completion', 'tauri mode should target the local Axum AI proxy endpoint');
assert.equal(JSON.parse(proxiedRequests[0].options.body).completion_endpoint, 'https://api.openai.com/v1/chat/completions', 'tauri proxy should forward the provider endpoint metadata to Axum');
assert.equal(proxied.text, 'proxied-ok', 'tauri proxy should preserve normalized completion text');

if (previousWindow === undefined) {
    delete globalThis.window;
} else {
    globalThis.window = previousWindow;
}

console.log('provider_client: ok');
