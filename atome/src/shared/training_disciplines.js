/** The Sport disciplines as data (Health cahier §51.20.1 and §51.20.4, P040, P045–P053; register R-104 D6): a new sport
 * is a definition here (or the person's own, #validateTrainingOwnDiscipline), never a new engine or screen. Each one:
 * - `matrices`: its own options in order (environment, stroke, equipment…), a record naming one value of each;
 * - `params`: the parameters it records (#training_discipline_params.js), `when` narrowing one to some matrix values
 *   (a pool length only in a pool, an incline only on a treadmill), `sourced` the ones never typed for it;
 * - `step`: what its execution counts (a set, a length, an interval, a posture, a segment, a round, a period);
 * - `sources`: where its values may come from, `sources_when` narrowing one (GPS only outdoors);
 * - `exercises`: the catalogue exercises it gathers (#training_catalog.js), run by the existing session engine;
 * - `adaptations`: the variants the person may choose (seated, with support, adapted equipment; P053 1), never
 *   inferred from a handicap or a diagnosis;
 * - `flags`: the cahier's safety rules kept as data (HIIT never proposed to a novice, no generated sparring, outdoor
 *   safety not simulated, no stretch imposed on acute pain).
 * Composed session, exercise, step, equipment and result stay distinct records (P040 3, `TRAINING_RECORD_KINDS`).
 * Physiological values never come from the catalogue: nothing here is a prescription. */
import { TRAINING_EXERCISES, TRAINING_BODY_ZONES } from './training_catalog.js';
import { TRAINING_OWN_PARAM_PATTERN, TRAINING_OWN_PARAM_UNITS, TRAINING_PARAM_KEYS, TRAINING_PARAMS, TRAINING_SOURCES } from './training_discipline_params.js';

export const TRAINING_STEP_KINDS = Object.freeze(['set', 'length', 'interval', 'posture', 'segment', 'round', 'period']);
export const TRAINING_RECORD_KINDS = Object.freeze(['session', 'exercise', 'step', 'equipment', 'result']);
export const TRAINING_ADAPTATIONS = Object.freeze(['seated', 'supported', 'adapted_equipment']);

const deep = value => Object.freeze(Array.isArray(value) ? value.map(deep)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deep(item)])) : value);
const exercisesWhere = test => TRAINING_EXERCISES.filter(test).map(exercise => exercise.id);
const BASE = ['duration_s', 'active_s', 'pause_s', 'rpe', 'notes'];
const HEART = ['heart_rate_bpm'];
const ADAPTED = TRAINING_ADAPTATIONS;

