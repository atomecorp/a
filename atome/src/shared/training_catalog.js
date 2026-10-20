/** Frozen training catalogue: four levels per exercise, validated by the user (todo/Dashboard Sport.md).
 * Sources: WHO 2020 (150-300 min moderate or 75-150 vigorous a week, strength 2 days a week),
 * ACSM 2009 progression models (novice 8-12 RM, 1-2 min rest for hypertrophy), trainer consensus
 * for planks (+5 s a week, a new variant after 60 s) and treadmill HIIT (1:3 → 2:1 work-rest). */
const deep = value => Object.freeze(Array.isArray(value) ? value.map(deep)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deep(item)])) : value);

// Strength levels: sets × [reps low, reps high] (double progression inside the range), rest between sets.
const sets = (count, low, high, rest_s, variant = '') => ({ sets: count, reps: [low, high], rest_s, ...(variant ? { variant } : {}) });
// Core levels: rounds of holds [variant, seconds], rest after every hold but the last.
const holds = (rounds, list, rest_s) => ({ rounds, holds: list, rest_s });
// Cardio levels: warm-up, a steady part or interval blocks [count, work [s, zone], rest [s, zone]], cool-down.
const steady = (minutes, zone, variant = '') => ({ warmup_min: 0, steady: [minutes, zone], cooldown_min: 0, ...(variant ? { variant } : {}) });
const intervals = (warmup_min, count, work, rest, cooldown_min, variant = '') => ({ warmup_min, intervals: [count, work, rest], cooldown_min, ...(variant ? { variant } : {}) });

// load_ratios: share of body weight proposed for the first test set per level (null = body weight only);
// load_step_kg: the equipment step a double progression adds.
export const TRAINING_EXERCISES = deep([
    { id: 'plank', kind: 'core', group: 'core', icon: 'movement', progression: { hold_step_s: 5, hold_cap_s: 60 }, levels: [
        holds(3, [['front', 20]], 40),
        holds(1, [['front', 30], ['front', 30], ['front', 30], ['side_left', 20], ['side_right', 20]], 30),
        holds(2, [['front', 45], ['side_left', 30], ['side_right', 30]], 30),
        holds(3, [['front', 60], ['side_left', 45], ['side_right', 45], ['arm_leg_raise', 30]], 20)] },
    { id: 'triceps_rope_pushdown', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.15, 0.22, 0.30, 0.38], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60), sets(4, 8, 12, 60)] },
    { id: 'biceps_curl', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12, 0.15], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60), sets(4, 8, 12, 60)] },
    { id: 'push_up', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'body', load_ratios: [null, null, null, null],
        levels: [sets(3, 8, 12, 60, 'knee'), sets(3, 10, 14, 60), sets(4, 12, 16, 60), sets(4, 15, 20, 45, 'tempo_311')] },
    { id: 'squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2,
        load_ratios: [null, 0.15, 0.25, 0.35], levels: [sets(3, 12, 15, 60), sets(3, 10, 12, 90, 'goblet'), sets(4, 10, 12, 90, 'goblet'), sets(4, 8, 10, 120)] },
    { id: 'lunge', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell', per_side: true,
        load_ratios: [null, null, 0.08, 0.11], levels: [sets(2, 8, 10, 60), sets(3, 10, 12, 60), sets(3, 12, 12, 75), sets(4, 12, 12, 75)] },
    { id: 'seated_row', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.25, 0.35, 0.45, 0.55], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60), sets(4, 8, 12, 60)] },
    { id: 'walking', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(20, 2), steady(30, 2), intervals(10, 3, [180, 3], [420, 2], 5), steady(60, 2)] },
    { id: 'treadmill_run', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        intervals(0, 8, [60, 3], [120, 1], 0), intervals(0, 8, [120, 3], [60, 1], 0), steady(30, 2),
        intervals(15, 1, [600, 4], [0, 2], 15)] },
    { id: 'treadmill_hiit', kind: 'cardio', group: 'cardio', icon: 'movement', weekly_max: 2, levels: [
        intervals(5, 8, [20, 5], [60, 1], 5), intervals(5, 10, [30, 5], [60, 1], 5),
        intervals(5, 10, [30, 5], [30, 1], 5), intervals(5, 10, [40, 5], [20, 1], 5)] },
    { id: 'elliptical', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(20, 2), steady(30, 2), intervals(6, 6, [60, 4], [120, 2], 6), intervals(12, 8, [60, 4], [60, 2], 12)] },
    { id: 'cycling', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(20, 2), steady(35, 2), intervals(10, 5, [180, 4], [120, 2], 10), intervals(9, 6, [240, 4], [180, 2], 9)] }
]);
export const TRAINING_EXERCISE_IDS = Object.freeze(TRAINING_EXERCISES.map(exercise => exercise.id));
export const TRAINING_KINDS = Object.freeze(['core', 'strength', 'cardio']);
export const TRAINING_LEVELS = Object.freeze([1, 2, 3, 4]);
export const TRAINING_GOALS = Object.freeze(['muscle', 'movement', 'weight']);
export const trainingExercise = id => {
    const exercise = TRAINING_EXERCISES.find(item => item.id === id);
    if (!exercise) throw new Error('TRAINING_EXERCISE_UNKNOWN');
    return exercise;
};
export const trainingLevel = (id, level) => {
    if (!TRAINING_LEVELS.includes(level)) throw new Error('INVALID_ARGUMENT');
    return trainingExercise(id).levels[level - 1];
};
