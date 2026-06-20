import { atomeMCPHandlers } from './mcp_handlers.js';
import {
    cloneValue,
    completeOperationRecord,
    createOperationRecord,
    failOperationRecord,
    finalizeCancelledOperation,
    hasOwn,
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
    resolveActorProfile,
    validateConfirmation,
    writeIdempotencyRecord
} from './mcp_security.js';
import { resolveAccessPolicy } from './mcp_security_policy.js';

function handleAtomeMCPRequest(request = {}) {
    const response = { jsonrpc: '2.0', id: request.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') {
            throw new Error('Invalid MCP payload: missing jsonrpc 2.0 envelope');
        }
        const { method, params } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) {
            throw new Error(`Unknown MCP method: ${method}`);
        }
        const handler = atomeMCPHandlers[method];
        const result = handler(params);
        if (result && typeof result.then === 'function') {
            throw new Error('Async MCP method called via sync handler. Use handleAtomeMCPRequestAsync.');
        }
        response.result = result;
    } catch (error) {
        response.error = {
            code: -32000,
            message: error && error.message ? error.message : 'Unhandled MCP error'
        };
    }
    return response;
}

async function handleAtomeMCPRequestAsync(request = {}) {
    const response = { jsonrpc: '2.0', id: request.id != null ? request.id : null };
    try {
        if (!request || request.jsonrpc !== '2.0') {
            throw new Error('Invalid MCP payload: missing jsonrpc 2.0 envelope');
        }
        const { method, params } = request;
        if (!method || !hasOwn.call(atomeMCPHandlers, method)) {
            throw new Error(`Unknown MCP method: ${method}`);
        }
        const actor = resolveActorProfile(params || {});
        const access = resolveAccessPolicy(method, params || {});
        if (access.allowed !== true) {
            pushSecurityJournal('access_denied', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method,
                error: access.error || 'mcp_access_denied'
            });
            throw new Error(access.error || 'mcp_access_denied');
        }
        if (!hasActorCapability(actor, access.required_capabilities)) {
            pushSecurityJournal('capability_denied', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method,
                required_capabilities: access.required_capabilities || []
            });
            throw new Error('mcp_capability_denied');
        }
        if (!hasSandboxProfile(actor, access.sandbox_profile)) {
            pushSecurityJournal('sandbox_denied', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method,
                sandbox_profile: access.sandbox_profile || null
            });
            throw new Error('mcp_sandbox_denied');
        }
        const idempotentRecord = readIdempotencyRecord(method, params || {}, access);
        if (idempotentRecord) {
            pushSecurityJournal('idempotency_hit', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method
            });
            pushMcpEvent('mcp.idempotency.hit', {
                actor_id: actor.actor_id,
                method,
                subject: access.subject || method
            });
            response.result = cloneValue(idempotentRecord.result);
            return response;
        }
        const rateLimit = consumeRateLimit(method, params || {}, access, actor);
        if (rateLimit.ok !== true) {
            response.result = rateLimit.gate;
            return response;
        }
        const confirmation = validateConfirmation(method, params || {}, access, actor);
        if (confirmation.ok !== true) {
            response.result = confirmation.gate;
            return response;
        }
        const operation = createOperationRecord(method, params, request.id != null ? request.id : null);
        if (access.sensitive === true) {
            pushSecurityJournal('operation_started', {
                actor_id: actor.actor_id,
                operation_id: operation.operation_id,
                method,
                subject: access.subject || method
            });
        }
        const handlerParams = params && typeof params === 'object'
            ? { ...params }
            : {};
        handlerParams.actor = handlerParams.actor && typeof handlerParams.actor === 'object'
            ? handlerParams.actor
            : actor;
        handlerParams.__mcp = {
            operation_id: operation.operation_id,
            signal: operation.controller?.signal || null,
            access,
            reportProgress(progress = {}) {
                const normalized = progress && typeof progress === 'object'
                    ? progress
                    : { ratio: Number(progress) };
                reportOperationProgress(operation.operation_id, normalized);
            }
        };
        reportOperationProgress(operation.operation_id, {
            ratio: 0.1,
            phase: 'running'
        });

        const execute = async () => {
            try {
                const result = await atomeMCPHandlers[method](handlerParams);
                if (operation.controller?.signal?.aborted === true && operation.status === 'cancel_requested') {
                    finalizeCancelledOperation(operation.operation_id);
                    if (access.sensitive === true) {
                        pushSecurityJournal('operation_cancelled', {
                            actor_id: actor.actor_id,
                            operation_id: operation.operation_id,
                            method,
                            subject: access.subject || method
                        });
                    }
                    return {
                        ok: false,
                        error: 'mcp_operation_cancelled',
                        operation_id: operation.operation_id
                    };
                }
                completeOperationRecord(operation.operation_id, result);
                writeIdempotencyRecord(method, params || {}, access, result);
                if (access.sensitive === true) {
                    pushSecurityJournal('operation_completed', {
                        actor_id: actor.actor_id,
                        operation_id: operation.operation_id,
                        method,
                        subject: access.subject || method,
                        result: summarizeResult(result)
                    });
                }
                return result;
            } catch (error) {
                if (operation.controller?.signal?.aborted === true && operation.status === 'cancel_requested') {
                    finalizeCancelledOperation(operation.operation_id);
                    if (access.sensitive === true) {
                        pushSecurityJournal('operation_cancelled', {
                            actor_id: actor.actor_id,
                            operation_id: operation.operation_id,
                            method,
                            subject: access.subject || method
                        });
                    }
                    return {
                        ok: false,
                        error: 'mcp_operation_cancelled',
                        operation_id: operation.operation_id
                    };
                }
                failOperationRecord(operation.operation_id, error);
                if (access.sensitive === true) {
                    pushSecurityJournal('operation_failed', {
                        actor_id: actor.actor_id,
                        operation_id: operation.operation_id,
                        method,
                        subject: access.subject || method,
                        error: error?.message || String(error)
                    });
                }
                throw error;
            }
        };

        if (params?.defer === true) {
            execute().catch(() => {});
            response.result = {
                ok: true,
                deferred: true,
                operation_id: operation.operation_id
            };
            return response;
        }

        response.result = await execute();
    } catch (error) {
        response.error = {
            code: -32000,
            message: error && error.message ? error.message : 'Unhandled MCP error'
        };
    }
    return response;
}

if (typeof globalThis !== 'undefined') {
    globalThis.handleAtomeMCPRequest = handleAtomeMCPRequest;
    globalThis.handleAtomeMCPRequestAsync = handleAtomeMCPRequestAsync;
}
