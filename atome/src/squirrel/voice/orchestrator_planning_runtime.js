import { normalizeVoiceIntent } from './intent_schema.js';
import { collectProjectSceneContext } from './project_scene_collector.js';
import { cloneValue } from './orchestrator_env.js';

export const buildPlanningContext = (owner, sessionId, providedContext = {}) => {
    const context = providedContext && typeof providedContext === 'object'
        ? cloneValue(providedContext)
        : {};
    const key = String(sessionId || '').trim();
    if (!key || !owner.sessionRuntime) return context;
    const workingMemory = owner.sessionRuntime?.workingMemory || null;
    if (workingMemory && typeof workingMemory.getConversationContext === 'function' && !context.conversation_history) {
        try {
            const memoryContext = workingMemory.getConversationContext({ turnLimit: 6, summaryLimit: 3 });
            if (Array.isArray(memoryContext?.turns) && memoryContext.turns.length) {
                context.conversation_history = memoryContext.turns.map((turn) => ({
                    user: turn.user || '',
                    assistant: turn.assistant || null,
                    domain: turn.domain || null,
                    action: turn.action || null
                }));
            }
            if (Array.isArray(memoryContext?.summaries) && memoryContext.summaries.length) {
                context.conversation_summaries = cloneValue(memoryContext.summaries);
            }
        } catch (_) {
            // Ignore memory context extraction failures.
        }
    }
    try {
        const activeIntent = owner.sessionRuntime.getActiveIntent(key);
        if (activeIntent && !context.active_intent) {
            context.active_intent = activeIntent;
        }
    } catch (_) {
        // Ignore unknown session context reads.
    }
    try {
        const session = owner.sessionRuntime.getSession(key);
        const intentHistory = session?.conversation?.intent_history;
        if (Array.isArray(intentHistory) && intentHistory.length > 0) {
            const turns = [];
            for (const past of intentHistory.slice(-6)) {
                const userText = String(past?.utterance?.raw || past?.utterance?.normalized || '').trim();
                const assistReply = String(past?.meta?.reply_text || past?.meta?.spoken_reply || '').trim();
                const domain = String(past?.domain || '').trim();
                const action = String(past?.action || '').trim();
                if (userText) {
                    turns.push({
                        user: userText,
                        assistant: assistReply || null,
                        domain: domain || null,
                        action: action || null
                    });
                }
            }
            if (turns.length) {
                context.conversation_history = turns;
            }
        }
    } catch (_) {
        // Ignore history extraction errors.
    }
    // SOURCE 4: Project, scene, selection, user, recent mutations/errors.
    try {
        const sceneContext = collectProjectSceneContext();
        if (sceneContext && !context.project_scene) {
            context.project_scene = sceneContext;
        }
    } catch (_) {
        // Ignore scene context extraction failures.
    }
    return context;
}

export const resolvePlanningIntent = async (owner, utterance, options = {}) => {
    const localIntent = normalizeVoiceIntent(options.local_intent);
    if (localIntent.type === 'local_command') {
        return localIntent;
    }
    if (options.use_ai === false || !owner.aiPlanner) {
        const locale = options.locale || options.lang || 'fr-FR';
        const english = String(locale).toLowerCase().startsWith('en');
        return normalizeVoiceIntent({
            intent_id: options.intent_id,
            utterance: { raw: utterance },
            locale,
            source: options.source,
            context: {
                ...(options.context && typeof options.context === 'object' ? cloneValue(options.context) : {}),
                ai_error: options.use_ai === false ? 'voice_ai_disabled' : 'voice_ai_unavailable',
                ai_provider: null
            },
            assistant_reply: english
                ? 'The AI planner is required but unavailable.'
                : "Le planner IA est requis mais indisponible.",
            type: 'ambiguous',
            domain: 'unknown',
            action: 'unknown',
            confidence: 0,
            status: 'failed',
            execution: {
                target: 'none',
                confirmation_required: false,
                toolchain: []
            }
        });
    }

    return normalizeVoiceIntent(await owner.aiPlanner.planUtterance(utterance, {
        intent_id: options.intent_id,
        locale: options.locale,
        source: options.source,
        context: options.context,
        runtime_tools: options.runtime_tools,
        ...(options.signal ? { signal: options.signal } : {})
    }));
}

export const buildContextualFollowupIntent = ({ sessionId, followup, activeIntent }) => {
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

    const baseDomain = String(baseIntent?.domain || '').trim();
    if (baseDomain === 'mail') {
        if (followup === 'next_item') {
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'next_item',
                status: 'ready',
                requested_capabilities: ['mail_next_unread'],
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }
        if (followup === 'previous_item') {
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'previous_item',
                status: 'ready',
                requested_capabilities: ['mail_list'],
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }
        if (followup === 'reply_current') {
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'reply_current',
                status: 'ready',
                requested_capabilities: ['mail_reply_draft'],
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }
        if (followup === 'summarize_current') {
            return normalizeVoiceIntent({
                ...baseIntent,
                action: 'summarize_current',
                status: 'ready',
                requested_capabilities: ['mail_summarize'],
                context: {
                    session_id: sessionId,
                    followup_kind: followup
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
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
