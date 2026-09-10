import { cloneJson as clone } from '../shared/scalars.js';
const freeze = (value) => Object.freeze(value);


const createProviderDefinition = ({
    id,
    label,
    request_type,
    completion_endpoint,
    list_models_endpoint = '',
    docs_url = '',
    refresh_strategy = 'api_list',
    recommended_models = [],
    fallback_models = [],
    filter = {}
} = {}) => freeze({
    id: String(id || '').trim(),
    label: String(label || '').trim(),
    request_type: String(request_type || '').trim(),
    completion_endpoint: String(completion_endpoint || '').trim(),
    list_models_endpoint: String(list_models_endpoint || '').trim(),
    docs_url: String(docs_url || '').trim(),
    refresh_strategy: String(refresh_strategy || 'api_list').trim(),
    recommended_models: freeze(recommended_models.map((model) => String(model || '').trim()).filter(Boolean)),
    fallback_models: freeze(fallback_models.map((model) => String(model || '').trim()).filter(Boolean)),
    filter: freeze({
        exclude_preview: filter.exclude_preview !== false,
        exclude_deprecated: filter.exclude_deprecated !== false,
        exclude_modalities: freeze(Array.isArray(filter.exclude_modalities) ? filter.exclude_modalities.map((item) => String(item || '').trim()).filter(Boolean) : []),
        prefer_general_purpose: filter.prefer_general_purpose !== false
    })
});

export const AI_MODEL_PROVIDER_REGISTRY = freeze({
    openai: createProviderDefinition({
        id: 'openai',
        label: 'OpenAI',
        request_type: 'openai',
        completion_endpoint: 'https://api.openai.com/v1/responses',
        list_models_endpoint: 'https://api.openai.com/v1/models',
        docs_url: 'https://platform.openai.com/docs/models',
        recommended_models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-6-astra'],
        fallback_models: ['gpt-4o', 'gpt-4o-mini'],
        filter: {
            exclude_preview: true,
            exclude_deprecated: true,
            exclude_modalities: ['audio', 'image', 'embedding', 'moderation', 'realtime'],
            prefer_general_purpose: true
        }
    }),
    anthropic: createProviderDefinition({
        id: 'anthropic',
        label: 'Anthropic',
        request_type: 'anthropic',
        completion_endpoint: 'https://api.anthropic.com/v1/messages',
        list_models_endpoint: 'https://api.anthropic.com/v1/models',
        docs_url: 'https://docs.anthropic.com/en/docs/about-claude/models/overview',
        recommended_models: ['claude-sonnet-4', 'claude-opus-4-1', 'claude-haiku-3-5'],
        fallback_models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        filter: {
            exclude_preview: true,
            exclude_deprecated: true,
            prefer_general_purpose: true
        }
    }),
    mistral: createProviderDefinition({
        id: 'mistral',
        label: 'Mistral',
        request_type: 'openai',
        completion_endpoint: 'https://api.mistral.ai/v1/chat/completions',
        list_models_endpoint: 'https://api.mistral.ai/v1/models',
        docs_url: 'https://docs.mistral.ai/getting-started/models/models_overview',
        recommended_models: ['mistral-medium-3.1', 'mistral-small-3.2'],
        fallback_models: ['mistral-large-latest', 'mistral-small-latest'],
        filter: {
            exclude_preview: true,
            exclude_deprecated: true,
            prefer_general_purpose: true
        }
    }),
    google: createProviderDefinition({
        id: 'google',
        label: 'Google',
        request_type: 'google',
        completion_endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        list_models_endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        docs_url: 'https://ai.google.dev/models/gemini',
        recommended_models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
        fallback_models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
        filter: {
            exclude_preview: true,
            exclude_deprecated: true,
            exclude_modalities: ['embedding', 'image', 'speech', 'tts'],
            prefer_general_purpose: true
        }
    }),
    deepseek: createProviderDefinition({
        id: 'deepseek',
        label: 'DeepSeek',
        request_type: 'openai',
        completion_endpoint: 'https://api.deepseek.com/v1/chat/completions',
        list_models_endpoint: 'https://api.deepseek.com/models',
        docs_url: 'https://api-docs.deepseek.com/api/list-models',
        recommended_models: ['deepseek-chat', 'deepseek-reasoner'],
        fallback_models: [],
        filter: {
            exclude_preview: true,
            exclude_deprecated: true,
            prefer_general_purpose: true
        }
    })
});

export const AI_MODEL_PROVIDER_LIST = freeze(
    Object.values(AI_MODEL_PROVIDER_REGISTRY).map((provider) => freeze({
        id: provider.id,
        label: provider.label,
        models: freeze([...provider.recommended_models, ...provider.fallback_models])
    }))
);

