import { validateParams } from '../ai/agent_gateway_normalize.js';
import { BRICK_SESSION_IDS, BRICK_SESSION_BELL_MAX } from '../../shared/brick_session_catalog.js';
import { BREATH_PATTERN_IDS, BREATH_PHASES, BREATH_CUSTOM_RANGE } from '../../shared/breath_pattern.js';

// One contract for runtime V2, AI discovery and direct MCP calls: a nap, a meditation, a breathing or a relaxation
// lived as one timed session, its card on the Dashboard included (eVe/domains/programs/brick_session_runtime.js).
export const BRICK_SESSION_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'BRICK_SESSION_UNKNOWN', 'BRICK_SESSION_NOT_FOUND',
    'BRICK_SESSION_INVALID', 'BRICK_SESSION_REVISION_CHANGED', 'BRICK_SESSION_OBJECTIVES_UNAVAILABLE', 'PRESENTATION_UNAVAILABLE',
    'CONTEXT_CHANGED', 'BRICK_SESSION_WRITE_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 200 };
const brick_id = { type: 'string', enum: BRICK_SESSION_IDS };
const minutes = { type: 'integer', minimum: 1, maximum: 240 };
const breath = { type: 'string', enum: BREATH_PATTERN_IDS };
const custom = { type: 'object', additionalProperties: false, required: BREATH_PHASES,
    properties: Object.fromEntries(BREATH_PHASES.map(key => [key, { type: 'integer', minimum: BREATH_CUSTOM_RANGE[key][0], maximum: BREATH_CUSTOM_RANGE[key][1] }])) };
const BREATHS = 'coherence (cardiac coherence, in 5 s, out 5 s), square (box, 4-4-4-4), 478 (in 4, hold 7, out 8), alternate (nadi shodhana, 4-4), kapalabhati (30 quick exhalations then free breathing) or custom (its own in, hold, out, empty seconds; 0 = no hold)';
const measure = { type: 'object', additionalProperties: false, required: ['value', 'unit'],
    properties: { value: { type: 'number', minimum: 0 }, unit: { type: 'string', enum: ['s', 'min'] } } };
const definitions = {
    read: [{ brick_id }, ['brick_id'], 'Read a nap, meditation, breathing or relaxation: its session length in minutes, its last finished sessions, a breathing\'s breath and custom seconds, a meditation\'s bell (minutes between two strokes, 0 = none).', false],
    open: [{ brick_id }, ['brick_id'], 'Show the nap, meditation, breathing or relaxation card on the Dashboard, its length on a roller, ready to start. Writes nothing.', false],
    set_minutes: [{ brick_id, minutes }, ['brick_id', 'minutes'], 'Set the length of the user\'s nap, meditation, breathing or relaxation (minutes, within its roller\'s range).', true],
    set_breath: [{ breath, custom }, ['breath'], `Set the user's breathing: ${BREATHS}. custom gives the four seconds of their own breath.`, true],
    set_bell: [{ brick_id, minutes: { type: 'integer', minimum: 0, maximum: BRICK_SESSION_BELL_MAX } }, ['brick_id', 'minutes'],
        'Set the minutes between two strokes of the meditation\'s bell during the session (0 = no bell). Only a meditation has one.', true],
    prepare: [{ request_id: id, brick_id, minutes, breath, custom }, ['request_id', 'brick_id'],
        `Prepare a timed nap, meditation, breathing or relaxation session of its length (or minutes when given; a breathing at its breath, or breath when given: ${BREATHS}). What is given becomes the user's own. Does not start it.`, true],
    transition: [{ session_id: id, base_revision: { type: 'integer', minimum: 0 }, request_id: id,
        action: { type: 'string', enum: ['start', 'pause', 'resume', 'confirm', 'elapse', 'finish', 'stop'] }, step_id: id, actual: measure,
        note: { type: 'string', maxLength: 4000 }, use_in_followup: { type: 'boolean' } }, ['session_id', 'base_revision', 'request_id', 'action'],
        'Record one event of a nap, meditation, breathing or relaxation session: start, pause, resume, confirm (ended early, with the time done), elapse (its time is up), finish (saved; it counts for the user\'s objectives by itself, use_in_followup is recorded true, one objective left out by dashboard.session.objectives.set; a meditation or a breathing also writes its mindful minutes to the health store) or stop.', true],
    get: [{ session_id: id }, ['session_id'], 'Read a nap, meditation, breathing or relaxation session replayed from its recorded events.', false],
    open_sessions: [{}, [], 'List the nap, meditation, breathing or relaxation sessions left under way (running or paused) in the last 24 hours, as { session_id, brick_id, state }: one the app left when it closed can be resumed or stopped.', false]
};
export const BRICK_SESSION_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `brick_session.${action}`, action, description, persistent, capability: persistent ? 'brick_session.write' : 'brick_session.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: BRICK_SESSION_ERRORS },
        brick_id: { type: 'string' }, minutes: { type: 'number' }, session_id: { type: 'string' }, state: { type: 'object' }, sessions: { type: 'array' },
        objective_links: { type: 'array' }, mindful: { type: 'object' }, breath: { type: 'string' }, custom: { type: 'object' }, bell: { type: 'number' } } }
})));
export const validateBrickSessionInput = (action, input) => {
    const contract = BRICK_SESSION_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const BRICK_SESSION_ASSISTANT_INSTRUCTIONS = 'Nap, meditation, breathing and relaxation: « je fais une sieste », « lance une méditation de 15 minutes », « une relaxation » call brick_session.prepare with a new request_id, brick_id nap, meditation or relaxation and minutes when said, then brick_session.transition start; « fais une cohérence cardiaque de 5 minutes » is brick_id breathing, breath coherence, minutes 5 (« respiration carrée » square, « 4-7-8 » 478, « respiration alternée » alternate, « kapalabhati » kapalabhati). « montre ma sieste » calls brick_session.open; « ma sieste dure 30 minutes » calls brick_session.set_minutes; « ma respiration : inspire 4, tiens 4, expire 6 » calls brick_session.set_breath breath custom; « une cloche toutes les 3 minutes » calls brick_session.set_bell meditation 3 (0 = no bell). During a session « pause », « reprends », « j\'arrête » are pause, resume and stop; « enregistre la séance » calls finish with use_in_followup true only when the user says it counts for their objectives. Say a meditation or a breathing is in the Health app only when mindful.saved is true.';
export const brickSessionError = error => BRICK_SESSION_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'BRICK_SESSION_WRITE_FAILED';
