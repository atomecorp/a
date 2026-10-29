import { validateParams } from '../ai/agent_gateway_normalize.js';
import { TRAINING_CARDIO_GOALS, TRAINING_CARDIO_SHOW, TRAINING_CUSTOM_LEVEL, TRAINING_RECORD_LEVEL, TRAINING_EXERCISE_IDS, TRAINING_GOALS, TRAINING_KINDS, TRAINING_LEVELS, TRAINING_TARGETS, TRAINING_TEMPO_LIMITS } from '../../shared/training_catalog.js';

// One contract for runtime V2, AI discovery and direct MCP calls: every Sport
// feature of the Dashboard runs through these commands, the interface included.
export const TRAINING_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'TRAINING_EXERCISE_UNKNOWN',
    'TRAINING_PROFILE_REQUIRED', 'TRAINING_SESSION_NOT_FOUND', 'TRAINING_SESSION_INVALID', 'TRAINING_REVISION_CHANGED',
    'TRAINING_GOAL_REQUIRED', 'TRAINING_OBJECTIVES_UNAVAILABLE', 'PRESENTATION_UNAVAILABLE', 'CALENDAR_UNAVAILABLE', 'health_access_denied_for_actor', 'CONTEXT_CHANGED', 'TRAINING_WRITE_FAILED', 'TRAINING_FORM_INVALID', 'TRAINING_SERIES_NOT_FOUND', 'TRAINING_MEDIA_NOT_FOUND']);
const id = { type: 'string', minLength: 1, maxLength: 200 };
const exercise_id = { type: 'string', enum: TRAINING_EXERCISE_IDS };
const level = { enum: [...TRAINING_LEVELS, TRAINING_CUSTOM_LEVEL, TRAINING_RECORD_LEVEL] };
// The user's own prescription, in the shape of one of the exercise's catalogue levels (training.get_exercise).
const custom = { type: 'object', description: 'Same shape as a level of training.get_exercise for this exercise: strength {sets, reps:[low, high], rest_s}, core {rounds, holds:[[variant, seconds]], rest_s}, cardio {warmup_min, steady:[minutes, zone] or intervals:[count, [work_s, zone], [recovery_s, zone]], cooldown_min}.' };
const kg = { type: 'number', minimum: 0, maximum: 500 };
const phase = { type: 'integer', minimum: TRAINING_TEMPO_LIMITS[0], maximum: TRAINING_TEMPO_LIMITS[1] };
const tempo = { type: ['object', 'null'], additionalProperties: false, required: ['concentric_s', 'eccentric_s'], properties: { concentric_s: phase, eccentric_s: phase },
    description: 'A strength repetition\'s seconds: lifting (concentric_s) then lowering (eccentric_s); the session is guided by it (beeps, « Monte » / « Descends »). null: not guided.' };
const date = { type: 'string', format: 'date-time', maxLength: 40 };
// A progression's form (#eVe/domains/training/training_form.js), per target: strength load; core hold, rest.
const form = { type: 'object', additionalProperties: false, required: ['shape', 'over', 'from', 'to', 'step'], properties: {
    shape: { type: 'string', enum: ['equal', 'line', 'expo', 'bell', 'blocks', 'step', 'custom'] }, over: { type: 'string', enum: ['sets', 'sessions'] },
    from: { type: 'number', minimum: 0 }, to: { type: 'number', minimum: 0 }, step: { type: 'number' }, count: { type: 'integer', minimum: 1, maximum: 34 },
    manual: { type: 'array', maxItems: 34, items: { type: 'number', minimum: 0 } }, since: date } };
const forms = { type: ['object', 'null'], additionalProperties: false, properties: { load: form, hold: form, rest: form, zone: form, km: form, min: form },
    description: 'Each set\'s value along a shape between from and to (equal, line, expo, bell = up then down, blocks = low/high, step = from + step each set, custom = manual), over the sets of a session or over count sessions from since (one value a session): load (strength kg), hold and rest (core seconds), zone (a cardio programme\'s effort zones 1-5), km and min (a cardio distance or time, over sessions only). null clears them.' };
// A cardio's goal (L7): free, time (its level), distance (km) or program (count efforts of effort_s, rest_s recovery); the figure shown.
const cardio = { type: 'object', additionalProperties: false, required: ['goal', 'show', 'km', 'program', 'trip_id'], properties: {
    goal: { type: 'string', enum: TRAINING_CARDIO_GOALS }, show: { type: 'string', enum: TRAINING_CARDIO_SHOW }, km: { type: 'number', minimum: 1, maximum: 42 },
    program: { type: 'object', additionalProperties: false, required: ['count', 'effort_s', 'rest_s'], properties: { count: { type: 'integer', minimum: 1, maximum: 21 },
        effort_s: { type: 'integer', minimum: 5, maximum: 600 }, rest_s: { type: 'integer', minimum: 0, maximum: 600 } } },
    trip_id: { type: ['string', 'null'], maxLength: 200 } },
    description: 'A cardio exercise\'s goal and shown figure (pace min/km or speed km/h), its distance in km (a tenth at most: a trip\'s own length), its programme and a planned GPS trip (outdoor only, gps.list_trips).' };
