import { validateParams } from '../ai/agent_gateway_normalize.js';
import { HEALTH_MONITORS } from './health_catalog.js';

// One contract for runtime V2, AI discovery and direct MCP calls: what the person declares for a health monitor
// (a glass of water), the Verre and Retire tools of its detail included (#health_declarations.js). The assistant
// writes what the person says; it never reads a health value back.
export const HEALTH_DECLARATION_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'HEALTH_DECLARATION_MONITOR_UNKNOWN',
    'HEALTH_DECLARATION_NONE', 'HEALTH_DECLARATION_WRITE_FAILED']);
const monitor_id = { type: 'string', enum: HEALTH_MONITORS.filter(entry => entry.declaration).map(entry => entry.id) };
const definitions = {
    add: [{ monitor_id, value: { type: 'number', exclusiveMinimum: 0 }, unit: { type: 'string' } }, ['monitor_id'],
        'Declare what the user just drank or did, now, for a health monitor: hydration in mL (one glass, 250 mL, when no value is said).'],
    withdraw: [{ monitor_id, day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, ['monitor_id'],
        'Withdraw the last value the user declared for a health monitor on a day (today when no day is given).']
};
export const HEALTH_DECLARATION_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description]]) => Object.freeze({
    name: `health_declaration.${action}`, action, description, persistent: true, capability: 'health_declaration.write',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: HEALTH_DECLARATION_ERRORS },
        monitor_id: { type: 'string' }, entry: { type: 'object' } } }
})));
export const validateHealthDeclarationInput = (action, input) => {
    const contract = HEALTH_DECLARATION_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const HEALTH_DECLARATION_ASSISTANT_INSTRUCTIONS = 'Water: « j\'ai bu un verre d\'eau » calls health_declaration.add with monitor_id hydration (no value: one glass); « j\'ai bu 500 mL » adds value 500, unit mL; « enlève le dernier verre » calls health_declaration.withdraw. Never say how much the user drank today: the assistant does not read health values.';
export const healthDeclarationError = error => HEALTH_DECLARATION_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'HEALTH_DECLARATION_WRITE_FAILED';

/** The service executor of the family (eVe/intuition/tools/core/tool_runtime_service_commands.js). */
export const executeHealthDeclarationCommand = async (action, input = {}) => {
    const { getHealthOwner } = await import('./index.js');
    const declarations = getHealthOwner().declarations;
    try { return await (action === 'add' ? declarations.add(input) : declarations.withdraw(input)); }
    catch (error) { return { ok: false, error: healthDeclarationError(error) }; }
};
