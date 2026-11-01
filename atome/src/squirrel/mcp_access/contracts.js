import { validateParams } from '../ai/agent_gateway_normalize.js';

// What reaches this device from outside the app: the programs the person accepted by their number
// (Réglages › Mon matériel › Programmes, #squirrel/atome/mcp_surface_grants.js) and the requests held for the
// person's yes (#squirrel/atome/mcp_confirmation_gate.js, the request panel eVe/domains/user/mcp_confirmation_prompt.js).
// Changing a grant or answering a request belongs to the person at this device: their owners refuse any other
// source than the app itself, whatever the capability (a program never widens its own grant, eVe never says yes for them).
// Run by eVe/domains/user/mcp_access_commands.js.
export const MCP_ACCESS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'NOT_LOCAL', 'NOT_PENDING', 'AUTH_REQUIRED', 'WRITE_FAILED']);
const programId = { type: 'string', minLength: 1, maxLength: 80, description: 'The program, as mcp_access.programs lists it.' };
const families = { type: 'array', maxItems: 8, items: { type: 'string', enum: ['modify', 'calendar', 'contacts', 'mail', 'capture', 'health', 'purchases'] },
    description: 'The families it may use beyond « read » (always open): modify, calendar, contacts, mail, capture, health, purchases.' };
const definitions = {
    programs: [{}, [], 'The programs accepted on this account: name, the machine they run on, when they were paired, their families.', false, 'read'],
    program_families: [{ program_id: programId, families }, ['program_id', 'families'],
        'Set the families one program may use (only the person, in the app).', true, 'write'],
    program_withdraw: [{ program_id: programId }, ['program_id'], 'Withdraw a program: its key is revoked, its grant forgotten (only the person, in the app).', true, 'write'],
    confirmations: [{}, [], 'The requests waiting for the person\'s yes: who asks, what, until when.', false, 'read'],
    confirmation_open: [{ confirmation_id: { type: 'string', maxLength: 80 } }, [], 'Show a waiting request on its panel (the oldest one without an id).', false, 'control'],
    confirmation_decide: [{ confirmation_id: { type: 'string', minLength: 1, maxLength: 80 }, approved: { type: 'boolean' } }, ['confirmation_id', 'approved'],
        'Answer a waiting request (only the person, in the app).', true, 'write']
};
export const MCP_ACCESS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `mcp_access.${action}`, action, description, persistent, capability: `mcp_access.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: MCP_ACCESS_ERRORS },
        programs: { type: 'array' }, families: { type: 'array' }, confirmations: { type: 'array' }, status: { type: 'string' } } }
})));
export const MCP_ACCESS_CONFIRMED_COMMANDS = Object.freeze(['mcp_access.program_families', 'mcp_access.program_withdraw']);
export const validateMcpAccessInput = (action, input) => {
    const contract = MCP_ACCESS_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const MCP_ACCESS_ASSISTANT_INSTRUCTIONS = 'Programmes: « quels programmes ont accès ? » calls mcp_access.programs; « mes demandes en attente » mcp_access.confirmations, « montre la demande » mcp_access.confirmation_open. Granting a program a family, withdrawing it or answering a request is the person\'s alone, in the app: never claim it done.';
