export const hasOwn = Object.prototype.hasOwnProperty;

export const ATOME_MCP_PROTOCOL = '1.0.0';
export const MCP_EVENT_NAME = 'squirrel:mcp';
export const MCP_UI_EVENT_NAME = 'squirrel:mcp:ui';
export const MCP_VOICE_EVENT_NAME = 'squirrel:mcp:voice';
const MCP_EVENT_LIMIT = 200;
const MCP_OPERATION_LIMIT = 100;


let mcpEventSeq = 0;

let mcpOperationSeq = 0;

export const mcpEvents = [];

export const mcpOperations = new Map();

export function cloneValue(value) {
    if (value === undefined) return undefined;
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(value);
        }
    } catch (_) {
        // Fall through to JSON clone below.
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (_) {
        return null;
    }
}

export function nowIso() {
    return new Date().toISOString();
}

export function trimHistory(map, limit = MCP_OPERATION_LIMIT) {
    while (map.size > limit) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
    }
}

export function trimArrayHistory(list, limit = MCP_EVENT_LIMIT) {
    if (!Array.isArray(list)) return;
    if (list.length > limit) {
        list.splice(0, list.length - limit);
    }
}

export function normalizeStringList(value, fallback = []) {
    if (!Array.isArray(value)) return [...fallback];
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

export function pushMcpEvent(type, payload = {}) {
    const event = {
        seq: ++mcpEventSeq,
        at: nowIso(),
        type: String(type || 'mcp.event'),
        payload: cloneValue(payload) || {}
    };
    mcpEvents.push(event);
    if (mcpEvents.length > MCP_EVENT_LIMIT) {
        mcpEvents.splice(0, mcpEvents.length - MCP_EVENT_LIMIT);
    }
    if (typeof globalThis?.dispatchEvent === 'function' && typeof globalThis?.CustomEvent === 'function') {
        [MCP_EVENT_NAME, MCP_UI_EVENT_NAME, MCP_VOICE_EVENT_NAME].forEach((eventName) => {
            globalThis.dispatchEvent(new globalThis.CustomEvent(eventName, {
                detail: cloneValue(event) || {}
            }));
        });
    }
    return event;
}

export function summarizeResult(value) {
    if (value == null) return value;
    if (typeof value !== 'object') return value;
    const summary = {};
    if (Object.prototype.hasOwnProperty.call(value, 'ok')) summary.ok = value.ok;
    if (Object.prototype.hasOwnProperty.call(value, 'error')) summary.error = value.error;
    if (Object.prototype.hasOwnProperty.call(value, 'tool_id')) summary.tool_id = value.tool_id;
    if (Object.prototype.hasOwnProperty.call(value, 'count')) summary.count = value.count;
    if (Object.keys(summary).length) return summary;
    return cloneValue(value);
}

export function createOperationRecord(method, params = {}, requestId = null) {
    const operation_id = `mcp_op_${++mcpOperationSeq}`;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const record = {
        operation_id,
        request_id: requestId,
        method: String(method || ''),
        status: 'running',
        progress_ratio: 0,
        progress_phase: 'queued',
        started_at: nowIso(),
        updated_at: nowIso(),
        completed_at: null,
        cancel_requested_at: null,
        error: null,
        result: null,
        params_preview: summarizeResult(params),
        controller
    };
    mcpOperations.set(operation_id, record);
    trimHistory(mcpOperations, MCP_OPERATION_LIMIT);
    pushMcpEvent('mcp.operation.started', {
        operation_id,
        method: record.method,
        request_id: requestId
    });
    return record;
}

export function updateOperationRecord(operation_id, patch = {}) {
    const record = mcpOperations.get(String(operation_id || ''));
    if (!record) return null;
    Object.assign(record, patch, {
        updated_at: nowIso()
    });
    return record;
}

export function reportOperationProgress(operation_id, {
    ratio = null,
    phase = null,
    detail = null
} = {}) {
    const record = updateOperationRecord(operation_id, {
        ...(ratio != null ? { progress_ratio: Math.max(0, Math.min(1, Number(ratio) || 0)) } : {}),
        ...(phase ? { progress_phase: String(phase) } : {})
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.progress', {
        operation_id: record.operation_id,
        method: record.method,
        ratio: record.progress_ratio,
        phase: record.progress_phase,
        detail: cloneValue(detail)
    });
    return record;
}

export function completeOperationRecord(operation_id, result) {
    const record = updateOperationRecord(operation_id, {
        status: 'completed',
        progress_ratio: 1,
        progress_phase: 'completed',
        completed_at: nowIso(),
        result: summarizeResult(result)
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.completed', {
        operation_id: record.operation_id,
        method: record.method,
        result: record.result
    });
    return record;
}

export function failOperationRecord(operation_id, error) {
    const record = updateOperationRecord(operation_id, {
        status: 'failed',
        progress_phase: 'failed',
        completed_at: nowIso(),
        error: error && error.message ? error.message : String(error || 'mcp_operation_failed')
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.failed', {
        operation_id: record.operation_id,
        method: record.method,
        error: record.error
    });
    return record;
}

export function cancelOperationRecord(operation_id) {
    const record = mcpOperations.get(String(operation_id || ''));
    if (!record) {
        return { ok: false, error: 'mcp_operation_not_found', operation_id: String(operation_id || '') || null };
    }
    if (record.status !== 'running') {
        return {
            ok: false,
            error: 'mcp_operation_not_running',
            operation_id: record.operation_id,
            status: record.status
        };
    }
    record.cancel_requested_at = nowIso();
    record.status = 'cancel_requested';
    record.progress_phase = 'cancel_requested';
    record.updated_at = nowIso();
    if (record.controller && typeof record.controller.abort === 'function' && record.controller.signal?.aborted !== true) {
        record.controller.abort();
    }
    pushMcpEvent('mcp.operation.cancel_requested', {
        operation_id: record.operation_id,
        method: record.method
    });
    return {
        ok: true,
        operation_id: record.operation_id,
        status: record.status
    };
}

export function finalizeCancelledOperation(operation_id) {
    const record = updateOperationRecord(operation_id, {
        status: 'cancelled',
        progress_phase: 'cancelled',
        completed_at: nowIso()
    });
    if (!record) return null;
    pushMcpEvent('mcp.operation.cancelled', {
        operation_id: record.operation_id,
        method: record.method
    });
    return record;
}
