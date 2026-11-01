import { validateParams } from '../ai/agent_gateway_normalize.js';

// The `health_record` commands (R-104 D10; Health cahier P017–P020, P026–P029; mockups MA, MB): the Health record (Carnet de
// santé) — its entries, its received results verified line by line, their evolutions and their CSV export — and the
// screens of the record, the results, the supplements and the protocols. Health data: CLOSED to AI and MCP by default —
// the executor answers only the person acting in the app (source `ui`, health access open;
// eVe/domains/health_record/health_record_commands.js). Opening or closing a screen holds no data (the screen shows it
// to the person in the app, never to the caller). Removing an entry and saving a file out are confirmed.
export const HEALTH_RECORD_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'health_access_denied_for_actor', 'health_record_kind_invalid',
    'health_record_state_invalid', 'health_record_source_invalid', 'health_record_entry_unknown', 'health_result_unknown', 'health_result_unreadable',
    'health_result_line_unknown', 'health_export_cancelled', 'health_export_failed', 'health_record_presentation_unavailable', 'HEALTH_RECORD_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 300 };
const person = { type: 'string', maxLength: 300, description: 'Whose record: empty for the account holder, else a life profile id.' };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const output = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string' } } };
const command = (action, persistent, description, input, required = []) => Object.freeze({ name: `health_record.${action}`, action, persistent,
    capability: `health_record.${persistent ? 'write' : 'read'}`, description, input_schema: object(input, required), output_schema: output });
export const HEALTH_RECORD_KIND_NAMES = Object.freeze(['identity', 'history', 'allergy', 'vaccination', 'consultation', 'exam', 'prescription', 'follow_up', 'document']);
export const HEALTH_RECORD_SCREENS = Object.freeze(['rubric', 'identity', 'allergies', 'treatments', 'consultations', 'exams', 'prescriptions', 'follow_ups',
    'results', 'documents', 'entry', 'share', 'import', 'verify', 'csv', 'supplements', 'supplement', 'intakes', 'catalogue', 'protocol', 'alerts',
    'templates', 'template', 'template_send']);
const fields = { type: 'object', additionalProperties: false, properties: Object.fromEntries([
    ...['title', 'date', 'sampled', 'received', 'professional', 'notes', 'birth_date', 'blood_group', 'physician', 'reaction'].map(key => [key, { type: 'string', maxLength: 4000 }]),
    ['source', { type: 'string', enum: ['declared', 'professional', 'document'] }], ['state', { type: 'string', maxLength: 24 }],
    ...['original_atome_id', 'report_id', 'event_id', 'protocol_id'].map(key => [key, id])]) };

export const HEALTH_RECORD_COMMANDS = Object.freeze([
    command('open', false, 'Show a screen of the Health record to the person in the app (the record\'s rubric, a rubric\'s entries, an entry, share, results, supplements, protocols, templates).',
        { screen: { type: 'string', enum: HEALTH_RECORD_SCREENS }, person_id: person, entry_id: id, kind: { type: 'string', enum: HEALTH_RECORD_KIND_NAMES },
            report_id: id, proposal_id: id, product_id: id, template_id: id }, ['screen']),
    command('close', false, 'Close the Health record screen shown.', {}),
    command('entries', false, 'List the entries of one rubric of a person\'s record (newest first).', { person_id: person, kind: { type: 'string', enum: HEALTH_RECORD_KIND_NAMES } }),
    command('entry_save', true, 'Add an entry, or a new version of one (the previous version is kept): its fields as the person typed them; a field left out is « non renseigné ».',
        { entry_id: id, person_id: person, kind: { type: 'string', enum: HEALTH_RECORD_KIND_NAMES }, fields }, ['kind', 'fields']),
    command('entry_remove', true, 'Remove one entry of the record.', { entry_id: id }, ['entry_id']),
    command('allergies', false, 'The allergens the person declared and the record\'s allergy entries; an empty list is « non renseigné », never « aucune allergie ».', { person_id: person }),
    command('result_import', true, 'Read a received result (a text already filed by the import, or a text read from its original file): the original kept unchanged, its lines proposed, the lines its reading doubted marked to verify, nothing verified; a file nobody could read (no text recognition on this host) is kept as a received exam report filled by hand.',
        { text: { type: 'string', minLength: 1, maxLength: 524288 }, text_atome_id: id, original_file_id: id, original_name: { type: 'string', maxLength: 200 },
            uncertain_lines: { type: 'array', maxItems: 4000, items: { type: 'integer', minimum: 1 } }, person_id: person }),
    command('result_read', false, 'A received result: its lines as read and its original\'s lines.', { report_id: id }, ['report_id']),
    command('result_verify', true, '« Enreg. »: the ticked lines become values (refs); corrections: { ref: value typed }, the value read kept beside it.',
        { report_id: id, refs: { type: 'array', minItems: 1, maxItems: 500, items: id }, corrections: { type: 'object' } }, ['report_id', 'refs']),
    command('results', false, 'The received results and the evolutions of the verified values (a change of unit cuts a series).', { person_id: person }),
    command('results_export', true, 'The CSV of the chosen parameters (keys), and the originals as a separate package when asked; save writes them through the native export.',
        { person_id: person, keys: { type: 'array', minItems: 1, maxItems: 500, items: id }, originals: { type: 'boolean' }, save: { type: 'boolean' } }, ['keys'])
]);
export const HEALTH_RECORD_OPEN_ACTIONS = Object.freeze(['open', 'close']);
export const HEALTH_RECORD_CONFIRMED_COMMANDS = Object.freeze(['health_record.entry_remove', 'health_record.results_export']);
export const validateHealthRecordInput = (action, input) => {
    const contract = HEALTH_RECORD_COMMANDS.find(entry => entry.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const HEALTH_RECORD_ASSISTANT_INSTRUCTIONS = 'The Health record (Carnet de santé) is health data, closed to the assistant: never read or write its entries or results; health_record.open may show one of its screens to the person (« ouvre mon carnet de santé » → screen rubric), without reading what it shows.';
