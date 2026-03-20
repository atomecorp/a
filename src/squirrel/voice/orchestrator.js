import { classifyVoiceIntent, normalizeVoiceIntent } from './intent_schema.js';
import {
    normalizeAiProviderError,
    requestProviderCompletion,
    resolveFirstAiProviderConfig
} from '../ai/provider_client.js';

export const VOICE_ORCHESTRATOR_EVENT_NAME = 'squirrel:voice:orchestrator';

const defaultEnv = () => (typeof window !== 'undefined' ? window : globalThis);

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

const readEnv = (env, key) => {
    if (!env || typeof env !== 'object') return null;
    if (key in env) return env[key];
    if (env.window && typeof env.window === 'object' && key in env.window) return env.window[key];
    return null;
};

const ensureToolchain = (intent) => Array.isArray(intent?.execution?.toolchain)
    ? intent.execution.toolchain.filter((step) => step && typeof step === 'object')
    : [];

const normalizeInvocationMeta = (intent, options = {}) => {
    const meta = {};
    if (intent?.intent_id) meta.intent_id = String(intent.intent_id);
    if (options?.trace_id) meta.trace_id = String(options.trace_id);
    if (options?.idempotency_key) meta.idempotency_key = String(options.idempotency_key);
    return meta;
};

const normalizeInvocationSource = (intent, options = {}) => ({
    type: 'voice',
    layer: String(options?.source_layer || 'voice_orchestrator'),
    domain: String(intent?.domain || 'unknown'),
    action: String(intent?.action || 'unknown')
});

const normalizeBatchEvents = (intent, options = {}) => ensureToolchain(intent).map((step) => ({
    tool_id: step.tool_id,
    action: step.action || 'pointer.click',
    input: step.input && typeof step.input === 'object' ? { ...step.input } : {},
    source: normalizeInvocationSource(intent, options),
    meta: normalizeInvocationMeta(intent, options)
}));

const buildPendingConnectorStep = (capability, input = {}) => ({
    source: 'pending_connector',
    capability: String(capability || '').trim() || null,
    input: input && typeof input === 'object' ? { ...input } : {}
});

const BUSINESS_CONNECTOR_DOMAINS = new Set(['mail', 'calendar', 'contacts', 'bank']);

const wait = (ms = 0) => new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
});

const withSoftTimeout = async (task, {
    timeoutMs = 0,
    fallbackValue = null
} = {}) => {
    const duration = Number(timeoutMs);
    if (!Number.isFinite(duration) || duration <= 0) {
        return task();
    }
    return Promise.race([
        Promise.resolve().then(() => task()),
        wait(duration).then(() => fallbackValue)
    ]);
};

const resolveMailApi = async (env) => {
    const existing = env?.Squirrel?.mail || env?.atome?.mail || env?.AtomeMail || env?.window?.Squirrel?.mail || env?.window?.atome?.mail || env?.window?.AtomeMail || null;
    if (existing) return existing;
    const mod = await import('../mail/bootstrap.js');
    if (typeof mod?.createGlobalMailApi === 'function') {
        return mod.createGlobalMailApi({ env });
    }
    return null;
};

const dispatchWindowEvent = (env, name, detail) => {
    if (!env || typeof env.dispatchEvent !== 'function') return;
    if (!name || typeof env.CustomEvent !== 'function') return;
    try {
        env.dispatchEvent(new env.CustomEvent(name, { detail }));
    } catch (_) {
        // Ignore non-browser hosts.
    }
};

