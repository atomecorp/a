import { validateParams } from '../ai/agent_gateway_normalize.js';
import { CONTROL_KINDS } from '../../shared/control_contract.js';

// Controls of a project (R-347, todo/controles_cahier_2026-11-24.md): a Slider, a Rotatif, a Bouton… laid in the
// project, each a `control` Atome (atome/src/shared/control_contract.js). One contract for runtime V2, AI discovery,
// voice and direct MCP calls, run by eVe/domains/controls/control_commands.js. What a control does is its
// reactions: interactions.* with the control as atome_id.
export const CONTROLS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'PRESENTATION_UNAVAILABLE', 'WRITE_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const project = { ...id, description: 'The project; absent: the project open.' };
const range = { type: 'object', description: '{ min, max, display percent|value }.' };
const spec = {
    name: { type: 'string', maxLength: 60, description: 'Its name, shown at its top (the rail\'s Nom writes it too).' },
    value: { description: 'A number (slider, knob, display), a boolean (button, toggle), { x, y } (xy_pad), a text (field), an option index (menu, selector).' },
    range, range_y: range,
    step: { type: 'number', minimum: 0, description: '0: continuous; else whole steps from the range start.' },
    orientation: { type: 'string', enum: ['vertical', 'horizontal'] },
    options: { type: 'array', maxItems: 144, items: { type: 'string', maxLength: 60 } },
    pads: { type: 'object', description: '{ rows, columns }.' },
    keyboard: { type: 'object', description: '{ first_note, keys }.' },
    appearance: { type: 'object', description: '{ color, image_id }; absent: eVe\'s look.' },
    presence: { type: 'object', description: '{ fade, fade_ms }: how it comes and goes with its clip.' },
    zone_of: { ...id, description: 'A zone: the object it makes touchable.' },
    condition: { type: 'object', description: '{ mode rows|script, lang ruby|js, source, enabled }.' },
    left: { type: 'number' }, top: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }
};
const definitions = {
    list: [{ project_id: project }, [], 'The controls of the project: kind, name, value, frame.', false, 'read'],
    create: [{ project_id: project, control_kind: { type: 'string', enum: CONTROL_KINDS }, ...spec }, ['control_kind'],
        'Lay a control in the project (a slider, a knob, a button…); its reactions are then interactions.create on it.', true, 'write'],
    update: [{ project_id: project, control_id: id, ...spec }, ['control_id'], 'Change a control: its value, range, step, name, look, options.', true, 'write']
};
export const CONTROLS_COMMANDS = Object.freeze(Object.entries(definitions).map(([name, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `controls.${name}`, action: name, description, persistent, capability: `controls.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: CONTROLS_ERRORS },
        control_id: { type: 'string' }, controls: { type: 'array', items: { type: 'object' } } } }
})));
export const validateControlsInput = (name, input) => {
    const contract = CONTROLS_COMMANDS.find(command => command.action === name);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const CONTROLS_ASSISTANT_INSTRUCTIONS = 'Controls: « mets un slider de 0 à 127 par pas de 1 » calls controls.create { control_kind: "slider", range: { min: 0, max: 127, display: "value" }, step: 1 }; « un bouton Intro » { control_kind: "button", name: "Intro" }; its reactions are interactions.create with atome_id the control; controls.list, controls.update (value, range, name…).';
