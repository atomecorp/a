import { validateParams } from '../ai/agent_gateway_normalize.js';

// Two health command families (register R-104 D4; Health cahier annex B; mockups MA, MB3): `health_protocol` (import of a
// protocol text, conciliation, S0–S5, planning, review, templates) and `health_products` (declared products, intakes, the
// Compl'Alim catalogue by name, Open Food Facts by barcode). Health data: both are CLOSED to AI and MCP by default — the
// executor answers only the person acting in the app (source `ui`, health access open), whatever capability a caller
// declares (eVe/domains/health_protocol/health_protocol_commands.js). Writes that send or commit to a plan are confirmed.
export const HEALTH_PROTOCOL_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'health_access_denied_for_actor', 'health_protocol_unknown',
    'protocol_review_human_required', 'protocol_review_state_invalid', 'protocol_activation_confirmation_required', 'protocol_text_empty',
    'protocol_text_too_large', 'protocol_template_unknown', 'protocol_template_empty', 'CONTACT_REQUIRED', 'PROVIDER_UNAVAILABLE', 'HEALTH_PROTOCOL_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 300 };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const output = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string' } } };
const command = (family, action, persistent, description, input, required = []) => Object.freeze({ name: `${family}.${action}`, action, persistent,
    capability: `${family}.${persistent ? 'write' : 'read'}`, description, input_schema: object(input, required), output_schema: output });
const STATUS = { type: 'string', enum: ['declared_current', 'declared_historical', 'proposed', 'experimental', 'professional_only', 'unknown'] };
const P = 'health_protocol';
export const HEALTH_PROTOCOL_COMMANDS = Object.freeze([
    command(P, 'import', true, 'Import a health protocol text (pasted, or a text Atome already filed): the original is kept unchanged, every line read with its status, confidence, S0–S5 alerts and a proposed day, nothing active.',
        { text: { type: 'string', minLength: 1, maxLength: 524288 }, text_atome_id: id }),
    command(P, 'list', false, 'List the imported protocols and their review state.', {}),
    command(P, 'read', false, 'Read a protocol\'s outputs A–I (original, conciliation, ingredients, kinds, questions, alerts, planning, conflicts, approval).', { proposal_id: id }, ['proposal_id']),
    command(P, 'correct', true, 'Correct the status read on one line.', { proposal_id: id, ref: id, status: STATUS }, ['proposal_id', 'ref', 'status']),
    command(P, 'decide', true, 'Keep, refuse or postpone one line.', { proposal_id: id, ref: id, decision: { type: 'string', enum: ['pending', 'kept', 'refused', 'postponed'] } }, ['proposal_id', 'ref', 'decision']),
    command(P, 'professional', true, 'Record that a professional confirmed one line.', { proposal_id: id, ref: id, professional: { type: 'string', enum: ['physician', 'pharmacist', 'practitioner'] } },
        ['proposal_id', 'ref', 'professional']),
    command(P, 'answer', true, 'Answer a blocking question (answered, unknown, later, declined); times: wake, bedtime, breakfast, lunch, dinner as HH:MM.',
        { proposal_id: id, key: id, answer: { type: 'string', enum: ['answered', 'unknown', 'later', 'declined'] }, value: { type: 'string', maxLength: 2000 }, times: { type: 'object' } },
        ['proposal_id', 'key', 'answer']),
    command(P, 'review', true, 'Mark the conciliation as gone through by the person.', { proposal_id: id }, ['proposal_id']),
    command(P, 'refuse', true, 'Refuse the whole proposal.', { proposal_id: id }, ['proposal_id']),
    command(P, 'activate', true, 'Activate the kept, planned, evaluated lines after the person\'s confirmation; calendar writes personal occurrences, reminders lists the lines whose « Rappel » is on.',
        { proposal_id: id, confirmed: { type: 'boolean' }, calendar: { type: 'boolean' }, reminders: { type: 'array', items: id } }, ['proposal_id', 'confirmed']),
    command(P, 'template_create', true, 'Make a private template from a proposal; ticks: { line ref: true|false }; doses and medicine lines unticked by default.',
        { proposal_id: id, title: { type: 'string', minLength: 1, maxLength: 200 }, ticks: { type: 'object' }, include_doses: { type: 'boolean' } }, ['proposal_id', 'title']),
    command(P, 'template_revise', true, 'Publish a new version of one\'s template; receivers get it as a proposal.',
        { template_id: id, proposal_id: id, ticks: { type: 'object' }, include_doses: { type: 'boolean' } }, ['template_id']),
    command(P, 'template_list', false, 'List one\'s protocol templates.', {}),
    command(P, 'template_preview', false, 'Show exactly what a template would send.', { template_id: id }, ['template_id']),
    command(P, 'template_share', true, 'Share a template with a contact (linked share, read only).', { template_id: id, user_id: id }, ['template_id', 'user_id']),
    command(P, 'template_unshare', true, 'Stop sharing a template with a contact.', { template_id: id, user_id: id }, ['template_id', 'user_id']),
    command(P, 'template_proposals', false, 'List the template versions shared with the person that wait for their answer.', {}),
    command(P, 'template_accept', true, 'Import a shared template version on the person\'s own profile, as a new proposal (S0–S5 run again).', { template_id: id }, ['template_id']),
    command(P, 'template_refuse', true, 'Refuse a shared template version.', { template_id: id }, ['template_id']),
    command(P, 'template_duplicate', true, 'Copy one\'s template as a new private template (version 1, shared with nobody).', { template_id: id }, ['template_id']),
    command(P, 'template_remove', true, 'Remove one\'s template (its shares end with it).', { template_id: id }, ['template_id'])
]);
export const HEALTH_PROTOCOL_CONFIRMED_COMMANDS = Object.freeze(['health_protocol.activate', 'health_protocol.template_share', 'health_protocol.template_accept',
    'health_protocol.template_remove']);

