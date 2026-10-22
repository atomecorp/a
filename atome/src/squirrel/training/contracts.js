import { validateParams } from '../ai/agent_gateway_normalize.js';
import { TRAINING_CUSTOM_LEVEL, TRAINING_EXERCISE_IDS, TRAINING_GOALS, TRAINING_KINDS, TRAINING_LEVELS, TRAINING_TARGETS } from '../../shared/training_catalog.js';

// One contract for runtime V2, AI discovery and direct MCP calls: every Sport
// feature of the Dashboard runs through these commands, the interface included.
export const TRAINING_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'TRAINING_EXERCISE_UNKNOWN',
    'TRAINING_PROFILE_REQUIRED', 'TRAINING_SESSION_NOT_FOUND', 'TRAINING_SESSION_INVALID', 'TRAINING_REVISION_CHANGED',
    'TRAINING_GOAL_REQUIRED', 'TRAINING_OBJECTIVES_UNAVAILABLE', 'PRESENTATION_UNAVAILABLE', 'CALENDAR_UNAVAILABLE', 'health_access_denied_for_actor', 'CONTEXT_CHANGED', 'TRAINING_WRITE_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 200 };
const exercise_id = { type: 'string', enum: TRAINING_EXERCISE_IDS };
const level = { enum: [...TRAINING_LEVELS, TRAINING_CUSTOM_LEVEL] };
// The user's own prescription, in the shape of one of the exercise's catalogue levels (training.get_exercise).
const custom = { type: 'object', description: 'Same shape as a level of training.get_exercise for this exercise: strength {sets, reps:[low, high], rest_s}, core {rounds, holds:[[variant, seconds]], rest_s}, cardio {warmup_min, steady:[minutes, zone] or intervals:[count, [work_s, zone], [recovery_s, zone]], cooldown_min}.' };
const kg = { type: 'number', minimum: 0, maximum: 500 };
const date = { type: 'string', format: 'date-time', maxLength: 40 };
const days = { type: 'array', maxItems: 7, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 6 } };
const minutes_per_week = { type: 'number', minimum: 0, maximum: 10080 };
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', maxLength: 10 };
const goal = { type: 'string', enum: TRAINING_GOALS };
const measure = { type: 'object', additionalProperties: false, required: ['value', 'unit'],
    properties: { value: { type: 'number', minimum: 0 }, unit: { type: 'string', minLength: 1, maxLength: 32 } } };
