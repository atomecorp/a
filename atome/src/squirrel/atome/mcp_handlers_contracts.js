import { MCP_CONTRACT_FAMILIES } from './mcp_contract_families.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, projectRuntimeMcpResult } from './mcp_runtime.js';

// Direct MCP calls of a contract family (TV, social sharing) go through the
// same runtime tools as the eVe interface: one contract, one owner, one audit.
// The confirmation of a confirmed command (mcp_confirmation_gate.js) is the envelope's too, never the command's input.
const ENVELOPE_KEYS = new Set(['trace_id', 'intent_id', 'idempotency_key', 'meta', '__mcp', 'dry_run', 'confirmed', 'confirmation_id', 'defer']);
const FAMILY_BY_COMMAND = new Map(MCP_CONTRACT_FAMILIES.flatMap(family => family.commands.map(command => [command.name, { family, command }])));

/** The family's own validation of a contract command's input, whatever the door that reaches it
 *  (its direct method or runtime.tools.call). `null` when valid or when `toolId` is no contract command. */
export function validateContractCommandInput(toolId, input = {}) {
    const entry = FAMILY_BY_COMMAND.get(String(toolId || '').trim());
    return entry ? entry.family.validate(entry.command.action, input) || null : null;
}

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
