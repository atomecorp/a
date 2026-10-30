import { validateParams } from '../ai/agent_gateway_normalize.js';
import { HEALTH_PROFILE_STORED } from '../../shared/health_profile_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the person's health profile as an assistant or an MCP
// client may know it (decision Q28, 30 Oct. 2026). `health_profile.read` is confirmed: each question that needs the profile
// asks the person's agreement first (the conversation's Approve / Reject), never a standing access. It reads only the
// categories a store holds today (allergies, intolerances; #shared/health_profile_contract.js) and the purpose said.
export const HEALTH_PROFILE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'HEALTH_PROFILE_READ_FAILED']);
export const HEALTH_PROFILE_CONFIRMED_COMMANDS = Object.freeze(['health_profile.read']);
const categories = { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', enum: HEALTH_PROFILE_STORED.map(category => category.id) } };
export const HEALTH_PROFILE_COMMANDS = Object.freeze([Object.freeze({
    name: 'health_profile.read', action: 'read', persistent: false, capability: 'health_profile.read',
    description: 'Read what the user declared in their health profile (allergies, intolerances), only the categories this question needs, with purpose: the question in the user\'s words. The user is asked to agree each time; a refusal is final for that question. Never a diagnosis.',
    input_schema: { type: 'object', additionalProperties: false, required: ['categories', 'purpose'],
        properties: { categories, purpose: { type: 'string', minLength: 1, maxLength: 200 } } },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: HEALTH_PROFILE_ERRORS },
        profile: { type: 'array', items: { type: 'object', properties: { category: { type: 'string' }, declared: { type: 'boolean' },
            value: { type: 'string' }, allergens: { type: 'array' }, date: { type: 'string' } } } } } }
})]);
export const validateHealthProfileInput = (action, input) => {
    const contract = HEALTH_PROFILE_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const HEALTH_PROFILE_ASSISTANT_INSTRUCTIONS = 'Health profile: the assistant knows nothing of it by default. When a question needs it (« ce plat me convient-il ? » and an allergy matters), call health_profile.read with only the categories needed and purpose in the user\'s words; the user agrees or refuses each time. Never guess a condition, never keep what was read for another question.';
