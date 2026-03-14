import { getEveLocale } from '../../application/eVe/i18n/i18n.js';
import {
    normalizeAiProviderError,
    requestProviderJsonCompletion,
    resolveFirstAiProviderConfig
} from '../ai/provider_client.js';
import { normalizeVoiceIntent } from './intent_schema.js';

const DEFAULT_LOCALE = 'fr-FR';

const toText = (value) => String(value || '').trim();

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const resolveLocale = (locale = null) => {
    const preferred = toText(locale) || toText(getEveLocale?.()) || toText(globalThis?.document?.documentElement?.lang) || DEFAULT_LOCALE;
    return preferred || DEFAULT_LOCALE;
};

const isEnglishLocale = (locale) => toText(locale).toLowerCase().startsWith('en');

const localizeAiFailure = (code, locale) => {
    const english = isEnglishLocale(locale);
    if (code === 'no_ai_key_configured') {
        return english ? 'No AI key is configured.' : "Aucune cle IA n'est configuree.";
    }
    return english ? 'The AI is not responding.' : "L'IA ne repond pas.";
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const listAtomeAiTools = (env = globalThis) => {
    const agent = readEnv(env, 'AtomeAI') || readEnv(env, 'window')?.AtomeAI || null;
    if (!agent || typeof agent.listTools !== 'function') return [];
    try {
        return Array.isArray(agent.listTools()) ? agent.listTools() : [];
    } catch (_) {
        return [];
    }
};

const buildPlannerPrompt = ({
    utterance = '',
    locale = DEFAULT_LOCALE,
    context = {},
    heuristicIntent = null,
    runtimeTools = [],
    atomeAiTools = []
} = {}) => {
    const english = isEnglishLocale(locale);
    const rules = english
        ? [
            'You are the voice planner for eVe.',
            'Return JSON only.',
            'Do not use markdown.',
            'Use exactly one execution target for all actions: "atome_ai", "runtime_v2", or "none".',
            'Use "atome_ai" for business tools such as mail, contacts, calendar, banking, documents, and high-level actions.',
            'Use "runtime_v2" for direct UI manipulation when a runtime tool exists.',
            'If the request is unclear or purely conversational, use target "none" and actions [].',
            'Never invent tools.',
            'Never choose another provider or mention fallback.'
        ]
        : [
            "Tu es le planner vocal de eVe.",
            'Retourne du JSON uniquement.',
            'Pas de markdown.',
            'Utilise exactement une seule cible d execution pour toutes les actions: "atome_ai", "runtime_v2" ou "none".',
            'Utilise "atome_ai" pour les outils metier comme mail, contacts, agenda, banque, documents et actions de haut niveau.',
            'Utilise "runtime_v2" pour la manipulation directe de l interface quand un tool runtime existe.',
            'Si la demande est floue ou purement conversationnelle, utilise la cible "none" et actions [].',
            "N invente jamais d outils.",
            "Ne choisis jamais un autre provider et ne parle jamais de fallback."
        ];

    return [
        rules.join('\n'),
        '',
        english
            ? 'JSON schema: {"reply":"<string>","target":"atome_ai|runtime_v2|none","needs_confirmation":false,"actions":[{"target":"atome_ai","tool_name":"<string>","params":{}},{"target":"runtime_v2","tool_id":"<string>","action":"pointer.click","input":{}}]}'
            : 'Schema JSON: {"reply":"<string>","target":"atome_ai|runtime_v2|none","needs_confirmation":false,"actions":[{"target":"atome_ai","tool_name":"<string>","params":{}},{"target":"runtime_v2","tool_id":"<string>","action":"pointer.click","input":{}}]}',
        '',
        `LOCALE:\n${locale}`,
        '',
        `UTTERANCE:\n${String(utterance || '')}`,
        '',
        `CONTEXT:\n${JSON.stringify(context || {}, null, 2)}`,
        '',
        `HEURISTIC_INTENT:\n${JSON.stringify(heuristicIntent || null, null, 2)}`,
        '',
        `ATOME_AI_TOOLS:\n${JSON.stringify(Array.isArray(atomeAiTools) ? atomeAiTools : [], null, 2)}`,
        '',
        `RUNTIME_TOOLS:\n${JSON.stringify(Array.isArray(runtimeTools) ? runtimeTools : [], null, 2)}`
    ].join('\n');
};

const normalizeActions = (target, actions = []) => {
    const normalizedTarget = toText(target) || 'none';
    const sourceActions = Array.isArray(actions) ? actions : [];
    const toolchain = [];
    for (const action of sourceActions) {
        if (!action || typeof action !== 'object') continue;
        if (normalizedTarget === 'atome_ai') {
            const toolName = toText(action.tool_name);
            if (!toolName) continue;
            toolchain.push({
                source: 'atome_ai',
                tool_name: toolName,
                params: action.params && typeof action.params === 'object' ? { ...action.params } : {}
            });
            continue;
        }
        if (normalizedTarget === 'runtime_v2') {
            const toolId = toText(action.tool_id);
            if (!toolId) continue;
            toolchain.push({
                source: 'runtime_v2',
                tool_id: toolId,
                action: toText(action.action) || 'pointer.click',
                input: action.input && typeof action.input === 'object' ? { ...action.input } : {}
            });
        }
    }
    return toolchain;
};

export const createVoiceAiPlanner = ({
    env = globalThis,
    loadProfile,
    fetchImpl
} = {}) => ({
    async planUtterance(utterance, options = {}) {
        const locale = resolveLocale(options.locale || options.lang);
        const providerConfig = await resolveFirstAiProviderConfig({
            ...(typeof loadProfile === 'function' ? { loadProfile } : {})
        });

        if (providerConfig?.ok !== true) {
            const code = toText(providerConfig?.error) || 'no_ai_key_configured';
            return normalizeVoiceIntent({
                intent_id: options.intent_id,
                utterance: { raw: utterance },
                locale,
                source: options.source,
                context: {
                    ...(options.context && typeof options.context === 'object' ? cloneValue(options.context) : {}),
                    ai_error: code,
                    ai_provider: null
                },
                assistant_reply: localizeAiFailure(code, locale),
                type: 'ambiguous',
                domain: options.heuristic_intent?.domain || 'unknown',
                action: options.heuristic_intent?.action || 'unknown',
                confidence: 0,
                status: 'failed',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        try {
            const { parsed, text } = await requestProviderJsonCompletion({
                providerId: providerConfig.providerId,
                model: providerConfig.model,
                apiKey: providerConfig.apiKey,
                systemPrompt: buildPlannerPrompt({
                    utterance,
                    locale,
                    context: options.context,
                    heuristicIntent: options.heuristic_intent,
                    runtimeTools: options.runtime_tools,
                    atomeAiTools: listAtomeAiTools(env)
                }),
                prompt: String(utterance || ''),
                ...(typeof fetchImpl === 'function' ? { fetchImpl } : {}),
                ...(options.signal ? { signal: options.signal } : {})
            });

            const target = toText(parsed?.target) || 'none';
            const toolchain = normalizeActions(target, parsed?.actions);
            const actionCount = toolchain.length;
            const normalizedTarget = actionCount ? target : 'none';
            const intentType = normalizedTarget === 'atome_ai'
                ? (actionCount > 1 ? 'agent_toolchain' : 'agent_tool')
                : (normalizedTarget === 'runtime_v2'
                    ? (actionCount > 1 ? 'runtime_toolchain' : 'runtime_tool')
                    : 'ambiguous');

            return normalizeVoiceIntent({
                intent_id: options.intent_id,
                utterance: { raw: utterance },
                locale,
                source: options.source,
                context: {
                    ...(options.context && typeof options.context === 'object' ? cloneValue(options.context) : {}),
                    ai_provider: providerConfig.providerId,
                    ai_model: providerConfig.model,
                    ai_source: providerConfig.source
                },
                assistant_reply: toText(parsed?.reply) || '',
                llm_raw_response: text,
                type: intentType,
                domain: options.heuristic_intent?.domain || 'unknown',
                action: options.heuristic_intent?.action || 'ai_planned',
                confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0.85,
                status: 'ready',
                execution: {
                    target: normalizedTarget,
                    confirmation_required: parsed?.needs_confirmation === true,
                    toolchain
                }
            });
        } catch (error) {
            const normalized = normalizeAiProviderError(error);
            return normalizeVoiceIntent({
                intent_id: options.intent_id,
                utterance: { raw: utterance },
                locale,
                source: options.source,
                context: {
                    ...(options.context && typeof options.context === 'object' ? cloneValue(options.context) : {}),
                    ai_error: normalized.code,
                    ai_provider: providerConfig.providerId,
                    ai_model: providerConfig.model
                },
                assistant_reply: localizeAiFailure(normalized.code, locale),
                type: 'ambiguous',
                domain: options.heuristic_intent?.domain || 'unknown',
                action: options.heuristic_intent?.action || 'unknown',
                confidence: 0,
                status: 'failed',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }
    }
});
