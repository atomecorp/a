import { classifyVoiceIntent, normalizeVoiceIntent } from './intent_schema.js';
import { createToolRouter } from './tool_router.js';
import { resolveIdentityContext } from './identity_resolver.js';
import { createPersistentMemoryStore } from '../ai/persistent_memory.js';
import { createAiTraceStore } from '../ai/trace_store.js';
import { pushMutation, pushError } from './project_scene_collector.js';
import { defaultEnv, cloneValue, dispatchWindowEvent } from './orchestrator_env.js';
import {
    resolveMailApi,
    readExistingMailApi,
    resolveMessagesApi,
    readExistingMessagesApi,
    resolveContactsApi,
    readExistingContactsApi,
    resolveCalendarApi,
    readExistingCalendarApi
} from './orchestrator_connectors.js';
import { createDefaultMailAiSummarizer } from './orchestrator_mail_summary.js';
import { resolveVoiceExecutionBridge } from './orchestrator_bridge.js';
import {
    buildContextualFollowupIntent,
    buildPlanningContext,
    resolvePlanningIntent
} from './orchestrator_planning_runtime.js';
import { executeIntentRuntime } from './orchestrator_execution_runtime.js';

export const VOICE_ORCHESTRATOR_EVENT_NAME = 'squirrel:voice:orchestrator';
export { resolveVoiceExecutionBridge };