// An exercise id, or a body zone `zone:upper|lower|core` (all its exercises).
const target = { type: 'string', enum: TRAINING_TARGETS };
const definitions = {
    list_exercises: [{ kind: { type: 'string', enum: TRAINING_KINDS } }, [], 'List the Sport exercises (core, strength, cardio) with their three levels.', false],
    get_exercise: [{ exercise_id }, ['exercise_id'], 'Read one exercise: its three level prescriptions, the user\'s chosen level (1-3 or custom), own prescription, sound choice and load, recent results and the heart-rate zones from the user\'s age.', false],
    open_exercise: [{ exercise_id }, ['exercise_id'], 'Show an exercise\'s card on the Dashboard surface: its level, numbered sets or cardio steps, load and last sessions. Writes nothing.', false],
    set_profile: [{ exercise_id, level, load_kg: kg, minutes_per_week, days, custom, sound: { type: 'boolean' } }, ['exercise_id', 'level'],
        'Choose the user\'s level for an exercise: 1-3, or custom for their own prescription (custom, started from their current level when omitted); optionally its working load in kg, the weekly time given to it and whether the session beeps (sound).', true],
    suggest_load: [{ exercise_id, level, body_weight_kg: kg }, ['exercise_id'],
        'Propose the next working load (double progression from the log, else a share of body weight for a first test set) or the next plank holds.', false],
    plan_week: [{ minutes_per_week, days, goal }, [],
        'Preview a week of sessions within the user\'s weekly time (WHO targets, strength twice a week, HIIT at most twice). Writes nothing.', false],
    schedule_week: [{ week_start: day, hour: { type: 'integer', minimum: 5, maximum: 22 }, minutes_per_week, days, goal }, ['week_start'],
        'Put the planned week (training.plan_week) in the user\'s personal calendar, one event per session from week_start (a Monday) at hour (18 by default). Sessions already placed for that week are kept, never doubled.', true],
    open_journal: [{ exercise_id }, [], 'Show the training log card on the Dashboard surface (one exercise, or every one). Writes nothing.', false],
    open_week: [{}, [], 'Show the week card on the Dashboard surface: the planned sessions within the weekly time. Writes nothing.', false],
    prepare_session: [{ request_id: id, exercise_id, level, load_kg: kg }, ['request_id', 'exercise_id'],
        'Prepare an immutable timed session (numbered work sets and rest periods) of an exercise at the user\'s level. Does not start it.', true],
    session_transition: [{ session_id: id, base_revision: { type: 'integer', minimum: 0 }, request_id: id,
        action: { type: 'string', enum: ['start', 'pause', 'resume', 'confirm', 'elapse', 'measure', 'skip', 'correct', 'undo', 'finish', 'stop'] },
        recorded_at: date, step_id: id, actual: measure, actual_measures: { type: 'array', minItems: 1, maxItems: 4, items: measure },
        source: { type: 'string', enum: ['manual', 'health'] }, note: { type: 'string', maxLength: 4000 }, use_in_followup: { type: 'boolean' } },
        ['session_id', 'base_revision', 'request_id', 'action'],
        'Record one event of a running session: start, pause, resume, confirm a set (actual reps and kg), elapse (a timer ended), measure (heart rate in bpm), skip, correct, undo, finish or stop.', true],
    get_session: [{ session_id: id }, ['session_id'], 'Read a session replayed from its recorded events: current step, timers, sets done, heart rate.', false],
    list_favorites: [{}, [], 'Read the user\'s Sport favourites: exercises and body zones (zone:upper, zone:lower, zone:core), newest first.', false],
    set_favorite: [{ target, favorite: { type: 'boolean' } }, ['target', 'favorite'], 'Add an exercise or a body zone to the Sport favourites, or remove it.', true],
    read_program: [{}, [], 'Read the user\'s session programme: its ordered targets (exercises or body zones) and the exercises they run.', false],
    add_to_program: [{ target }, ['target'], 'Add an exercise or a body zone at the end of the session programme (kept where it is if already there).', true],
    set_program: [{ targets: { type: 'array', maxItems: 30, uniqueItems: true, items: target } }, ['targets'],
        'Replace the session programme by these ordered targets: reorder it, remove from it or empty it.', true],
    open_program: [{}, [], 'Show the session programme card on the Dashboard surface, where it is reordered and started. Writes nothing.', false],
    read_log: [{ exercise_id, from: date, to: date }, [], 'Read the training log: finished sessions with active time, volume, sets and heart rate.', false]
};
export const TRAINING_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `training.${action}`, action, description, persistent, capability: persistent ? 'training.write' : 'training.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: TRAINING_ERRORS },
        exercises: { type: 'array' }, exercise: { type: 'object' }, zones: { type: ['object', 'null'] }, events: { type: 'array' }, profile: { type: ['object', 'null'] }, suggestion: { type: 'object' },
        plan: { type: 'object' }, session_id: { type: 'string' }, state: { type: 'object' }, sessions: { type: 'array' }, favorites: { type: 'array' },
        program: { type: 'array' } } }
})));
export const validateTrainingInput = (action, input) => {
    const contract = TRAINING_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const TRAINING_ASSISTANT_INSTRUCTIONS = 'Sport: « je veux faire du gainage », « lance une séance de biceps niveau 2 » call training.prepare_session with a new request_id, the exercise id from training.list_exercises and the level when said, then training.session_transition start; TRAINING_PROFILE_REQUIRED means ask the level (1 to 3, or « perso » = custom). « mets 4 séries de 15 au squat » calls training.set_profile level custom with custom from training.get_exercise changed. During a session « série faite, 12 à 8 kilos » calls training.session_transition confirm with the current step_id from training.get_session and actual_measures reps and kg; « série terminée », « série validée », « étape validée », « c\'est validé » call confirm on the current step (a set with the reps and kg done, else as planned); during a rest « je reprends », « série suivante » confirm the rest; « enregistre la séance » calls finish with use_in_followup true only when the user says it counts for their objectives; « pause », « reprends » (when paused), « passe », « j\'arrête » are pause, resume, skip and stop; « mon pouls est à 120 » is measure with actual 120 bpm and source manual. « que dois-je faire cette semaine » calls training.plan_week; « montre-moi le gainage » calls training.open_exercise; « mon journal de sport » calls training.open_journal; « mets ma semaine de sport dans l\'agenda » calls training.schedule_week with next Monday as week_start. Never invent a load: use training.suggest_load. Report a set or session as recorded only when the result says ok; say it is also in the Health app only when health_workout.saved is true.';
export const trainingError = error => TRAINING_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'TRAINING_WRITE_FAILED';
