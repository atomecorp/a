import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the person's agreement to eVe using the body
// weight and the birth date of their own card (user, O10 = A, 28 Oct. 2026). Without « Oui », Sport proposes no
// load from the body weight, no heart zones from the age and no energy spent. Asked once, by the same card as the
// motion recordings, at the first Sport session that would use them (eVe/domains/dashboard/dashboard_sensor_consent.js).
export const BODY_DATA_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'body_data_storage_unavailable', 'body_data_invalid', 'BODY_DATA_FAILED']);
const definitions = {
    consent: [{}, [], 'Tell the person\'s agreement to eVe using the body weight and birth date of their own card for Sport (a first load from the body weight, heart zones from the age, the energy spent): granted, refused, or null while never asked.', false],
    set_consent: [{ granted: { type: 'boolean' } }, ['granted'],
        'Give (true) or withdraw (false) the person\'s agreement to eVe using their body weight and age; withdrawn, Sport proposes no load from the body weight and estimates no energy.', true],
    status: [{}, [], 'Tell the agreement and what the person\'s card keeps of their body: weight and birth true when present.', false],
    delete: [{}, [], 'Erase the body weight and the birth date from the person\'s card.', true]
};
export const BODY_DATA_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `body_data.${action}`, action, description, persistent, capability: persistent ? 'body_data.write' : 'body_data.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: BODY_DATA_ERRORS },
        consent: { type: ['string', 'null'], enum: ['granted', 'refused', null] }, weight: { type: 'boolean' }, birth: { type: 'boolean' } } }
})));
export const validateBodyDataInput = (action, input) => {
    const contract = BODY_DATA_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const BODY_DATA_ASSISTANT_INSTRUCTIONS = 'Body weight and age: eVe uses them for Sport only with the person\'s agreement (body_data.consent). '
    + '« n\'utilise plus mon poids » calls body_data.set_consent false, « tu peux utiliser mon poids » true; « qu\'est-ce que tu gardes de mon corps » '
    + 'calls body_data.status; « efface mon poids et mon âge » calls body_data.delete.';
