import { normalizeVoiceIntent } from './intent_schema.js';
import { cloneValue } from './orchestrator_env.js';
import {
    BUSINESS_CONNECTOR_DOMAINS,
    createVoiceConfirmation,
    ensureToolchain,
    normalizeBatchEvents,
    normalizeVoiceConfirmation
} from './orchestrator_invocation.js';
import {
    buildRuntimeFailureReply,
    buildRuntimeIntentMeta,
    buildStructuredReplyFromPayload
} from './orchestrator_reply.js';
import { executeAgentToolchain } from './orchestrator_agent_toolchain.js';
import { executePendingConnector } from './orchestrator_tool_router_runtime.js';

export const executeIntentRuntime = async (owner, intent, options = {}) => {
    const normalizedIntent = normalizeVoiceIntent(intent);
    // Trust-gated: mail reply confirmation is no longer forcibly disabled.
    // The trust scoring engine in tool_router handles confirmation at the result level.
    owner.bindSessionIntent(options.session_id, normalizedIntent, {
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
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }
    const confirmation = normalizeVoiceConfirmation(options);
    if (
        normalizedIntent.execution.confirmation_required === true
        && normalizedIntent.execution.target !== 'pending_connector'
        && !confirmation
    ) {
        const createdConfirmation = createVoiceConfirmation(normalizedIntent, options);
        const pendingIntent = {
            ...normalizedIntent,
            context: {
                ...(normalizedIntent.context || {}),
                voice_confirmation: createdConfirmation
            }
        };
        const response = {
            ok: true,
            executed: false,
            transport: normalizedIntent.execution.target,
            intent: pendingIntent,
            reason: 'confirmation_required',
            confirmation_required: true,
            confirmation: createdConfirmation,
            confirmation_prompt: options.confirmation_prompt
                || (String(normalizedIntent?.locale || '').toLowerCase().startsWith('fr')
                    ? `Confirmation demandee avant execution de ${normalizedIntent.domain}:${normalizedIntent.action}.`
                    : `Confirmation requested before executing ${normalizedIntent.domain}:${normalizedIntent.action}.`)
        };
        owner.pushJournal('voice.intent.executed', response);
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
        owner.pushJournal('voice.intent.executed', response);
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
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }

    if (normalizedIntent.execution.target === 'pending_connector') {
        const resolved = await executePendingConnector(owner, normalizedIntent, toolchain, options);
        if (resolved) {
            owner.pushJournal('voice.intent.executed', resolved);
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
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }

    if (BUSINESS_CONNECTOR_DOMAINS.has(String(normalizedIntent?.domain || '').trim())) {
        const resolved = await executePendingConnector(owner, normalizedIntent, toolchain, options);
        if (resolved) {
            owner.pushJournal('voice.intent.executed', resolved);
            return resolved;
        }
    }

    if (normalizedIntent.execution.target === 'atome_ai') {
        const response = await executeAgentToolchain(owner, normalizedIntent, toolchain, options);
        owner.pushJournal('voice.intent.executed', response);
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
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }

    if (!owner.bridge) {
        const response = {
            ok: false,
            executed: false,
            transport: 'none',
            intent: normalizedIntent,
            error: 'voice_execution_bridge_unavailable'
        };
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }

    const events = normalizeBatchEvents(normalizedIntent, options);
    if (!events.length) {
        const response = {
            ok: false,
            executed: false,
            transport: owner.bridge.kind,
            intent: normalizedIntent,
            error: 'voice_toolchain_empty'
        };
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }

    if (events.length === 1) {
        const result = await owner.bridge.callRuntimeTool(events[0]);
        owner.traceStore?.appendExecution?.(options.trace_id, {
            tool_name: events[0]?.tool_id || 'runtime.tools.call',
            domain: 'runtime',
            ok: result?.ok !== false,
            status: result?.ok === false ? 'ERROR' : 'OK',
            error: result?.error || null
        });
        const executionOk = result?.ok !== false;
        const structuredReply = executionOk ? buildStructuredReplyFromPayload(result, normalizedIntent, options) : '';
        const fallbackReply = executionOk
            ? (structuredReply || replyText)
            : buildRuntimeFailureReply(result, normalizedIntent, options);
        owner.bindSessionIntent(options.session_id, normalizedIntent, buildRuntimeIntentMeta(result, {
            phase: 'executed',
            replyText: fallbackReply
        }));
        const response = {
            ok: executionOk,
            executed: executionOk,
            transport: owner.bridge.kind,
            intent: normalizedIntent,
            result,
            ...(fallbackReply ? { reply_text: fallbackReply, spoken_reply: fallbackReply } : {})
        };
        owner.pushJournal('voice.intent.executed', response);
        return response;
    }

    const result = await owner.bridge.batchRuntimeTools(events, {
        tx_id: options.tx_id || normalizedIntent.intent_id || undefined
    });
    events.forEach((event, index) => {
        const stepResult = Array.isArray(result?.results) ? result.results[index] : result;
        owner.traceStore?.appendExecution?.(options.trace_id, {
            tool_name: event?.tool_id || 'runtime.tools.call',
            domain: 'runtime',
            ok: stepResult?.ok !== false,
            status: stepResult?.ok === false ? 'ERROR' : 'OK',
            error: stepResult?.error || null
        });
    });
    const executionOk = result?.ok !== false;
    const structuredReply = executionOk ? buildStructuredReplyFromPayload(result, normalizedIntent, options) : '';
    const fallbackReply = executionOk
        ? (structuredReply || replyText)
        : buildRuntimeFailureReply(result, normalizedIntent, options);
    owner.bindSessionIntent(options.session_id, normalizedIntent, buildRuntimeIntentMeta(result, {
        phase: 'executed',
        replyText: fallbackReply
    }));
    const response = {
        ok: executionOk,
        executed: executionOk,
        transport: owner.bridge.kind,
        intent: normalizedIntent,
        result,
        ...(fallbackReply ? { reply_text: fallbackReply, spoken_reply: fallbackReply } : {})
    };
    owner.pushJournal('voice.intent.executed', response);
    return response;
}
