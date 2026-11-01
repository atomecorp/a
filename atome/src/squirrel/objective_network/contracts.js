import { validateParams } from '../ai/agent_gateway_normalize.js';

// The objectives network (P022–P025, validated mockups MD3a–MD3e): being findable for one objective (« Visib. », what
// others then see: the objective's shown name, its moments, a language, an approximate zone; never a health value, a
// precise place or the notebook), the people who share it, their card, a report, a block, the end of a link, and the
// whole network on or off (Réglages › Confidentialité). Run by eVe/domains/objectives/objective_network_runtime.js.
export const OBJECTIVE_NETWORK_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'AUTH_REQUIRED', 'ADULT_REQUIRED', 'NETWORK_OFF',
    'PRESENTATION_UNAVAILABLE', 'WRITE_FAILED']);
const objectiveId = { type: 'string', minLength: 1, maxLength: 200, description: 'The objective, as dashboard.objectives.list gives it.' };
const userId = { type: 'string', minLength: 1, maxLength: 200, description: 'The person, as objective_network.people gives them.' };
const definitions = {
    visibility_get: [{ objective_id: objectiveId }, ['objective_id'], 'Whether others may find the person for this objective, and what they then see.', false, 'read'],
    visibility_set: [{ objective_id: objectiveId, visible: { type: 'boolean' }, shown_name: { type: 'string', maxLength: 80 },
        moments: { type: 'array', maxItems: 3, items: { type: 'string', enum: ['morning', 'noon', 'evening'] } },
        language: { type: 'string', maxLength: 40 }, zone: { type: 'string', maxLength: 80, description: 'An approximate zone (« Lyon et environs »), never a position.' } },
    ['objective_id'], 'Be findable (visible true) or not for one objective, and what others see of it.', true, 'write'],
    visibility_open: [{ objective_id: objectiveId }, ['objective_id'], 'Show what others see for this objective (its « Visib. » panel).', false, 'control'],
    people: [{ objective_id: objectiveId }, ['objective_id'], 'The people who show themselves for this objective (adults only, those blocked either way never).', false, 'read'],
    people_open: [{ objective_id: objectiveId }, ['objective_id'], 'Show the people who share this objective (its « Relier » level).', false, 'control'],
    report: [{ user_id: userId, reason: { type: 'string', enum: ['spam', 'abuse', 'fake', 'other'] } }, ['user_id'],
        'Report a person: recorded for eVe\'s moderators; three reports hide them from the network.', true, 'write'],
    block: [{ user_id: userId }, ['user_id'], 'Block a person: they no longer reach the person, nor find them.', true, 'write'],
    end_link: [{ user_id: userId }, ['user_id'], 'End the link with a contact: removed from both books, future shares stop; what was sent stays.', true, 'write'],
    network_get: [{}, [], 'Whether the person is in the objectives network at all.', false, 'read'],
    network_set: [{ enabled: { type: 'boolean' } }, ['enabled'],
        'Join or leave the whole objectives network; leaving turns every « Visib. » off and takes back unanswered requests.', true, 'write']
};
export const OBJECTIVE_NETWORK_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `objective_network.${action}`, action, description, persistent, capability: `objective_network.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: OBJECTIVE_NETWORK_ERRORS },
        visibility: { type: 'object' }, people: { type: 'array' }, enabled: { type: 'boolean' }, status: { type: 'string' } } }
})));
export const OBJECTIVE_NETWORK_CONFIRMED_COMMANDS = Object.freeze(['objective_network.visibility_set', 'objective_network.report',
    'objective_network.block', 'objective_network.end_link', 'objective_network.network_set']);
export const validateObjectiveNetworkInput = (action, input) => {
    const contract = OBJECTIVE_NETWORK_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const OBJECTIVE_NETWORK_ASSISTANT_INSTRUCTIONS = 'Objectives network: « qui partage mon objectif marche ? » calls dashboard.objectives.list then objective_network.people_open with its objective_id; « rends-moi visible pour cet objectif » objective_network.visibility_set visible true (say back what others will see: shown name, moments, language, zone); « je ne veux plus être trouvé » visibility_set visible false; « quitte le réseau des objectifs » objective_network.network_set enabled false. « signale Inès » objective_network.report, « bloque-la » objective_network.block, « fin du lien avec Hugo » objective_network.end_link. A report is recorded for eVe\'s moderators: never say it was sent to anyone.';
