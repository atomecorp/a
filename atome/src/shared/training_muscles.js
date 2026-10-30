/** The muscles each Sport exercise works (register R-016, lot D; mockup temp/results_panel/mockups/M10_muscles.png validated
 * by the user on 2026-10-28): its main ones (`primary`, drawn in the activity's pastel on the body map) and the ones it
 * works less (`secondary`, at half strength). Assigned from the usual exercise-science references (ACE exercise library,
 * ExRx.net muscle tables, NSCA Essentials of Strength Training and Conditioning, 4th ed.): the prime movers are primary,
 * the synergists and the main stabilisers secondary. A stretch's primary muscle is the one it lengthens; a cardio's are
 * the ones that carry its effort. Every exercise of the catalogue has at least one primary muscle (training_catalog.js
 * attaches them as `muscles` and refuses an exercise without them); every muscle is a region of the body map
 * (eVe/domains/training/training_body_map.js). */

// The muscles the body map draws, front then back (`shoulders` and `forearms` show on both sides).
export const TRAINING_MUSCLES = Object.freeze(['shoulders', 'chest', 'biceps', 'forearms', 'abs', 'obliques', 'hip_flexors', 'quadriceps',
    'adductors', 'traps', 'upper_back', 'lats', 'triceps', 'lower_back', 'glutes', 'hamstrings', 'calves']);

// exercise id → [primary, secondary].
const MUSCLES = {
    // Pectoraux.
    push_up: [['chest'], ['triceps', 'shoulders', 'abs']],
    bench_press: [['chest'], ['triceps', 'shoulders']],
    barbell_bench_press: [['chest'], ['triceps', 'shoulders']],
    incline_press: [['chest', 'shoulders'], ['triceps']],
    chest_press: [['chest'], ['triceps', 'shoulders']],
    dumbbell_fly: [['chest'], ['shoulders']],
    chest_fly: [['chest'], ['shoulders']],
    cable_crossover: [['chest'], ['shoulders']],
    dips: [['chest', 'triceps'], ['shoulders']],
    // Dos.
    pull_up: [['lats'], ['biceps', 'upper_back', 'forearms']],
    lat_pulldown: [['lats'], ['biceps', 'upper_back']],
    seated_row: [['upper_back', 'lats'], ['biceps', 'shoulders']],
    one_arm_row: [['lats', 'upper_back'], ['biceps', 'shoulders']],
    barbell_row: [['lats', 'upper_back'], ['biceps', 'lower_back', 'shoulders']],
    pullover: [['lats', 'chest'], ['triceps']],
    back_extension: [['lower_back'], ['glutes', 'hamstrings']],
    superman: [['lower_back'], ['glutes', 'shoulders']],
    // Épaules.
    shoulder_press: [['shoulders'], ['triceps', 'traps']],
    military_press: [['shoulders'], ['triceps', 'traps', 'abs']],
    lateral_raise: [['shoulders'], ['traps']],
    front_raise: [['shoulders'], ['chest']],
    reverse_fly: [['shoulders', 'upper_back'], ['traps']],
    face_pull: [['shoulders', 'upper_back'], ['traps']],
    shrug: [['traps'], ['forearms']],
    pike_push_up: [['shoulders'], ['triceps', 'chest']],
    // Bras.
    biceps_curl: [['biceps'], ['forearms']],
    hammer_curl: [['biceps', 'forearms'], []],
    barbell_curl: [['biceps'], ['forearms']],
    triceps_rope_pushdown: [['triceps'], []],
    skull_crusher: [['triceps'], []],
    overhead_extension: [['triceps'], ['shoulders']],
    bench_dip: [['triceps'], ['chest', 'shoulders']],
    diamond_push_up: [['triceps', 'chest'], ['shoulders']],
    wrist_curl: [['forearms'], []],
    // Abdos.
    crunch: [['abs'], ['obliques']],
    reverse_crunch: [['abs'], ['hip_flexors']],
    bicycle_crunch: [['abs', 'obliques'], ['hip_flexors']],
    leg_raise: [['abs', 'hip_flexors'], []],
    hanging_knee_raise: [['abs', 'hip_flexors'], ['forearms']],
    russian_twist: [['obliques'], ['abs', 'hip_flexors']],
    dead_bug: [['abs'], ['hip_flexors']],
    mountain_climber: [['abs'], ['shoulders', 'hip_flexors', 'quadriceps']],
    ab_wheel: [['abs'], ['lats', 'shoulders']],
    // Fessiers.
    glute_bridge: [['glutes'], ['hamstrings']],
    single_leg_bridge: [['glutes'], ['hamstrings', 'abs']],
    hip_thrust: [['glutes'], ['hamstrings', 'quadriceps']],
    donkey_kick: [['glutes'], ['hamstrings']],
    cable_kickback: [['glutes'], ['hamstrings']],
    hip_abduction: [['glutes'], []],
    side_lying_abduction: [['glutes'], ['obliques']],
    step_up: [['quadriceps', 'glutes'], ['hamstrings', 'calves']],
    // Jambes.
    squat: [['quadriceps', 'glutes'], ['hamstrings', 'adductors', 'lower_back']],
    barbell_squat: [['quadriceps', 'glutes'], ['hamstrings', 'adductors', 'lower_back']],
    lunge: [['quadriceps', 'glutes'], ['hamstrings', 'adductors', 'calves']],
    bulgarian_split_squat: [['quadriceps', 'glutes'], ['hamstrings', 'adductors']],
    leg_press: [['quadriceps'], ['glutes', 'hamstrings']],
    leg_extension: [['quadriceps'], []],
    leg_curl: [['hamstrings'], ['calves']],
    romanian_deadlift: [['hamstrings', 'glutes'], ['lower_back', 'forearms']],
    hip_adduction: [['adductors'], []],
    calf_raise: [['calves'], []],
    seated_calf_raise: [['calves'], []],
    // Corps entier.
    deadlift: [['glutes', 'hamstrings', 'lower_back'], ['quadriceps', 'traps', 'forearms', 'lats']],
    burpee: [['quadriceps', 'chest'], ['shoulders', 'triceps', 'abs', 'glutes']],
    kettlebell_swing: [['glutes', 'hamstrings'], ['lower_back', 'shoulders', 'abs']],
    thruster: [['quadriceps', 'shoulders'], ['glutes', 'triceps', 'abs']],
    jump_squat: [['quadriceps', 'glutes'], ['calves', 'hamstrings']],
    farmer_walk: [['forearms', 'traps'], ['abs', 'obliques', 'glutes']],
    // Gainage (the plank holds front and side positions: its sides work the obliques).
    plank: [['abs', 'shoulders'], ['chest', 'obliques', 'quadriceps', 'lower_back', 'glutes']],
    wall_sit: [['quadriceps'], ['glutes', 'calves']],
    dead_hang: [['forearms', 'lats'], ['shoulders']],
    superman_hold: [['lower_back'], ['glutes', 'shoulders']],
    hollow_hold: [['abs'], ['hip_flexors', 'quadriceps']],
    bird_dog: [['lower_back', 'abs'], ['glutes', 'shoulders']],
    bridge_hold: [['glutes'], ['hamstrings', 'lower_back']],
    // Souplesse: the muscle a stretch lengthens.
    stretch_hamstrings: [['hamstrings'], ['calves', 'lower_back']],
    stretch_quadriceps: [['quadriceps'], ['hip_flexors']],
    stretch_glutes: [['glutes'], ['lower_back']],
    stretch_hip_flexors: [['hip_flexors'], ['quadriceps']],
    stretch_calves: [['calves'], ['hamstrings']],
    stretch_chest: [['chest'], ['shoulders']],
    stretch_shoulders: [['shoulders'], ['upper_back', 'triceps']],
    stretch_back: [['lower_back', 'lats'], ['glutes']],
    // Cardio: the muscles that carry the effort.
    walking: [['quadriceps', 'calves'], ['glutes', 'hamstrings']],
    outdoor_run: [['quadriceps', 'hamstrings', 'calves'], ['glutes', 'hip_flexors', 'abs']],
    treadmill_run: [['quadriceps', 'hamstrings', 'calves'], ['glutes', 'hip_flexors', 'abs']],
    treadmill_hiit: [['quadriceps', 'glutes', 'calves'], ['hamstrings', 'hip_flexors', 'abs']],
    elliptical: [['quadriceps', 'glutes'], ['hamstrings', 'calves', 'shoulders']],
    cycling: [['quadriceps'], ['glutes', 'hamstrings', 'calves']],
    rowing: [['quadriceps', 'lats', 'upper_back'], ['glutes', 'hamstrings', 'biceps', 'lower_back']],
    jump_rope: [['calves'], ['quadriceps', 'shoulders', 'forearms']],
    swimming: [['lats', 'shoulders'], ['chest', 'triceps', 'abs', 'quadriceps']],
    stair_climber: [['quadriceps', 'glutes'], ['calves', 'hamstrings']]
};

