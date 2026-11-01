/** Musculation down to the movement (Health cahier P041, §51.20): the muscle groups, each movement once (one identity
 * whatever session names it), and its variants — the catalogue's exercises (#training_catalog.js), told apart by their
 * equipment (machine, barbell, dumbbells, cable, kettlebell, body weight), their positions and their side when it counts.
 * Anatomy, equipment and sets are never mixed: a movement is not a set, a variant is not a muscle. What a variant is
 * measured by follows the movement: repetitions for an extension, a hold in seconds for a posture; a body-weight variant
 * has no presumed load, so no volume in kg is ever computed for it nor for a posture. The cahier's examples (curls,
 * triceps extensions, presses, pulls, leg presses, knee flexions, bridges, planks, carries) are entries to choose from,
 * never a universal programme. Checked at load: every strength and hold exercise of the catalogue is the variant of
 * exactly one movement, and every variant is a catalogue exercise. */
import { TRAINING_EXERCISES } from './training_catalog.js';

export const TRAINING_MOVEMENT_GROUPS = Object.freeze(['biceps_forearms', 'triceps', 'chest', 'back', 'shoulders', 'quadriceps', 'hamstrings',
    'glutes_hips', 'adductors_calves', 'trunk', 'compound']);
// [movement, group, its variants (catalogue exercise ids)]
const MOVEMENTS = [
    ['curl', 'biceps_forearms', ['biceps_curl', 'hammer_curl', 'barbell_curl']],
    ['wrist_curl', 'biceps_forearms', ['wrist_curl']],
    ['triceps_extension', 'triceps', ['triceps_rope_pushdown', 'skull_crusher', 'overhead_extension']],
    ['dip', 'triceps', ['dips', 'bench_dip']],
    ['push_up', 'chest', ['push_up', 'diamond_push_up', 'pike_push_up']],
    ['chest_press', 'chest', ['bench_press', 'barbell_bench_press', 'incline_press', 'chest_press']],
    ['fly', 'chest', ['dumbbell_fly', 'chest_fly', 'cable_crossover']],
    ['vertical_pull', 'back', ['pull_up', 'lat_pulldown']],
    ['row', 'back', ['seated_row', 'one_arm_row', 'barbell_row']],
    ['pullover', 'back', ['pullover']],
    ['back_extension', 'back', ['back_extension', 'superman']],
    ['shrug', 'back', ['shrug']],
    ['overhead_press', 'shoulders', ['shoulder_press', 'military_press']],
    ['raise', 'shoulders', ['lateral_raise', 'front_raise']],
    ['rear_fly', 'shoulders', ['reverse_fly', 'face_pull']],
    ['squat', 'quadriceps', ['squat', 'barbell_squat', 'jump_squat']],
    ['lunge', 'quadriceps', ['lunge', 'bulgarian_split_squat', 'step_up']],
    ['leg_press', 'quadriceps', ['leg_press']],
    ['knee_extension', 'quadriceps', ['leg_extension']],
    ['knee_flexion', 'hamstrings', ['leg_curl']],
    ['hip_hinge', 'hamstrings', ['romanian_deadlift', 'kettlebell_swing']],
    ['bridge', 'glutes_hips', ['glute_bridge', 'single_leg_bridge', 'hip_thrust']],
    ['hip_extension', 'glutes_hips', ['donkey_kick', 'cable_kickback']],
    ['hip_abduction', 'glutes_hips', ['hip_abduction', 'side_lying_abduction']],
    ['hip_adduction', 'adductors_calves', ['hip_adduction']],
    ['calf_raise', 'adductors_calves', ['calf_raise', 'seated_calf_raise']],
    ['crunch', 'trunk', ['crunch', 'reverse_crunch', 'bicycle_crunch']],
    ['leg_raise', 'trunk', ['leg_raise', 'hanging_knee_raise']],
    ['rotation', 'trunk', ['russian_twist']],
    ['anti_extension', 'trunk', ['dead_bug', 'ab_wheel', 'mountain_climber']],
    ['plank', 'trunk', ['plank', 'hollow_hold', 'bird_dog', 'superman_hold', 'bridge_hold']],
    ['isometric_hold', 'compound', ['wall_sit', 'dead_hang']],
    ['carry', 'compound', ['farmer_walk']],
    ['deadlift', 'compound', ['deadlift']],
    ['full_body', 'compound', ['burpee', 'thruster']]
];
const EQUIPMENT = Object.freeze({ body: 'body_weight', dumbbell: 'dumbbells', barbell: 'barbell', machine: 'machine', cable: 'cable', kettlebell: 'kettlebell' });
const exerciseById = new Map(TRAINING_EXERCISES.map(exercise => [exercise.id, exercise]));

