import { validateParams } from '../ai/agent_gateway_normalize.js';

// The `ordonnance` commands (register R-115 « Ordonnance dictée », cahier D26; mockups O1–O6): a prescription a doctor writes
// for a contact — a list of medicines kept for that person (the share engine's list, `share.list_create`), each line a declared
// medicine marked « à valider » whose dose eVe's posology proposes, the paper itself (the author's identity, the patient, the
// date, the lines), the finger's signature, the paper printed, saved as a PDF, sent to the patient (`share.send`: it reaches
// them as a list to validate), and the ordonnances received. Health data: CLOSED to AI and MCP like the whole Health record —
// the executor answers only the person acting in the app (eVe/domains/prescription/ordonnance_commands.js); showing a screen
// holds no data and is open to every caller, and so is making a new, empty one for a contact (« fais une ordonnance pour Marie »). Validating the lines, signing, sending and saving the file are confirmed.
export const ORDONNANCE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'health_access_denied_for_actor', 'ordonnance_unknown',
    'ordonnance_no_line', 'ordonnance_not_signed', 'ordonnance_patient_unreachable', 'ordonnance_identity_missing', 'ordonnance_ai_unavailable',
    'ordonnance_ai_unreadable', 'ordonnance_print_unavailable', 'ordonnance_tip_no_food', 'ordonnance_tip_unknown', 'ordonnance_presentation_unavailable', 'ORDONNANCE_FAILED']);
