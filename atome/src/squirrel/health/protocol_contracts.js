import { validateParams } from '../ai/agent_gateway_normalize.js';

// Two health command families (register R-104 D4; Health cahier annex B; mockups MA, MB3): `health_protocol` (import of a
// protocol text, conciliation, S0–S5, planning, review, templates) and `health_products` (declared products, intakes, the
// Compl'Alim catalogue by name, Open Food Facts by barcode, the BDPM medicines on the device). Health data: both are CLOSED to AI and MCP by default — the
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
    command(P, 'template_proposals', false, 'List the template versions shared with the person that wait for their answer.', {}),
    command(P, 'template_accept', true, 'Import a shared template version on the person\'s own profile, as a new proposal (S0–S5 run again).', { template_id: id }, ['template_id']),
    command(P, 'template_refuse', true, 'Refuse a shared template version.', { template_id: id }, ['template_id']),
    command(P, 'template_duplicate', true, 'Copy one\'s template as a new private template (version 1, shared with nobody).', { template_id: id }, ['template_id']),
    command(P, 'template_remove', true, 'Remove one\'s template (its shares end with it).', { template_id: id }, ['template_id'])
]);
export const HEALTH_PROTOCOL_CONFIRMED_COMMANDS = Object.freeze(['health_protocol.activate', 'health_protocol.template_accept',
    'health_protocol.template_remove']);

const Q = 'health_products';
const quantity = { type: 'object', additionalProperties: false, required: ['value', 'unit'],
    properties: { value: { type: 'number', exclusiveMinimum: 0 }, unit: { type: 'string', minLength: 1, maxLength: 24 }, unit_basis: { type: 'string', enum: ['per_intake', 'per_day'] } } };
const day = { type: 'string', minLength: 10, maxLength: 10 };
const list = { list_id: { type: 'string', minLength: 1, maxLength: 80, description: 'The list: « medication » or « supplement » (the person\'s own), or a list id.' },
    person_id: { type: 'string', maxLength: 300, description: 'Whose list: empty for the account holder.' } };
