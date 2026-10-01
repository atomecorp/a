import { TV_COMMANDS, validateTvInput } from '../tv/contracts.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, projectRuntimeMcpResult } from './mcp_runtime.js';

const ENVELOPE_KEYS = new Set(['actor', 'source', 'trace_id', 'intent_id', 'idempotency_key', 'meta', '__mcp', 'dry_run']);
export function createMcpTvHandlers() {
    return Object.fromEntries(TV_COMMANDS.map(command => [command.name, async (params = {}) => {
        const input = Object.fromEntries(Object.entries(params).filter(([key]) => !ENVELOPE_KEYS.has(key)));
        const error = validateTvInput(command.action, input);
        if (error) return { ok: false, error };
        if (!globalThis.window?.document && !globalThis.document) return { ok: false, error: 'NO_ACTIVE_CLIENT' };
        const runtime = ensureRuntimeToolApi();
        return projectRuntimeMcpResult(await runtime.invokeById(buildRuntimeInvocationPayload({
            ...params, tool_id: command.name, input
        }, { layer: 'atome_mcp_tv', presentation: 'mcp' })));
    }]));
}