export const ORDONNANCE_SCREENS = Object.freeze(['ordonnance', 'ordonnance_document', 'ordonnance_signature']);
const id = { type: 'string', minLength: 1, maxLength: 400 };
const text = max => ({ type: 'string', maxLength: max });
const hour = { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' };
const count = { type: 'number', minimum: 0.25, maximum: 24 };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
// One line as dictated or typed: the medicine's name (searched in the BDPM), its dose, when, how long; a fact not said stays out.
export const ORDONNANCE_LINE_SCHEMA = object({ name: { type: 'string', minLength: 2, maxLength: 200 }, form: text(40), per_intake: count,
    hours: { type: 'array', maxItems: 12, items: hour }, as_needed: { type: 'boolean' }, max_per_day: { type: 'integer', minimum: 1, maximum: 24 },
    days: { type: 'integer', minimum: 1, maximum: 366 }, instructions: text(400) }, ['name']);
const patient = object({ name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' }, contact_id: id, account_id: id }, ['name']);
const identity = object(Object.fromEntries(['name', 'quality', 'rpps', 'address', 'phone'].map(key => [key, text(240)])));
// A finger's strokes, each a run of points on the sheet (0–1 of its width and of its height).
const strokes = { type: 'array', minItems: 1, maxItems: 144, items: { type: 'array', minItems: 1, maxItems: 2000,
    items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', minimum: 0, maximum: 1 } } } };
const definitions = {
    open: [{ screen: { type: 'string', enum: ORDONNANCE_SCREENS }, list_id: id, ordonnance_id: id }, ['screen'],
        'Show an ordonnance to the person in the app: its lines (ordonnance), its paper (ordonnance_document) or its signature (ordonnance_signature); list_id names one the user wrote, ordonnance_id one received (its paper).', false],
    new: [{ patient }, ['patient'], 'A new ordonnance for a contact (patient: their name, contact_id, account_id): its list kept for them and its paper, dated today, empty, shown to the person in the app.', true],
    dictate: [{ list_id: id, text: { type: 'string', minLength: 1, maxLength: 8000, pattern: '\\S' }, lines: { type: 'array', minItems: 1, maxItems: 34, items: ORDONNANCE_LINE_SCHEMA },
        correct: { type: 'boolean' } }, ['list_id', 'text'],
        'The words a doctor dictated (« Doliprane 1000, 1 comprimé matin et soir pendant 3 jours »), read into lines — lines given win; correct asks the assistant to correct the reading when it is there. Each line is found in the BDPM and its dose proposed by the posology, every line « à valider ». A sentence opening on « Conseil » (« Conseil : pas de pamplemousse ») is his advice on foods: a food_advice tip of the list, signed with his name, printed under the medicines.', true],
    read_photo: [{ list_id: id, image: { type: 'string', minLength: 32, maxLength: 12000000, pattern: '^data:image/' }, media_url: { type: 'string', minLength: 1, maxLength: 2000 } }, ['list_id'],
        'A photo of an ordonnance (image as a data URL, or a stored media\'s address) read by the assistant into lines, each « à valider ».', true],
    add_line: [{ list_id: id, line: ORDONNANCE_LINE_SCHEMA }, ['list_id', 'line'], 'One line added by hand, « à valider ».', true],
    lines: [{ list_id: id }, ['list_id'], 'The ordonnance: its patient, its author\'s identity, its date, its status and its lines.', false],
    validate: [{ list_id: id }, ['list_id'], 'The doctor validates every line as it now is (the dose proposed becomes his).', true],
    identity: [{}, [], 'The author\'s identity the ordonnance carries (the professional life profile\'s, else the base card\'s) and the fields missing.', false],
    identity_set: [{ identity }, ['identity'], 'The author\'s identity typed (name, quality, RPPS, address, phone), written back to his card (Réglages › Ma fiche › Profil › Ordonnances).', true],
    tip_remove: [{ list_id: id, tip_id: id }, ['list_id', 'tip_id'], 'Take one of the doctor\'s advice lines (« Conseil ») out of the ordonnance.', true],
    sign: [{ list_id: id, strokes }, ['list_id', 'strokes'], 'Sign the ordonnance with the finger\'s strokes: its lines and identity are fixed as signed.', true],
    print: [{ list_id: id }, ['list_id'], 'Print the signed ordonnance on the host\'s printer.', true],
    export: [{ list_id: id }, ['list_id'], 'Save the ordonnance as a PDF file out of eVe.', true],
    send: [{ list_id: id }, ['list_id'], 'Send the signed ordonnance to its patient: it reaches them as a list to validate.', true],
    list: [{}, [], 'The ordonnances the user wrote, newest first.', false],
    received: [{}, [], 'The ordonnances the user received, newest first.', false]
};
const ordonnanceSchema = { type: 'object', properties: { list_id: { type: 'string' }, status: { type: 'string' }, date: { type: 'string' },
    patient: { type: 'object' }, prescriber: { type: 'object' }, lines: { type: 'array' } } };
export const ORDONNANCE_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `ordonnance.${action}`, action, description, persistent, capability: `ordonnance.${persistent ? 'write' : 'read'}`,
    input_schema: object(properties, required),
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: ORDONNANCE_ERRORS },
        list_id: { type: 'string' }, ordonnance: ordonnanceSchema, ordonnances: { type: 'array', items: ordonnanceSchema }, identity: { type: 'object' },
        missing: { type: 'array', items: { type: 'string' } } } }
})));
export const ORDONNANCE_OPEN_ACTIONS = Object.freeze(['open']);
export const ORDONNANCE_CONFIRMED_COMMANDS = Object.freeze(['ordonnance.validate', 'ordonnance.sign', 'ordonnance.send', 'ordonnance.export']);
export const validateOrdonnanceInput = (action, input) => {
    const contract = ORDONNANCE_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    if (action === 'read_photo' && Boolean(input.image) === Boolean(input.media_url)) return 'INVALID_ARGUMENT';
    if (action === 'open' && !input.list_id && !(input.screen === 'ordonnance_document' && input.ordonnance_id)) return 'INVALID_ARGUMENT';
    return null;
};
export const ORDONNANCE_ASSISTANT_INSTRUCTIONS = 'An ordonnance is health data, closed to the assistant: never read, write, sign or send one. « Fais une ordonnance pour Marie » calls ordonnance.new with her name, contact_id and account_id: it makes an empty one and shows it; ordonnance.open shows one to the person, without reading what it shows. The doctor dictates its lines on its own screen (its « Dicter » tool or its field), where eVe reads them.';