// The contract, checked once when the catalogue is built: known muscles, at least one primary, none twice.
const checked = (id, [primary, secondary]) => {
    const all = [...primary, ...secondary];
    if (!primary.length || new Set(all).size !== all.length || !all.every(muscle => TRAINING_MUSCLES.includes(muscle))) throw new Error(`TRAINING_MUSCLES_INVALID:${id}`);
    return Object.freeze({ primary: Object.freeze([...primary]), secondary: Object.freeze([...secondary]) });
};
export const TRAINING_EXERCISE_MUSCLES = Object.freeze(Object.fromEntries(Object.entries(MUSCLES).map(([id, pair]) => [id, checked(id, pair)])));

// The catalogue's exercises with their `muscles`: an exercise without them, or muscles for no exercise, is refused.
export const withTrainingMuscles = exercises => {
    const ids = new Set(exercises.map(exercise => exercise.id));
    const orphan = Object.keys(TRAINING_EXERCISE_MUSCLES).find(id => !ids.has(id));
    if (orphan) throw new Error(`TRAINING_MUSCLES_ORPHAN:${orphan}`);
    return exercises.map(exercise => {
        const muscles = TRAINING_EXERCISE_MUSCLES[exercise.id];
        if (!muscles) throw new Error(`TRAINING_MUSCLES_MISSING:${exercise.id}`);
        return { ...exercise, muscles };
    });
};
