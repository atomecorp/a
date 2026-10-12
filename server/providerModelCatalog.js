import { getAiModelProviderDefinition } from '../atome/src/squirrel/ai/model_catalog_registry.js';
import { readProviderBytes } from '../atome/src/squirrel/ai/openai_stream.js';

// Only canonical registry endpoints are reachable. Keys stay in headers and
// are never returned with the public catalog. Pagination shares one deadline.
export const listProviderModelCatalog = async ({ provider = 'openai', key, fetchImpl = globalThis.fetch, signal } = {}) => {
    const definition = getAiModelProviderDefinition(provider);
    if (!definition?.list_models_endpoint) throw new Error('provider_catalog_unavailable');
    if (!key || String(key).length > 1024 || /\s/.test(key)) throw new Error('provider_key_invalid');
    const headers = provider === 'anthropic'
        ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        : provider === 'google' ? { 'x-goog-api-key': key } : { Authorization: `Bearer ${key}` };
    const models = new Map(), cursors = new Set();
    let cursor = '';
    for (let page = 0; page < 100; page++) {
        signal?.throwIfAborted();
        const url = new URL(definition.list_models_endpoint);
        if (provider === 'anthropic') url.searchParams.set('limit', '100');
        if (provider === 'google') url.searchParams.set('pageSize', '1000');
        if (cursor) url.searchParams.set(provider === 'google' ? 'pageToken' : provider === 'anthropic' ? 'after_id' : 'after', cursor);
        const response = await fetchImpl(url.href, { method: 'GET', redirect: 'error', headers, signal });
        if (!response.ok) {
            const error = new Error(`provider_catalog_http_${response.status}`);
            error.http_status = response.status;
            try {
                const bytes = await readProviderBytes(response.body, { signal, maxBytes: 65536 });
                const payload = JSON.parse(new TextDecoder().decode(bytes));
                const code = payload?.error?.code || payload?.error?.type;
                if (['invalid_api_key', 'authentication_error', 'permission_denied', 'rate_limit_exceeded', 'insufficient_quota'].includes(code)) error.message = code;
            } catch (_) { /* HTTP status remains sufficient; never forward the provider body. */ }
            throw error;
        }
        const bytes = await readProviderBytes(response.body, { signal });
        let payload;
        try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
        catch (_) { throw new Error('provider_catalog_response_invalid'); }
        const listed = provider === 'google' ? payload.models : Array.isArray(payload) ? payload : payload.data;
        if (!Array.isArray(listed)) throw new Error('provider_catalog_response_invalid');
        for (const model of listed) {
            if (model.lifecycle === 'retired' || model.archived === true) continue;
            if (provider === 'google' && !model.supportedGenerationMethods?.includes('generateContent')) continue;
            if (provider === 'mistral' && model.capabilities?.completion_chat !== true) continue;
            const id = String(model.id || model.name || '').replace(/^models\//, '').trim();
            if (!id || id.length > 256) continue;
            models.set(id, { id });
            if (provider === 'mistral') for (const alias of model.aliases || []) {
                if (typeof alias === 'string' && alias && alias.length <= 256) models.set(alias, { id: alias });
            }
        }
        const next = provider === 'google' ? payload.nextPageToken
            : payload.has_more ? payload.last_id || listed.at(-1)?.id : '';
        if (!next) {
            if (payload.has_more) throw new Error('provider_catalog_cursor_invalid');
            return { data: [...models.values()] };
        }
        if (typeof next !== 'string' || next.length > 4096 || cursors.has(next)) throw new Error('provider_catalog_cursor_invalid');
        cursors.add(next);
        cursor = next;
    }
    throw new Error('provider_catalog_page_limit');
};
