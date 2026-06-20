import { normalizeInvocationSource, normalizeVoiceConfirmation } from './orchestrator_invocation.js';
import { buildStructuredReplyFromPayload } from './orchestrator_reply.js';

export const executeAgentToolchain = async (owner, intent, toolchain, options = {}) => {
    const confirmation = normalizeVoiceConfirmation(options);
    const agent = owner.env?.AtomeAI || owner.env?.window?.AtomeAI || null;
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

    if (typeof agent.executeToolchain === 'function') {
        const toolchainResult = await agent.executeToolchain({
            steps: toolchain.map((step) => ({
                tool_name: step.tool_name,
                params: step.params || {}
            })),
            actor,
            signals,
            trace_id: options.trace_id,
            intent_id: options.intent_id || intent.intent_id,
            idempotency_key: confirmation?.idempotency_key || options.idempotency_key,
            source,
            confirmation
        });

        if (toolchainResult?.status === 'CONFIRMATION_REQUIRED') {
            owner.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: 'atome_ai.toolchain',
                domain: 'atome_ai',
                ok: true,
                status: toolchainResult.status
            });
            return {
                ok: true,
                executed: false,
                transport: 'atome_ai',
                intent,
                confirmation_required: true,
                reason: 'confirmation_required',
                confirmation_prompt: toolchainResult.human_summary || intent.assistant_reply || null,
                result: toolchainResult
            };
        }

        if (toolchainResult?.status !== 'OK') {
            owner.traceStore?.appendExecution?.(options.trace_id, {
                tool_name: 'atome_ai.toolchain',
                domain: 'atome_ai',
                ok: false,
                status: toolchainResult?.status || 'ERROR',
                error: toolchainResult?.error || null
            });
            return {
                ok: false,
                executed: toolchainResult?.completed_steps > 0,
                transport: 'atome_ai',
                intent,
                result: toolchainResult?.result || toolchainResult,
                error: toolchainResult?.error || toolchainResult?.status || 'voice_toolchain_failed',
                ...(intent.assistant_reply ? { reply_text: intent.assistant_reply, spoken_reply: intent.assistant_reply } : {})
            };
        }

        const fallbackReply = buildStructuredReplyFromPayload(toolchainResult?.result || toolchainResult, intent, options);
        owner.traceStore?.appendExecution?.(options.trace_id, {
            tool_name: 'atome_ai.toolchain',
            domain: 'atome_ai',
            ok: true,
            status: toolchainResult?.status || 'OK'
        });
        return {
            ok: true,
            executed: true,
            transport: 'atome_ai',
            intent,
            result: toolchainResult?.result || toolchainResult,
            ...((fallbackReply || intent.assistant_reply)
                ? {
                    reply_text: fallbackReply || intent.assistant_reply,
                    spoken_reply: fallbackReply || intent.assistant_reply
                }
                : {})
        };
    }

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
        owner.traceStore?.appendExecution?.(options.trace_id, {
            tool_name: step.tool_name,
            domain: 'atome_ai',
            ok: result?.status === 'OK',
            status: result?.status || null,
            error: result?.error || null
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

    const fallbackReply = buildStructuredReplyFromPayload({ results }, intent, options);

    return {
        ok: true,
        executed: true,
        transport: 'atome_ai',
        intent,
        result: { results },
        ...((fallbackReply || intent.assistant_reply)
            ? {
                reply_text: fallbackReply || intent.assistant_reply,
                spoken_reply: fallbackReply || intent.assistant_reply
            }
            : {})
    };
}