// A variant: its equipment (a hold without equipment is body weight), its positions, whether a side is chosen, what it is
// measured by (`reps`, or `hold_s` for a posture or a carry the catalogue times) and its load (`load_kg`, or none).
const variantOf = (exerciseId) => {
    const exercise = exerciseById.get(exerciseId);
    if (!exercise || !['strength', 'core'].includes(exercise.kind)) throw new Error(`training_movement_variant_invalid:${exerciseId}`);
    const equipment = EQUIPMENT[exercise.equipment || 'body'];
    const param = exercise.kind === 'core' ? 'hold_s' : 'reps';
    return Object.freeze({ exercise_id: exerciseId, equipment, positions: Object.freeze([...(exercise.positions || [])]), side: exercise.per_side === true,
        param, load: param === 'reps' && equipment !== 'body_weight' ? 'load_kg' : null, personal_machine: ['machine', 'cable'].includes(equipment) });
};
export const TRAINING_MOVEMENTS = Object.freeze(MOVEMENTS.map(([id, group, variants]) => Object.freeze({ id, group, variants: Object.freeze(variants.map(variantOf)) })));
const movementOfExercise = new Map(TRAINING_MOVEMENTS.flatMap(movement => movement.variants.map(variant => [variant.exercise_id, movement])));
const indexed = TRAINING_EXERCISES.filter(exercise => (exercise.kind === 'strength' || exercise.kind === 'core') && exercise.group !== 'mobility');
if (TRAINING_MOVEMENTS.some(movement => !TRAINING_MOVEMENT_GROUPS.includes(movement.group))
    || movementOfExercise.size !== TRAINING_MOVEMENTS.reduce((sum, movement) => sum + movement.variants.length, 0)
    || indexed.some(exercise => !movementOfExercise.has(exercise.id))) throw new Error('training_movement_index_invalid');

/** The movement an exercise is a variant of, with that variant; throws for an exercise outside musculation. */
export const trainingMovementOf = (exerciseId) => {
    const movement = movementOfExercise.get(exerciseId);
    if (!movement) throw Object.assign(new Error('TRAINING_MOVEMENT_UNKNOWN'), { code: 'TRAINING_MOVEMENT_UNKNOWN' });
    return { movement, variant: movement.variants.find(variant => variant.exercise_id === exerciseId) };
};
export const trainingMovementsOfGroup = group => TRAINING_MOVEMENTS.filter(movement => movement.group === group);
/** A variant's input kept to what it is measured by: an incompatible field (a load on a body-weight variant or a posture,
 * repetitions on a hold, a side or a position it has not) is dropped, never sent. */
export const trainingVariantInput = (exerciseId, input = {}) => {
    const { variant } = trainingMovementOf(exerciseId);
    const allowed = new Set([variant.param, 'sets', 'rest_s', ...(variant.load ? [variant.load] : []), ...(variant.side ? ['side'] : []),
        ...(variant.positions.length ? ['position'] : []), ...(variant.personal_machine ? ['machine_id'] : [])]);
    return Object.fromEntries(Object.entries(input).filter(([key, value]) => allowed.has(key)
        && (key !== 'position' || variant.positions.includes(value)) && (key !== 'side' || ['left', 'right'].includes(value))));
};
