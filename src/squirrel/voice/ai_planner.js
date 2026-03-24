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

const buildConversationHistorySection = (context, english) => {
    const turns = Array.isArray(context?.conversation_history) ? context.conversation_history : [];
    if (!turns.length) {
        return english ? 'CONVERSATION_HISTORY:\n(none)' : 'CONVERSATION_HISTORY:\n(aucune)';
    }
    const lines = turns.map((turn, i) => {
        const userLine = `  User: ${turn.user || ''}`;
        const assistLine = turn.assistant ? `  Assistant: ${turn.assistant}` : '  Assistant: (no reply)';
        const metaLine = turn.domain ? `  [domain: ${turn.domain}, action: ${turn.action || '?'}]` : '';
        return `Turn ${i + 1}:\n${userLine}\n${assistLine}${metaLine ? '\n' + metaLine : ''}`;
    });
    return `CONVERSATION_HISTORY:\n${lines.join('\n')}`;
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
            'Choose the best domain and action yourself from the user request.',
            'Use "atome_ai" for business tools such as mail, contacts, calendar, banking, documents, and high-level actions.',
            'Use "runtime_v2" for direct UI manipulation when a runtime tool exists.',
            'If the request is purely conversational, informational, or does not need a tool, use target "none" and actions [].',
            'Do not answer with progress placeholders like "I am preparing" or "it is coming".',
            'If a tool is needed to answer, choose the tool. If no tool is needed, give the final answer directly.',
            'For mail actions, choose the real mail action: list, search, read_current, read_next, summarize, reply_current, send, archive_current, delete_current, mark_read_current, or mark_unread_current.',
            'For mail queries, express semantic filters in action params instead of paraphrasing them away.',
            'Mail query params may include unread_only, status_only, from, not_from, mailbox, thread_id, query, limit, and order.',
            'order can be "oldest" or "newest". Use "oldest" when the user asks for the oldest, first, or earliest mail. Use "newest" when the user asks for the latest, most recent, or last mail. Default is "newest".',
            'limit must be extracted from the user request when a number is explicitly mentioned (e.g. "the 5 latest mails" -> limit:5).',
            'Example: "Do I have messages from people other than Jean-Eric?" -> domain "mail", action "list", params {"status_only":true,"not_from":"Jean-Eric"}. Use unread_only only if the user explicitly asks about unread or new mail.',
            'For reply_current, extract reply_target and draft_text from the utterance. Put them BOTH at the TOP LEVEL of the JSON response AND in the action params. Example: "Reply to Alice to ask if she is free tomorrow" -> {"reply":"Replied to Alice.","domain":"mail","action":"reply_current","target":"atome_ai","reply_target":"Alice","draft_text":"Are you free tomorrow?","actions":[{"target":"atome_ai","tool_name":"mail","params":{"reply_target":"Alice","draft_text":"Are you free tomorrow?","auto_send":true}}]}.',
            'CRITICAL: draft_text MUST be a proper direct-address message, never indirect speech. Reformulate the user\'s words into a real email sentence addressed to "tu". "reply to Bob to ask if he works today" -> draft_text "Do you work today?" NOT "if he works today". "reply to Alice to tell her to come at 3pm" -> draft_text "Can you come at 3pm?". "ask John if Sylvain is coming" -> draft_text "Is Sylvain coming?". "ask Jean-eric if he goes downtown" -> draft_text "Vas-tu en ville ?". Always reformulate, even when the subject is a third person name. NEVER copy raw text from the utterance starting with "si", "de", "que" — ALWAYS reformulate into a proper sentence.',
            'Distinguish sender (from), subject, and body. "from" filters by sender name/address, "query" searches subject+body text. "Who sent me..." = from filter. "Mail about X" = query filter.',
            'Use the CONVERSATION_HISTORY section to understand the context of the current request. Pronouns like "it", "that one", "the most recent" may refer to a previous query.',
            'Each new utterance is independent: do NOT carry over order, limit, or filters from the previous query unless the user explicitly refers to them.',
            'Never invent tools.',
            'Never choose another provider or mention fallback.'
        ]
        : [
            "Tu es le planner vocal de eVe.",
            'Retourne du JSON uniquement.',
            'Pas de markdown.',
            'Utilise exactement une seule cible d execution pour toutes les actions: "atome_ai", "runtime_v2" ou "none".',
            "Choisis toi-meme le meilleur domain et la meilleure action a partir de la demande utilisateur.",
            'Utilise "atome_ai" pour les outils metier comme mail, contacts, agenda, banque, documents et actions de haut niveau.',
            'Utilise "runtime_v2" pour la manipulation directe de l interface quand un tool runtime existe.',
            'Pour les tools runtime_v2 creatifs et visuels, preserve TOUJOURS les attributs explicites demandes par l utilisateur dans action.input: couleur, texte, taille, position, cible.',
            'Si la demande est conversationnelle, informative ou ne necessite aucun outil, utilise la cible "none" et actions [].',
            'Ne reponds jamais par une promesse vague du type "je prepare", "ca arrive" ou "je m en occupe" sans resultat concret.',
            'Si un outil est necessaire pour repondre, choisis un outil. Sinon, donne directement la reponse finale.',
            'Pour les actions mail, choisis la vraie action mail: list, search, read_current, read_next, summarize, reply_current, send, archive_current, delete_current, mark_read_current ou mark_unread_current.',
            'Pour les requetes mail, exprime les filtres semantiques dans les params au lieu de les perdre.',
            'Les params mail peuvent inclure unread_only, status_only, from, not_from, mailbox, thread_id, query, limit et order.',
            'order peut etre "oldest" ou "newest". Utilise "oldest" quand l utilisateur demande le plus ancien, le premier ou le premier arrive. Utilise "newest" quand il demande le plus recent ou le dernier. Par defaut "newest".',
            'limit doit etre extrait de la demande quand un nombre est explicitement mentionne (ex: "les 5 mails les plus recents" -> limit:5).',
            'Exemple: "Ai je des messages d autres personnes que Jean-Eric ?" -> domain "mail", action "list", params {"status_only":true,"not_from":"Jean-Eric"}. Utilise unread_only seulement si l utilisateur demande explicitement des mails non lus ou nouveaux.',
            'Pour reply_current, extrais reply_target et draft_text de la phrase. Mets-les AU NIVEAU RACINE du JSON ET dans les params de l action. Exemple: "Reponds a Alice pour lui demander si elle est libre demain" -> {"reply":"Repondu a Alice.","domain":"mail","action":"reply_current","target":"atome_ai","reply_target":"Alice","draft_text":"Es-tu libre demain ?","actions":[{"target":"atome_ai","tool_name":"mail","params":{"reply_target":"Alice","draft_text":"Es-tu libre demain ?","auto_send":true}}]}.',
            'CRITIQUE: draft_text DOIT etre un vrai message direct, jamais du discours indirect. Reformule les mots de l utilisateur en une vraie phrase de mail. "reponds a Bob pour lui demander si il travaille aujourd hui" -> draft_text "Travailles-tu aujourd\'hui ?" PAS "si il travaille aujourd hui". "demande a Alice si Sylvain va en ville" -> draft_text "Est-ce que Sylvain va en ville ?". "dis a Pierre de rappeler demain" -> draft_text "Peux-tu rappeler demain ?". "demande a Jean-eric si il va en ville" -> draft_text "Vas-tu en ville ?". Reformule toujours, meme quand le sujet est un prenom tiers. NE COPIE JAMAIS le texte brut commencant par "si", "de", "que" — reformule TOUJOURS en vraie phrase.',
            'Distingue bien expediteur (from), sujet et corps du mail. "from" filtre par expediteur, "query" cherche dans le sujet+corps. "Qui m a envoye..." = filtre from. "Mail a propos de X" = filtre query.',
            'Utilise la section CONVERSATION_HISTORY pour comprendre le contexte de la demande actuelle. Les pronoms comme "le", "celui-la", "le plus recent" peuvent se referer a une requete precedente.',
            'Chaque nouvelle phrase est independante: ne reporte PAS order, limit ou filtres de la requete precedente sauf si l utilisateur y fait explicitement reference.',
            'Exemple runtime_v2: "peux tu me creer un cercle rouge sur le projet courant" -> {"domain":"creative","action":"draw_circle","target":"runtime_v2","actions":[{"target":"runtime_v2","tool_id":"ui.circle","action":"pointer.click","input":{"color":"red"}}]}.',
            'Exemple runtime_v2 follow-up: "mets le en violet" -> {"domain":"creative","action":"apply_color","target":"runtime_v2","actions":[{"target":"runtime_v2","tool_id":"ui.couleur.apply","action":"pointer.click","input":{"color":"violet"}}]}.',
            "N invente jamais d outils.",
            "Ne choisis jamais un autre provider et ne parle jamais de fallback."
        ];

    const historySection = buildConversationHistorySection(context, english);

    // Strip draft_text from heuristic so the LLM reformulates from the utterance
    // instead of echoing the raw extracted text
    const sanitizedHeuristic = (() => {
        if (!heuristicIntent || typeof heuristicIntent !== 'object') return heuristicIntent;
        const h = JSON.parse(JSON.stringify(heuristicIntent));
        if (h.entities && typeof h.entities === 'object') {
            delete h.entities.draft_text;
        }
        if (Array.isArray(h.execution?.toolchain)) {
            for (const step of h.execution.toolchain) {
                if (step?.input && typeof step.input === 'object') delete step.input.draft_text;
                if (step?.params && typeof step.params === 'object') delete step.params.draft_text;
            }
        }
        return h;
    })();

    return [
        rules.join('\n'),
        '',
        english
            ? 'JSON schema: {"reply":"<string>","domain":"<string>","action":"<string>","target":"atome_ai|runtime_v2|none","needs_confirmation":false,"reply_target":"<string or null>","draft_text":"<reformulated reply body or null>","actions":[{"target":"atome_ai","tool_name":"<string>","params":{"unread_only":true,"status_only":true,"from":"Alice","not_from":"Jean-Eric","mailbox":"INBOX","thread_id":"<id>","limit":5,"reply_target":"Alice","draft_text":"the reply body","auto_send":true,"query":"search text"}},{"target":"runtime_v2","tool_id":"<string>","action":"pointer.click","input":{}}]}'
            : 'Schema JSON: {"reply":"<string>","domain":"<string>","action":"<string>","target":"atome_ai|runtime_v2|none","needs_confirmation":false,"reply_target":"<string ou null>","draft_text":"<corps du message reformule ou null>","actions":[{"target":"atome_ai","tool_name":"<string>","params":{"unread_only":true,"status_only":true,"from":"Alice","not_from":"Jean-Eric","mailbox":"INBOX","thread_id":"<id>","limit":5,"reply_target":"Alice","draft_text":"le corps de la reponse","auto_send":true,"query":"texte de recherche"}},{"target":"runtime_v2","tool_id":"<string>","action":"pointer.click","input":{}}]}',
        '',
        `LOCALE:\n${locale}`,
        '',
        historySection,
        '',
        `UTTERANCE:\n${String(utterance || '')}`,
        '',
        `CONTEXT:\n${JSON.stringify(context || {}, null, 2)}`,
        '',
        `HEURISTIC_INTENT:\n${JSON.stringify(sanitizedHeuristic || null, null, 2)}`,
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

            // Extract mail-specific params: first from TOP-LEVEL parsed fields,
            // then from raw parsed actions as fallback
            const rawActions = Array.isArray(parsed?.actions) ? parsed.actions : [];
            const llmEntities = {};
            // Top-level fields (most reliable — always present regardless of target/actions)
            if (parsed?.draft_text) llmEntities.draft_text = String(parsed.draft_text);
            if (parsed?.reply_target) llmEntities.reply_target = String(parsed.reply_target);
            // Fallback: scan raw actions params
            for (const act of rawActions) {
                if (!act || typeof act !== 'object') continue;
                const p = act.params && typeof act.params === 'object' ? act.params : null;
                if (!p) continue;
                if (p.draft_text && !llmEntities.draft_text) llmEntities.draft_text = String(p.draft_text);
                if (p.reply_target && !llmEntities.reply_target) llmEntities.reply_target = String(p.reply_target);
                if (p.auto_send !== undefined && llmEntities.auto_send === undefined) llmEntities.auto_send = p.auto_send;
            }

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
                domain: toText(parsed?.domain) || options.heuristic_intent?.domain || 'unknown',
                action: toText(parsed?.action) || options.heuristic_intent?.action || 'ai_planned',
                confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0.85,
                status: 'ready',
                entities: Object.keys(llmEntities).length ? llmEntities : undefined,
                execution: {
                    target: normalizedTarget,
                    confirmation_required: parsed?.needs_confirmation === true
                        && normalizedTarget !== 'none'
                        && toolchain.length > 0,
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