export const getAiModelProviderDefinition = (providerId) => {
    const key = String(providerId || '').trim().toLowerCase();
    return AI_MODEL_PROVIDER_REGISTRY[key] || null;
};

export const listAiModelProviders = () => AI_MODEL_PROVIDER_LIST.map((entry) => clone(entry));

// Product roles are independent of the gesture and modality. Listed account
// models prove availability only; supported options come from this capability
// contract and are never inferred from the spelling of an unknown model id.
export const OPENAI_MODEL_PROFILES = freeze([
    freeze({ level: 1, role: 'sol_light', model: 'gpt-5.6-sol', effort: 'low' }),
    freeze({ level: 2, role: 'balanced', model: 'gpt-5.6-sol', effort: 'medium' }),
    freeze({ level: 3, role: 'reasoning', model: 'gpt-5.6-sol', effort: 'high' }),
    freeze({ level: 4, role: 'best_reasoning', model: 'gpt-6-astra', effort: 'high' }),
    freeze({ level: 5, role: 'max_reasoning', model: 'gpt-6-astra', effort: 'max' })
]);

// Standard direct-API USD per million tokens, verified 2026-09-10.
// https://developers.openai.com/api/docs/pricing
export const OPENAI_TEXT_TOKEN_PRICING = freeze({
    'gpt-5.6-sol': freeze({ input: 4, cached: 0.4, cacheWrite: 5, output: 20 }),
    'gpt-6-astra': freeze({ input: 10, cached: 1, cacheWrite: 12.5, output: 50 })
});

// Standard Realtime token tariffs; input transcription is charged separately.
export const OPENAI_REALTIME_TOKEN_PRICING = freeze({
    'gpt-realtime-2.1': freeze({
        text: freeze({ input: 4, cached: 0.4, output: 24 }),
        audio: freeze({ input: 32, cached: 0.4, output: 64 }),
        image: freeze({ input: 5, cached: 0.5 })
    })
});

export const OPENAI_MODALITY_MODELS = freeze({
    voice: 'gpt-realtime-2.1', image: 'gpt-image-2.5-sunburst',
    image_fast: 'gpt-image-2.5-flare', transcription: 'gpt-4o-transcribe',
    tts: 'gpt-4o-mini-tts', embedding: 'text-embedding-3-small', moderation: 'omni-moderation-latest'
});

export const OPENAI_VAD_SCHEMA = freeze({ oneOf: [
    { type: 'object', required: ['type'], additionalProperties: false, properties: {
        type: { const: 'server_vad' }, threshold: { type: 'number', minimum: 0, maximum: 1 },
        silence_duration_ms: { type: 'integer', minimum: 0, maximum: 5000 },
        prefix_padding_ms: { type: 'integer', minimum: 0, maximum: 2000 }
    } },
    { type: 'object', required: ['type'], additionalProperties: false, properties: {
        type: { const: 'semantic_vad' }, eagerness: { type: 'string', enum: ['low', 'medium', 'high', 'auto'] }
    } }
] });

export const resolveOpenAiProfile = ({ level = 1, availableModels = [] } = {}) => {
    const profile = OPENAI_MODEL_PROFILES.find(entry => entry.level === Number(level));
    if (!profile) throw new Error('provider_level_invalid');
    if (!availableModels.includes(profile.model)) return { ...profile, available: false };
    return { ...profile, available: true };
};