// The declared supplements and medicines (D24/D29): Pause suspends intakes and reminders until resumed, Arrêter ends today as
// the last day would (history kept), Supprimer erases the product and every intake of it — one product or a whole list.
export const HEALTH_PRODUCTS_COMMANDS = Object.freeze([
    command(Q, 'declare', true, 'Declare (or change) a product the person takes or applies: name, kind, form, actives, the quantity per intake (typed, or recommended by eVe: then to_validate with its recommendation, no intake nor reminder until validate), hours or as_needed (« si besoin », no hour, at most max_per_day), start_day and end_day (none: long-term), their own instructions, source (who says what it holds: self, label, doctor), the BDPM codes (cis, cip13) when found there.', {
        product_id: id, name: { type: 'string', minLength: 1, maxLength: 200 }, item_kind: { type: 'string', enum: ['supplement', 'medication', 'cosmetic', 'device'] },
        form: { type: 'string', maxLength: 80 }, brand: { type: 'string', maxLength: 200 }, per_intake: quantity, hours: { type: 'array', maxItems: 12, items: { type: 'string' } },
        as_needed: { type: 'boolean' }, max_per_day: { type: 'integer', minimum: 1, maximum: 24 }, start_day: day, end_day: day,
        instructions: { type: 'string', maxLength: 400 }, cis: { type: 'string', maxLength: 16 }, cip13: { type: 'string', maxLength: 16 }, strength: { type: 'string', maxLength: 120 },
        actives: { type: 'array', maxItems: 64, items: { type: 'object' } }, source: { type: 'string', enum: ['self', 'label', 'doctor'] },
        catalogue_id: { type: 'string', maxLength: 80 }, barcode: { type: 'string', maxLength: 32 }, status: { type: 'string', enum: ['declared_current', 'declared_historical'] },
        reminder: { type: 'boolean' }, to_validate: { type: 'boolean' }, recommendation: { type: 'object' },
        pack_units: { type: 'integer', minimum: 1, maximum: 1000, description: 'The units one box holds (120 gélules).' },
        stock_units: { type: 'number', minimum: 0, maximum: 100000, description: 'The units the person has left, counted on stock_day (today when none).' }, stock_day: day,
        received_from: { type: 'string', maxLength: 300, description: 'The account a list it came from was sent by (a list received, then validated).' },
        received_entry: { type: 'string', maxLength: 400, description: 'Its line in that list, so a later version updates it.' }, ...list }, ['name']),
    command(Q, 'validate', true, 'Valider: the person (by self) or the doctor (by doctor) takes a sheet eVe recommended as theirs; only then its intakes and reminders start. Never called for the person.',
        { product_id: id, by: { type: 'string', enum: ['self', 'doctor'] } }, ['product_id']),
    command(Q, 'list', false, 'List the declared products (current, paused, former; a product past its last day reads as former), each with what is left of it (supply: units_left, per_day, days_left, empty_day) once its stock is counted.', {}),
    command(Q, 'restock', true, 'Bought boxes of a product (its box size set): what is left today plus boxes × its units.', { product_id: id,
        boxes: { type: 'integer', minimum: 1, maximum: 99 } }, ['product_id', 'boxes']),
    command(Q, 'pause', true, 'Pause a product: its intakes and reminders suspended until it is resumed.', { product_id: id }, ['product_id']),
    command(Q, 'resume', true, 'Resume a paused product: its intakes and its reminders (when « Rappel » is on) again.', { product_id: id }, ['product_id']),
    command(Q, 'stop', true, 'Arrêter: the product ends today, as its last day would; its intakes stay in the history.', { product_id: id }, ['product_id']),
    command(Q, 'remove', true, 'Supprimer: erase the product and every intake of it, and its reminders.', { product_id: id }, ['product_id']),
    command(Q, 'list_pause', true, 'Pause (paused true) or resume (false) every current product of a list.', { ...list, paused: { type: 'boolean' } }, ['list_id', 'paused']),
    command(Q, 'list_stop', true, 'Arrêter every current product of a list (each ends today, history kept).', list, ['list_id']),
    command(Q, 'list_remove', true, 'Supprimer a whole list: every product of it and all their intakes and reminders.', list, ['list_id']),
    command(Q, 'intake_note', true, 'Note one intake: taken, postponed (to_hour, else half an hour later; its reminder rings again then), stopped or forgotten, or cleared (a tick taken back) — only the person ticks it; for « si besoin » without hour, taken now.', { product_id: id,
        day, hour: { type: 'string', minLength: 5, maxLength: 5 }, state: { type: 'string', enum: ['taken', 'postponed', 'stopped', 'forgotten', 'cleared'] },
        to_hour: { type: 'string', minLength: 5, maxLength: 5 } }, ['product_id', 'day', 'state']),
    command(Q, 'intakes', false, 'Read the intakes noted on a day.', { day }, ['day']),
    command(Q, 'intakes_range', false, 'Read the intakes noted from one day to another (at most 91 days), of one product or all.', { from: day, to: day, product_id: id }, ['from', 'to']),
    command(Q, 'catalogue_search', false, 'Search the Compl\'Alim supplement catalogue (France, offline) by name.', { query: { type: 'string', minLength: 2, maxLength: 120 },
        limit: { type: 'number', minimum: 1, maximum: 50 } }, ['query']),
    command(Q, 'catalogue_barcode', false, 'Read a product by its barcode (Open Food Facts; a product seen once is kept on the device).', {
        barcode: { type: 'string', minLength: 8, maxLength: 14 }, source: { type: 'string', enum: ['off', 'obf', 'opf'] } }, ['barcode']),
    command(Q, 'medicine_search', false, 'Search the BDPM (official French medicines database, on the device: nothing searched leaves it) by name or substance: each box with its form, strength and source date; never a dose.', {
        query: { type: 'string', minLength: 2, maxLength: 120 }, limit: { type: 'number', minimum: 1, maximum: 50 } }, ['query']),
    command(Q, 'medicine_presentation', false, 'The BDPM box of a code read on it: its CIP13, a GTIN-14 or its whole GS1 DataMatrix (expiry and lot read too).', {
        code: { type: 'string', minLength: 13, maxLength: 120 } }, ['code']),
    command(Q, 'medicine_posology', false, 'The dose the BDPM reference recommends for the person (or person_id) from their recorded parameters (age, weight, height, BMI, sex, pregnancy, renal and hepatic function, glycaemia, HbA1c, blood pressure, results): a recommendation to validate, the unknown parameters named, never a prescription.', {
        cis: { type: 'string', minLength: 1, maxLength: 16 }, person_id: { type: 'string', maxLength: 300 } }, ['cis']),
    command(Q, 'medicine_scan', false, 'Read a medicine box with the camera (its GS1 DataMatrix or its CIP13 barcode) and find it in the BDPM.', {}),
    command(Q, 'reminder', true, '« Rappel » of a declared product turned on or off: on, its hours become personal calendar occurrences with an alarm, within its days; off, they are suspended.',
        { product_id: id, on: { type: 'boolean' } }, ['product_id', 'on'])
]);
export const HEALTH_PRODUCTS_CONFIRMED_COMMANDS = Object.freeze(['health_products.reminder', 'health_products.stop', 'health_products.remove', 'health_products.list_stop',
    'health_products.list_remove']);

const validator = commands => (action, input) => {
    const contract = commands.find(entry => entry.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const validateHealthProtocolInput = validator(HEALTH_PROTOCOL_COMMANDS);
export const validateHealthProductsInput = validator(HEALTH_PRODUCTS_COMMANDS);
export const HEALTH_PROTOCOL_ASSISTANT_INSTRUCTIONS = 'Health protocols and declared products are health data, closed to the assistant: never call health_protocol.* or health_products.*, and never interpret a protocol, a dose or an interaction; say the person can open them in their Health record.';
