import { validateParams } from '../ai/agent_gateway_normalize.js';

// Interactions of a project (eVe/intuition/runtime/interaction_runtime.js): « when this object is touched, do that ».
// One contract for runtime V2, AI discovery, voice and direct MCP calls, run by eVe/domains/site/site_runtime.js.
// An interaction is an `interaction` Atome of the project: its trigger (an object touched or held), its target and its
// actions, each a tool of eVe with its parameters (e.g. site.goto { page_id } goes to a page).
export const INTERACTIONS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'PRESENTATION_UNAVAILABLE', 'WRITE_FAILED', 'RUN_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const project = { ...id, description: 'The project; absent: the project open.' };
const action = { type: 'object', additionalProperties: false, required: ['tool_id'], properties: {
    tool_id: { type: 'string', minLength: 1, maxLength: 120, description: 'An eVe tool, e.g. site.goto.' },
    action: { type: 'string', maxLength: 40 }, parameters: { type: 'object' } } };
const spec = {
    name: { type: 'string', maxLength: 120 },
    trigger: { type: 'string', enum: ['activate', 'hold'], description: 'activate: the object is touched; hold: it is held.' },
    atome_id: { ...id, description: 'The object that triggers the interaction.' },
    actions: { type: 'array', minItems: 1, maxItems: 12, items: action },
    enabled: { type: 'boolean' }
};
const definitions = {
    list: [{ project_id: project }, [], 'The interactions of the project: name, trigger, object, actions, enabled.', false, 'read'],
    create: [{ project_id: project, ...spec }, ['atome_id', 'actions'], 'Create an interaction: when the object is touched (or held), run the actions.', true, 'write'],
    update: [{ project_id: project, interaction_id: id, ...spec }, ['interaction_id'], 'Change an interaction (name, trigger, object, actions, enabled).', true, 'write'],
    remove: [{ project_id: project, interaction_id: id }, ['interaction_id'], 'Delete an interaction.', true, 'write'],
    run: [{ project_id: project, interaction_id: id }, ['interaction_id'], 'Test an interaction now, as if its object were touched.', false, 'control']
};
export const INTERACTIONS_COMMANDS = Object.freeze(Object.entries(definitions).map(([name, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `interactions.${name}`, action: name, description, persistent, capability: `interactions.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: INTERACTIONS_ERRORS },
        interaction_id: { type: 'string' }, interactions: { type: 'array', items: { type: 'object' } } } }
})));
export const validateInteractionsInput = (name, input) => {
    const contract = INTERACTIONS_COMMANDS.find(command => command.action === name);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const INTERACTIONS_ASSISTANT_INSTRUCTIONS = 'Interactions: « quand on touche ce texte, va à la page Contact » calls interactions.create with the object (atome_id), trigger activate and the action { tool_id: "site.goto", parameters: { page_id } } (site.pages gives the pages); « ce bouton ouvre mon Instagram » uses { tool_id: "site.goto", parameters: { url, new_tab: true } }; interactions.list, interactions.update, interactions.remove, interactions.run (test).';