const DISCIPLINES = [
    { id: 'walk', glyph: 'training_walking', step: 'segment', exercises: ['walking'], adaptations: ADAPTED,
        matrices: { environment: ['outdoor', 'indoor', 'treadmill'], variant: ['free', 'brisk', 'nordic'], session: ['free', 'time', 'distance', 'intervals', 'route'] },
        params: [...BASE, ...HEART, 'distance_m', 'speed_kmh', 'incline_percent', 'terrain', 'work_s', 'rest_s', 'rounds'],
        when: { incline_percent: { environment: ['treadmill'] }, terrain: { environment: ['outdoor'] } },
        sources: ['manual', 'watch', 'gps', 'device'], sources_when: { gps: { environment: ['outdoor'] }, device: { environment: ['treadmill'] } } },
    { id: 'run', glyph: 'training_outdoor_run', step: 'segment', exercises: ['outdoor_run', 'treadmill_run', 'treadmill_hiit'],
        matrices: { environment: ['outdoor', 'track', 'treadmill', 'trail'], session: ['free', 'distance', 'time', 'intervals'] },
        params: [...BASE, ...HEART, 'distance_m', 'speed_kmh', 'incline_percent', 'elevation_m', 'laps', 'work_s', 'rest_s', 'rounds', 'terrain'],
        when: { incline_percent: { environment: ['treadmill'] }, elevation_m: { environment: ['outdoor', 'trail'] }, laps: { environment: ['track'] },
            terrain: { environment: ['outdoor', 'trail'] } },
        sources: ['manual', 'watch', 'gps', 'device'], sources_when: { gps: { environment: ['outdoor', 'track', 'trail'] }, device: { environment: ['treadmill'] } },
        // P046 5: no intense training nor marathon goal proposed from the effort level alone.
        flags: { intense_from_effort_level: false } },
    { id: 'strength', glyph: 'training_strength', step: 'set', engine: 'training_session', adaptations: ADAPTED,
        exercises: exercisesWhere(exercise => exercise.kind !== 'cardio' && exercise.group !== 'mobility'),
        matrices: { zone: [...TRAINING_BODY_ZONES], equipment: ['machine', 'dumbbell', 'barbell', 'cable', 'band', 'body', 'kettlebell'] },
        params: [...BASE, ...HEART, 'sets', 'reps', 'load_kg', 'load_lb', 'assistance_kg', 'rest_s', 'hold_s', 'side', 'position'],
        // No load is presumed for the body's own weight (P041 tests).
        when: { load_kg: { equipment: ['machine', 'dumbbell', 'barbell', 'cable', 'band', 'kettlebell'] }, load_lb: { equipment: ['machine', 'dumbbell', 'barbell', 'cable', 'band', 'kettlebell'] },
            assistance_kg: { equipment: ['machine', 'band'] } },
        sources: ['manual', 'device', 'sensor'] },
    { id: 'swim', glyph: 'training_swimming', step: 'length', exercises: ['swimming'],
        matrices: { environment: ['pool', 'open_water'], stroke: ['crawl', 'breaststroke', 'backstroke', 'butterfly', 'drills', 'aquagym', 'mixed'], session: ['free', 'lengths', 'intervals'] },
        params: [...BASE, ...HEART, 'pool_length_m', 'lengths', 'distance_m', 'stroke', 'sets', 'work_s', 'rest_s'],
        // A pool length and lengths only in a pool (P045 2): never invented for open water.
        when: { pool_length_m: { environment: ['pool'] }, lengths: { environment: ['pool'] } },
        sources: ['manual', 'watch', 'gps'], sources_when: { gps: { environment: ['open_water'] } },
        // P045 3: recorded after leaving the water or by an allowed watch, never by handling a phone while swimming.
        flags: { phone_during_activity: false } },
    { id: 'rower', glyph: 'training_rowing', step: 'interval', exercises: ['rowing'],
        matrices: { environment: ['gym', 'home', 'water'], equipment: ['ergometer', 'boat'], session: ['free', 'intervals'] },
        params: [...BASE, ...HEART, 'distance_m', 'stroke_rate_spm', 'resistance_level', 'power_w', 'work_s', 'rest_s', 'rounds'],
        when: { resistance_level: { equipment: ['ergometer'] } },
        sources: ['manual', 'device', 'watch', 'gps'], sources_when: { gps: { environment: ['water'] } } },
    { id: 'bike', glyph: 'training_cycling', step: 'segment', exercises: ['cycling'],
        matrices: { environment: ['road', 'mtb', 'urban', 'indoor', 'spinning'], session: ['free', 'distance', 'time', 'intervals'] },
        params: [...BASE, ...HEART, 'distance_m', 'speed_kmh', 'cadence_rpm', 'resistance_level', 'power_w', 'elevation_m', 'work_s', 'rest_s', 'rounds', 'terrain'],
        when: { resistance_level: { environment: ['indoor', 'spinning'] }, elevation_m: { environment: ['road', 'mtb', 'urban'] }, terrain: { environment: ['road', 'mtb', 'urban'] } },
        // P048 2: elevation only from a source that measures it; no route for a fixed bike.
        sourced: ['elevation_m'],
        sources: ['manual', 'device', 'watch', 'gps', 'sensor'], sources_when: { gps: { environment: ['road', 'mtb', 'urban'] } } },
    { id: 'indoor_cardio', glyph: 'training_elliptical', step: 'interval', exercises: ['elliptical', 'stair_climber', 'jump_rope'],
        matrices: { equipment: ['elliptical', 'stepper', 'treadmill', 'stairs', 'jump_rope', 'ski_erg'] },
        params: [...BASE, ...HEART, 'work_s', 'rest_s', 'rounds', 'step_rate_spm', 'resistance_level', 'speed_kmh', 'incline_percent', 'distance_m', 'reps'],
        // P049 tests: no distance for a machine that cannot measure one.
        when: { distance_m: { equipment: ['treadmill', 'ski_erg'] }, speed_kmh: { equipment: ['treadmill'] }, incline_percent: { equipment: ['treadmill'] },
            resistance_level: { equipment: ['elliptical', 'stepper', 'ski_erg'] }, step_rate_spm: { equipment: ['stepper', 'stairs', 'jump_rope'] }, reps: { equipment: ['jump_rope'] } },
        sources: ['manual', 'device', 'watch'] },
    { id: 'fitness', glyph: 'training_burpee', step: 'round', adaptations: ADAPTED,
        exercises: ['burpee', 'mountain_climber', 'jump_squat', 'kettlebell_swing', 'thruster', 'treadmill_hiit'],
        matrices: { session: ['light_strength', 'circuit', 'cardio_dance', 'intervals', 'hiit'] },
        params: [...BASE, ...HEART, 'rounds', 'work_s', 'rest_s', 'reps'],
        // HIIT is never proposed to a novice by default (§51.20.1).
        flags: { advanced: ['hiit'], novice_default: false },
        sources: ['manual', 'watch'] },
    { id: 'mobility', glyph: 'training_mobility', step: 'posture', adaptations: ADAPTED,
        exercises: exercisesWhere(exercise => exercise.group === 'mobility'),
        matrices: { zone: ['neck', 'shoulders', 'back', 'hips', 'legs', 'whole_body'] },
        params: [...BASE, 'hold_s', 'sets', 'side', 'position', 'rest_s'],
        // No amplitude without a method; no stretch imposed on acute pain (§51.20.1, P050 tests).
        flags: { amplitude_measured: false, imposed_on_acute_pain: false },
        sources: ['manual'] },
    { id: 'yoga_pilates', glyph: 'training_discipline_yoga_pilates', step: 'posture', adaptations: ADAPTED,
        matrices: { discipline: ['yoga', 'pilates', 'gentle'], level: ['1', '2', '3'] },
        params: [...BASE, 'hold_s', 'reps', 'side', 'position', 'sequence', 'rest_s'],
        // A finished timer is no proof of a correct posture (P050 tests): no automatic posture analysis.
        flags: { posture_analysis: false },
        sources: ['manual'] },
    { id: 'balance', glyph: 'training_discipline_balance', step: 'posture', adaptations: ADAPTED,
        matrices: { support: ['standing', 'seated', 'with_support'] },
        params: [...BASE, 'hold_s', 'reps', 'side', 'position'],
        // A person at risk of falling is pointed to supervised exercises (§51.20.1): told, never decided by eVe.
        flags: { supervision_when_fall_risk: true },
        sources: ['manual'] },
    { id: 'outdoor', glyph: 'hiking', step: 'segment',
        matrices: { discipline: ['hiking', 'trail', 'climbing', 'ski', 'snowshoe', 'skating', 'roller', 'kayak', 'paddle'] },
        params: [...BASE, ...HEART, 'distance_m', 'elevation_m', 'terrain', 'difficulty_declared', 'conditions', 'equipment', 'steps'],
        // Each sub-discipline its own fields (P051 1): no distance for a climb, its routes counted as steps.
        when: { distance_m: { discipline: ['hiking', 'trail', 'ski', 'snowshoe', 'skating', 'roller', 'kayak', 'paddle'] },
            steps: { discipline: ['climbing'] }, elevation_m: { discipline: ['hiking', 'trail', 'climbing', 'ski', 'snowshoe'] } },
        // Safety and supervision stay apart from the record: never simulated, never an authorisation (P051 4).
        flags: { safety_simulated: false, social_location_shared: false },
        sources: ['manual', 'watch', 'gps'] },
    { id: 'racket', glyph: 'training_discipline_racket', step: 'period',
        matrices: { discipline: ['tennis', 'padel', 'badminton', 'squash', 'table_tennis'], kind: ['training', 'match', 'technique'] },
        params: [...BASE, ...HEART, 'match_kind', 'sets_won', 'sets_lost', 'score_for', 'score_against', 'rallies', 'partner'],
        when: { sets_won: { kind: ['match'] }, sets_lost: { kind: ['match'] }, score_for: { kind: ['match'] }, score_against: { kind: ['match'] } },
        flags: { health_from_score: false },
        sources: ['manual', 'watch'] },
    { id: 'team', glyph: 'training_discipline_team', step: 'period',
        matrices: { discipline: ['football', 'basketball', 'volleyball', 'handball', 'rugby', 'hockey', 'other'], kind: ['training', 'match'] },
        params: [...BASE, ...HEART, 'match_kind', 'play_time_s', 'score_for', 'score_against', 'partner'],
        when: { score_for: { kind: ['match'] }, score_against: { kind: ['match'] } },
        flags: { health_from_score: false },
        sources: ['manual', 'watch'] },
    { id: 'dance', glyph: 'training_discipline_dance', step: 'segment', adaptations: ADAPTED,
        matrices: { style: ['free', 'classical', 'contemporary', 'salsa', 'hip_hop', 'other'] },
        params: [...BASE, ...HEART, 'sequence', 'reps'],
        // Its music is the native audio's (music.* commands), no cadence demanded when useless.
        flags: { music: 'native' },
        sources: ['manual', 'watch'] },
    { id: 'combat', glyph: 'training_discipline_combat', step: 'round',
        matrices: { discipline: ['boxing', 'judo', 'karate', 'taekwondo', 'aikido', 'other'], work: ['technique', 'bag', 'forms', 'sparring'] },
        params: [...BASE, ...HEART, 'rounds', 'work_s', 'rest_s', 'equipment', 'partner'],
        // No sparring ever generated, no supervision invented (P052 4).
        flags: { sparring_generated: false, supervision_simulated: false },
        sources: ['manual', 'watch'] },
    { id: 'other', glyph: 'movement', step: 'segment', adaptations: ADAPTED, matrices: {},
        params: [...BASE, 'steps', 'distance_m', 'reps', 'sets', 'hold_s'], sources: ['manual'] }
];