const truncateForAi = (value, maxLength = 600) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const normalizeComparableText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeReplyDraftText = (value) => String(value || '')
    .trim()
    .replace(/^(?:que\s+|qu['’]\s*)/i, '')
    .trim();

const collectMailCandidates = (...groups) => {
    const seen = new Set();
    const items = [];
    for (const group of groups) {
        for (const item of Array.isArray(group) ? group : []) {
            const messageId = String(item?.message_id || '').trim();
            if (!messageId || seen.has(messageId)) continue;
            seen.add(messageId);
            items.push(item);
        }
    }
    return items;
};

const findMailByReplyTarget = (items = [], replyTarget = '') => {
    const normalizedTarget = normalizeComparableText(replyTarget);
    if (!normalizedTarget) return null;
    return items.find((item) => {
        const senderName = normalizeComparableText(item?.from?.name);
        const senderAddress = normalizeComparableText(item?.from?.address);
        return (
            (senderName && (senderName.includes(normalizedTarget) || normalizedTarget.includes(senderName)))
            || (senderAddress && senderAddress.includes(normalizedTarget))
        );
    }) || null;
};

const buildMailReplyAcknowledgement = ({
    draft = null,
    sourceItem = null,
    locale = 'fr-FR'
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const recipient = String(
        sourceItem?.from?.name
        || sourceItem?.from?.address
        || draft?.to?.[0]?.name
        || draft?.to?.[0]?.address
        || ''
    ).trim();
    const bodyText = String(draft?.body_text || '').trim();
    if (english) {
        return recipient
            ? `I prepared a reply to ${recipient}: "${bodyText}". Say "send the mail" to send it.`
            : `I prepared the reply draft: "${bodyText}". Say "send the mail" to send it.`;
    }
    return recipient
        ? `J'ai prepare une reponse a ${recipient}: "${bodyText}". Dis "envoie le mail" pour l'envoyer.`
        : `J'ai prepare le brouillon de reponse: "${bodyText}". Dis "envoie le mail" pour l'envoyer.`;
};

const buildMailSendAcknowledgement = ({
    locale = 'fr-FR',
    queued = false,
    recipient = ''
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    if (english) {
        if (queued) {
            return recipient
                ? `The mail for ${recipient} is queued locally.`
                : 'The mail is queued locally.';
        }
        return recipient
            ? `The mail has been sent to ${recipient}.`
            : 'The mail has been sent.';
    }
    if (queued) {
        return recipient
            ? `Le mail pour ${recipient} est en file d'attente locale.`
            : "Le mail est en file d'attente locale.";
    }
    return recipient
        ? `Le mail a ete envoye a ${recipient}.`
        : 'Le mail a ete envoye.';
};

const buildMailSummaryPrompt = ({
    items = [],
    stats = {},
    locale = 'fr-FR'
} = {}) => {
    const english = String(locale || '').toLowerCase().startsWith('en');
    const payload = items.slice(0, 5).map((item, index) => ({
        rank: index + 1,
        subject: String(item?.subject || '').trim() || '(sans objet)',
        from: String(item?.from?.name || item?.from?.address || '').trim() || '(expediteur inconnu)',
        unread: item?.unread === true,
        received_at: item?.received_at || null,
        preview: truncateForAi(item?.preview || item?.body_text || '', 800),
        body_text: truncateForAi(item?.body_text || '', 1600)
    }));

    const instructions = english
        ? [
            'You are eVe, summarizing recent emails for a voice reply.',
            'Use the provided emails only.',
            'Respond in concise natural English for speech.',
            'Mention the important senders, topics, and any clear action items.',
            'If there are no unread emails but there are recent emails, summarize the latest recent emails anyway.',
            'Do not say "message(s) out of". Do not produce raw counts only.'
        ]
        : [
            'Tu es eVe, tu resumes des emails recents pour une reponse vocale.',
            'Utilise uniquement les emails fournis.',
            'Reponds en francais naturel, concis, adapte a l oral.',
            'Mentionne les expediteurs importants, les sujets, et les actions evidentes si elles existent.',
            "S'il n'y a aucun mail non lu mais qu'il y a des mails recents, resume quand meme les derniers mails.",
            'Ne dis pas "message(s) out of". Ne renvoie pas seulement un compteur brut.'
        ];

    return [
        instructions.join('\n'),
        '',
        `MAIL_STATS:\n${JSON.stringify({
            total: Number(stats?.total || 0),
            unread: Number(stats?.unread || 0)
        }, null, 2)}`,
        '',
        `MAIL_ITEMS:\n${JSON.stringify(payload, null, 2)}`
    ].join('\n');
};

const createDefaultMailAiSummarizer = ({
    env = defaultEnv(),
    fetchImpl = null
} = {}) => async ({
    items = [],
    stats = {},
    locale = 'fr-FR'
} = {}) => {
    const providerConfig = await resolveFirstAiProviderConfig();
    if (providerConfig?.ok !== true) {
        return {
            ok: false,
            error: String(providerConfig?.error || 'no_ai_key_configured')
        };
    }
    try {
        const text = await requestProviderCompletion({
            providerId: providerConfig.providerId,
            model: providerConfig.model,
            apiKey: providerConfig.apiKey,
            systemPrompt: buildMailSummaryPrompt({ items, stats, locale }),
            prompt: String(locale || '').toLowerCase().startsWith('en')
                ? 'Summarize these recent emails for the user.'
                : 'Resume ces derniers emails pour l utilisateur.',
            ...(typeof fetchImpl === 'function'
                ? { fetchImpl }
                : (typeof env?.fetch === 'function' ? { fetchImpl: env.fetch.bind(env) } : {}))
        });
        const normalized = String(text || '').trim();
        if (!normalized) {
            return { ok: false, error: 'provider_empty_response' };
        }
        return {
            ok: true,
            text: normalized
        };
    } catch (error) {
        const normalized = normalizeAiProviderError(error);
        return {
            ok: false,
            error: normalized.code,
            message: normalized.message
        };
    }
};

const createMcpBridge = (env) => {
    const asyncHandler = readEnv(env, 'handleAtomeMCPRequestAsync');
    if (typeof asyncHandler !== 'function') return null;
    return {
        kind: 'mcp',
        async listRuntimeTools() {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tools-list',
                method: 'runtime.tools.list',
                params: {}
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.list failed');
            }
            return Array.isArray(response?.result?.tools) ? response.result.tools : [];
        },
        async callRuntimeTool(payload = {}) {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tool-call',
                method: 'runtime.tools.call',
                params: payload
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.call failed');
            }
            return response.result;
        },
        async batchRuntimeTools(events = [], options = {}) {
            const response = await asyncHandler({
                jsonrpc: '2.0',
                id: 'voice-runtime-tool-batch',
                method: 'runtime.tools.batch_call',
                params: {
                    events,
                    ...(options?.tx_id ? { tx_id: options.tx_id } : {})
                }
            });
            if (response?.error) {
                throw new Error(response.error.message || 'MCP runtime.tools.batch_call failed');
            }
            return response.result;
        }
    };
};

const createRuntimeBridge = (env) => {
    const runtime = readEnv(env, 'atome')?.tools?.v2Runtime
        || readEnv(env, 'window')?.atome?.tools?.v2Runtime
        || null;
    if (!runtime || typeof runtime.invokeById !== 'function') return null;
    return {
        kind: 'runtime_v2',
        async listRuntimeTools() {
            if (typeof runtime.listTools !== 'function') return [];
            return runtime.listTools({ includeDisabled: false });
        },
        async callRuntimeTool(payload = {}) {
            return runtime.invokeById(payload);
        },
        async batchRuntimeTools(events = [], options = {}) {
            if (typeof runtime.invokeBatch === 'function') {
                return runtime.invokeBatch(events, options);
            }
            const results = [];
            for (const event of events) {
                results.push(await runtime.invokeById(event));
            }
            return { ok: results.every((entry) => entry?.ok !== false), results };
        }
    };
};

export const resolveVoiceExecutionBridge = (env = defaultEnv()) => {
    return createMcpBridge(env) || createRuntimeBridge(env) || null;
};

class VoiceOrchestrator {
    constructor({
        env = defaultEnv(),
        bridge = resolveVoiceExecutionBridge(env),
        aiPlanner = null,
        mailAiSummarizer = null,
        classifyIntent = classifyVoiceIntent,
        sessionRuntime = null,
        now = () => Date.now(),
        eventName = VOICE_ORCHESTRATOR_EVENT_NAME
    } = {}) {
        this.env = env;
        this.bridge = bridge;
        this.aiPlanner = aiPlanner && typeof aiPlanner.planUtterance === 'function' ? aiPlanner : null;
        this.mailAiSummarizer = typeof mailAiSummarizer === 'function'
            ? mailAiSummarizer
            : createDefaultMailAiSummarizer({ env });
        this.classifyIntent = typeof classifyIntent === 'function' ? classifyIntent : classifyVoiceIntent;
        this.sessionRuntime = sessionRuntime && typeof sessionRuntime.getSession === 'function' ? sessionRuntime : null;
        this.now = typeof now === 'function' ? now : (() => Date.now());
        this.eventName = String(eventName || VOICE_ORCHESTRATOR_EVENT_NAME);
        this.runtimeCatalog = null;
        this.listeners = new Set();
        this.journal = [];
        this.seq = 0;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    listJournal({ limit = 50 } = {}) {
        const size = Number.isFinite(Number(limit)) ? Math.max(1, Math.round(Number(limit))) : 50;
        return cloneValue(this.journal.slice(-size));
    }

    clearJournal() {
        this.journal = [];
        this.seq = 0;
    }

    async listRuntimeTools({ refresh = false } = {}) {
        if (!refresh && Array.isArray(this.runtimeCatalog)) {
            return cloneValue(this.runtimeCatalog);
        }
        if (!this.bridge || typeof this.bridge.listRuntimeTools !== 'function') {
            this.runtimeCatalog = [];
            return [];
        }
        const tools = await this.bridge.listRuntimeTools();
        this.runtimeCatalog = Array.isArray(tools) ? cloneValue(tools) : [];
        return cloneValue(this.runtimeCatalog);
    }

    async planUtterance(utterance, options = {}) {
        const runtimeTools = options.runtime_tools || await this.listRuntimeTools({
            refresh: options.refresh_catalog === true
        });
        const planningContext = this.#buildPlanningContext(options.session_id, options.context);
        const aiFirst = options.use_ai !== false && !!this.aiPlanner;
        const heuristicIntent = this.classifyIntent(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: planningContext,
            runtime_tools: runtimeTools,
            allow_business_heuristics: aiFirst !== true
        });
        const normalizedHeuristic = normalizeVoiceIntent(heuristicIntent);
        const normalizedFallback = aiFirst === true
            ? normalizeVoiceIntent(this.classifyIntent(utterance, {
                intent_id: options.intent_id,
                locale: options.locale,
                source: options.source,
                context: planningContext,
                runtime_tools: runtimeTools,
                allow_business_heuristics: true
            }))
            : normalizedHeuristic;
        const normalizedIntent = await this.#resolvePlanningIntent(utterance, {
            ...options,
            locale: options.locale,
            context: planningContext,
            runtime_tools: runtimeTools,
            heuristic_intent: normalizedHeuristic,
            fallback_intent: normalizedFallback
        });
        this.#bindSessionIntent(options.session_id, normalizedIntent, {
            phase: 'planned'
        });
        this.#pushJournal('voice.intent.planned', {
            utterance: normalizedIntent.utterance.raw,
            intent: normalizedIntent
        });
        return normalizedIntent;
    }

    planSessionFollowup(sessionId, {
        consume = false,
        nextPhase = 'processing',
        allowResume = true
    } = {}) {
        if (!this.sessionRuntime) {
            throw new Error('Voice session runtime is not available for followup planning');
        }
        const snapshot = this.sessionRuntime.getSession(sessionId);
        const consumed = consume === true
            ? this.sessionRuntime.consumePendingFollowup(sessionId, { nextPhase, allowResume })
            : null;
        const followup = consumed?.followup
            || snapshot?.conversation?.pending_followup
            || ((allowResume === true && snapshot?.conversation?.resume_available) ? 'resume_interrupted' : null);
        if (!followup) return null;
        const activeIntent = consumed?.active_intent || snapshot?.conversation?.active_intent || null;
        const planned = this.#buildContextualFollowupIntent({
            sessionId,
            followup,
            activeIntent
        });
        this.#bindSessionIntent(sessionId, planned, {
            phase: consume === true ? 'followup_consumed' : 'followup_planned',
            followup
        });
        this.#pushJournal('voice.followup.planned', {
            session_id: sessionId,
            followup,
            intent: planned
        });
        return planned;
    }

    async executeSessionFollowup(sessionId, options = {}) {
        const planned = this.planSessionFollowup(sessionId, {
            consume: options.consume !== false,
            nextPhase: options.nextPhase || 'processing',
            allowResume: options.allowResume !== false
        });
        if (!planned) return null;
        return this.executeIntent(planned, {
            ...options,
            session_id: sessionId
        });
    }

    async executeIntent(intent, options = {}) {
        const normalizedIntent = normalizeVoiceIntent(intent);
        const intentCapabilities = Array.isArray(normalizedIntent?.requested_capabilities)
            ? normalizedIntent.requested_capabilities.map((entry) => String(entry || '').trim()).filter(Boolean)
            : [];
        const isMailDraftIntent = normalizedIntent?.domain === 'mail'
            && (
                normalizedIntent?.action === 'reply_current'
                || intentCapabilities.includes('mail_reply_draft')
            );
        if (isMailDraftIntent && normalizedIntent.execution?.confirmation_required === true) {
            normalizedIntent.execution.confirmation_required = false;
        }
        this.#bindSessionIntent(options.session_id, normalizedIntent, {
            phase: 'executing'
        });
        if (normalizedIntent.status === 'failed' && normalizedIntent.context?.ai_error) {
            const response = {
                ok: false,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                error: normalizedIntent.context.ai_error,
                reply_text: normalizedIntent.assistant_reply || null,
                spoken_reply: normalizedIntent.assistant_reply || null
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }
        if (normalizedIntent.execution.confirmation_required === true && options.confirmed !== true) {
            const response = {
                ok: true,
                executed: false,
                transport: normalizedIntent.execution.target,
                intent: normalizedIntent,
                reason: 'confirmation_required',
                confirmation_required: true,
                confirmation_prompt: options.confirmation_prompt
                    || `Confirm ${normalizedIntent.domain}:${normalizedIntent.action} before execution.`
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }
        const toolchain = ensureToolchain(normalizedIntent);
        const replyText = typeof normalizedIntent.assistant_reply === 'string' ? normalizedIntent.assistant_reply.trim() : '';

        if (normalizedIntent.execution.target === 'voice_runtime') {
            const response = {
                ok: true,
                executed: false,
                transport: 'voice_runtime',
                intent: normalizedIntent,
                reason: 'local_command_handled_by_voice_runtime',
                ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target === 'none') {
            const response = {
                ok: !!replyText,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                ...(replyText
                    ? {
                        reply_text: replyText,
                        spoken_reply: replyText
                    }
                    : {
                        error: 'voice_intent_not_executable'
                    })
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target === 'pending_connector') {
            const resolved = await this.#executePendingConnector(normalizedIntent, toolchain, options);
            if (resolved) {
                this.#pushJournal('voice.intent.executed', resolved);
                return resolved;
            }
            const response = {
                ok: true,
                executed: false,
                transport: 'pending_connector',
                intent: normalizedIntent,
                requested_capabilities: cloneValue(normalizedIntent.requested_capabilities),
                reason: 'connector_not_implemented_yet',
                ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target === 'atome_ai') {
            const response = await this.#executeAgentToolchain(normalizedIntent, toolchain, options);
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (normalizedIntent.execution.target !== 'runtime_v2') {
            const response = {
                ok: false,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                error: 'voice_intent_not_executable'
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (!this.bridge) {
            const response = {
                ok: false,
                executed: false,
                transport: 'none',
                intent: normalizedIntent,
                error: 'voice_execution_bridge_unavailable'
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        const events = normalizeBatchEvents(normalizedIntent, options);
        if (!events.length) {
            const response = {
                ok: false,
                executed: false,
                transport: this.bridge.kind,
                intent: normalizedIntent,
                error: 'voice_toolchain_empty'
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        if (events.length === 1) {
            const result = await this.bridge.callRuntimeTool(events[0]);
            const response = {
                ok: result?.ok !== false,
                executed: true,
                transport: this.bridge.kind,
                intent: normalizedIntent,
                result,
                ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
            };
            this.#pushJournal('voice.intent.executed', response);
            return response;
        }

        const result = await this.bridge.batchRuntimeTools(events, {
            tx_id: options.tx_id || normalizedIntent.intent_id || undefined
        });
        const response = {
            ok: result?.ok !== false,
            executed: true,
            transport: this.bridge.kind,
            intent: normalizedIntent,
            result,
            ...(replyText ? { reply_text: replyText, spoken_reply: replyText } : {})
        };
        this.#pushJournal('voice.intent.executed', response);
        return response;
    }

    async executeUtterance(utterance, options = {}) {
        const intent = await this.planUtterance(utterance, options);
        return this.executeIntent(intent, options);
    }

    #buildPlanningContext(sessionId, providedContext = {}) {
        const context = providedContext && typeof providedContext === 'object'
            ? cloneValue(providedContext)
            : {};
        const key = String(sessionId || '').trim();
        if (!key || !this.sessionRuntime) return context;
        try {
            const activeIntent = this.sessionRuntime.getActiveIntent(key);
            if (activeIntent && !context.active_intent) {
                context.active_intent = activeIntent;
            }
        } catch (_) {
            // Ignore unknown session context reads.
        }
        return context;
    }

    async #resolvePlanningIntent(utterance, options = {}) {
        const heuristicIntent = normalizeVoiceIntent(options.heuristic_intent);
        const fallbackIntent = normalizeVoiceIntent(options.fallback_intent || heuristicIntent);
        if (
            heuristicIntent.type === 'local_command'
            || options.use_ai === false
            || !this.aiPlanner
        ) {
            return fallbackIntent;
        }

        const fallbackExecutable = fallbackIntent?.status !== 'ambiguous'
            && fallbackIntent?.status !== 'failed'
            && (
                fallbackIntent?.execution?.target !== 'none'
                || String(fallbackIntent?.assistant_reply || '').trim().length > 0
            );

        const plannedIntent = normalizeVoiceIntent(await this.aiPlanner.planUtterance(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: options.context,
            runtime_tools: options.runtime_tools,
            heuristic_intent: heuristicIntent,
            ...(options.signal ? { signal: options.signal } : {})
        }));

        const plannedTarget = String(plannedIntent?.execution?.target || 'none').trim();
        const plannedToolchain = ensureToolchain(plannedIntent);
        const plannedReply = String(plannedIntent?.assistant_reply || '').trim();
        const plannerProducedToolIntent = plannedIntent?.status === 'ready'
            && plannedTarget !== 'none'
            && plannedToolchain.length > 0;
        const plannerProducedFreeReply = plannedIntent?.status === 'ready'
            && plannedTarget === 'none'
            && plannedReply.length > 0;
        const businessConnectorFallback = fallbackExecutable
            && BUSINESS_CONNECTOR_DOMAINS.has(String(fallbackIntent?.domain || '').trim());

        // For business connectors, keep the LLM as the interpreter but execute through the
        // deterministic connector route when one is available. This prevents the planner from
        // claiming that a mail was sent while bypassing the real mail transport.
        if (businessConnectorFallback) {
            return fallbackIntent;
        }

        if (plannerProducedToolIntent) {
            return plannedIntent;
        }

        // If the planner only produced a conversational placeholder while a concrete
        // local/business route exists, prefer the executable fallback.
        if (fallbackExecutable) {
            return fallbackIntent;
        }

        if (plannerProducedFreeReply) {
            return plannedIntent;
        }

        return plannedIntent;
    }

    #bindSessionIntent(sessionId, intent, meta = {}) {
        const key = String(sessionId || '').trim();
        if (!key || !this.sessionRuntime || !intent || typeof intent !== 'object') return;
        if (intent.execution?.target === 'voice_runtime' && meta.phase === 'executing') return;
        try {
            this.sessionRuntime.bindIntentContext(key, intent, meta);
        } catch (_) {
            // Ignore stale or unknown session bindings from exploratory calls.
        }
    }

    async #executeAgentToolchain(intent, toolchain, options = {}) {
        const agent = this.env?.AtomeAI || this.env?.window?.AtomeAI || null;
        if (!agent || typeof agent.callTool !== 'function') {
            return {
                ok: false,
                executed: false,
                transport: 'atome_ai',
                intent,
                error: 'voice_agent_bridge_unavailable',
                ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
            };
        }
        if (!toolchain.length) {
            return {
                ok: !!intent.assistant_reply,
                executed: false,
                transport: 'atome_ai',
                intent,
                ...(intent.assistant_reply
                    ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply }
                    : { error: 'voice_toolchain_empty' })
            };
        }

        const actor = {
            user_id: options.actor?.user_id || 'local_user',
            agent_id: 'voice_ai_planner',
            session_id: options.session_id || 'voice'
        };
        const signals = {
            overall_confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : 0.92
        };
        const source = normalizeInvocationSource(intent, options);
        const results = [];

        for (const step of toolchain) {
            const result = await agent.callTool({
                tool_name: step.tool_name,
                params: step.params || {},
                actor,
                signals,
                trace_id: options.trace_id,
                intent_id: options.intent_id || intent.intent_id,
                idempotency_key: options.idempotency_key,
                source
            });
            results.push({
                tool_name: step.tool_name,
                result
            });
            if (result?.status && result.status !== 'OK') {
                return {
                    ok: false,
                    executed: true,
                    transport: 'atome_ai',
                    intent,
                    result: { results },
                    error: result.error || result.status,
                    ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
                };
            }
        }

        return {
            ok: true,
            executed: true,
            transport: 'atome_ai',
            intent,
            result: { results },
            ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
        };
    }

    async #executePendingConnector(intent, toolchain, options = {}) {
        if (intent?.domain !== 'mail') return null;
        const mail = await resolveMailApi(this.env);
        if (!mail) return null;
        let readyResult = null;

        try {
            if (typeof mail.ensureReady === 'function') {
                readyResult = await mail.ensureReady({
                    initial: false,
                    limit: 20
                });
            }
        } catch (_) {
            // Keep the rest of the mail fallback path alive.
        }

        let connectorStatus = null;
        try {
            connectorStatus = typeof mail.connectorStatus === 'function' ? mail.connectorStatus() : null;
            if (connectorStatus?.configured && typeof mail.syncPull === 'function') {
                const syncTimeoutMs = Number.isFinite(Number(
                    this.env?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                    || this.env?.window?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                ))
                    ? Math.max(0, Number(
                        this.env?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                        || this.env?.window?.__SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS
                    ))
                    : 2500;
                const syncResult = await withSoftTimeout(
                    () => mail.syncPull({ initial: false }),
                    {
                        timeoutMs: syncTimeoutMs,
                        fallbackValue: {
                            ok: false,
                            error: 'mail_sync_pull_timeout'
                        }
                    }
                );
                if (syncResult?.error === 'mail_sync_pull_timeout') {
                    this.#pushJournal('voice.intent.connector_timeout', {
                        domain: 'mail',
                        action: intent?.action || null,
                        timeout_ms: syncTimeoutMs
                    });
                }
            }
        } catch (_) {
            // Ignore sync refresh failures and keep the local index fallback.
        }

        const capabilities = toolchain
            .map((step) => String(step?.capability || '').trim())
            .filter(Boolean);

        const locale = String(intent?.locale || options?.locale || 'fr-FR').toLowerCase();
        const english = locale.startsWith('en');
        const buildResponse = (payload = {}) => ({
            ok: payload.ok !== false,
            executed: payload.executed !== false,
            transport: 'mail_api',
            intent,
            ...(payload.error ? { error: payload.error } : {}),
            ...(payload.result ? { result: payload.result } : {}),
            ...(payload.reply_text ? { reply_text: payload.reply_text, spoken_reply: payload.reply_text } : {})
        });
        const unreadOnly = intent?.entities?.unread_only === true
            || toolchain.some((step) => step?.input?.unread_only === true);
        const statusOnly = intent?.entities?.status_only === true
            || toolchain.some((step) => step?.input?.status_only === true);

        const topList = typeof mail.list === 'function' ? mail.list({ limit: 5 }) : { ok: false, items: [] };
        const unreadList = typeof mail.list === 'function'
            ? mail.list({ limit: 5, unread_only: true })
            : { ok: false, items: [] };
        const hasIndexedMail = Array.isArray(topList?.items) && topList.items.length > 0;
        if (!connectorStatus?.configured && !hasIndexedMail) {
            const readyError = String(readyResult?.error || '').trim();
            if (
                readyError === 'icloud_mail_live_smoke_missing_credentials'
                || readyError === 'icloud_mail_credentials_missing'
            ) {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: readyError,
                    reply_text: english
                        ? 'I do not see any iCloud Mail credentials configured on this machine yet.'
                        : "Je ne trouve pas encore les identifiants iCloud Mail sur cette machine."
                });
            }
            const surfacedError = readyError && readyError !== 'mail_connector_missing' && readyError !== 'mail_remote_sync_unavailable'
                ? readyError
                : 'mail_connector_unavailable';
            return buildResponse({
                ok: false,
                executed: false,
                error: surfacedError,
                reply_text: english
                    ? 'I do not have access to your mail here yet.'
                    : "Je n'ai pas encore acces a tes mails ici."
            });
        }
        const nextUnread = typeof mail.nextUnread === 'function' ? mail.nextUnread({}) : { ok: false, error: 'mail_next_unread_not_found' };

        if (capabilities.includes('mail_next_unread') || intent.action === 'read') {
            if (nextUnread?.ok === true && nextUnread.item?.message_id && typeof mail.buildReadout === 'function') {
                const readout = mail.buildReadout(nextUnread.item.message_id, {
                    mode: 'summary'
                });
                if (readout?.ok === true) {
                    return buildResponse({
                        result: {
                            item: nextUnread.item,
                            readout
                        },
                        reply_text: readout.text
                    });
                }
            }
            const fallback = topList?.items?.[0];
            if (fallback?.message_id && typeof mail.buildReadout === 'function') {
                const readout = mail.buildReadout(fallback.message_id, {
                    mode: 'summary'
                });
                if (readout?.ok === true) {
                    return buildResponse({
                        result: {
                            item: fallback,
                            readout
                        },
                        reply_text: readout.text
                    });
                }
            }
            return buildResponse({
                ok: false,
                executed: false,
                error: 'mail_next_unread_not_found',
                reply_text: english ? 'I do not see any mail to read right now.' : "Je ne vois pas de mail a lire pour le moment."
            });
        }

        if (capabilities.includes('mail_summarize') || intent.action === 'summarize') {
            const summary = typeof mail.summarize === 'function'
                ? mail.summarize({
                    unread_only: unreadOnly,
                    limit: 10
                })
                : null;
            if (summary?.ok === true) {
                const itemsForAi = Array.isArray(summary?.items) && summary.items.length > 0
                    ? summary.items
                    : (Array.isArray(topList?.items) ? topList.items : []);
                if (itemsForAi.length > 0 && typeof this.mailAiSummarizer === 'function') {
                    const aiSummary = await this.mailAiSummarizer({
                        items: itemsForAi,
                        stats: summary?.stats || topList?.stats || null,
                        locale
                    });
                    if (aiSummary?.ok === true && aiSummary?.text) {
                        return buildResponse({
                            result: {
                                ...summary,
                                ai_summary: aiSummary.text
                            },
                            reply_text: aiSummary.text
                        });
                    }
                }
                return buildResponse({
                    result: summary,
                    reply_text: summary.summary
                });
            }
        }

        if (capabilities.includes('mail_list') || intent.action === 'list') {
            const listing = unreadOnly ? unreadList : topList;
            if (statusOnly) {
                const unreadCount = Number(unreadList?.stats?.unread || 0);
                const subjects = (unreadList?.items || [])
                    .slice(0, 3)
                    .map((item) => String(item?.subject || '').trim())
                    .filter(Boolean);
                const replyText = unreadCount <= 0
                    ? (english ? 'You do not have any unread mail.' : "Tu n'as pas de mail non lu.")
                    : (subjects.length
                        ? (english
                            ? `You have ${unreadCount} unread mail(s): ${subjects.join(', ')}.`
                            : `Tu as ${unreadCount} mail(s) non lu(s): ${subjects.join(', ')}.`)
                        : (english
                            ? `You have ${unreadCount} unread mail(s).`
                            : `Tu as ${unreadCount} mail(s) non lu(s).`));
                return buildResponse({
                    result: unreadList,
                    reply_text: replyText
                });
            }
            if (listing?.ok === true) {
                const subjects = (listing.items || [])
                    .slice(0, 3)
                    .map((item) => String(item?.subject || '').trim())
                    .filter(Boolean);
                const replyText = subjects.length
                    ? (english
                        ? (unreadOnly
                            ? `Here are the unread mails: ${subjects.join(', ')}.`
                            : `Here are the latest mails: ${subjects.join(', ')}.`)
                        : (unreadOnly
                            ? `Voici les mails non lus: ${subjects.join(', ')}.`
                            : `Voici les derniers mails: ${subjects.join(', ')}.`))
                    : (english
                        ? (unreadOnly ? 'I do not see any unread mail right now.' : 'I do not see any mail right now.')
                        : (unreadOnly ? "Je ne vois pas de mail non lu pour le moment." : "Je ne vois pas de mail pour le moment."));
                return buildResponse({
                    result: listing,
                    reply_text: replyText
                });
            }
        }

        if (capabilities.includes('mail_reply_draft')) {
            const replyStep = toolchain.find((step) => step?.capability === 'mail_reply_draft') || null;
            const replyTarget = String(
                replyStep?.input?.reply_target
                || intent?.entities?.reply_target
                || ''
            ).trim();
            const autoSend = (
                replyStep?.input?.auto_send === true
                || intent?.entities?.auto_send === true
            );
            const rawDraftText = String(
                replyStep?.input?.draft_text
                || intent?.entities?.draft_text
                || ''
            ).trim();
            const draftText = sanitizeReplyDraftText(rawDraftText);

            if (!draftText) {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_reply_text_missing',
                    reply_text: english
                        ? 'What should I reply to this mail?'
                        : 'Que veux-tu que je reponde a ce mail ?'
                });
            }

            const candidates = collectMailCandidates(
                topList?.items,
                nextUnread?.ok === true ? [nextUnread.item] : []
            );
            const sourceItem = findMailByReplyTarget(candidates, replyTarget)
                || (nextUnread?.ok === true ? nextUnread.item : null)
                || candidates[0]
                || null;

            if (!sourceItem?.message_id || typeof mail.replyDraft !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_not_found',
                    reply_text: english
                        ? 'I do not see which mail to reply to right now.'
                        : "Je ne vois pas encore a quel mail repondre."
                });
            }

            const draftResult = mail.replyDraft(sourceItem.message_id, {
                reply_text: draftText
            });
            if (draftResult?.ok === true && draftResult?.draft) {
                const boundIntent = {
                    ...intent,
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        draft_text: draftText,
                        auto_send: autoSend,
                        last_draft_id: draftResult.draft.draft_id,
                        last_source_message_id: sourceItem.message_id,
                        ...(replyTarget ? { reply_target: replyTarget } : {})
                    },
                    followups: {
                        send_current: {
                            intent_id: intent?.intent_id || null,
                            type: 'connector_tool',
                            domain: 'mail',
                            action: 'send',
                            status: 'pending_connector',
                            requested_capabilities: ['mail_send'],
                            entities: {
                                last_draft_id: draftResult.draft.draft_id
                            },
                            execution: {
                                target: 'pending_connector',
                                confirmation_required: false,
                                toolchain: [buildPendingConnectorStep('mail_send', {
                                    draft_id: draftResult.draft.draft_id
                                })]
                            }
                        }
                    }
                };
                this.#bindSessionIntent(options.session_id, {
                    ...boundIntent
                }, {
                    phase: 'executed',
                    draft_id: draftResult.draft.draft_id
                });

                if (autoSend && typeof mail.send === 'function') {
                    const sendResult = await mail.send(draftResult.draft.draft_id, {
                        confirmed: true
                    });
                    if (sendResult?.ok === true) {
                        const recipient = String(
                            sendResult?.draft?.to?.[0]?.name
                            || sendResult?.draft?.to?.[0]?.address
                            || sourceItem?.from?.name
                            || sourceItem?.from?.address
                            || ''
                        ).trim();
                        this.#bindSessionIntent(options.session_id, {
                            ...boundIntent,
                            entities: {
                                ...boundIntent.entities,
                                last_sent_draft_id: draftResult.draft.draft_id
                            }
                        }, {
                            phase: 'executed',
                            draft_id: draftResult.draft.draft_id,
                            sent: true
                        });
                        return buildResponse({
                            result: {
                                ...sendResult,
                                source_item: sourceItem
                            },
                            reply_text: buildMailSendAcknowledgement({
                                locale,
                                queued: sendResult?.queued === true,
                                recipient
                            })
                        });
                    }
                    return buildResponse({
                        ok: false,
                        executed: false,
                        error: sendResult?.error || 'mail_send_failed',
                        result: {
                            draft: draftResult.draft,
                            send_result: sendResult,
                            source_item: sourceItem
                        },
                        reply_text: english
                            ? 'I prepared the reply, but I could not send it.'
                            : "J'ai prepare la reponse, mais je n'ai pas pu l'envoyer."
                    });
                }

                return buildResponse({
                    result: {
                        ...draftResult,
                        source_item: sourceItem
                    },
                    reply_text: buildMailReplyAcknowledgement({
                        draft: draftResult.draft,
                        sourceItem,
                        locale
                    })
                });
            }
            return buildResponse({
                ok: false,
                executed: false,
                error: draftResult?.error || 'mail_reply_draft_failed',
                result: draftResult || undefined,
                reply_text: english
                    ? 'I could not prepare the reply draft for this mail.'
                    : "Je n'ai pas pu preparer le brouillon de reponse pour ce mail."
            });
        }

        if (capabilities.includes('mail_send')) {
            const sendStep = toolchain.find((step) => step?.capability === 'mail_send') || null;
            const activeIntent = intent?.context?.active_intent || null;
            const draftId = String(
                sendStep?.input?.draft_id
                || intent?.entities?.last_draft_id
                || activeIntent?.entities?.last_draft_id
                || ''
            ).trim();
            if (!draftId || typeof mail.send !== 'function') {
                return buildResponse({
                    ok: false,
                    executed: false,
                    error: 'mail_draft_not_found',
                    reply_text: english
                        ? 'I do not have any reply draft ready to send.'
                        : "Je n'ai pas encore de brouillon pret a envoyer."
                });
            }
            const sendResult = await mail.send(draftId, {
                confirmed: true
            });
            if (sendResult?.ok === true) {
                const recipient = String(
                    sendResult?.draft?.to?.[0]?.name
                    || sendResult?.draft?.to?.[0]?.address
                    || ''
                ).trim();
                this.#bindSessionIntent(options.session_id, {
                    ...intent,
                    entities: {
                        ...(intent?.entities && typeof intent.entities === 'object' ? cloneValue(intent.entities) : {}),
                        last_draft_id: draftId,
                        last_sent_draft_id: draftId
                    }
                }, {
                    phase: 'executed',
                    draft_id: draftId,
                    sent: true
                });
                return buildResponse({
                    result: sendResult,
                    reply_text: buildMailSendAcknowledgement({
                        locale,
                        queued: sendResult?.queued === true,
                        recipient
                    })
                });
            }
            return buildResponse({
                ok: false,
                executed: false,
                error: sendResult?.error || 'mail_send_failed',
                result: sendResult || undefined,
                reply_text: english
                    ? 'I could not send that mail.'
                    : "Je n'ai pas pu envoyer ce mail."
            });
        }

        if (capabilities.includes('mail_search')) {
            return null;
        }

        return null;
    }

    #buildContextualFollowupIntent({ sessionId, followup, activeIntent }) {
        const baseIntent = activeIntent && typeof activeIntent === 'object'
            ? cloneValue(activeIntent)
            : {
                intent_id: null,
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'ambiguous',
                utterance: { raw: '', normalized: '' },
                entities: {},
                requested_capabilities: [],
                execution: { target: 'none', confirmation_required: false, toolchain: [] }
            };

        const override = baseIntent?.followups?.[followup];
        if (override && typeof override === 'object') {
            return normalizeVoiceIntent({
                ...cloneValue(override),
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                }
            });
        }

        if (followup === 'resume_interrupted') {
            return normalizeVoiceIntent({
                ...baseIntent,
                status: 'ready',
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                }
            });
        }

        if (followup === 'reply_current') {
            if (baseIntent.domain === 'mail') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: 'reply_current',
                    type: 'connector_tool',
                    status: 'pending_connector',
                    requested_capabilities: ['mail_reply_draft'],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: [buildPendingConnectorStep('mail_reply_draft', {
                            context: 'current'
                        })]
                    }
                });
            }
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'reply_current',
                status: 'ambiguous',
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (followup === 'summarize_current') {
            const capability = baseIntent.domain === 'mail' ? 'mail_summarize' : 'voice_summarize_current';
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'summarize_current',
                type: 'connector_tool',
                status: 'pending_connector',
                requested_capabilities: [capability],
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: [buildPendingConnectorStep(capability, {
                        context: 'current',
                        summary_mode: 'short'
                    })]
                }
            });
        }

        if (followup === 'next_item' || followup === 'previous_item') {
            const direction = followup === 'next_item' ? 'next' : 'previous';
            if (baseIntent.domain === 'mail') {
                const capability = direction === 'next' ? 'mail_next_unread' : 'mail_list';
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: `${direction}_item`,
                    type: 'connector_tool',
                    status: 'pending_connector',
                    requested_capabilities: [capability],
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: [buildPendingConnectorStep(capability, {
                            direction,
                            context: 'current'
                        })]
                    }
                });
            }

            if (baseIntent.domain === 'calendar') {
                return normalizeVoiceIntent({
                    ...baseIntent,
                    action: `${direction}_item`,
                    status: 'ready',
                    context: {
                        session_id: sessionId,
                        followup_kind: followup
                    },
                    execution: {
                        target: 'runtime_v2',
                        confirmation_required: false,
                        toolchain: [{
                            source: 'runtime_v2',
                            tool_id: 'calendar.list_events',
                            action: 'pointer.click',
                            input: {
                                direction,
                                context: 'current'
                            }
                        }]
                    }
                });
            }
        }

        return normalizeVoiceIntent({
            ...baseIntent,
            action: String(followup || 'unknown'),
            status: 'ambiguous',
            context: {
                session_id: sessionId,
                followup_kind: followup
            },
            execution: {
                target: 'none',
                confirmation_required: false,
                toolchain: []
            }
        });
    }

    #pushJournal(type, payload = {}) {
        const entry = {
            seq: ++this.seq,
            at: this.now(),
            type,
            payload: cloneValue(payload)
        };
        this.journal.push(entry);
        if (this.journal.length > 200) {
            this.journal.splice(0, this.journal.length - 200);
        }
        for (const listener of this.listeners) {
            listener(entry);
        }
        dispatchWindowEvent(this.env, this.eventName, entry);
        return entry;
    }
}

export const createVoiceOrchestrator = (options = {}) => new VoiceOrchestrator(options);

export { VoiceOrchestrator };