const days = { type: 'array', maxItems: 7, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 6 } };
const minutes_per_week = { type: 'number', minimum: 0, maximum: 10080 };
const day = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', maxLength: 10 };
const goal = { type: 'string', enum: TRAINING_GOALS };
const measure = { type: 'object', additionalProperties: false, required: ['value', 'unit'],
    properties: { value: { type: 'number', minimum: 0 }, unit: { type: 'string', minLength: 1, maxLength: 32 } } };
// An exercise id, or a body zone `zone:chest|back|shoulders|arms|abs|glutes|lower|full_body|core` (all its exercises).
const target = { type: 'string', enum: TRAINING_TARGETS };
const series_id = { type: 'string', pattern: '^series:[a-z0-9]{1,24}$', maxLength: 31 };
const definitions = {
    list_exercises: [{ kind: { type: 'string', enum: TRAINING_KINDS } }, [], 'List the Sport exercises (core = timed holds, strength, cardio) with their three levels; group is the Musculation body zone, cardio or mobility (Souplesse, stretches held).', false],
    get_exercise: [{ exercise_id }, ['exercise_id'], 'Read one exercise: its three level prescriptions, the user\'s chosen level (1-3, custom or record), own prescription, sound choice and load, recent results, its record (best value of a record set, its unit, date and average seconds per repetition; null without one) and the heart-rate zones from the user\'s age.', false],
    open_exercise: [{ exercise_id, form: { type: 'boolean' } }, ['exercise_id'], 'Show an exercise\'s card on the Dashboard surface: its level, numbered sets or cardio steps, load and last sessions; form true opens its progression form (Forme). Writes nothing.', false],
    set_profile: [{ exercise_id, level, load_kg: kg, minutes_per_week, days, custom, sound: { type: 'boolean' }, tempo, auto: { type: 'boolean' }, forms, cardio }, ['exercise_id', 'level'],
        'Choose the user\'s level for an exercise: 1-3, custom for their own prescription (custom, started from their current level when omitted), or record (strength and core only: one set as many repetitions, or a hold as long, as the user can; with a tempo it is a cadence challenge); optionally its working load in kg, the weekly time given to it, whether the session beeps (sound), a strength repetition\'s tempo, its progression forms, and whether a rest, hold or cardio step at zero moves on by itself (auto, on by default) or waits for the user.', true],
    suggest_load: [{ exercise_id, level, body_weight_kg: kg }, ['exercise_id'],
        'Propose the next working load (double progression from the log, else a share of body weight for a first test set) or the next plank holds.', false],
    plan_week: [{ minutes_per_week, days, goal }, [],
        'Preview a week of sessions within the user\'s weekly time (WHO targets, strength twice a week, HIIT at most twice). Writes nothing.', false],
    schedule_week: [{ week_start: day, hour: { type: 'integer', minimum: 5, maximum: 22 }, minutes_per_week, days, goal }, ['week_start'],
        'Put the planned week (training.plan_week) in the user\'s personal calendar, one event per session from week_start (a Monday) at hour (18 by default). Sessions already placed for that week keep their time (never doubled), take the new plan\'s exercises, and the future ones the plan no longer has are removed.', true],
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
    open_sessions: [{}, [], 'List the Sport sessions left under way (running or paused, a step still to do) in the last 24 hours, as { session_id, exercise_id, state }: one the app left when it closed can be resumed or stopped.', false],
    keep_series: [{ exercise_id, name: { type: 'string', minLength: 1, maxLength: 40 } }, ['exercise_id', 'name'],
        'Keep the exercise\'s current own prescription (custom) and forms under a name (« garde cette série sous le nom Pyramide »): it becomes a tile of the Sport favourites.', true],
    open_series: [{ series_id }, ['series_id'], 'Open a kept series: it becomes the exercise\'s custom prescription and forms again, and its card shows.', true],
    remove_series: [{ series_id }, ['series_id'], 'Remove a kept series from the Sport favourites and forget it.', true],
    list_favorites: [{}, [], 'Read the user\'s Sport favourites (with series, the kept series: id, name, exercise_id, custom, forms): exercises and body zones (zone:chest, zone:back, zone:shoulders, zone:arms, zone:abs, zone:glutes, zone:lower for the legs, zone:full_body, zone:core for the holds), newest first.', false],
    set_favorite: [{ target, favorite: { type: 'boolean' } }, ['target', 'favorite'], 'Add an exercise or a body zone to the Sport favourites, or remove it.', true],
    read_program: [{}, [], 'Read the user\'s session programme: its ordered targets (exercises or body zones) and the exercises they run.', false],
    add_to_program: [{ target }, ['target'], 'Add an exercise or a body zone at the end of the session programme (kept where it is if already there).', true],
    set_program: [{ targets: { type: 'array', maxItems: 30, uniqueItems: true, items: target } }, ['targets'],
        'Replace the session programme by these ordered targets: reorder it, remove from it or empty it.', true],
    open_program: [{}, [], 'Show the session programme card on the Dashboard surface, where it is reordered and started. Writes nothing.', false],
    read_log: [{ exercise_id, from: date, to: date }, [], 'Read the training log: finished sessions with active time (split into work_minutes, rest_minutes and paused_minutes), volume, sets, heart rate and estimated energy (energy: active_kcal and total_kcal from the 2024 Compendium METs and the body weight on the user\'s card, null without one), and each day\'s totals (days). The energy is an estimate, never the health store\'s measured value.', false],
    // L10: an exercise's media level (its takes, the music kept for it, the exercises of the same muscles).
    open_media: [{ exercise_id, take_id: id, fullscreen: { type: 'boolean' } }, ['exercise_id'],
        'Show an exercise\'s media on the Dashboard surface: its takes (the person\'s photos and videos of it), the music kept for it and the exercises of the same muscles; take_id opens that take large (fullscreen true: the whole screen). Returns media {takes, music, resume}. Writes nothing.', false],
    add_media: [{ exercise_id, media_atome_ids: { type: 'array', minItems: 1, maxItems: 21, uniqueItems: true, items: id },
        media: { type: 'array', minItems: 1, maxItems: 21, items: { type: 'object', additionalProperties: false, required: ['id', 'kind', 'file_name'], properties: {
            id, kind: { type: 'string', enum: ['image', 'video'] }, file_name: id, file_path: { type: 'string', maxLength: 500 }, owner_id: { type: 'string', maxLength: 200 },
            mime_type: { type: 'string', maxLength: 120 }, width: { type: 'number', minimum: 0 }, height: { type: 'number', minimum: 0 } } } } }, ['exercise_id'],
        'Add the person\'s own photos or videos to an exercise\'s takes: media_atome_ids (their media Atomes, as listed in their media), or media (the files just stored by the import panel); with neither it shows the one import panel (several at once) on the Dashboard, what is chosen joining the person\'s media and the takes.', true],
    set_music: [{ exercise_id, music: { type: ['object', 'null'], additionalProperties: false, required: ['provider', 'id', 'kind', 'title'], properties: {
        provider: { type: 'string', enum: ['apple_music', 'spotify', 'deezer'] }, id, kind: { type: 'string', enum: ['song', 'playlist', 'artist'] },
        scope: { type: 'string', maxLength: 40 }, title: { type: 'string', minLength: 1, maxLength: 200 } } }, resume: { type: 'boolean' } }, ['exercise_id'],
        'Keep a music for an exercise (« mets ma liste Course pour les pompes »: the id, kind, scope and title returned by apple_music.search or music.search, with its provider; null forgets it) and whether its sessions resume it where it stopped (resume, true by default when a music is given). The title shows under the exercise\'s name during its sessions.', true],
};
export const TRAINING_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `training.${action}`, action, description, persistent, capability: persistent ? 'training.write' : 'training.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: TRAINING_ERRORS },
        exercises: { type: 'array' }, exercise: { type: 'object' }, zones: { type: ['object', 'null'] }, events: { type: 'array' }, profile: { type: ['object', 'null'] }, suggestion: { type: 'object' },
        plan: { type: 'object' }, session_id: { type: 'string' }, state: { type: 'object' }, sessions: { type: 'array' }, favorites: { type: 'array' },
        program: { type: 'array' }, days: { type: 'array' }, energy: { type: ['object', 'null'] }, completed_ends: { type: 'array' }, series: { type: ['object', 'array'] }, record: { type: ['object', 'null'] }, media: { type: 'object' } } }
})));
export const validateTrainingInput = (action, input) => {
    const contract = TRAINING_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const TRAINING_ASSISTANT_INSTRUCTIONS = 'Sport: « je veux faire du gainage », « lance une séance de biceps niveau 2 » call training.prepare_session with a new request_id, the exercise id from training.list_exercises and the level when said, then training.session_transition start; TRAINING_PROFILE_REQUIRED means ask the level (1 to 3, or « perso » = custom). « mets 4 séries de 15 au squat » calls training.set_profile level custom with custom from training.get_exercise changed. During a session « série faite, 12 à 8 kilos » calls training.session_transition confirm with the current step_id from training.get_session and actual_measures reps and kg; « série terminée », « série validée », « étape validée », « c\'est validé » call confirm on the current step (a set with the reps and kg done, else as planned); during a rest « je reprends », « série suivante » confirm the rest; « enregistre la séance » calls finish with a finished session counts for the user\'s objectives by itself (use_in_followup is recorded true; « pas pour Poids » is dashboard.session.objectives.set); « pause », « reprends » (when paused), « passe », « j\'arrête » are pause, resume, skip and stop; « mon pouls est à 120 » is measure with actual 120 bpm and source manual. « que dois-je faire cette semaine » calls training.plan_week; « montre-moi le gainage » calls training.open_exercise; « mon journal de sport » calls training.open_journal; « mets ma semaine de sport dans l\'agenda » calls training.schedule_week with next Monday as week_start. Never invent a load: use training.suggest_load. Report a set or session as recorded only when the result says ok; say it is also in the Health app only when health_workout.saved is true.';
export const trainingError = error => TRAINING_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'TRAINING_WRITE_FAILED';
