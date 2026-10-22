/** Frozen training catalogue: three levels per exercise plus the user's own (« Perso »), validated by the user
 * (todo/Dashboard Sport.md; four levels until 2026-10-21, the fourth now reached through « Perso »).
 * Sources: WHO 2020 (150-300 min moderate or 75-150 vigorous a week, strength 2 days a week),
 * ACSM 2009 progression models (novice 8-12 RM, 1-2 min rest for hypertrophy), trainer consensus
 * for planks (+5 s a week, a new variant after 60 s) and treadmill HIIT (1:3 → 2:1 work-rest).
 * Audited on 2026-10-22 against the ACSM 2026 position stand (MSSE 58(4):851-872, doi 10.1249/MSS.0000000000003897:
 * ≥2 sessions a week, strength ≥80% 1RM 2-3 sets, hypertrophy ≥10 sets a week, failure not needed, 2-3 reps in reserve)
 * and Currier et al., BJSM 2023;57:1211 (every prescription beats none): todo/urgent_task_suivi_2026-10-22.md, S-01. */
const deep = value => Object.freeze(Array.isArray(value) ? value.map(deep)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deep(item)])) : value);

// Strength levels: sets × [reps low, reps high] (double progression inside the range), rest between sets.
const sets = (count, low, high, rest_s, variant = '') => ({ sets: count, reps: [low, high], rest_s, ...(variant ? { variant } : {}) });
// Core levels: rounds of holds [variant, seconds], rest after every hold but the last.
// `progression`: the hold bonus a week brings (`hold_step_s`) up to `hold_cap_s` (#training_progression.js).
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
        holds(2, [['front', 45], ['side_left', 30], ['side_right', 30]], 30)] },
    // One timed hold, 30 s, 1 min or 2 min (user request, 2026-10-21); no weekly bonus: « Perso » sets the rest.
    { id: 'wall_sit', kind: 'core', group: 'lower', icon: 'movement', progression: { hold_step_s: 0, hold_cap_s: 600 }, levels: [
        holds(1, [['wall_sit', 30]], 60), holds(1, [['wall_sit', 60]], 60), holds(1, [['wall_sit', 120]], 60)] },
    { id: 'dead_hang', kind: 'core', group: 'upper', icon: 'movement', progression: { hold_step_s: 0, hold_cap_s: 600 }, levels: [
        holds(1, [['dead_hang', 30]], 60), holds(1, [['dead_hang', 60]], 60), holds(1, [['dead_hang', 120]], 60)] },
    { id: 'triceps_rope_pushdown', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.15, 0.22, 0.30], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60)] },
    { id: 'biceps_curl', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60)] },
    { id: 'push_up', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(3, 8, 12, 60, 'knee'), sets(3, 10, 14, 60), sets(4, 12, 16, 60)] },
    { id: 'squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2,
        load_ratios: [null, 0.15, 0.25], levels: [sets(3, 12, 15, 60), sets(3, 10, 12, 90, 'goblet'), sets(4, 10, 12, 90, 'goblet')] },
    { id: 'lunge', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell', per_side: true,
        load_ratios: [null, null, 0.08], levels: [sets(2, 8, 10, 60), sets(3, 10, 12, 60), sets(3, 12, 12, 75)] },
    // Leg machines (user request, 2026-10-21): the plate-loaded press, the extension (pushing forward) and the curl (folding).
    { id: 'leg_press', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 5,
        load_ratios: [0.5, 0.75, 1.0], levels: [sets(2, 12, 12, 90), sets(3, 10, 12, 90), sets(4, 8, 12, 120)] },
    { id: 'leg_extension', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60)] },
    { id: 'leg_curl', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.15, 0.25, 0.35], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60)] },
    { id: 'seated_row', kind: 'strength', group: 'upper', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.25, 0.35, 0.45], levels: [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 10, 12, 60)] },
    { id: 'walking', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(20, 2), steady(30, 2), intervals(10, 3, [180, 3], [420, 2], 5)] },
    { id: 'treadmill_run', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        intervals(0, 8, [60, 3], [120, 1], 0), intervals(0, 8, [120, 3], [60, 1], 0), steady(30, 2)] },
    { id: 'treadmill_hiit', kind: 'cardio', group: 'cardio', icon: 'movement', weekly_max: 2, levels: [
        intervals(5, 8, [20, 5], [60, 1], 5), intervals(5, 10, [30, 5], [60, 1], 5),
        intervals(5, 10, [30, 5], [30, 1], 5)] },
    { id: 'elliptical', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(20, 2), steady(30, 2), intervals(6, 6, [60, 4], [120, 2], 6)] },
    { id: 'cycling', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(20, 2), steady(35, 2), intervals(10, 5, [180, 4], [120, 2], 10)] }
]);
export const TRAINING_EXERCISE_IDS = Object.freeze(TRAINING_EXERCISES.map(exercise => exercise.id));
export const TRAINING_KINDS = Object.freeze(['core', 'strength', 'cardio']);
export const TRAINING_LEVELS = Object.freeze([1, 2, 3]);
// The user's own prescription, in the shape of a catalogue level (#trainingCustomLevel).
export const TRAINING_CUSTOM_LEVEL = 'custom';
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
// « Perso »: the user's own prescription, in the shape of a catalogue level of the same kind. It starts
// from a catalogue level (its variants, zones and structure stay) and only its counts and times change.
export const TRAINING_CUSTOM_LIMITS = Object.freeze({ sets: [1, 10], reps: [1, 100], rest_s: [0, 600], rounds: [1, 10], hold_s: [5, 600],
    warmup_min: [0, 60], cooldown_min: [0, 60], steady_min: [1, 240], count: [1, 50], work_s: [5, 3600], recovery_s: [0, 3600] });