const Q = 'health_products';
const quantity = { type: 'object', additionalProperties: false, required: ['value', 'unit'],
    properties: { value: { type: 'number', exclusiveMinimum: 0 }, unit: { type: 'string', minLength: 1, maxLength: 24 }, unit_basis: { type: 'string', enum: ['per_intake', 'per_day'] } } };
export const HEALTH_PRODUCTS_COMMANDS = Object.freeze([
    command(Q, 'declare', true, 'Declare (or change) a product the person takes or applies: name, kind, form, actives, the quantity per intake they typed (never proposed), hours, source (who says what it holds: self, label, doctor).', {
        product_id: id, name: { type: 'string', minLength: 1, maxLength: 200 }, item_kind: { type: 'string', enum: ['supplement', 'medication', 'cosmetic', 'device'] },
        form: { type: 'string', maxLength: 80 }, brand: { type: 'string', maxLength: 200 }, per_intake: quantity, hours: { type: 'array', maxItems: 12, items: { type: 'string' } },
        actives: { type: 'array', maxItems: 64, items: { type: 'object' } }, source: { type: 'string', enum: ['self', 'label', 'doctor'] },
        catalogue_id: { type: 'string', maxLength: 80 }, barcode: { type: 'string', maxLength: 32 }, status: { type: 'string', enum: ['declared_current', 'declared_historical'] },
        reminder: { type: 'boolean' } }, ['name']),
    command(Q, 'list', false, 'List the declared products.', {}),
    command(Q, 'stop', true, 'Mark a declared product as no longer taken.', { product_id: id }, ['product_id']),
    command(Q, 'intake_note', true, 'Note one intake: taken, postponed (to_hour), stopped or forgotten, or cleared (a tick taken back) — only the person ticks it.', { product_id: id,
        day: { type: 'string', minLength: 10, maxLength: 10 }, hour: { type: 'string', minLength: 5, maxLength: 5 }, state: { type: 'string', enum: ['taken', 'postponed', 'stopped', 'forgotten', 'cleared'] },
        to_hour: { type: 'string', minLength: 5, maxLength: 5 } }, ['product_id', 'day', 'hour', 'state']),
    command(Q, 'intakes', false, 'Read the intakes noted on a day.', { day: { type: 'string', minLength: 10, maxLength: 10 } }, ['day']),
    command(Q, 'catalogue_search', false, 'Search the Compl\'Alim supplement catalogue (France, offline) by name.', { query: { type: 'string', minLength: 2, maxLength: 120 },
        limit: { type: 'number', minimum: 1, maximum: 50 } }, ['query']),
    command(Q, 'catalogue_barcode', false, 'Read a product by its barcode (Open Food Facts; a product seen once is kept on the device).', {
        barcode: { type: 'string', minLength: 8, maxLength: 14 }, source: { type: 'string', enum: ['off', 'obf', 'opf'] } }, ['barcode']),
    command(Q, 'reminder', true, '« Rappel » of a declared product turned on or off: on, its hours become personal calendar occurrences with an alarm; off, they are suspended.',
        { product_id: id, on: { type: 'boolean' } }, ['product_id', 'on'])
]);
export const HEALTH_PRODUCTS_CONFIRMED_COMMANDS = Object.freeze(['health_products.reminder']);

const validator = commands => (action, input) => {
    const contract = commands.find(entry => entry.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const validateHealthProtocolInput = validator(HEALTH_PROTOCOL_COMMANDS);
export const validateHealthProductsInput = validator(HEALTH_PRODUCTS_COMMANDS);
export const HEALTH_PROTOCOL_ASSISTANT_INSTRUCTIONS = 'Health protocols and declared products are health data, closed to the assistant: never call health_protocol.* or health_products.*, and never interpret a protocol, a dose or an interaction; say the person can open them in their Health record.';