export const TRAINING_DISCIPLINES = deep(DISCIPLINES.map(discipline => ({ when: {}, sourced: [], sources_when: {}, flags: {}, adaptations: [], exercises: [], ...discipline })));
export const TRAINING_DISCIPLINE_IDS = Object.freeze(TRAINING_DISCIPLINES.map(discipline => discipline.id));

const fail = code => Object.assign(new Error(code), { code });
const matches = (condition, context) => Object.entries(condition || {}).every(([key, values]) => values.includes(context?.[key]));

export const trainingDiscipline = id => {
    const found = TRAINING_DISCIPLINES.find(discipline => discipline.id === id);
    if (!found) throw fail('TRAINING_DISCIPLINE_UNKNOWN');
    return found;
};
// The platform workout a practice under way is mirrored as (#squirrel/health/health_workout.js), so the watch measures its
// heart rate at workout rate; a person's own activity and a discipline not listed are `other`.
const DISCIPLINE_WORKOUTS = Object.freeze({ walk: 'walking', run: 'running', strength: 'strength', rower: 'rowing', bike: 'cycling',
    indoor_cardio: 'mixed_cardio', fitness: 'functional', mobility: 'flexibility', yoga_pilates: 'yoga', balance: 'flexibility', outdoor: 'hiking',
    dance: 'dance', combat: 'martial_arts' });
