import { classifyVoiceIntent, normalizeVoiceIntent } from './intent_schema.js';

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

const dispatchWindowEvent = (env, name, detail) => {
    if (!env || typeof env.dispatchEvent !== 'function') return;
    if (!name || typeof env.CustomEvent !== 'function') return;
    try {
        env.dispatchEvent(new env.CustomEvent(name, { detail }));
    } catch (_) {
        // Ignore non-browser hosts.
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
        classifyIntent = classifyVoiceIntent,
        sessionRuntime = null,
        now = () => Date.now(),
        eventName = VOICE_ORCHESTRATOR_EVENT_NAME
    } = {}) {
        this.env = env;
        this.bridge = bridge;
        this.aiPlanner = aiPlanner && typeof aiPlanner.planUtterance === 'function' ? aiPlanner : null;
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
        const heuristicIntent = this.classifyIntent(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: planningContext,
            runtime_tools: runtimeTools
        });
        const normalizedHeuristic = normalizeVoiceIntent(heuristicIntent);
        const normalizedIntent = await this.#resolvePlanningIntent(utterance, {
            ...options,
            locale: options.locale,
            context: planningContext,
            runtime_tools: runtimeTools,
            heuristic_intent: normalizedHeuristic
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
        if (heuristicIntent.type === 'local_command' || options.use_ai === false || !this.aiPlanner) {
            return heuristicIntent;
        }
        return this.aiPlanner.planUtterance(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: options.context,
            runtime_tools: options.runtime_tools,
            heuristic_intent: heuristicIntent,
            ...(options.signal ? { signal: options.signal } : {})
        });
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
