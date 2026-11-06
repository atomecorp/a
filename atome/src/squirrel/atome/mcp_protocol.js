// The standard MCP layer (architecture §6.2): the official JSON-RPC methods mapped onto the single
// entry (mcp.js), which judges every request before any effect. No business logic here: a tool is
// a method, a Runtime V2 tool or an assistant tool of the entry, a resource and a prompt are the
// entry's own. Dotted methods stay callable through the same entry.
//
// A tool call held for the person's yes comes back as an error result whose `_meta['atome/confirmation']`
// says `pending`; the caller re-sends the same call with `_meta['atome/confirmation_id']` once the person
// decided (the relay does this round trip for a program, teleport/remote_command.js).
import { handleAtomeMCPRequestAsync } from './mcp.js';
import { atomeMCPHandlers } from './mcp_handlers.js';
import { cancelOperationRecord, hasOwn, isMcpInfrastructureMethod, MCP_ERROR, mcpError, mcpOperations, readMcpToolsGeneration } from './mcp_core.js';
import { ensureRuntimeToolApi, loadAIAgent, loadMcpToolModules } from './mcp_bridges.js';
import { MCP_RESOURCE_TEMPLATES } from './mcp_resources.js';

// Newest first: a client asking for one of these gets it, any other gets the newest.
export const MCP_PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);
export const MCP_SERVER_INFO = Object.freeze({ name: 'atome-eve', version: '1.0.0' });
const CONFIRMATION_META = 'atome/confirmation';
const CONFIRMATION_ID_META = 'atome/confirmation_id';
// A page of tools/list stays well under the relay's answer size (server/remoteCommandRelay.js).
const TOOLS_PAGE_SIZE = 50;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const requireObject = (value, name) => {
    if (value !== undefined && !isObject(value)) throw mcpError(MCP_ERROR.INVALID_PARAMS, `mcp_${name}_not_an_object`);
    return value || {};
};

/** Calls the single entry; a JSON-RPC error of the entry becomes this layer's error. */
async function entry(method, params, transport, requestId) {
    const response = await handleAtomeMCPRequestAsync({ jsonrpc: '2.0', id: requestId, method, params }, transport);
    if (response.error) throw mcpError(response.error.code, response.error.message);
    return response.result;
}

// A tool name is a business method first, then a Runtime V2 tool, then an assistant tool (as tools/list orders them).
async function toolRequest(name, args) {
    if (hasOwn.call(atomeMCPHandlers, name) && !isMcpInfrastructureMethod(name)) return { method: name, params: { ...args } };
    await loadMcpToolModules();
    if (await ensureRuntimeToolApi().resolveTool(name)) return { method: 'runtime.tools.call', params: { tool_id: name, input: { ...args } } };
    if ((await loadAIAgent()).getTool(name)) return { method: 'ai.tools.call', params: { tool_name: name, params: { ...args } } };
    throw mcpError(MCP_ERROR.INVALID_PARAMS, `mcp_tool_unknown:${name}`);
}

const textContent = value => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }];
const toolResult = (value, isError) => ({ content: textContent(value), structuredContent: isObject(value) ? value : { value }, isError });

async function callTool(params, transport, requestId) {
    const name = String(params.name || '').trim();
    if (!name) throw mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_tool_name_missing');
    const meta = requireObject(params._meta, 'meta');
    const { method, params: callParams } = await toolRequest(name, requireObject(params.arguments, 'arguments'));
    if (meta[CONFIRMATION_ID_META]) Object.assign(callParams, { confirmed: true, confirmation_id: String(meta[CONFIRMATION_ID_META]) });
    let result;
    try {
        result = await entry(method, callParams, transport, requestId);
    } catch (error) {
        // A refusal of the policy or of the tool's own checks is the tool's result; an unknown method is not.
        if (error.code === MCP_ERROR.METHOD_NOT_FOUND || error.code === MCP_ERROR.INVALID_REQUEST) throw error;
        return toolResult({ ok: false, error: error.message }, true);
    }
    if (result?.confirmation_required === true) {
        return { ...toolResult(result, true), _meta: { [CONFIRMATION_META]: { status: 'pending',
            confirmation_id: result.confirmation_id, expires_at: result.expires_at } } };
    }
    return toolResult(result, result?.ok === false || result?.status === 'DENIED');
}

/** A cancellation names the request it ends: the operation started for it stops (mcp_core.js). */
export function cancelMcpRequest(requestId) {
    const operation = [...mcpOperations.values()].find(entryRecord => entryRecord.request_id === requestId && entryRecord.status === 'running');
    return operation ? cancelOperationRecord(operation.operation_id) : { ok: false, error: 'mcp_operation_not_found' };
}

// One client's list, built for its first page and kept for the next ones until the catalog or its grant changes
// (`mcp.tools.list_changed`) or a minute passes: the pages of one listing are slices of one list, and a
// listing costs one build instead of one per page.
const LISTING_TTL_MS = 60 * 1000;
const listings = new Map();
const listingKey = transport => JSON.stringify([transport?.source?.type || '', transport?.source?.from_program_id || '',
    transport?.actor?.actor_id || transport?.actor?.user_id || '']);
