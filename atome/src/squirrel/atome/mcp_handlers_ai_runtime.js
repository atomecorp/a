import { ATOME_MCP_PROTOCOL } from './mcp_core.js';
import { ensureAIAgent, ensureRuntimeCommandBus, ensureRuntimeToolApi } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, normalizeRuntimeToolEntry } from './mcp_runtime.js';

export const createMcpAiRuntimeHandlers = () => ({
    'ai.tools.list'() {
        const agent = ensureAIAgent();
        const tools = agent.listTools();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools
        };
    },
    async 'ai.tools.call'(params = {}) {
        const agent = ensureAIAgent();
        if (typeof agent.callTool !== 'function') {
            throw new Error('AtomeAI.callTool is not available');
        }

        const request = {
            tool_name: params.tool_name || params.name || params.tool,
            params: params.params || {},
            actor: params.actor || {},
            signals: params.signals || {},
            source: (params?.source && typeof params.source === 'object')
                ? params.source
                : { type: 'mcp', layer: 'atome_mcp_ai_call' },
            idempotency_key: params.idempotency_key || null,
            trace_id: params.trace_id || null,
            intent_id: params.intent_id || null,
            dry_run: params.dry_run === true
        };

        return agent.callTool(request);
    },
    'ai.audit.list'(params = {}) {
        const agent = ensureAIAgent();
        const limit = Number.isFinite(params?.limit) ? params.limit : 20;
        if (!agent.audit || typeof agent.audit.list !== 'function') {
            throw new Error('AtomeAI.audit.list is not available');
        }
        return agent.audit.list({ limit });
    },
    async 'runtime.tools.list'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        if (typeof runtime.listTools !== 'function') {
            throw new Error('Runtime V2 listTools is not available');
        }
        const tools = await runtime.listTools({
            includeDisabled: params?.includeDisabled === true
        });
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools: Array.isArray(tools) ? tools.map((entry) => normalizeRuntimeToolEntry(entry)) : []
        };
    },
    async 'runtime.tools.call'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        const payload = buildRuntimeInvocationPayload(params, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_runtime_call'
        });
        return runtime.invokeById(payload);
    },
    async 'runtime.tools.batch_call'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        if (typeof runtime.invokeBatch !== 'function') {
            throw new Error('Runtime V2 invokeBatch is not available');
        }
        const events = Array.isArray(params?.events) ? params.events : [];
        const normalizedEvents = events.map((entry) => buildRuntimeInvocationPayload(entry, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_runtime_batch_call'
        }));
        return runtime.invokeBatch(normalizedEvents, {
            tx_id: String(params?.tx_id || params?.txId || '').trim() || undefined
        });
    },
    'runtime.audit.list'(params = {}) {
        const bus = ensureRuntimeCommandBus();
        const events = bus.listEvents({
            fromSeq: Number.isFinite(Number(params?.fromSeq)) ? Number(params.fromSeq) : undefined,
            kind: params?.kind ? String(params.kind) : undefined,
            trace_id: params?.trace_id ? String(params.trace_id) : undefined,
            tool_id: params?.tool_id ? String(params.tool_id) : undefined,
            source: params?.source ? String(params.source) : undefined,
            source_layer: params?.source_layer ? String(params.source_layer) : undefined
        });
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        return {
            protocol: ATOME_MCP_PROTOCOL,
            events: Array.isArray(events) ? events.slice(-limit) : []
        };
    },
});
