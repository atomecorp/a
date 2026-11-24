import { validateParams } from '../ai/agent_gateway_normalize.js';

// Interactions of a project (eVe/intuition/runtime/interaction_runtime.js): « when this object is touched, do that ».
// One contract for runtime V2, AI discovery, voice and direct MCP calls, run by eVe/domains/site/site_runtime.js.
// An interaction is an `interaction` Atome of the project: its trigger (an object touched or held), its target and its
// actions, each a tool of eVe with its parameters (e.g. site.goto { page_id } goes to a page).
export const INTERACTIONS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'PRESENTATION_UNAVAILABLE', 'WRITE_FAILED', 'RUN_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const project = { ...id, description: 'The project; absent: the project open.' };
// A step (R-347, todo/controles_cahier_2026-11-24.md A5): a tool of eVe (kind tool, the default), a MIDI message, a
// fixed value of a property, or a property memorized / restored.
const action = { type: 'object', additionalProperties: false, properties: {
    kind: { type: 'string', enum: ['tool', 'midi', 'constant', 'memory'] },
    tool_id: { type: 'string', minLength: 1, maxLength: 120, description: 'kind tool: an eVe tool, e.g. site.goto.' },
    action: { type: 'string', maxLength: 40 }, parameters: { type: 'object' },
    midi: { type: 'object', description: 'kind midi: { type note|cc|program|pitch_bend|aftertouch|start|stop|clock, channel 1-16, number, velocity }.' },
    property: { type: 'string', maxLength: 80, description: 'kind constant or memory: the property set, stored or restored.' },
    value: { description: 'kind constant: the value set.' },
    op: { type: 'string', enum: ['store', 'restore'] }, slot: { type: 'string', maxLength: 60 } } };
// The Interactions' own triggers and a control's (R-347 A4).
const TRIGGERS = ['activate', 'release', 'double', 'hold', 'drag', 'enter', 'leave', 'changed', 'threshold', 'playhead_enter',
    'playhead_leave', 'beat', 'midi', 'open', 'timer'];
const spec = {
    name: { type: 'string', maxLength: 120 },
    trigger: { type: 'string', enum: TRIGGERS, description: 'activate: touched; release: let go; double: touched twice; hold: held; drag: dragged, its value following the finger; enter / leave: the finger enters or leaves it; changed: its value changed; threshold: its value crosses trigger_params.value; playhead_enter / playhead_leave: the playhead reaches or leaves its clip; beat: each beat or bar while it is present; midi: a MIDI message received; open: the project opens; timer: trigger_params.after_ms after another interaction.' },
    trigger_params: { type: 'object', description: 'threshold { value, direction up|down|both }; beat { every beat|bar }; timer { after_ms, after }; midi { input: { port or bus_id, type note|cc|program, channel, number } }.' },
    target: { type: 'object', description: 'Absent: the object itself. { mode: fixed, atome_ids } (objects, media, clips, tracks, controls); { mode: midi_port, port, channel }; { mode: midi_bus, bus_id }; { mode: network, protocol osc|http, address }.' },
    value_map: { type: 'object', description: 'How the value becomes the message: { out_min, out_max, curve linear|exp|log, invert, relative, on_value, off_value }.' },
    feedback_midi: { type: 'boolean', description: 'Send the value back to the MIDI controller.' },
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
export const INTERACTIONS_ASSISTANT_INSTRUCTIONS = 'Interactions (also a control\'s reactions: « ce slider règle l\'opacité de la vidéo » is trigger drag on the slider with target { mode: "fixed", atome_ids: [video] }; « ce bouton envoie le programme 3 » is an action { kind: "midi", midi: { type: "program", number: 3 } } with target { mode: "midi_port", port }): « quand on touche ce texte, va à la page Contact » calls interactions.create with the object (atome_id), trigger activate and the action { tool_id: "site.goto", parameters: { page_id } } (site.pages gives the pages); « ce bouton ouvre mon Instagram » uses { tool_id: "site.goto", parameters: { url, new_tab: true } }; interactions.list, interactions.update, interactions.remove, interactions.run (test).';