async function listedTools(params, transport, requestId) {
    const key = listingKey(transport);
    const kept = listings.get(key);
    const generation = readMcpToolsGeneration();
    if (params.cursor !== undefined && kept && kept.generation === generation && Date.now() - kept.at < LISTING_TTL_MS) return kept.tools;
    const tools = (await entry('mcp.tools.list', {}, transport, requestId)).tools;
    listings.set(key, { tools, generation, at: Date.now() });
    return tools;
}

const METHODS = {
    initialize: async (params) => ({
        protocolVersion: MCP_PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : MCP_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: true }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { ...MCP_SERVER_INFO }
    }),
    ping: async () => ({}),
    'tools/list': async (params, transport, requestId) => {
        const tools = await listedTools(params, transport, requestId);
        const offset = params.cursor === undefined ? 0 : Number(params.cursor);
        if (!Number.isInteger(offset) || offset < 0 || offset > tools.length) throw mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_cursor_invalid');
        const next = offset + TOOLS_PAGE_SIZE;
        return { tools: tools.slice(offset, next).map(tool => ({
            name: tool.name, ...(tool.title ? { title: tool.title } : {}), ...(tool.description ? { description: tool.description } : {}),
            inputSchema: tool.inputSchema,
            ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
            annotations: { readOnlyHint: tool.risk_tier === 'read', destructiveHint: ['high', 'irreversible'].includes(tool.risk_tier) },
            _meta: { 'atome/risk_tier': tool.risk_tier, 'atome/exposure': tool.exposure,
                ...(tool.exposure_blocked_on ? { 'atome/exposure_blocked_on': tool.exposure_blocked_on } : {}),
                'atome/confirmation_required': tool.confirmation_required, 'atome/source': tool.source }
        })), ...(next < tools.length ? { nextCursor: String(next) } : {}) };
    },
    'tools/call': callTool,
    'resources/list': async (params, transport, requestId) => ({
        resources: (await entry('mcp.resources.list', {}, transport, requestId)).resources
            .map(({ uri, name, description, mime_type }) => ({ uri, name, description, mimeType: mime_type }))
    }),
    'resources/templates/list': async () => ({ resourceTemplates: MCP_RESOURCE_TEMPLATES.map(template => ({ ...template })) }),
    'resources/read': async (params, transport, requestId) => {
        const uri = String(params.uri || '').trim();
        if (!uri) throw mcpError(MCP_ERROR.INVALID_PARAMS, 'mcp_resource_uri_missing');
        const read = await entry('mcp.resources.read', { uri }, transport, requestId);
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(read.content) }] };
    },
    'prompts/list': async (params, transport, requestId) => ({
        prompts: (await entry('mcp.prompts.list', {}, transport, requestId)).prompts
            .map(({ name, description, arguments: args }) => ({ name, description, ...(args ? { arguments: args } : {}) }))
    }),
    'prompts/get': async (params, transport, requestId) => {
        const prompt = await entry('mcp.prompts.get', { ...requireObject(params.arguments, 'arguments'), name: String(params.name || '') },
            transport, requestId);
        return { description: prompt.name, messages: [{ role: 'user', content: { type: 'text', text: prompt.prompt } }] };
    }
};
const NOTIFICATIONS = {
    'notifications/initialized': () => {},
    'notifications/progress': () => {},
    'notifications/cancelled': (params, namespace) => { cancelMcpRequest(`${namespace}:${params.requestId}`); }
};

/** One JSON-RPC message from an MCP client. `namespace` keeps one client's request ids apart from another's.
 *  Resolves the response, or null for a notification. */
export async function handleMcpProtocolMessage(message, transport, namespace) {
    if (!isObject(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        return { jsonrpc: '2.0', id: message?.id ?? null, error: { code: MCP_ERROR.INVALID_REQUEST, message: 'mcp_invalid_request' } };
    }
    const isNotification = !hasOwn.call(message, 'id');
    try {
        const params = requireObject(message.params, 'params');
        if (isNotification) {
            if (NOTIFICATIONS[message.method]) NOTIFICATIONS[message.method](params, namespace);
            return null;
        }
        const requestId = `${namespace}:${message.id}`;
        if (METHODS[message.method]) return { jsonrpc: '2.0', id: message.id, result: await METHODS[message.method](params, transport, requestId) };
        // A dotted method of the entry (its internal callers' contract) answers as it always did.
        const response = await handleAtomeMCPRequestAsync({ jsonrpc: '2.0', id: requestId, method: message.method, params }, transport);
        return { ...response, id: message.id };
    } catch (error) {
        if (isNotification) return null;
        return { jsonrpc: '2.0', id: message.id, error: { code: Number.isInteger(error.code) ? error.code : MCP_ERROR.INTERNAL, message: error.message } };
    }
}