export const trainingDisciplineWorkout = id => DISCIPLINE_WORKOUTS[id] || 'other';
// The discipline a catalogue exercise belongs to (a strength or core exercise to Musculation, a stretch to Mobilité…).
export const trainingDisciplineOfExercise = exerciseId => TRAINING_DISCIPLINES.find(discipline => discipline.exercises.includes(exerciseId))?.id || null;

/** A record's matrix values, each one of its discipline's options (an option left out stays unknown). */
export const trainingDisciplineContext = (discipline, context = {}) => {
    if (!context || typeof context !== 'object' || Array.isArray(context)) throw fail('TRAINING_CONTEXT_INVALID');
    return Object.fromEntries(Object.entries(context).map(([key, value]) => {
        if (!discipline.matrices[key]?.includes(value)) throw fail('TRAINING_CONTEXT_INVALID');
        return [key, value];
    }));
};
// The parameters a record of `discipline` may carry in `context`: its own, minus those whose matrix value does not fit.
export const trainingDisciplineParams = (discipline, context = {}) => discipline.params.filter(key => !discipline.when[key] || matches(discipline.when[key], context));
export const trainingDisciplineSources = (discipline, context = {}) => discipline.sources.filter(source => !discipline.sources_when[source] || matches(discipline.sources_when[source], context));

