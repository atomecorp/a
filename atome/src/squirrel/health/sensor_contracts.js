import { validateParams } from '../ai/agent_gateway_normalize.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the raw motion this device records during
// every activity session (#health_sensors.js). Recording itself follows the sessions; these commands only
// tell what is kept here, delete it, bring back its encrypted copies, or pause recording on this device. No
// sample ever leaves the device unencrypted (#sensor_backup.js).
export const SENSORS_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'health_host_unsupported', 'health_access_sealed', 'health_account_required',
    'health_context_changed', 'health_sensors_invalid', 'health_sensors_not_found', 'health_sensors_storage_unavailable',
    'health_sensors_backup_unavailable', 'health_sensors_backup_invalid', 'health_sensors_key_missing', 'SENSORS_FAILED']);
const definitions = {
    status: [{}, [], 'Tell the person\'s agreement to the recording (consent: granted, refused, or null while never asked), whether this device records the raw motion of activity sessions, the session being recorded, how many recordings it keeps, their total size in bytes, how many encrypted copies the account vault holds (copies) and the motion sensors it has.', false],
    consent: [{}, [], 'Tell the person\'s agreement to the recording of their raw motion during activity sessions: granted, refused, or null while never asked (the first session card asks it).', false],
    set_consent: [{ granted: { type: 'boolean' } }, ['granted'],
        'Give (true) or withdraw (false) the person\'s agreement to the recording of their raw motion during activity sessions, for the account; nothing is recorded without it, and withdrawing it ends the recording in progress, kept.', true],
    list: [{}, [], 'List the motion recordings kept on this device, newest first: file name, session id, start time (epoch ms), role (phone or watch), platform and size in bytes.', false],
    delete: [{ file: { type: 'string', pattern: '^[0-9]{1,16}-(phone|watch)\\.asr$' }, all: { type: 'boolean' } }, [],
        'Delete one motion recording of this device by its file name (from sensors.list) with its encrypted copy, or every recording of this device and every copy of the account (all true). The recording in progress is kept.', true],
    restore: [{ file: { type: 'string', pattern: '^[0-9]{1,16}-(phone|watch)\\.asr$' } }, [],
        'Bring back to this device the motion recordings of the account that it does not hold, from their encrypted copies in the account vault (one by its file name, or every one).', true],
    set_enabled: [{ enabled: { type: 'boolean' } }, ['enabled'],
        'Pause (false) or resume (true) the recording of raw motion during activity sessions on this device; pausing ends the recording in progress, kept.', true]
};
export const SENSORS_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `sensors.${action}`, action, description, persistent, capability: persistent ? 'sensors.write' : 'sensors.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SENSORS_ERRORS },
        consent: { type: ['string', 'null'], enum: ['granted', 'refused', null] }, enabled: { type: 'boolean' }, recording: { type: ['string', 'null'] }, recordings: { type: ['integer', 'array'] }, bytes: { type: 'integer' },
        sensors: { type: 'array' }, deleted: { type: 'integer' }, copies: { type: 'integer' }, restored: { type: 'integer' } } }
})));
export const validateSensorsInput = (action, input) => {
    const contract = SENSORS_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    return action === 'delete' && (input.all === true) === Boolean(input.file) ? 'INVALID_ARGUMENT' : null;
};
export const SENSORS_ASSISTANT_INSTRUCTIONS = 'Motion recordings: with the person\'s agreement (sensors.consent), every Sport, nap or meditation session records this device\'s raw motion, kept on this device with an encrypted copy in the account vault that only the person\'s devices can open. « combien de place prennent mes enregistrements de mouvement » calls sensors.status; « liste mes enregistrements de mouvement » calls sensors.list; « supprime mes enregistrements de mouvement » calls sensors.delete with all true, « supprime le dernier » with the newest file from sensors.list; « récupère mes enregistrements de mouvement » calls sensors.restore; « arrête d\'enregistrer mes mouvements » calls sensors.set_consent false, « reprends l\'enregistrement de mes mouvements » or « oui, enregistre mes mouvements » true; « mets en pause sur cet appareil » calls sensors.set_enabled false.';
const sensorsError = error => SENSORS_ERRORS.includes(error) ? error : 'SENSORS_FAILED';

/** The service executor of the family (eVe/intuition/tools/core/tool_runtime_service_commands.js). */
export const executeSensorsCommand = async (action, input = {}) => {
    const { getHealthOwner } = await import('./index.js');
    const sensors = getHealthOwner().sensors;
    const run = { status: () => sensors.status(), consent: () => sensors.consent(), set_consent: () => sensors.setConsent(input), list: () => sensors.list(),
        delete: () => sensors.remove(input), restore: () => sensors.restore(input), set_enabled: () => sensors.setEnabled(input) }[action];
    if (!run) return { ok: false, error: 'INVALID_ARGUMENT' };
    const result = await run();
    return result.ok ? result : { ok: false, error: sensorsError(result.error) };
};
