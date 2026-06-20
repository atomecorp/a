import { hasOwn } from './mcp_core.js';

export function ensureAtomeContext() {
    if (typeof globalThis === 'undefined') {
        throw new Error('Global context unavailable for MCP bridge');
    }
    return {
        defaults: globalThis.atomeDefaultsParams || {},
        AtomeCtor: typeof globalThis.Atome === 'function' ? globalThis.Atome : null
    };
}

export function normalizeRuntimeToolIdentifier(params = {}) {
    const candidates = [
        params.tool_id,
        params.toolId,
        params.tool_key,
        params.toolKey,
        params.tool_name,
        params.name,
        params.tool
    ];
    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
    }
    return '';
}

export function normalizeRuntimeToolEntry(tool = {}) {
    const contexts = Array.isArray(tool?.capabilities?.contexts)
        ? tool.capabilities.contexts.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    return {
        name: String(tool?.id || tool?.tool_key || '').trim() || null,
        description: String(tool?.meta?.name || tool?.ui?.label_fallback || tool?.tool_key || tool?.id || '').trim() || null,
        source: 'runtime_v2',
        tool_id: String(tool?.id || '').trim() || null,
        tool_key: String(tool?.tool_key || '').trim() || null,
        visibility: String(tool?.visibility || '').trim() || 'visible',
        parameters: null,
        runtime: {
            execution_mode: String(tool?.runtime?.execution_mode || '').trim() || null,
            contexts,
            selection_required: tool?.capabilities?.selection_required === true,
            disabled: tool?.capabilities?.disabled === true
        }
    };
}

export function buildRuntimeInvocationPayload(params = {}, defaults = {}) {
    const toolId = normalizeRuntimeToolIdentifier(params);
    if (!toolId) {
        throw new Error('Missing runtime tool identifier');
    }
    const mcpContext = params?.__mcp && typeof params.__mcp === 'object' ? params.__mcp : null;
    const input = params?.input && typeof params.input === 'object'
        ? { ...params.input }
        : ((params?.params && typeof params.params === 'object') ? { ...params.params } : {});
    const meta = params?.meta && typeof params.meta === 'object'
        ? { ...params.meta }
        : {};
    if (params?.trace_id && !meta.trace_id) {
        meta.trace_id = String(params.trace_id);
    }
    if (params?.intent_id && !meta.intent_id) {
        meta.intent_id = String(params.intent_id);
    }
    if (params?.idempotency_key && !meta.idempotency_key) {
        meta.idempotency_key = params.idempotency_key;
    }
    if (mcpContext?.operation_id && !meta.operation_id) {
        meta.operation_id = String(mcpContext.operation_id);
    }
    return {
        tool_id: toolId,
        action: params.action || params.event || defaults.action || 'pointer.click',
        ...(params.event ? { event: params.event } : {}),
        input,
        presentation: params.presentation || defaults.presentation || 'mcp',
        source: (params?.source && typeof params.source === 'object')
            ? params.source
            : { type: 'mcp', layer: defaults.layer || 'atome_mcp' },
        ...(params?.actor && typeof params.actor === 'object' ? { actor: params.actor } : {}),
        meta,
        ...(mcpContext?.signal ? { signal: mcpContext.signal } : {}),
        ...(params?.dry_run === true ? { dry_run: true } : {}),
        ...(params?.idempotency_key ? { idempotency_key: params.idempotency_key } : {})
    };
}
