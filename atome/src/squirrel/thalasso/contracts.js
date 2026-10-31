import { validateParams } from '../ai/agent_gateway_normalize.js';
import { THALASSO_CARE_IDS, THALASSO_STAY_MAX_DAYS } from '../../shared/thalasso_stay_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the person's Thalasso stay (decision Q26, 30 Oct. 2026),
// its dates and place said once, each care added to one of its days (eVe/domains/programs/thalasso_stay_runtime.js).
// Ending a stay (its cares with it) is the user's to confirm.
export const THALASSO_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'THALASSO_STAY_INVALID', 'THALASSO_STAY_NOT_FOUND',
    'THALASSO_CARE_NOT_FOUND', 'THALASSO_CARES_OUTSIDE_STAY', 'THALASSO_STAY_WRITE_FAILED', 'THALASSO_SCREEN_UNAVAILABLE']);
export const THALASSO_CONFIRMED_COMMANDS = Object.freeze(['thalasso.stay_clear']);
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const entry = { type: 'string', minLength: 1, maxLength: 80 };
const care_id = { type: 'string', enum: THALASSO_CARE_IDS };
const CARES = 'sea_bath (heated sea water bath or pool), jet_bath (hydromassage bath, jet shower), seaweed_wrap (seaweed or marine mud wrap), aqua_gym (exercise in a pool), marine_relaxation, slow_breathing (cardiac coherence, out of the water) or nap';
const definitions = {
    catalog: [{}, [], `List the cares a stay can hold: ${CARES}; each with water (in or beside water) and the health profile categories its precautions name. Wellness practices, never treatments: never promise a benefit.`, false],
    open: [{}, [], 'Show the user\'s Thalasso stay screen on the Dashboard (Santé › Thalasso): its place and dates, one card per day with its cares.', false],
    stay_read: [{}, [], 'Read the user\'s Thalasso stay: its first and last day, its place, and each day with its cares (id, care_id, time, done_at); today says whether today lies in it.', false],
    stay_set: [{ start_day: day, end_day: day, place_label: { type: 'string', minLength: 1, maxLength: 120 },
        lat: { type: 'number', minimum: -90, maximum: 90 }, lon: { type: 'number', minimum: -180, maximum: 180 } }, ['start_day', 'end_day', 'place_label'],
        `Set the user's Thalasso stay once: its first and last day (at most ${THALASSO_STAY_MAX_DAYS} days) and its place (lat and lon together when known). Its cares stay; a care outside the new days is refused (THALASSO_CARES_OUTSIDE_STAY).`, true],
    stay_clear: [{}, [], 'End the user\'s Thalasso stay and its cares (kept in its history).', true],
    care_add: [{ care_id, day, time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' } }, ['care_id', 'day'],
        `Add one care to a day of the stay (time HH:MM when said): ${CARES}. Returns the care's id.`, true],
    care_remove: [{ care_entry_id: entry }, ['care_entry_id'], 'Take a care out of the stay.', true],
    care_done: [{ care_entry_id: entry }, ['care_entry_id'], 'Mark a care of the stay done, then show the user\'s feeling rows (« Comment te sens-tu ? », health_feeling.open), the one debrief after a care.', true]
};
export const THALASSO_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `thalasso.${action}`, action, description, persistent, capability: persistent ? 'thalasso.write' : 'thalasso.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: THALASSO_ERRORS },
        cares: { type: 'array' }, shown: { type: 'boolean' }, stay: { type: ['object', 'null'] }, days: { type: 'array' }, today: { type: 'object' }, care_entry_id: { type: 'string' },
        feeling_opened: { type: 'boolean' } } }
})));
export const validateThalassoInput = (action, input) => {
    const contract = THALASSO_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const thalassoError = error => (THALASSO_ERRORS.includes(error?.code || error?.message) ? error.code || error.message : 'THALASSO_STAY_WRITE_FAILED');
export const THALASSO_ASSISTANT_INSTRUCTIONS = 'Thalasso: « je pars en thalasso à Saint-Malo du 3 au 8 novembre » calls thalasso.stay_set (start_day, end_day, place_label); « ajoute un bain d\'eau de mer mardi à 10 h » calls thalasso.care_add; « j\'ai fini l\'enveloppement » calls thalasso.care_done. A care is a wellness practice, never a treatment: never promise a benefit. During a stay never propose Kapalabhati or any fast breathing, apnoea or hyperventilation: only slow breathing, out of the water.';
