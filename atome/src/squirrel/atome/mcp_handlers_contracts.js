import { MCP_CONTRACT_FAMILIES } from './mcp_contract_families.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, projectRuntimeMcpResult } from './mcp_runtime.js';

// Direct MCP calls of a contract family (TV, social sharing) go through the
// same runtime tools as the eVe interface: one contract, one owner, one audit.
// The confirmation of a confirmed command (mcp_security.js#validateConfirmation) is the envelope's too, never the command's input.
const ENVELOPE_KEYS = new Set(['actor', 'source', 'trace_id', 'intent_id', 'idempotency_key', 'meta', '__mcp', 'dry_run', 'confirmed', 'confirmation_id', 'confirmationId']);
const createContractHandlers = ({ commands, validate, layer, noClient }) => Object.fromEntries(commands.map((command) => [command.name, async (params = {}) => {
    const input = Object.fromEntries(Object.entries(params).filter(([key]) => !ENVELOPE_KEYS.has(key)));
    const error = validate(command.action, input);
    if (error) return { ok: false, error };
    if (!globalThis.window?.document && !globalThis.document) return { ok: false, error: noClient };
    const runtime = ensureRuntimeToolApi();
    return projectRuntimeMcpResult(await runtime.invokeById(buildRuntimeInvocationPayload({
        ...params, tool_id: command.name, input
    }, { layer, presentation: 'mcp' })));
}]));

export const createMcpContractHandlers = () => Object.assign({}, ...MCP_CONTRACT_FAMILIES.map(createContractHandlers));