/** The person's own activity (P040 4, P053 2): a name, what a step is, parameters of the dictionary and their own named
 * ones with an explicit unit, the adaptations offered. Plain data only: anything else is refused, never run. */
export const validateTrainingOwnDiscipline = (definition) => {
    const plain = value => value === null || ['string', 'number', 'boolean'].includes(typeof value)
        || (Array.isArray(value) ? value.every(plain) : typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(plain));
    if (!definition || typeof definition !== 'object' || !plain(definition)) throw fail('TRAINING_DISCIPLINE_INVALID');
    const allowed = ['name', 'step', 'params', 'own_params', 'adaptations'];
    if (Object.keys(definition).some(key => !allowed.includes(key))) throw fail('TRAINING_DISCIPLINE_INVALID');
    const name = typeof definition.name === 'string' ? definition.name.trim() : '';
    if (!name || name.length > 60 || !TRAINING_STEP_KINDS.includes(definition.step)) throw fail('TRAINING_DISCIPLINE_INVALID');
    const params = definition.params ?? [], own = definition.own_params ?? [], adaptations = definition.adaptations ?? [];
    if (!Array.isArray(params) || params.length > 21 || params.some(key => !TRAINING_PARAM_KEYS.includes(key)) || new Set(params).size !== params.length) throw fail('TRAINING_DISCIPLINE_INVALID');
    if (!Array.isArray(adaptations) || adaptations.some(item => !TRAINING_ADAPTATIONS.includes(item))) throw fail('TRAINING_DISCIPLINE_INVALID');
    if (!Array.isArray(own) || own.length > 8) throw fail('TRAINING_DISCIPLINE_INVALID');
    const ownParams = own.map((param) => {
        if (!param || !TRAINING_OWN_PARAM_PATTERN.test(param.key || '') || typeof param.name !== 'string' || !param.name.trim() || param.name.length > 40) throw fail('TRAINING_DISCIPLINE_INVALID');
        if (!TRAINING_OWN_PARAM_UNITS.includes(param.unit)) throw fail('TRAINING_UNIT_UNKNOWN');
        const kind = param.unit === 'text' ? 'text' : param.kind === 'number' ? 'number' : 'integer';
        return { key: param.key, name: param.name.trim(), unit: param.unit, kind, min: 0, ...(kind === 'text' ? { max: 200 } : { max: 1000000 }) };
    });
    if (new Set(ownParams.map(param => param.key)).size !== ownParams.length) throw fail('TRAINING_DISCIPLINE_INVALID');
    return deep({ name, step: definition.step, params: [...new Set(['duration_s', 'notes', ...params])], own_params: ownParams, adaptations,
        matrices: {}, when: {}, sourced: [], sources: ['manual'], sources_when: {}, flags: {}, exercises: [], glyph: 'movement' });
};
// A parameter's definition for `discipline` (an own parameter, or the dictionary's).
export const trainingDisciplineParam = (discipline, key) => discipline.own_params?.find(param => param.key === key) || TRAINING_PARAMS[key] || null;
export { TRAINING_SOURCES };
