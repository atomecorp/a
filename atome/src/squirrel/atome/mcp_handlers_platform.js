import { resolveAtomeRuntimeInvocation } from './runtime_tool_resolution.js';
import {
    ATOME_MCP_PROTOCOL,
    cancelOperationRecord,
    cloneValue,
    hasOwn,
    mcpEvents,
    mcpOperations
} from './mcp_core.js';
import { listUnifiedMcpTools } from './mcp_discovery.js';
import { readMcpResource, listMcpPromptEntries, listMcpResourceEntries, renderPrompt } from './mcp_resources.js';
import { listProposals, listSecurityJournal, readProposal } from './mcp_security.js';
import { listConfirmations, readConfirmation } from './mcp_confirmation_gate.js';
import { listAclRules, listRateLimitRules } from './mcp_security_policy.js';
import { buildRuntimeInvocationPayload } from './mcp_runtime.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';

export const createMcpPlatformHandlers = (getHandlers) => ({
    async 'atome.create'(params = {}) {
        // The eVe creation funnel owns presets and placement: the legacy Squirrel
        // DOM defaults (0,0 · 69 px · #272727) are never merged into a creation.
        const runtime = ensureRuntimeToolApi();
        const invocation = resolveAtomeRuntimeInvocation({ operation: 'create', params });
        if (!invocation?.tool_id) {
            throw new Error('Atome create could not be resolved to a Runtime V2 tool');
        }
        return runtime.invokeById(buildRuntimeInvocationPayload({
            tool_id: invocation.tool_id,
            action: invocation.action,
            input: invocation.input,
            meta: params?.meta,
            trace_id: params?.trace_id,
            intent_id: params?.intent_id,
            idempotency_key: params?.idempotency_key,
            dry_run: params?.dry_run === true,
            __mcp: params?.__mcp
        }, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_create'
        }));
    },
    async 'atome.box'(params = {}) {
        // The eVe creation funnel owns presets and placement: the legacy Squirrel
        // DOM defaults (0,0 · 69 px · #272727) are never merged into a creation.
        const runtime = ensureRuntimeToolApi();
        const invocation = resolveAtomeRuntimeInvocation({ operation: 'box', params });
        if (!invocation?.tool_id) {
            throw new Error('Atome box could not be resolved to a Runtime V2 tool');
        }
        return runtime.invokeById(buildRuntimeInvocationPayload({
            tool_id: invocation.tool_id,
            action: invocation.action,
            input: invocation.input,
            meta: params?.meta,
            trace_id: params?.trace_id,
            intent_id: params?.intent_id,
            idempotency_key: params?.idempotency_key,
            dry_run: params?.dry_run === true,
            __mcp: params?.__mcp
        }, {
            action: 'pointer.click',
            presentation: 'mcp',
            layer: 'atome_mcp_box'
        }));
    },
    // Every method goes through the one async entry (mcp.js); there is no synchronous subset to list.
    'atome.describe'() {
        return { protocol: ATOME_MCP_PROTOCOL, methods: Object.keys(getHandlers()) };
    },
    async 'mcp.tools.list'(params = {}) {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools: await listUnifiedMcpTools(params.__mcp.actor, getHandlers())
        };
    },
    'mcp.resources.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            resources: listMcpResourceEntries()
        };
    },
    async 'mcp.resources.read'(params = {}) {
        const uri = params?.uri;
        return {
            protocol: ATOME_MCP_PROTOCOL,
            uri: String(uri || '').trim() || null,
            content: await readMcpResource(uri, params, getHandlers())
        };
    },
    'mcp.prompts.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            prompts: listMcpPromptEntries()
        };
    },
    'mcp.prompts.get'(params = {}) {
        return renderPrompt(params?.name, params);
    },
    'mcp.acl.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            acl: listAclRules()
        };
    },
    'mcp.proposals.list'(params = {}) {
        const status = params?.status ? String(params.status) : null;
        const proposals = listProposals(status);
        return {
            protocol: ATOME_MCP_PROTOCOL,
            proposals
        };
    },
    'mcp.proposals.read'(params = {}) {
        const proposalId = String(params?.proposal_id || params?.proposalId || params?.id || '').trim();
        const entry = readProposal(proposalId);
        if (!entry) {
            throw new Error(`Unknown MCP proposal: ${proposalId}`);
        }
        return {
            protocol: ATOME_MCP_PROTOCOL,
            proposal: cloneValue(entry)
        };
    },
    'mcp.confirmations.list'(params = {}) {
        const status = params?.status ? String(params.status) : null;
        const confirmations = listConfirmations(status);
        return {
            protocol: ATOME_MCP_PROTOCOL,
            confirmations
        };
    },
    'mcp.confirmations.read'(params = {}) {
        const confirmationId = String(params?.confirmation_id || params?.confirmationId || params?.id || '').trim();
        const entry = readConfirmation(confirmationId);
        if (!entry) {
            throw new Error(`Unknown MCP confirmation: ${confirmationId}`);
        }
        return {
            protocol: ATOME_MCP_PROTOCOL,
            confirmation: cloneValue(entry)
        };
    },
    'mcp.rate_limits.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            rules: listRateLimitRules()
        };
    },
    'mcp.security.journal.list'(params = {}) {
        const type = params?.type ? String(params.type) : null;
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        const items = listSecurityJournal({ type, limit });
        return {
            protocol: ATOME_MCP_PROTOCOL,
            items
        };
    },
    // Each step is a request of its own through the single entry (mcp.js `__mcp.dispatch`), with its own
    // policy and confirmation: a chain never carries a step past the person's yes. A held step stops the
    // chain; the caller re-sends it from `resume_index` with that step's `confirmed` and `confirmation_id`.
    async 'mcp.toolchains.execute'(params = {}) {
        const steps = Array.isArray(params?.steps) ? params.steps : [];
        if (!steps.length) throw new Error('Missing toolchain steps');
        const start = params.start_index === undefined ? 0 : Number(params.start_index);
        if (!Number.isInteger(start) || start < 0 || start >= steps.length) throw new Error('toolchain_start_index_invalid');
        steps.forEach((step) => {
            const method = String(step?.method || '').trim();
            if (!method || !hasOwn.call(getHandlers(), method) || method === 'mcp.toolchains.execute') {
                throw new Error(`Invalid toolchain step: ${method || '<empty>'}`);
            }
        });
        const results = [];
        for (let index = start; index < steps.length; index += 1) {
            const method = String(steps[index].method).trim();
            const stepParams = steps[index].params && typeof steps[index].params === 'object' ? steps[index].params : {};
            const response = await params.__mcp.dispatch(method, stepParams);
            if (response.error) return { ok: false, mode: 'sequential', failed_index: index, error: response.error, steps: results };
            const gate = response.result;
            if (gate?.confirmation_required === true || /^mcp_(confirmation|rate_limited)/.test(String(gate?.error || ''))) {
                return { ok: false, mode: 'sequential', status: 'held', resume_index: index, gate, steps: results };
            }
            results.push({ index, method, result: gate });
            params.__mcp.reportProgress({ ratio: (index + 1) / steps.length, phase: 'toolchain.step', detail: { index, method } });
        }
        return { ok: true, mode: 'sequential', count: results.length, steps: results };
    },
    'mcp.operations.list'(params = {}) {
        const status = params?.status ? String(params.status) : null;
        const method = params?.method ? String(params.method) : null;
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        const operations = Array.from(mcpOperations.values())
            .filter((entry) => (!status || entry.status === status) && (!method || entry.method === method))
            .slice(-limit)
            .map((entry) => ({
                operation_id: entry.operation_id,
                request_id: entry.request_id,
                method: entry.method,
                status: entry.status,
                progress_ratio: entry.progress_ratio,
                progress_phase: entry.progress_phase,
                started_at: entry.started_at,
                updated_at: entry.updated_at,
                completed_at: entry.completed_at,
                cancel_requested_at: entry.cancel_requested_at,
                result: cloneValue(entry.result),
                error: entry.error
            }));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            operations
        };
    },
    'mcp.operations.read'(params = {}) {
        const operationId = String(params?.operation_id || params?.operationId || params?.id || '').trim();
        const entry = mcpOperations.get(operationId);
        if (!entry) {
            throw new Error(`Unknown MCP operation: ${operationId}`);
        }
        return {
            protocol: ATOME_MCP_PROTOCOL,
            operation: {
                operation_id: entry.operation_id,
                request_id: entry.request_id,
                method: entry.method,
                status: entry.status,
                progress_ratio: entry.progress_ratio,
                progress_phase: entry.progress_phase,
                started_at: entry.started_at,
                updated_at: entry.updated_at,
                completed_at: entry.completed_at,
                cancel_requested_at: entry.cancel_requested_at,
                result: cloneValue(entry.result),
                error: entry.error
            }
        };
    },
    'mcp.operations.cancel'(params = {}) {
        const operationId = params?.operation_id || params?.operationId || params?.id;
        return cancelOperationRecord(operationId);
    },
    'mcp.events.list'(params = {}) {
        const type = params?.type ? String(params.type) : null;
        const limit = Number.isFinite(Number(params?.limit))
            ? Math.max(1, Math.round(Number(params.limit)))
            : 50;
        const events = mcpEvents
            .filter((entry) => !type || entry.type === type)
            .slice(-limit)
            .map((entry) => cloneValue(entry));
        return {
            protocol: ATOME_MCP_PROTOCOL,
            events
        };
    },
});
