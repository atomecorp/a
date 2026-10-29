/** Frozen training catalogue: three levels per exercise plus the user's own (« Perso »), validated by the user
 * (todo/Dashboard Sport.md; four levels until 2026-10-21, the fourth now reached through « Perso »).
 * Sources: WHO 2020 (150-300 min moderate or 75-150 vigorous a week, strength 2 days a week),
 * ACSM 2009 progression models (novice 8-12 RM, 1-2 min rest for hypertrophy), trainer consensus
 * for planks (a little more each week, a new variant after 60 s) and treadmill HIIT (1:3 → 2:1 work-rest).
 * Audited on 2026-10-22 against the ACSM 2026 position stand (MSSE 58(4):851-872, doi 10.1249/MSS.0000000000003897:
 * ≥2 sessions a week, strength ≥80% 1RM 2-3 sets, hypertrophy ≥10 sets a week, failure not needed, 2-3 reps in reserve)
 * and Currier et al., BJSM 2023;57:1211 (every prescription beats none): todo/urgent_task_suivi_2026-10-22.md, S-01. */
const deep = value => Object.freeze(Array.isArray(value) ? value.map(deep)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deep(item)])) : value);

// Strength levels: sets × [reps low, reps high] (double progression inside the range), rest between sets.
const sets = (count, low, high, rest_s, variant = '') => ({ sets: count, reps: [low, high], rest_s, ...(variant ? { variant } : {}) });
// Core levels: rounds of holds [variant, seconds], rest after every hold but the last.
// `progression`: whether the longest hold moves each week to the next natural number (`hold_weekly`) up to `hold_cap_s`
// (#training_progression.js). Every count and time here is a natural number (AGENTS.md rule 19, #shared/natural_numbers.js).
const holds = (rounds, list, rest_s) => ({ rounds, holds: list, rest_s });
// Cardio levels: warm-up, a steady part or interval blocks [count, work [s, zone], rest [s, zone]], cool-down.
const steady = (minutes, zone, variant = '') => ({ warmup_min: 0, steady: [minutes, zone], cooldown_min: 0, ...(variant ? { variant } : {}) });
const intervals = (warmup_min, count, work, rest, cooldown_min, variant = '') => ({ warmup_min, intervals: [count, work, rest], cooldown_min, ...(variant ? { variant } : {}) });

// The usual strength ladders (ACSM 2009, novice to intermediate): an isolation movement stays at 12 reps,
// a compound one climbs to 5 × 8-12 with longer rests.
const isolation = () => [sets(2, 12, 12, 90), sets(3, 12, 12, 75), sets(3, 9, 12, 60)];
const compound = () => [sets(2, 12, 12, 90), sets(3, 9, 12, 90), sets(5, 8, 12, 120)];
// A stretch held on each side (`[left, right]`), or once, for 30 s, 45 s then 1 min (ACSM: 30-60 s a stretch).
const stretch = (variants, rest_s = 9) => [30, 45, 60].map(seconds => holds(1, variants.map(variant => [variant, seconds]), rest_s));
const SIDES = ['left', 'right'];
const STRETCH = { kind: 'core', group: 'mobility', icon: 'movement', progression: { hold_weekly: false, hold_cap_s: 600 } };

