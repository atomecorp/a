// The single MCP entry (architecture §6.1). Every request, whatever its door (an eVe module,
// the assistant, an alarm, the relay from another surface, the standard MCP layer
// mcp_protocol.js), is judged here before any effect: transport actor, access policy,
// capabilities, sandbox, idempotency, rate limit and the person's confirmation, then the
// handler. The actor and the source come from the transport, never from the params.
import { atomeMCPHandlers } from './mcp_handlers.js';
import {
    cloneValue,
    completeOperationRecord,
    createOperationRecord,
    failOperationRecord,
    finalizeCancelledOperation,
    hasOwn,
    MCP_ERROR,
    mcpError,
    pushMcpEvent,
    reportOperationProgress,
    summarizeResult
} from './mcp_core.js';
import {
    consumeRateLimit,
    hasActorCapability,
    hasSandboxProfile,
    pushSecurityJournal,
    readIdempotencyRecord,
    writeIdempotencyRecord
} from './mcp_security.js';
import { resolveAccessPolicy } from './mcp_security_policy.js';
import { validateConfirmation } from './mcp_confirmation_gate.js';
import { programAccessPolicy } from './mcp_surface_grants.js';
import { resolveTransportActor, runtimeActor, transportSource } from './mcp_transport.js';
import { loadAIAgent } from './mcp_bridges.js';

// Envelope keys a caller may never set: the transport gives them.
const TRANSPORT_KEYS = ['actor', 'source', '__mcp'];

const denied = (actor, method, access, type, detail, message) => {
    pushSecurityJournal(type, { actor_id: actor.actor_id, method, subject: access.subject || method, ...detail });
    return mcpError(MCP_ERROR.ACCESS_DENIED, message);
};

async function resolvePolicyContext(method, params) {
    if (method !== 'ai.tools.call') return {};
    const agent = await loadAIAgent();
    return { aiTool: agent.getTool(String(params.tool_name || '').trim()) };
}

async function judge(method, params, transport) {
    const actor = resolveTransportActor(transport);
    const access = programAccessPolicy(actor, resolveAccessPolicy(method, params, await resolvePolicyContext(method, params)));
    if (access.allowed !== true) {
        throw denied(actor, method, access, 'access_denied', { error: access.error || 'mcp_access_denied' }, access.error || 'mcp_access_denied');
    }
    if (!hasActorCapability(actor, access.required_capabilities)) {
        throw denied(actor, method, access, 'capability_denied', { required_capabilities: access.required_capabilities || [] }, 'mcp_capability_denied');
    }
    if (!hasSandboxProfile(actor, access.sandbox_profile)) {
        throw denied(actor, method, access, 'sandbox_denied', { sandbox_profile: access.sandbox_profile || null }, 'mcp_sandbox_denied');
    }
    return { actor, access };
}

const journalIfSensitive = (access, type, payload) => {
    if (access.sensitive === true) pushSecurityJournal(type, payload);
};

async function run(method, params, request, transport, actor, access, confirmed) {
    const operation = createOperationRecord(method, params, request.id != null ? request.id : null);
    const trace = { actor_id: actor.actor_id, operation_id: operation.operation_id, method, subject: access.subject || method };
    journalIfSensitive(access, 'operation_started', trace);
    const handlerParams = { ...params };
    // Only a confirmation the gate consumed reaches a handler as `confirmed`.
    if (confirmed) handlerParams.confirmed = true; else delete handlerParams.confirmed;
    delete handlerParams.confirmation_id;
    handlerParams.__mcp = {
        operation_id: operation.operation_id,
        signal: operation.controller?.signal || null,
        access,
        confirmation_id: confirmed ? String(params.confirmation_id) : null,
        actor: runtimeActor(actor),
        source: transportSource(transport),
        // A step of a toolchain is a request of its own, judged here with the same transport.
        dispatch: (stepMethod, stepParams) => handleAtomeMCPRequestAsync({ jsonrpc: '2.0', id: null, method: stepMethod, params: stepParams }, transport),
        reportProgress(progress = {}) {
            reportOperationProgress(operation.operation_id, progress && typeof progress === 'object' ? progress : { ratio: Number(progress) });
        }
    };
    reportOperationProgress(operation.operation_id, { ratio: 0.1, phase: 'running' });
    const cancelled = () => operation.controller?.signal?.aborted === true && operation.status === 'cancel_requested';
    const settleCancelled = () => {
        finalizeCancelledOperation(operation.operation_id);
        journalIfSensitive(access, 'operation_cancelled', trace);
        return { ok: false, error: 'mcp_operation_cancelled', operation_id: operation.operation_id };
    };
    const execute = async () => {
        try {
            const result = await atomeMCPHandlers[method](handlerParams);
            if (cancelled()) return settleCancelled();
            completeOperationRecord(operation.operation_id, result);
            writeIdempotencyRecord(method, params, access, actor, result);
            journalIfSensitive(access, 'operation_completed', { ...trace, result: summarizeResult(result) });
            return result;
        } catch (error) {
            if (cancelled()) return settleCancelled();
            failOperationRecord(operation.operation_id, error);
            journalIfSensitive(access, 'operation_failed', { ...trace, error: error?.message || String(error) });
            throw error;
        }
    };
    if (params.defer === true) {
        // The deferred result is read through mcp.operations.read; its failure is recorded there.
        execute().catch(() => {});
        return { ok: true, deferred: true, operation_id: operation.operation_id };
    }
    return execute();
}

/** The single entry. `transport` = { source: { type, layer }, actor } (mcp_transport.js). */
async function handleAtomeMCPRequestAsync(request, transport) {
    const response = { jsonrpc: '2.0', id: request?.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') throw mcpError(MCP_ERROR.INVALID_REQUEST, 'mcp_invalid_request');
        const { method } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) throw mcpError(MCP_ERROR.METHOD_NOT_FOUND, `mcp_method_not_found:${method}`);
        if (request.params != null && (typeof request.params !== 'object' || Array.isArray(request.params))) {
            throw mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_params_not_an_object');
        }
        const params = request.params || {};
        const forged = TRANSPORT_KEYS.find(key => hasOwn.call(params, key));
        if (forged) throw mcpError(MCP_ERROR.INVALID_PARAMS, `mcp_params_${forged.replace(/_/g, '')}_forbidden`);
        const { actor, access } = await judge(method, params, transport);
        const idempotent = readIdempotencyRecord(method, params, access, actor);
        if (idempotent) {
            pushSecurityJournal('idempotency_hit', { actor_id: actor.actor_id, method, subject: access.subject || method });
            pushMcpEvent('mcp.idempotency.hit', { actor_id: actor.actor_id, method, subject: access.subject || method });
            response.result = cloneValue(idempotent.result);
            return response;
        }
        const rateLimit = consumeRateLimit(method, params, access, actor);
        if (rateLimit.ok !== true) {
            response.result = rateLimit.gate;
            return response;
        }
        const confirmation = validateConfirmation(method, params, access, actor);
        if (confirmation.ok !== true) {
            response.result = confirmation.gate;
            return response;
        }
        response.result = await run(method, params, request, transport, actor, access, confirmation.consumed === true);
    } catch (error) {
        response.error = {
            code: Number.isInteger(error?.code) ? error.code : MCP_ERROR.INTERNAL,
            message: error?.message || 'mcp_internal_error'
        };
    }
    return response;
}

if (typeof globalThis !== 'undefined') {
    globalThis.handleAtomeMCPRequestAsync = handleAtomeMCPRequestAsync;
}

export { handleAtomeMCPRequestAsync };
