import { TV_COMMANDS, validateTvInput } from '../tv/contracts.js';
import { SOCIAL_COMMANDS, validateSocialInput } from '../social/contracts.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, projectRuntimeMcpResult } from './mcp_runtime.js';

// Direct MCP calls of a contract family (TV, social sharing) go through the
// same runtime tools as the eVe interface: one contract, one owner, one audit.
const ENVELOPE_KEYS = new Set(['actor', 'source', 'trace_id', 'intent_id', 'idempotency_key', 'meta', '__mcp', 'dry_run']);
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

export const createMcpTvHandlers = () => createContractHandlers({
    commands: TV_COMMANDS, validate: validateTvInput, layer: 'atome_mcp_tv', noClient: 'NO_ACTIVE_CLIENT' });
export const createMcpSocialHandlers = () => createContractHandlers({
    commands: SOCIAL_COMMANDS, validate: validateSocialInput, layer: 'atome_mcp_social', noClient: 'social_handoff_unavailable' });
