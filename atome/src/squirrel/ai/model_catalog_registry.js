const freeze = (value) => Object.freeze(value);

const clone = (value) => JSON.parse(JSON.stringify(value));

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
        completion_endpoint: 'https://api.openai.com/v1/chat/completions',
        list_models_endpoint: 'https://api.openai.com/v1/models',
        docs_url: 'https://platform.openai.com/docs/models',
        recommended_models: ['gpt-5.1', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
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
