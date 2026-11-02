import { ATOME_MCP_PROTOCOL } from './mcp_core.js';
import { ensureRuntimeCommandBus, ensureRuntimeToolApi, loadAIAgent, loadMcpToolModules } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, normalizeRuntimeToolEntry, normalizeRuntimeToolIdentifier, projectRuntimeMcpResult } from './mcp_runtime.js';
import { validateContractCommandInput } from './mcp_handlers_contracts.js';

// A contract command reached through runtime.tools.call is validated by its family, as its direct method is.
const contractInputError = (params = {}) => validateContractCommandInput(normalizeRuntimeToolIdentifier(params),
    params?.input && typeof params.input === 'object' ? params.input : {});

export const createMcpAiRuntimeHandlers = () => ({
    async 'ai.tools.list'() {
        const agent = await loadAIAgent();
        const tools = agent.listTools();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools
        };
    },
    async 'ai.tools.call'(params = {}) {
        const agent = await loadAIAgent();
        if (typeof agent.callTool !== 'function') {
            throw new Error('AtomeAI.callTool is not available');
        }

        // The MCP gate already held the call for the person's yes (mcp_confirmation_gate.js): the assistant's
        // own gateway receives that confirmation and opens no second proposal.
        const request = {
            tool_name: params.tool_name,
            params: params.params || {},
            actor: { ...params.__mcp.actor },
            signals: params.signals || {},
            source: { ...params.__mcp.source },
            ...(params.confirmed === true ? { confirmation: { confirmation_id: params.__mcp.confirmation_id } } : {}),
            idempotency_key: params.idempotency_key || (params.confirmed === true ? params.__mcp.confirmation_id : null),
            trace_id: params.trace_id || null,
            intent_id: params.intent_id || null,
            dry_run: params.dry_run === true
        };

        return agent.callTool(request);
    },
    async 'ai.audit.list'(params = {}) {
        const agent = await loadAIAgent();
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
        await loadMcpToolModules();
        const tools = await runtime.listTools({
            includeDisabled: params?.includeDisabled === true
        });
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools: Array.isArray(tools) ? tools.map((entry) => normalizeRuntimeToolEntry(entry)) : []
        };
    },
    async 'runtime.tools.call'(params = {}) {
        const invalid = contractInputError(params);
        if (invalid) return { ok: false, error: invalid };
        const runtime = ensureRuntimeToolApi();
        await loadMcpToolModules();
        const payload = buildRuntimeInvocationPayload(params, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_runtime_call'
        });
        return projectRuntimeMcpResult(await runtime.invokeById(payload));
    },
    async 'runtime.tools.batch_call'(params = {}) {
        const runtime = ensureRuntimeToolApi();
        await loadMcpToolModules();
        if (typeof runtime.invokeBatch !== 'function') {
            throw new Error('Runtime V2 invokeBatch is not available');
        }
        const events = Array.isArray(params?.events) ? params.events : [];
        const invalid = events.map(contractInputError).find(Boolean);
        if (invalid) return { ok: false, error: invalid };
        const normalizedEvents = events.map((entry, index) => buildRuntimeInvocationPayload({ ...entry, __mcp: params.__mcp,
            ...(params.dry_run === true ? { dry_run: true } : {}),
            ...(params.idempotency_key ? { idempotency_key: params.idempotency_key + ':' + index } : {})
        }, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_runtime_batch_call'
        }));
        return projectRuntimeMcpResult(await runtime.invokeBatch(normalizedEvents, {
            tx_id: String(params?.tx_id || params?.txId || '').trim() || undefined
        }));
    },
    'runtime.audit.list'(params = {}) {
        const bus = ensureRuntimeCommandBus();
        const events = bus.listEvents({
            fromSeq: Number.isFinite(Number(params?.fromSeq)) ? Number(params.fromSeq) : undefined,
            kind: params?.kind ? String(params.kind) : undefined,
            trace_id: params?.trace_id ? String(params.trace_id) : undefined,
            tool_id: params?.tool_id ? String(params.tool_id) : undefined,
            source: params?.source_type ? String(params.source_type) : undefined,
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