const serviceTool = (action, description, method, path, properties = {}, required = [], risk = 'moderate', hosted = null) => freeze({
    action, description, method, path, risk, hosted,
    parameters: freeze({ type: 'object', properties, required, additionalProperties: false })
});
const resourceId = { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,200}$' };
const page = { limit: { type: 'integer', minimum: 1, maximum: 100 }, after: resourceId, order: { type: 'string', enum: ['asc', 'desc'] } };
// The same capability descriptions drive MCP tools and authenticated routing.
// Binary imports and explicit uploads remain owned by the media service.
export const OPENAI_SERVICE_TOOLS = freeze([
    serviceTool('skills.list', 'List procedures already uploaded to the configured project for explicit review.', 'GET', '/skills', { limit: page.limit, after: resourceId }, [], 'read'),
    serviceTool('skills.read', 'Inspect metadata for a designated procedure before approving a pinned version.', 'GET', '/skills/:id', { id: resourceId }, ['id'], 'read'),
    serviceTool('skills.delete', 'Delete a designated procedure and all its versions after review.', 'DELETE', '/skills/:id', { id: resourceId }, ['id'], 'high'),
    serviceTool('skills.update', 'Change the default version of a designated procedure after review. Existing pinned workflows remain unchanged.', 'POST', '/skills/:id', {
        id: resourceId, default_version: { type: 'integer', minimum: 1 }
    }, ['id', 'default_version'], 'high'),
    serviceTool('skills.versions.list', 'List immutable versions of a designated procedure.', 'GET', '/skills/:id/versions', { id: resourceId, limit: page.limit, after: resourceId }, ['id'], 'read'),
    serviceTool('skills.versions.read', 'Inspect one exact procedure version.', 'GET', '/skills/:id/versions/:version', {
        id: resourceId, version: { type: 'string', pattern: '^[0-9]+$' }
    }, ['id', 'version'], 'read'),
    serviceTool('skills.versions.delete', 'Delete a designated procedure version after review; the provider protects the default version.', 'DELETE', '/skills/:id/versions/:version', {
        id: resourceId, version: { type: 'string', pattern: '^[0-9]+$' }
    }, ['id', 'version'], 'high'),
    serviceTool('remote_mcp.run', 'Configure a remote HTTPS MCP server for this explicit request. Review the destination and allowed tools. Every remote action requires a further exact approval.', 'POST', '/responses', {
        query: { type: 'string', minLength: 1, maxLength: 32000 }, server_url: { type: 'string', maxLength: 2000 },
        server_label: resourceId, allowed_tools: { type: 'array', items: resourceId, minItems: 1, maxItems: 32 }
    }, ['query', 'server_url', 'server_label', 'allowed_tools'], 'high'),
    serviceTool('remote_mcp.continue', 'Review and approve or reject one exact pending remote MCP action. A model response cannot constitute approval.', 'POST', '/responses', {
        approval_id: resourceId, approved: { type: 'boolean' }, review: { type: 'object', properties: {
            server_url: { type: 'string' }, name: resourceId, arguments: { type: 'string', maxLength: 100000 }
        }, required: ['server_url', 'name', 'arguments'], additionalProperties: false }
    }, ['approval_id', 'approved', 'review'], 'high'),
    serviceTool('analysis.run', 'Analyze an explicit question and designated uploaded files in an isolated Code Interpreter container after review.', 'POST', '/responses', {
        query: { type: 'string', minLength: 1, maxLength: 32000 }, file_ids: { type: 'array', items: resourceId, maxItems: 8 }
    }, ['query'], 'high', 'code_interpreter'),
    serviceTool('file_search.run', 'Answer an explicit question using only designated remote corpora and return source annotations.', 'POST', '/responses', {
        query: { type: 'string', minLength: 1, maxLength: 32000 }, vector_store_ids: { type: 'array', items: resourceId, minItems: 1, maxItems: 2 }
    }, ['query', 'vector_store_ids'], 'moderate', 'file_search'),
    serviceTool('shell.run', 'Run an explicitly requested file task in an isolated hosted shell with no network access. No local Atome mutations. Review required.', 'POST', '/responses', {
        query: { type: 'string', minLength: 1, maxLength: 32000 }, file_ids: { type: 'array', items: resourceId, maxItems: 8 },
        skills: { type: 'array', maxItems: 8, items: { type: 'object', properties: { skill_id: resourceId,
            version: { type: 'string', pattern: '^[0-9]+$' } }, required: ['skill_id', 'version'], additionalProperties: false } }
    }, ['query'], 'high', 'shell'),
    serviceTool('containers.list', 'List requested hosted work containers.', 'GET', '/containers', { limit: page.limit, after: resourceId }, [], 'read'),
    serviceTool('containers.read', 'Read a designated hosted container status.', 'GET', '/containers/:id', { id: resourceId }, ['id'], 'read'),
    serviceTool('containers.delete', 'Delete a designated ephemeral work container after review.', 'DELETE', '/containers/:id', { id: resourceId }, ['id'], 'high'),
    serviceTool('containers.files.list', 'List outputs of a designated hosted container.', 'GET', '/containers/:id/files', { id: resourceId, ...page }, ['id'], 'read'),
    serviceTool('embeddings', 'Compute embeddings only for supplied text; does not index the project automatically.', 'POST', '/embeddings', {
        input: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, maxItems: 64 }] },
        model: { type: 'string', enum: [OPENAI_MODALITY_MODELS.embedding] }, dimensions: { type: 'integer', minimum: 1, maximum: 1536 }
    }, ['input', 'model']),
    serviceTool('moderation', 'Moderate explicitly supplied text.', 'POST', '/moderations', {
        input: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, maxItems: 64 }] },
        model: { type: 'string', enum: [OPENAI_MODALITY_MODELS.moderation] }
    }, ['input']),
    serviceTool('uploads.create', 'Start an explicit chunked transfer of a designated file.', 'POST', '/uploads', {
        filename: { type: 'string', minLength: 1, maxLength: 255 }, bytes: { type: 'integer', minimum: 1, maximum: 20000000 },
        mime_type: { type: 'string' }, purpose: { type: 'string', enum: ['user_data', 'assistants', 'batch'] }
    }, ['filename', 'bytes', 'mime_type', 'purpose']),
    serviceTool('uploads.complete', 'Complete a designated upload with its ordered part identifiers.', 'POST', '/uploads/:id/complete', {
        id: resourceId, part_ids: { type: 'array', items: resourceId, minItems: 1, maxItems: 8 }
    }, ['id', 'part_ids']),
    serviceTool('uploads.cancel', 'Cancel an incomplete designated remote upload.', 'POST', '/uploads/:id/cancel', { id: resourceId }, ['id']),
    serviceTool('files.list', 'List remote files in the configured OpenAI project when requested.', 'GET', '/files', page, [], 'read'),
    serviceTool('files.read', 'Read metadata for a designated remote file.', 'GET', '/files/:id', { id: resourceId }, ['id'], 'read'),
    serviceTool('files.delete', 'Delete a designated remote file after review.', 'DELETE', '/files/:id', { id: resourceId }, ['id'], 'high'),
    serviceTool('vector_stores.create', 'Create an explicitly requested searchable corpus from designated remote files.', 'POST', '/vector_stores', {
        name: { type: 'string' }, file_ids: { type: 'array', items: resourceId, maxItems: 100 },
        expires_after: { type: 'object', properties: { anchor: { type: 'string', enum: ['last_active_at'] },
            days: { type: 'integer', minimum: 1, maximum: 365 } }, required: ['anchor', 'days'], additionalProperties: false }
    }, ['name']),
    serviceTool('vector_stores.list', 'List explicitly requested remote corpora.', 'GET', '/vector_stores', page, [], 'read'),
    serviceTool('vector_stores.read', 'Read a designated remote corpus status.', 'GET', '/vector_stores/:id', { id: resourceId }, ['id'], 'read'),
    serviceTool('vector_stores.delete', 'Delete a designated remote corpus after review.', 'DELETE', '/vector_stores/:id', { id: resourceId }, ['id'], 'high'),
    serviceTool('vector_stores.attach', 'Attach a designated remote file to an explicitly chosen corpus.', 'POST', '/vector_stores/:id/files',
        { id: resourceId, file_id: resourceId }, ['id', 'file_id']),
    serviceTool('vector_stores.files.list', 'List indexing states and failures in a designated corpus; paginate explicitly.', 'GET', '/vector_stores/:id/files',
        { id: resourceId, ...page, filter: { type: 'string', enum: ['in_progress', 'completed', 'failed', 'cancelled'] } }, ['id'], 'read'),
    serviceTool('vector_stores.files.read', 'Read indexing status and last_error for a designated corpus file before searching it.', 'GET', '/vector_stores/:id/files/:file_id',
        { id: resourceId, file_id: resourceId }, ['id', 'file_id'], 'read'),
    serviceTool('vector_stores.files.detach', 'Remove a designated file from a corpus after review. The original remote file remains until explicitly deleted; search removal is eventually consistent.', 'DELETE', '/vector_stores/:id/files/:file_id',
        { id: resourceId, file_id: resourceId }, ['id', 'file_id'], 'high'),
    serviceTool('vector_stores.search', 'Search an explicitly designated corpus.', 'POST', '/vector_stores/:id/search', {
        id: resourceId, query: { type: 'string' }, max_num_results: { type: 'integer', minimum: 1, maximum: 50 }
    }, ['id', 'query'], 'read'),
    serviceTool('batches.create', 'Submit the designated uploaded JSONL file as a deferred batch after review.', 'POST', '/batches', {
        input_file_id: resourceId, endpoint: { type: 'string', enum: ['/v1/responses', '/v1/embeddings'] },
        completion_window: { type: 'string', enum: ['24h'] }
    }, ['input_file_id', 'endpoint', 'completion_window'], 'high'),
    serviceTool('batches.list', 'List requested deferred batches.', 'GET', '/batches', { limit: page.limit, after: resourceId }, [], 'read'),
    serviceTool('batches.read', 'Read a designated deferred batch status and result file identifiers.', 'GET', '/batches/:id', { id: resourceId }, ['id'], 'read'),
    serviceTool('batches.cancel', 'Cancel a designated deferred batch after review.', 'POST', '/batches/:id/cancel', { id: resourceId }, ['id'], 'high')
]);
