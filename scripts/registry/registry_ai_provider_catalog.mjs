// eVe/registry/generated/ai_provider_catalog.json — the provider contract (the OpenAI service tools and their
// parameter schemas, the model profiles and modality models, the model providers' list endpoints, the session tool
// limit, the music, Strava and social commands' input schemas), generated from its JS owners
// (atome/src/squirrel/ai/model_catalog_registry.js, atome/src/shared/provider_tool_limit.js and the music, strava and social
// contracts.js of atome/src/squirrel/) for the server that cannot import them: atome-server (src/providers/, compiled in).
import fs from 'node:fs';
import { generatedFile } from './registry_paths.mjs';

export const AI_PROVIDER_CATALOG_FILE = 'ai_provider_catalog.json';

const aiProviderCatalogText = async () => {
    const registry = await import('../../atome/src/squirrel/ai/model_catalog_registry.js');
    const { PROVIDER_SESSION_TOOL_LIMIT } = await import('../../atome/src/shared/provider_tool_limit.js');
    const { MUSIC_COMMANDS } = await import('../../atome/src/squirrel/music/contracts.js');
    const { STRAVA_COMMANDS } = await import('../../atome/src/squirrel/strava/contracts.js');
    const { SOCIAL_COMMANDS } = await import('../../atome/src/squirrel/social/contracts.js');
    const schemas = commands => commands.map(({ action, input_schema }) => ({ action, input_schema }));
    const listEndpoints = Object.fromEntries(Object.values(registry.AI_MODEL_PROVIDER_REGISTRY)
        .map((provider) => [provider.id, provider.list_models_endpoint]));
    return `${JSON.stringify({ format: 'ai_provider_catalog/1',
        owner: 'atome/src/squirrel/ai/model_catalog_registry.js', service_tools: registry.OPENAI_SERVICE_TOOLS,
        model_profiles: registry.OPENAI_MODEL_PROFILES, modality_models: registry.OPENAI_MODALITY_MODELS,
        list_models_endpoints: listEndpoints, session_tool_limit: PROVIDER_SESSION_TOOL_LIMIT,
        music_commands: schemas(MUSIC_COMMANDS), strava_commands: schemas(STRAVA_COMMANDS),
        social_commands: schemas(SOCIAL_COMMANDS) })}\n`;
};

export const writeAiProviderCatalog = async () => fs.writeFileSync(generatedFile(AI_PROVIDER_CATALOG_FILE), await aiProviderCatalogText());

// registry:check — the generated file must be what the owners produce now.
export const aiProviderCatalogErrors = async () => {
    const file = generatedFile(AI_PROVIDER_CATALOG_FILE);
    if (!fs.existsSync(file)) return [`ai_provider_catalog_not_built: eVe/registry/generated/${AI_PROVIDER_CATALOG_FILE} is missing (npm run registry:build)`];
    return fs.readFileSync(file, 'utf8') === await aiProviderCatalogText()
        ? [] : ['stale_ai_provider_catalog: the AI provider registry changed since the last build (npm run registry:build)'];
};