class VoiceOrchestrator {
    constructor({
        env = defaultEnv(),
        bridge = resolveVoiceExecutionBridge(env),
        aiPlanner = null,
        mailAiSummarizer = null,
        classifyIntent = classifyVoiceIntent,
        sessionRuntime = null,
        toolRouter = null,
        persistentMemory = null,
        traceStore = null,
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
        this.toolRouter = toolRouter && typeof toolRouter.execute === 'function' ? toolRouter : null;
        this.persistentMemory = persistentMemory && typeof persistentMemory.getSummary === 'function'
            ? persistentMemory
            : createPersistentMemoryStore({ env });
        this.traceStore = traceStore && typeof traceStore.startTrace === 'function'
            ? traceStore
            : createAiTraceStore({ env });
        this.now = typeof now === 'function' ? now : (() => Date.now());
        this.eventName = String(eventName || VOICE_ORCHESTRATOR_EVENT_NAME);
        this.runtimeCatalog = null;
        this.listeners = new Set();
        this.journal = [];
        this.seq = 0;
    }

    subscribe(listener) {
        if (typeof listener !== 'function') return () => { };
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    #runtimeContext() {
        const owner = this;
        return {
            get env() { return owner.env; },
            get bridge() { return owner.bridge; },
            get sessionRuntime() { return owner.sessionRuntime; },
            get toolRouter() { return owner.toolRouter; },
            set toolRouter(value) { owner.toolRouter = value; },
            get traceStore() { return owner.traceStore; },
            get mailAiSummarizer() { return owner.mailAiSummarizer; },
            initToolRouter: (options = {}) => owner.initToolRouter(options),
            ensureExistingToolRouter: (options = {}) => owner.ensureExistingToolRouter(options),
            bindSessionIntent: (sessionId, intent, meta = {}) => owner.#bindSessionIntent(sessionId, intent, meta),
            pushJournal: (type, payload = {}) => owner.#pushJournal(type, payload)
        };
    }

    /**
     * Lazily initializes the unified tool router by resolving domain connectors
     * from the current environment. Call this after all domain APIs are
     * registered on window.Squirrel.
     */
    async initToolRouter({ workingMemory = null } = {}) {
        const mail = await resolveMailApi(this.env);
        const messages = await resolveMessagesApi(this.env);
        const contacts = await resolveContactsApi(this.env);
        const calendar = await resolveCalendarApi(this.env);
        this.toolRouter = createToolRouter({
            env: this.env,
            connectors: { mail, messages, contacts, calendar },
            workingMemory: workingMemory
                || (this.sessionRuntime?.workingMemory ?? null),
            bridge: this.bridge
        });
        return this.toolRouter;
    }

    ensureExistingToolRouter({ workingMemory = null } = {}) {
        if (this.toolRouter) return this.toolRouter;
        const connectors = {
            mail: readExistingMailApi(this.env),
            messages: readExistingMessagesApi(this.env),
            contacts: readExistingContactsApi(this.env),
            calendar: readExistingCalendarApi(this.env)
        };
        if (!Object.values(connectors).some(Boolean)) return null;
        this.toolRouter = createToolRouter({
            env: this.env,
            connectors,
            workingMemory: workingMemory
                || (this.sessionRuntime?.workingMemory ?? null),
            bridge: this.bridge
        });
        return this.toolRouter;
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
        const planningContext = buildPlanningContext(this, options.session_id, options.context);
        if (this.persistentMemory && typeof this.persistentMemory.getSummary === 'function') {
            planningContext.persistent_memory_summary = this.persistentMemory.getSummary();
        }
        planningContext.identity_resolution = await resolveIdentityContext({
            utterance,
            workingMemory: this.sessionRuntime?.workingMemory || null,
            connectors: {
                contacts: readExistingContactsApi(this.env),
                calendar: readExistingCalendarApi(this.env),
                mail: readExistingMailApi(this.env)
            },
            ui_context: planningContext.ui_context || {},
            preferred_domains: ['contacts', 'calendar', 'mail', 'atome']
        });
        const localIntent = this.classifyIntent(utterance, {
            intent_id: options.intent_id,
            locale: options.locale,
            source: options.source,
            context: planningContext,
            runtime_tools: runtimeTools
        });
        const normalizedIntent = await resolvePlanningIntent(this, utterance, {
            ...options,
            locale: options.locale,
            context: planningContext,
            runtime_tools: runtimeTools,
            local_intent: normalizeVoiceIntent(localIntent)
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
        const planned = buildContextualFollowupIntent({
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
        return executeIntentRuntime(this.#runtimeContext(), intent, options);
    }

    async executeUtterance(utterance, options = {}) {
        const startedAt = this.now();
        const trace = this.traceStore?.startTrace?.({
            trace_id: options.trace_id,
            input: {
                utterance,
                modality: 'voice',
                locale: options.locale || null
            }
        }) || null;
        const intent = await this.planUtterance(utterance, options);
        const response = await this.executeIntent(intent, {
            ...options,
            trace_id: trace?.trace_id || options.trace_id
        });
        if (trace?.trace_id && this.traceStore?.finishTrace) {
            this.traceStore.finishTrace(trace.trace_id, {
                identity_resolution: intent?.context?.identity_resolution
                    || options?.context?.identity_resolution
                    || null,
                llm_call: {
                    provider: intent?.context?.ai_provider || null,
                    model: intent?.context?.ai_model || null,
                    target: intent?.execution?.target || null,
                    prompt_tokens: intent?.context?.ai_usage?.prompt_tokens || 0,
                    completion_tokens: intent?.context?.ai_usage?.completion_tokens || 0
                },
                autonomy_decision: {
                    confirmation_required: intent?.execution?.confirmation_required === true,
                    risk_tier: response?.result?.aggregate_risk || null
                },
                response: {
                    ok: response?.ok === true,
                    transport: response?.transport || null,
                    reply_text: response?.reply_text || response?.spoken_reply || null
                },
                total_latency_ms: Math.max(0, this.now() - startedAt)
            });
        }
        if (response?.ok === true && response?.executed === true && this.persistentMemory) {
            try {
                this.persistentMemory.recordWorkflowPattern({
                    domain: response?.intent?.domain || null,
                    action: response?.intent?.action || null
                });
                if (response?.intent?.domain === 'contacts') {
                    this.persistentMemory.recordContactAffinity({
                        contact_id: response?.intent?.entities?.current_contact_id || response?.intent?.entities?.contact_id || null,
                        label: response?.intent?.entities?.query_text || null,
                        channel: 'contacts'
                    });
                }
            } catch (_) {
                // Persistent memory updates stay off the critical path.
            }
        }
        return response;
    }

    listTraces(options = {}) {
        if (!this.traceStore || typeof this.traceStore.list !== 'function') return [];
        return this.traceStore.list(options);
    }

    queryTraces(options = {}) {
        if (!this.traceStore || typeof this.traceStore.query !== 'function') return [];
        return this.traceStore.query(options);
    }

    traceMetrics(options = {}) {
        if (!this.traceStore || typeof this.traceStore.metrics !== 'function') return {};
        return this.traceStore.metrics(options);
    }

    listPendingMutations(options = {}) {
        if (!this.toolRouter || typeof this.toolRouter.listPendingMutations !== 'function') return [];
        return this.toolRouter.listPendingMutations(options);
    }

    async flushPendingMutations(options = {}) {
        if (!this.toolRouter || typeof this.toolRouter.flushPendingMutations !== 'function') {
            return { processed: 0, failed: 0, remaining: 0 };
        }
        return this.toolRouter.flushPendingMutations(options);
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
        // Feed recent mutations/errors into the project scene collector.
        if (type === 'voice.intent.executed') {
            const intent = payload?.intent;
            if (payload?.ok === false) {
                pushError({
                    code: payload?.error || 'execution_failed',
                    message: payload?.reply_text || null,
                    domain: intent?.domain || null
                });
            } else if (payload?.executed) {
                pushMutation({
                    action: intent?.action || null,
                    domain: intent?.domain || null,
                    atome_id: intent?.entities?.atome_id || null,
                    summary: payload?.reply_text || null
                });
            }
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
