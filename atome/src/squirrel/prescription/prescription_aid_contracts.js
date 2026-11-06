import { validateParams } from '../ai/agent_gateway_normalize.js';
import { ORDONNANCE_LINE_SCHEMA } from './contracts.js';

// The `prescription_aid` commands (register R-115 « Aide à la prescription », cahier D27; validated mockups P1–P5b): symptoms told
// by the patient or the doctor (voice or text) become, when the assistant is there, a pre-diagnosis and a suggested pre-ordonnance,
// every line « à valider »; rules on the device (the ANSM thesaurus, the SmPC 4.3–4.6, the Carnet, the person's parameters, the
// supplements' nutrivigilance) mark each line, a contra-indication or a major interaction locking Valider until the doctor
// replaces or confirms that line; the intake hours are proposed; the patient sends it to a doctor of their contacts, who refuses,
// corrects or validates it — validated, it becomes an ordonnance (`ordonnance.*`, D26). Health data: closed to AI and MCP but for
// showing a screen and for the symptoms the person told the assistant (`symptoms`, which answers no health value).
export const PRESCRIPTION_AID_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'health_access_denied_for_actor', 'prescription_aid_unknown',
    'prescription_aid_not_author', 'prescription_aid_not_doctor', 'prescription_aid_not_draft', 'prescription_aid_no_line', 'prescription_aid_blocked',
    'prescription_aid_line_unknown', 'prescription_aid_no_alternative', 'prescription_aid_doctor_unreachable', 'prescription_aid_ai_unreadable',
    'prescription_aid_presentation_unavailable', 'PRESCRIPTION_AID_FAILED']);
export const PRESCRIPTION_AID_SCREENS = Object.freeze(['prescription_aid_symptoms', 'prescription_aid', 'prescription_aid_hours']);
const id = { type: 'string', minLength: 1, maxLength: 400 };
const hour = { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const patient = object({ name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' }, contact_id: id, account_id: id }, ['name']);
/** A line as the assistant proposes it: an ordonnance's line, with the medicines it would take instead (« eVe propose »). */
export const PRESCRIPTION_AID_LINE_SCHEMA = Object.freeze({ ...ORDONNANCE_LINE_SCHEMA, properties: { ...ORDONNANCE_LINE_SCHEMA.properties,
    alternatives: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 2, maxLength: 200 } } } });
/** One hypothesis of the pre-diagnosis: its name, how likely, what makes it so. */
export const PRESCRIPTION_AID_HYPOTHESIS_SCHEMA = object({ label: { type: 'string', minLength: 2, maxLength: 200 },
    likelihood: { type: 'string', enum: ['probable', 'possible'] }, reason: { type: 'string', maxLength: 200 } }, ['label', 'likelihood']);
const definitions = {
    open: [{ screen: { type: 'string', enum: PRESCRIPTION_AID_SCREENS }, aid_id: id }, ['screen'],
        'Show the prescription aid to the person in the app: the symptoms entry, one aid (its pre-diagnosis and pre-ordonnance), or its intake hours (a doctor\'s received aids lie in his profile\'s « Ordonnances »).', false],
    symptoms: [{ text: { type: 'string', minLength: 2, maxLength: 4000, pattern: '\\S' }, patient }, ['text'],
        'The symptoms the person told (« fièvre et toux depuis trois jours »): a new aid, shown to the person, who has eVe analyse it there (pre-diagnosis and pre-ordonnance to validate); patient: the doctor describing a contact\'s symptoms. Answers no health value.', true],
    analyse: [{ aid_id: id }, ['aid_id'], 'The aid analysed as the person in the app asks it: the Carnet\'s facts read and, when the assistant is there, its pre-diagnosis and pre-ordonnance proposed for that request alone.', true],
    view: [{ aid_id: id }, ['aid_id'], 'One aid: its symptoms, hypotheses, lines and every rule check, the parameters unknown, the hours.', false],
    list: [{}, [], 'The aids the user made, newest first.', false],
    send: [{ aid_id: id, doctor: object({ account_id: id, name: { type: 'string', maxLength: 200 } }, ['account_id']) }, ['aid_id', 'doctor'],
        'The patient sends the aid to a doctor of their contacts, with the Carnet facts its checks need.', true],
    received: [{}, [], 'The aids patients sent to the user (a doctor), newest first.', false],
    resolve: [{ aid_id: id, line_id: id, decision: { type: 'string', enum: ['replace', 'confirm'] } }, ['aid_id', 'line_id', 'decision'],
        'The doctor lifts a line\'s lock: replace takes eVe\'s alternative, confirm keeps the line under his responsibility (recorded).', true],
    correct: [{ aid_id: id, text: { type: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' }, remove: id }, ['aid_id'],
        'The doctor corrects the pre-ordonnance: lines read from his words added, or one line removed.', true],
    refuse: [{ aid_id: id }, ['aid_id'], 'The doctor refuses the pre-ordonnance.', true],
    validate: [{ aid_id: id }, ['aid_id'], 'The doctor validates the pre-ordonnance: it becomes his ordonnance for the patient (to sign).', true],
    hours: [{ aid_id: id, line_id: id, intake: { type: 'integer', minimum: 0, maximum: 23 }, time: hour, meal: { type: 'string', enum: ['before', 'during', 'after', 'none'] } },
        ['aid_id', 'line_id', 'intake'], 'An intake hour moved by the doctor or the patient; a time outside the rules is marked.', true]
};
const aidSchema = { type: 'object', properties: { aid_id: { type: 'string' }, status: { type: 'string' }, role: { type: 'string' }, lines: { type: 'array' } } };
export const PRESCRIPTION_AID_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `prescription_aid.${action}`, action, description, persistent, capability: `prescription_aid.${persistent ? 'write' : 'read'}`,
    input_schema: object(properties, required),
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: PRESCRIPTION_AID_ERRORS },
        aid_id: { type: 'string' }, shown: { type: 'boolean' }, aid: aidSchema, aids: { type: 'array', items: aidSchema },
        ordonnance_list_id: { type: 'string' } } }
})));
/** Open to the assistant and MCP: showing a screen, and the symptoms the person told it (the answer holds no health value). */
export const PRESCRIPTION_AID_OPEN_ACTIONS = Object.freeze(['open', 'symptoms']);
export const PRESCRIPTION_AID_CONFIRMED_COMMANDS = Object.freeze(['prescription_aid.send', 'prescription_aid.validate', 'prescription_aid.resolve']);
export const validatePrescriptionAidInput = (action, input) => {
    const contract = PRESCRIPTION_AID_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    if (action === 'correct' && Boolean(input.text) === Boolean(input.remove)) return 'INVALID_ARGUMENT';
    if (['prescription_aid', 'prescription_aid_hours'].includes(input.screen) && !input.aid_id) return 'INVALID_ARGUMENT';
    return null;
};
export const PRESCRIPTION_AID_ASSISTANT_INSTRUCTIONS = 'The prescription aid is health data, closed to the assistant but for two calls: when the person tells you their symptoms (or a doctor a patient\'s), call prescription_aid.symptoms with their words (and patient for a doctor\'s contact): eVe shows its pre-diagnosis and pre-ordonnance on the screen, to validate by a doctor; prescription_aid.open shows a screen. Never read, check, send or validate an aid yourself.';
