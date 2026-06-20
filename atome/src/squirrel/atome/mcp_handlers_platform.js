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
import {
    listConfirmations,
    listProposals,
    listSecurityJournal,
    readConfirmation,
    readProposal
} from './mcp_security.js';
import { listAclRules, listRateLimitRules } from './mcp_security_policy.js';
import { buildRuntimeInvocationPayload, ensureAtomeContext } from './mcp_runtime.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';

export const createMcpPlatformHandlers = (getHandlers) => ({
    async 'atome.create'(params = {}) {
        const { defaults } = ensureAtomeContext();
        const runtime = ensureRuntimeToolApi();
        const invocation = resolveAtomeRuntimeInvocation({
            operation: 'create',
            params,
            defaults
        });
        if (!invocation?.tool_id) {
            throw new Error('Atome create could not be resolved to a Runtime V2 tool');
        }
        return runtime.invokeById(buildRuntimeInvocationPayload({
            tool_id: invocation.tool_id,
            action: invocation.action,
            input: invocation.input,
            actor: params?.actor,
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
        const { defaults } = ensureAtomeContext();
        const runtime = ensureRuntimeToolApi();
        const invocation = resolveAtomeRuntimeInvocation({
            operation: 'box',
            params,
            defaults
        });
        if (!invocation?.tool_id) {
            throw new Error('Atome box could not be resolved to a Runtime V2 tool');
        }
        return runtime.invokeById(buildRuntimeInvocationPayload({
            tool_id: invocation.tool_id,
            action: invocation.action,
            input: invocation.input,
            actor: params?.actor,
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
    'atome.describe'() {
        const { defaults } = ensureAtomeContext();
        return {
            protocol: ATOME_MCP_PROTOCOL,
            defaults,
            methods: Object.keys(getHandlers()),
            async_methods: [
                'ai.tools.call',
                'mcp.tools.list',
                'mcp.resources.list',
                'mcp.resources.read',
                'mcp.prompts.list',
                'mcp.prompts.get',
                'mcp.acl.list',
                'mcp.proposals.list',
                'mcp.proposals.read',
                'mcp.confirmations.list',
                'mcp.confirmations.read',
                'mcp.rate_limits.list',
                'mcp.security.journal.list',
                'mcp.toolchains.execute',
                'mcp.operations.list',
                'mcp.operations.read',
                'mcp.operations.cancel',
                'mcp.events.list',
                'mail.list',
                'mail.read',
                'mail.search',
                'mail.next_unread',
                'mail.summarize',
                'mail.reply_draft',
                'mail.mark_read',
                'mail.mark_unread',
                'mail.archive',
                'mail.delete',
                'mail.send',
                'contacts.sources',
                'contacts.list',
                'contacts.search',
                'contacts.read',
                'contacts.import_macos',
                'contacts.import_icloud',
                'contacts.push_icloud',
                'contacts.create',
                'contacts.update',
                'contacts.delete',
                'calendar.sources',
                'calendar.search',
                'calendar.today',
                'calendar.next',
                'calendar.create',
                'calendar.update',
                'calendar.delete',
                'bank.accounts',
                'bank.balance',
                'bank.transactions',
                'bank.summary',
                'bank.search_transactions',
                'bank.find_payer',
                'bank.spending_by_period',
                'bank.top_merchants',
                'bank.recurring_payments',
                'runtime.tools.list',
                'runtime.tools.call',
                'runtime.tools.batch_call',
                'runtime.audit.list'
            ]
        };
    },
    async 'mcp.tools.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            tools: await listUnifiedMcpTools()
        };
    },
    'mcp.resources.list'() {
        return {
            protocol: ATOME_MCP_PROTOCOL,
            resources: listMcpResourceEntries()
        };
    },
    async 'mcp.resources.read'(params = {}) {
        const uri = params?.uri || params?.resource || params?.resource_uri;
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
        const name = params?.name || params?.prompt || params?.prompt_name;
        return renderPrompt(name, params);
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
    async 'mcp.toolchains.execute'(params = {}) {
        const steps = Array.isArray(params?.steps) ? params.steps : [];
        if (!steps.length) {
            throw new Error('Missing toolchain steps');
        }
        const reportProgress = typeof params?.__mcp?.reportProgress === 'function'
            ? params.__mcp.reportProgress
            : () => {};

        if (steps.every((step) => String(step?.method || '').trim() === 'runtime.tools.call')) {
            reportProgress({
                ratio: 0.25,
                phase: 'toolchain.batch'
            });
            const result = await getHandlers()['runtime.tools.batch_call']({
                events: steps.map((step) => ({
                    ...(step?.params && typeof step.params === 'object' ? step.params : {})
                })),
                __mcp: params.__mcp
            });
            reportProgress({
                ratio: 1,
                phase: 'toolchain.completed'
            });
            return {
                ok: true,
                mode: 'runtime_batch',
                count: steps.length,
                result
            };
        }

        const results = [];
        for (let index = 0; index < steps.length; index += 1) {
            const step = steps[index];
            const method = String(step?.method || '').trim();
            if (!method || !hasOwn.call(getHandlers(), method) || method === 'mcp.toolchains.execute') {
                throw new Error(`Invalid toolchain step: ${method || '<empty>'}`);
            }
            const stepParams = step?.params && typeof step.params === 'object'
                ? { ...step.params }
                : {};
            if (params?.__mcp) {
                stepParams.__mcp = params.__mcp;
            }
            const result = await getHandlers()[method](stepParams);
            results.push({
                index,
                method,
                result
            });
            reportProgress({
                ratio: (index + 1) / steps.length,
                phase: 'toolchain.step',
                detail: {
                    index,
                    method
                }
            });
        }
        return {
            ok: true,
            mode: 'sequential',
            count: results.length,
            steps: results
        };
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