// `group`: the Musculation zone (TRAINING_BODY_ZONES), `cardio` or `mobility` (Souplesse).
// `equipment`: body | dumbbell | barbell | kettlebell | cable | machine; `load_per: 'dumbbell'` when the load is one of a pair.
// `per_side`: `leg` or `arm` when each side does the repetitions in turn.
// load_ratios: share of body weight proposed for the first test set per level (null = body weight only);
// load_step_kg: the equipment step a double progression adds.
export const TRAINING_EXERCISES = deep([
    // Pectoraux.
    { id: 'push_up', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(3, 8, 12, 60, 'knee'), sets(3, 9, 13, 60), sets(5, 12, 15, 60)] },
    { id: 'bench_press', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.1, 0.15, 0.2], levels: compound() },
    { id: 'barbell_bench_press', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.3, 0.45, 0.6], levels: compound() },
    { id: 'incline_press', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.08, 0.12, 0.16], levels: compound() },
    { id: 'chest_press', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.25, 0.35, 0.5], levels: compound() },
    { id: 'dumbbell_fly', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.04, 0.06, 0.08], levels: isolation() },
    { id: 'chest_fly', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.15, 0.22, 0.3], levels: isolation() },
    { id: 'cable_crossover', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.06, 0.09, 0.12], levels: isolation() },
    { id: 'dips', kind: 'strength', group: 'chest', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(3, 5, 6, 90, 'negative'), sets(3, 6, 9, 90), sets(5, 8, 12, 90)] },
    // Dos.
    { id: 'pull_up', kind: 'strength', group: 'back', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(3, 3, 5, 120, 'negative'), sets(3, 5, 8, 120), sets(5, 6, 9, 120)] },
    { id: 'lat_pulldown', kind: 'strength', group: 'back', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.3, 0.4, 0.5], levels: compound() },
    { id: 'seated_row', kind: 'strength', group: 'back', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.25, 0.35, 0.45], levels: isolation() },
    { id: 'one_arm_row', kind: 'strength', group: 'back', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, per_side: 'arm',
        load_ratios: [0.1, 0.15, 0.2], levels: compound() },
    { id: 'barbell_row', kind: 'strength', group: 'back', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.25, 0.35, 0.5], levels: compound() },
    { id: 'pullover', kind: 'strength', group: 'back', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1,
        load_ratios: [0.06, 0.09, 0.12], levels: isolation() },
    { id: 'back_extension', kind: 'strength', group: 'back', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 9, 12, 60), sets(3, 12, 15, 60), sets(3, 15, 15, 60)] },
    { id: 'superman', kind: 'strength', group: 'back', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 9, 12, 45), sets(3, 12, 15, 45), sets(3, 15, 15, 45)] },
    // Épaules.
    { id: 'shoulder_press', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12], levels: compound() },
    { id: 'military_press', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: compound() },
    { id: 'lateral_raise', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.03, 0.04, 0.06], levels: isolation() },
    { id: 'front_raise', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.03, 0.04, 0.06], levels: isolation() },
    { id: 'reverse_fly', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.03, 0.04, 0.06], levels: isolation() },
    { id: 'face_pull', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.1, 0.15, 0.2], levels: isolation() },
    { id: 'shrug', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2, load_per: 'dumbbell',
        load_ratios: [0.15, 0.2, 0.3], levels: [sets(2, 12, 15, 60), sets(3, 12, 15, 60), sets(3, 9, 12, 60)] },
    { id: 'pike_push_up', kind: 'strength', group: 'shoulders', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 6, 8, 60), sets(3, 8, 9, 60), sets(3, 9, 12, 60)] },
    // Bras.
    { id: 'biceps_curl', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12], levels: isolation() },
    { id: 'hammer_curl', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12], levels: isolation() },
    { id: 'barbell_curl', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.12, 0.18, 0.24], levels: isolation() },
    { id: 'triceps_rope_pushdown', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'cable', load_step_kg: 2.5,
        load_ratios: [0.15, 0.22, 0.30], levels: isolation() },
    { id: 'skull_crusher', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.08, 0.12, 0.16], levels: isolation() },
    { id: 'overhead_extension', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1,
        load_ratios: [0.06, 0.09, 0.12], levels: isolation() },
    { id: 'bench_dip', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 8, 9, 60), sets(3, 9, 12, 60), sets(3, 12, 15, 60)] },
    { id: 'diamond_push_up', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 6, 8, 60, 'knee'), sets(3, 8, 9, 60), sets(3, 9, 12, 60)] },
    { id: 'wrist_curl', kind: 'strength', group: 'arms', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.03, 0.05, 0.07], levels: [sets(2, 15, 15, 45), sets(3, 15, 21, 45), sets(3, 21, 21, 45)] },
    // Abdos.
    { id: 'crunch', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 12, 15, 45), sets(3, 15, 21, 45), sets(3, 21, 24, 45)] },
    { id: 'reverse_crunch', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 9, 12, 45), sets(3, 12, 15, 45), sets(3, 15, 21, 45)] },
    { id: 'bicycle_crunch', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 12, 15, 45), sets(3, 15, 21, 45), sets(3, 21, 24, 45)] },
    { id: 'leg_raise', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 8, 9, 60), sets(3, 9, 12, 60), sets(3, 12, 15, 60)] },
    { id: 'hanging_knee_raise', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 6, 8, 60), sets(3, 8, 12, 60), sets(3, 12, 15, 60)] },
    { id: 'russian_twist', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 15, 21, 45), sets(3, 21, 24, 45), sets(3, 24, 30, 45)] },
    { id: 'dead_bug', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 9, 12, 45), sets(3, 12, 15, 45), sets(3, 15, 21, 45)] },
    { id: 'mountain_climber', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 21, 21, 45), sets(3, 21, 30, 45), sets(3, 30, 39, 45)] },
    { id: 'ab_wheel', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 5, 8, 60, 'knee'), sets(3, 8, 9, 60, 'knee'), sets(3, 9, 12, 60)] },
    // Fessiers.
    { id: 'glute_bridge', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 12, 15, 60), sets(3, 12, 15, 60), sets(3, 15, 21, 60)] },
    { id: 'single_leg_bridge', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', per_side: 'leg', load_ratios: [null, null, null],
        levels: [sets(2, 8, 9, 45), sets(3, 9, 12, 45), sets(3, 12, 15, 45)] },
    { id: 'hip_thrust', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2,
        load_ratios: [null, 0.15, 0.3], levels: [sets(3, 12, 15, 60), sets(3, 9, 12, 90), sets(5, 9, 12, 90)] },
    { id: 'donkey_kick', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', per_side: 'leg', load_ratios: [null, null, null],
        levels: [sets(2, 12, 12, 45), sets(3, 12, 15, 45), sets(3, 15, 15, 45)] },
    { id: 'cable_kickback', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'cable', load_step_kg: 2.5, per_side: 'leg',
        load_ratios: [0.05, 0.08, 0.1], levels: isolation() },
    { id: 'hip_abduction', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: isolation() },
    { id: 'side_lying_abduction', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', per_side: 'leg', load_ratios: [null, null, null],
        levels: [sets(2, 12, 15, 45), sets(3, 15, 15, 45), sets(3, 15, 21, 45)] },
    { id: 'step_up', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell', per_side: 'leg',
        load_ratios: [null, 0.06, 0.1], levels: [sets(2, 8, 9, 60), sets(3, 9, 12, 60), sets(3, 9, 12, 75)] },
    // Jambes.
    { id: 'squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2,
        load_ratios: [null, 0.15, 0.25], levels: [sets(3, 12, 15, 60), sets(3, 9, 12, 90, 'goblet'), sets(5, 9, 12, 90, 'goblet')] },
    { id: 'barbell_squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.4, 0.6, 0.8], levels: compound() },
    { id: 'lunge', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell', per_side: 'leg',
        load_ratios: [null, null, 0.08], levels: [sets(2, 8, 9, 60), sets(3, 9, 12, 60), sets(3, 12, 12, 75)] },
    { id: 'bulgarian_split_squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        per_side: 'leg', load_ratios: [null, 0.06, 0.1], levels: [sets(2, 8, 9, 60), sets(3, 8, 9, 75), sets(3, 9, 12, 90)] },
    // Leg machines (user request, 2026-10-21): the plate-loaded press, the extension (pushing forward) and the curl (folding).
    { id: 'leg_press', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 5,
        load_ratios: [0.5, 0.75, 1.0], levels: compound() },
    { id: 'leg_extension', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: isolation() },
    { id: 'leg_curl', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.15, 0.25, 0.35], levels: isolation() },
    { id: 'romanian_deadlift', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.3, 0.45, 0.6], levels: compound() },
    { id: 'hip_adduction', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: isolation() },
    { id: 'calf_raise', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 15, 15, 45), sets(3, 15, 21, 45), sets(3, 21, 24, 45)] },
    { id: 'seated_calf_raise', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: [sets(2, 15, 15, 45), sets(3, 15, 21, 45), sets(3, 21, 21, 45)] },
    // Corps entier.
    { id: 'deadlift', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.5, 0.75, 1.0], levels: [sets(2, 8, 8, 120), sets(3, 6, 8, 150), sets(5, 5, 8, 180)] },
    { id: 'burpee', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 6, 8, 60), sets(3, 8, 9, 60), sets(5, 9, 12, 60)] },
    { id: 'kettlebell_swing', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'kettlebell', load_step_kg: 4,
        load_ratios: [0.15, 0.2, 0.3], levels: [sets(3, 12, 15, 60), sets(3, 15, 21, 60), sets(5, 15, 21, 60)] },
    { id: 'thruster', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12], levels: compound() },
    { id: 'jump_squat', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 8, 9, 60), sets(3, 9, 12, 60), sets(5, 9, 12, 60)] },
    // One timed carry a round: the load is the person's own choice, the clock the prescription.
    { id: 'farmer_walk', kind: 'core', group: 'full_body', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 120 }, levels: [
        holds(2, [['farmer_walk', 30]], 60), holds(3, [['farmer_walk', 45]], 60), holds(3, [['farmer_walk', 60]], 60)] },
    // Gainage.
    // `positions`: in « Perso » each position has its own time, 0 s leaving it out of the round, one always kept (L5 C + O7 A,
    // validated 2026-10-28; #dashboard_training_custom.js).
    { id: 'plank', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, positions: ['front', 'side_left', 'side_right'], levels: [
        holds(3, [['front', 21]], 39),
        holds(1, [['front', 30], ['front', 30], ['front', 30], ['side_left', 21], ['side_right', 21]], 30),
        holds(2, [['front', 45], ['side_left', 30], ['side_right', 30]], 30)] },
    // One timed hold, 30 s, 1 min or 2 min (user request, 2026-10-21); no weekly bonus: « Perso » sets the rest.
    { id: 'wall_sit', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: false, hold_cap_s: 600 }, levels: [
        holds(1, [['wall_sit', 30]], 60), holds(1, [['wall_sit', 60]], 60), holds(1, [['wall_sit', 120]], 60)] },
    { id: 'dead_hang', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: false, hold_cap_s: 600 }, levels: [
        holds(1, [['dead_hang', 30]], 60), holds(1, [['dead_hang', 60]], 60), holds(1, [['dead_hang', 120]], 60)] },
    { id: 'superman_hold', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, levels: [
        holds(3, [['superman', 21]], 39), holds(3, [['superman', 30]], 30), holds(3, [['superman', 45]], 30)] },
    { id: 'hollow_hold', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, levels: [
        holds(3, [['hollow', 15]], 39), holds(3, [['hollow', 24]], 30), holds(3, [['hollow', 39]], 30)] },
    { id: 'bird_dog', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, levels: [
        holds(2, [['left', 21], ['right', 21]], 21), holds(3, [['left', 30], ['right', 30]], 21), holds(3, [['left', 45], ['right', 45]], 21)] },
    { id: 'bridge_hold', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 90 }, levels: [
        holds(3, [['bridge', 30]], 30), holds(3, [['bridge', 45]], 30), holds(3, [['bridge', 60]], 30)] },
    // Souplesse (validated by the user, 2026-10-28).
    { id: 'stretch_hamstrings', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_quadriceps', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_glutes', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_hip_flexors', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_calves', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_chest', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_shoulders', ...STRETCH, levels: stretch(SIDES) },
    { id: 'stretch_back', ...STRETCH, levels: stretch(['child_pose']) },
    // Cardio.
    { id: 'walking', kind: 'cardio', group: 'cardio', icon: 'movement', distance: { speed_kmh: 5, outdoor: true }, levels: [
        steady(21, 2), steady(30, 2), intervals(9, 3, [180, 3], [420, 2], 5)] },
    { id: 'outdoor_run', kind: 'cardio', group: 'cardio', icon: 'movement', distance: { speed_kmh: 9, outdoor: true }, levels: [
        intervals(5, 6, [60, 3], [90, 1], 5), steady(24, 3), steady(39, 3)] },
    { id: 'treadmill_run', kind: 'cardio', group: 'cardio', icon: 'movement', distance: { speed_kmh: 9, outdoor: false }, levels: [
        intervals(0, 8, [60, 3], [120, 1], 0), intervals(0, 8, [120, 3], [60, 1], 0), steady(30, 2)] },
    { id: 'treadmill_hiit', kind: 'cardio', group: 'cardio', icon: 'movement', weekly_max: 2, levels: [
        intervals(5, 8, [21, 5], [60, 1], 5), intervals(5, 9, [30, 5], [60, 1], 5),
        intervals(5, 9, [30, 5], [30, 1], 5)] },
    { id: 'elliptical', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(21, 2), steady(30, 2), intervals(6, 6, [60, 4], [120, 2], 6)] },
    { id: 'cycling', kind: 'cardio', group: 'cardio', icon: 'movement', distance: { speed_kmh: 18, outdoor: true }, levels: [
        steady(21, 2), steady(34, 2), intervals(9, 5, [180, 4], [120, 2], 9)] },
    { id: 'rowing', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(9, 2), steady(21, 3), intervals(5, 6, [60, 4], [60, 2], 5)] },
    { id: 'jump_rope', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        intervals(0, 6, [30, 3], [30, 1], 0), intervals(0, 8, [60, 3], [30, 1], 0), intervals(0, 9, [60, 4], [30, 2], 0)] },
    { id: 'swimming', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(21, 2), steady(30, 3), intervals(5, 8, [60, 4], [30, 2], 5)] },
    { id: 'stair_climber', kind: 'cardio', group: 'cardio', icon: 'movement', levels: [
        steady(9, 3), steady(21, 3), intervals(3, 6, [60, 4], [60, 2], 3)] }
]);
export const TRAINING_EXERCISE_IDS = Object.freeze(TRAINING_EXERCISES.map(exercise => exercise.id));
export const TRAINING_KINDS = Object.freeze(['core', 'strength', 'cardio']);
export const TRAINING_LEVELS = Object.freeze([1, 2, 3]);
// A cardio's goal (L7 a, validated 2026-10-28): free (no plan, Stop ends it), its level's time, a distance (the exercises
// with a `distance`: their usual speed, outdoors or not) or a programme (warm-up, efforts and recoveries, cool-down); and
// the figure the session shows, a pace (min/km) or a speed (km/h). Kept per exercise.
export const TRAINING_CARDIO_GOALS = Object.freeze(['free', 'time', 'distance', 'program']);
export const TRAINING_CARDIO_SHOW = Object.freeze(['pace', 'speed']);
export const TRAINING_CARDIO_LIMITS = Object.freeze({ km: [1, 42], km_tenths: [10, 420], count: [1, 21], effort_s: [5, 600], rest_s: [0, 600] });
export const TRAINING_CARDIO_DEFAULT = Object.freeze({ goal: 'time', show: 'pace', km: 5, program: Object.freeze({ count: 8, effort_s: 60, rest_s: 60 }), trip_id: null });
export const trainingCardioGoals = exercise => TRAINING_CARDIO_GOALS.filter(goal => goal !== 'distance' || exercise.distance);
export const trainingCardio = (exerciseId, cardio) => {
    const exercise = trainingExercise(exerciseId), program = cardio?.program;
    const within = (value, key) => Number.isInteger(value) && value >= TRAINING_CARDIO_LIMITS[key][0] && value <= TRAINING_CARDIO_LIMITS[key][1];
    // Kilometres keep a tenth: a chosen trip's own length (the « Km » slider sets whole ones).
    const tenths = value => Number.isFinite(value) && within(Math.round(value * 10), 'km_tenths');
    if (exercise.kind !== 'cardio' || !sameKeys(cardio, ['goal', 'show', 'km', 'program', 'trip_id']) || !trainingCardioGoals(exercise).includes(cardio.goal)
        || !TRAINING_CARDIO_SHOW.includes(cardio.show) || !tenths(cardio.km) || Math.abs(cardio.km * 10 - Math.round(cardio.km * 10)) > 1e-9 || !sameKeys(program, ['count', 'effort_s', 'rest_s'])
        || !within(program.count, 'count') || !within(program.effort_s, 'effort_s') || !within(program.rest_s, 'rest_s')
        || !(cardio.trip_id === null || (typeof cardio.trip_id === 'string' && cardio.trip_id.length <= 200 && exercise.distance?.outdoor))) invalid();
    return { goal: cardio.goal, show: cardio.show, km: cardio.km, program: { ...program }, trip_id: cardio.trip_id };
};
// The user's own prescription, in the shape of a catalogue level (#trainingCustomLevel).
export const TRAINING_CUSTOM_LEVEL = 'custom';
// « Record » (L9, validated 2026-10-28): one set as many as you can (a hold: as long as you can), the best one to beat;
// a strength or core exercise only (a cardio has no record).
export const TRAINING_RECORD_LEVEL = 'record';
export const trainingRecordable = exercise => exercise.kind !== 'cardio';
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
// The body zones Musculation opens on (user's choice, 2026-10-21, by muscle group since 2026-10-28): chest,
// back, shoulders, arms, abs, glutes, legs, full body, then the holds (Gainage); Cardio and Souplesse stay one
// level. A zone is a target of the favourites and of the programme as `zone:<id>`, an exercise as its own id.
export const TRAINING_BODY_ZONES = Object.freeze(['chest', 'back', 'shoulders', 'arms', 'abs', 'glutes', 'lower', 'full_body', 'core']);
export const trainingBodyZone = exercise => (TRAINING_BODY_ZONES.includes(exercise.group) ? exercise.group : null);
export const trainingZoneExercises = zone => TRAINING_EXERCISES.filter(exercise => trainingBodyZone(exercise) === zone);
export const TRAINING_TARGETS = Object.freeze([...TRAINING_EXERCISE_IDS, ...TRAINING_BODY_ZONES.map(zone => `zone:${zone}`)]);
// The exercises a target stands for, in catalogue order.
export const trainingTargetExercises = target => {
    if (!TRAINING_TARGETS.includes(target)) throw new Error('INVALID_ARGUMENT');
    return target.startsWith('zone:') ? trainingZoneExercises(target.slice(5)) : [trainingExercise(target)];
};