const within = (value, key) => Number.isInteger(value) && value >= TRAINING_CUSTOM_LIMITS[key][0] && value <= TRAINING_CUSTOM_LIMITS[key][1];
const zoneOk = zone => Number.isInteger(zone) && zone >= 1 && zone <= 5;
const invalid = () => { throw new Error('INVALID_ARGUMENT'); };
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
export const trainingCustomFrom = (id, level) => JSON.parse(JSON.stringify(trainingLevel(id, level)));
export const trainingCustomLevel = (id, custom) => {
    const exercise = trainingExercise(id);
    const variants = new Set(exercise.levels.flatMap(level => level.holds?.map(([variant]) => variant) || [level.variant]).filter(Boolean));
    if (exercise.kind === 'strength') {
        if (!sameKeys(custom, ['sets', 'reps', 'rest_s', 'variant']) || !within(custom.sets, 'sets') || !within(custom.rest_s, 'rest_s')
            || !Array.isArray(custom.reps) || custom.reps.length !== 2 || !custom.reps.every(value => within(value, 'reps')) || custom.reps[0] > custom.reps[1]
            || (custom.variant !== undefined && !variants.has(custom.variant))) invalid();
    } else if (exercise.kind === 'core') {
        if (!sameKeys(custom, ['rounds', 'holds', 'rest_s']) || !within(custom.rounds, 'rounds') || !within(custom.rest_s, 'rest_s')
            || !Array.isArray(custom.holds) || !custom.holds.length || custom.holds.length > 8
            || !custom.holds.every(hold => Array.isArray(hold) && hold.length === 2 && variants.has(hold[0]) && within(hold[1], 'hold_s'))) invalid();
    } else {
        const { steady, intervals: blocks } = custom || {};
        if (!sameKeys(custom, ['warmup_min', 'steady', 'intervals', 'cooldown_min', 'variant']) || !within(custom.warmup_min, 'warmup_min')
            || !within(custom.cooldown_min, 'cooldown_min') || Boolean(steady) === Boolean(blocks)
            || (steady && !(Array.isArray(steady) && steady.length === 2 && within(steady[0], 'steady_min') && zoneOk(steady[1])))
            || (blocks && !(Array.isArray(blocks) && blocks.length === 3 && within(blocks[0], 'count')
                && Array.isArray(blocks[1]) && within(blocks[1][0], 'work_s') && zoneOk(blocks[1][1])
                && Array.isArray(blocks[2]) && within(blocks[2][0], 'recovery_s') && zoneOk(blocks[2][1])))) invalid();
    }
    return deep(custom);
};
// A strength repetition's tempo: its lifting (concentric) and lowering (eccentric) seconds, coached by the
// session's beeps. Without a chosen tempo a repetition takes the default, three seconds.
export const TRAINING_TEMPO_DEFAULT = Object.freeze({ concentric_s: 1, eccentric_s: 2 });
export const TRAINING_TEMPO_LIMITS = Object.freeze([1, 6]);
export const trainingTempo = tempo => {
    const within = value => Number.isInteger(value) && value >= TRAINING_TEMPO_LIMITS[0] && value <= TRAINING_TEMPO_LIMITS[1];
    if (!sameKeys(tempo, ['concentric_s', 'eccentric_s']) || !within(tempo.concentric_s) || !within(tempo.eccentric_s)) invalid();
    return { concentric_s: tempo.concentric_s, eccentric_s: tempo.eccentric_s };
};
// The prescription a session follows: a catalogue level, or the user's own.
export const trainingPrescription = (id, level, custom = null) => (level === TRAINING_CUSTOM_LEVEL ? trainingCustomLevel(id, custom) : trainingLevel(id, level));
// The body zones Musculation opens on (user's choice, 2026-10-21): the holds (Gainage: plank, wall sit,
// dead hang), the upper body and the legs; Cardio stays one level. A zone is a target of the favourites
// and of the programme as `zone:<id>`, an exercise as its own id.
export const TRAINING_BODY_ZONES = Object.freeze(['upper', 'lower', 'core']);
export const trainingBodyZone = exercise => (exercise.kind === 'core' ? 'core' : exercise.kind === 'strength' ? exercise.group : null);
export const trainingZoneExercises = zone => TRAINING_EXERCISES.filter(exercise => trainingBodyZone(exercise) === zone);
export const TRAINING_TARGETS = Object.freeze([...TRAINING_EXERCISE_IDS, ...TRAINING_BODY_ZONES.map(zone => `zone:${zone}`)]);
// The exercises a target stands for, in catalogue order.
export const trainingTargetExercises = target => {
    if (!TRAINING_TARGETS.includes(target)) throw new Error('INVALID_ARGUMENT');
    return target.startsWith('zone:') ? trainingZoneExercises(target.slice(5)) : [trainingExercise(target)];
};
