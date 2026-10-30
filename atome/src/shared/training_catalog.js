/** Frozen training catalogue: three levels per exercise plus the user's own (« Perso »), validated by the user
 * (todo/Dashboard Sport.md; four levels until 2026-10-21, the fourth now reached through « Perso »).
 * Sources: WHO 2020 (150-300 min moderate or 75-150 vigorous a week, strength 2 days a week),
 * ACSM 2009 progression models (novice 8-12 RM, 1-2 min rest for hypertrophy), trainer consensus
 * for planks (a little more each week, a new variant after 60 s) and treadmill HIIT (1:3 → 2:1 work-rest).
 * Audited on 2026-10-22 against the ACSM 2026 position stand (MSSE 58(4):851-872, doi 10.1249/MSS.0000000000003897:
 * ≥2 sessions a week, strength ≥80% 1RM 2-3 sets, hypertrophy ≥10 sets a week, failure not needed, 2-3 reps in reserve)
 * and Currier et al., BJSM 2023;57:1211 (every prescription beats none): todo/urgent_task_suivi_2026-10-22.md, S-01. */
import { isNaturalNumber } from './natural_numbers.js';
import { withTrainingMuscles } from './training_muscles.js';

const deep = value => Object.freeze(Array.isArray(value) ? value.map(deep)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deep(item)])) : value);

// Strength levels: sets × [reps low, reps high] (double progression inside the range), rest between sets.
const sets = (count, low, high, rest_s, variant = '') => ({ sets: count, reps: [low, high], rest_s, ...(variant ? { variant } : {}) });
// Core levels: rounds of holds [variant, seconds], rest after every hold but the last.
// `progression`: whether the longest hold moves each week to the next natural number (`hold_weekly`) up to `hold_cap_s`
// (#training_progression.js). Every count and time here is a natural number (AGENTS.md rule 19, #shared/natural_numbers.js).
const holds = (rounds, list, rest_s) => ({ rounds, holds: list, rest_s });
// Every timed hold works like the other exercises, in several sets parted by a rest (user, V6 of 2026-10-30, BUG-067): 2 × 21 s,
// 3 × 30 s, 3 × 45 s, 60 s of rest. The user said 2 × 20 s; 20 is not a natural number, so its nearest one, 21 (AGENTS.md rule 19).
// `variants`: the holds of one set (a bird dog's left then right).
const timedHolds = variants => [[2, 21], [3, 30], [3, 45]].map(([rounds, seconds]) => holds(rounds, variants.map(variant => [variant, seconds]), 60));
// Cardio levels: warm-up, a steady part or interval blocks [count, work [s, zone], rest [s, zone]], cool-down.
const steady = (minutes, zone, variant = '') => ({ warmup_min: 0, steady: [minutes, zone], cooldown_min: 0, ...(variant ? { variant } : {}) });
const intervals = (warmup_min, count, work, rest, cooldown_min, variant = '') => ({ warmup_min, intervals: [count, work, rest], cooldown_min, ...(variant ? { variant } : {}) });

// The usual strength ladders (ACSM 2009, novice to intermediate): an isolation movement stays at 12 reps,
// a compound one climbs to 5 × 8-12 with longer rests.
// One rest at every level (S-01, the user's « reco partout » of 2026-10-30, Q15): a shorter rest is no progression (ACSM 2026:
// the rest's length changes no strength gain); 90 s for an isolation movement, 120 s for a multi-joint one (#MULTI_JOINT).
const REST_S = Object.freeze({ single: 90, multi: 120 });
const isolation = (rest_s = REST_S.single) => [sets(2, 12, 12, rest_s), sets(3, 12, 12, rest_s), sets(3, 9, 12, rest_s)];
const compound = () => [sets(2, 12, 12, REST_S.multi), sets(3, 9, 12, REST_S.multi), sets(5, 8, 12, REST_S.multi)];
// The multi-joint (poly-articulaire) strength exercises: they rest 120 s and come first in a session by default (Q15, Q17);
// every other strength exercise is an isolation one. A strength exercise carries `joints`: multi | single.
const MULTI_JOINT = new Set(['push_up', 'bench_press', 'barbell_bench_press', 'incline_press', 'chest_press', 'dips', 'pull_up', 'lat_pulldown',
    'seated_row', 'one_arm_row', 'barbell_row', 'shoulder_press', 'military_press', 'pike_push_up', 'bench_dip', 'diamond_push_up', 'step_up', 'squat',
    'barbell_squat', 'lunge', 'bulgarian_split_squat', 'leg_press', 'romanian_deadlift', 'deadlift', 'burpee', 'kettlebell_swing', 'thruster', 'jump_squat']);
const withJoints = list => list.map(item => (item.kind === 'strength' ? { ...item, joints: MULTI_JOINT.has(item.id) ? 'multi' : 'single' } : item));
// A stretch held on each side (`[left, right]`), or once, for 30 s, 45 s then 1 min (ACSM: 30-60 s a stretch).
const stretch = (variants, rest_s = 9) => [30, 45, 60].map(seconds => holds(1, variants.map(variant => [variant, seconds]), rest_s));
const SIDES = ['left', 'right'];
const STRETCH = { kind: 'core', group: 'mobility', icon: 'movement', progression: { hold_weekly: false, hold_cap_s: 600 } };

// `muscles`: { primary, secondary }, the muscles it works (#training_muscles.js), attached to every exercise.
// `group`: the Musculation zone (TRAINING_BODY_ZONES), `cardio` or `mobility` (Souplesse).
// `equipment`: body | dumbbell | barbell | kettlebell | cable | machine; `load_per: 'dumbbell'` when the load is one of a pair.
// `per_side`: `leg` or `arm` when each side does the repetitions in turn.
// load_ratios: share of body weight proposed for the first test set per level (null = body weight only);
// load_step_kg: the equipment step a double progression adds.
export const TRAINING_EXERCISES = deep(withJoints(withTrainingMuscles([
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
        load_ratios: [0.25, 0.35, 0.45], levels: isolation(REST_S.multi) },
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
        levels: [sets(2, 21, 21, 45), sets(3, 21, 30, 45), sets(3, 30, 30, 45)] },
    { id: 'ab_wheel', kind: 'strength', group: 'abs', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 5, 8, 60, 'knee'), sets(3, 8, 9, 60, 'knee'), sets(3, 9, 12, 60)] },
    // Fessiers.
    { id: 'glute_bridge', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 12, 15, 60), sets(3, 12, 15, 60), sets(3, 15, 21, 60)] },
    { id: 'single_leg_bridge', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', per_side: 'leg', load_ratios: [null, null, null],
        levels: [sets(2, 8, 9, 45), sets(3, 9, 12, 45), sets(3, 12, 15, 45)] },
    { id: 'hip_thrust', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2,
        load_ratios: [null, 0.15, 0.3], levels: [sets(3, 12, 15, REST_S.single), sets(3, 9, 12, REST_S.single), sets(5, 9, 12, REST_S.single)] },
    { id: 'donkey_kick', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', per_side: 'leg', load_ratios: [null, null, null],
        levels: [sets(2, 12, 12, 45), sets(3, 12, 15, 45), sets(3, 15, 15, 45)] },
    { id: 'cable_kickback', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'cable', load_step_kg: 2.5, per_side: 'leg',
        load_ratios: [0.05, 0.08, 0.1], levels: isolation() },
    { id: 'hip_abduction', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'machine', load_step_kg: 2.5,
        load_ratios: [0.2, 0.3, 0.4], levels: isolation() },
    { id: 'side_lying_abduction', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'body', per_side: 'leg', load_ratios: [null, null, null],
        levels: [sets(2, 12, 15, 45), sets(3, 15, 15, 45), sets(3, 15, 21, 45)] },
    { id: 'step_up', kind: 'strength', group: 'glutes', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell', per_side: 'leg',
        load_ratios: [null, 0.06, 0.1], levels: [sets(2, 8, 9, REST_S.multi), sets(3, 9, 12, REST_S.multi), sets(3, 9, 12, REST_S.multi)] },
    // Jambes.
    { id: 'squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 2,
        load_ratios: [null, 0.15, 0.25], levels: [sets(3, 12, 15, REST_S.multi), sets(3, 9, 12, REST_S.multi, 'goblet'), sets(5, 9, 12, REST_S.multi, 'goblet')] },
    { id: 'barbell_squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'barbell', load_step_kg: 2.5,
        load_ratios: [0.4, 0.6, 0.8], levels: compound() },
    { id: 'lunge', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell', per_side: 'leg',
        load_ratios: [null, null, 0.08], levels: [sets(2, 8, 9, REST_S.multi), sets(3, 9, 12, REST_S.multi), sets(3, 12, 12, REST_S.multi)] },
    { id: 'bulgarian_split_squat', kind: 'strength', group: 'lower', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        per_side: 'leg', load_ratios: [null, 0.06, 0.1], levels: [sets(2, 8, 9, REST_S.multi), sets(3, 8, 9, REST_S.multi), sets(3, 9, 12, REST_S.multi)] },
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
        load_ratios: [0.5, 0.75, 1.0], levels: [sets(2, 8, 8, 120), sets(3, 6, 8, 120), sets(5, 5, 8, 120)] },
    { id: 'burpee', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 6, 8, 60), sets(3, 8, 9, 60), sets(5, 9, 12, 60)] },
    { id: 'kettlebell_swing', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'kettlebell', load_step_kg: 4,
        load_ratios: [0.15, 0.2, 0.3], levels: [sets(3, 12, 15, 60), sets(3, 15, 21, 60), sets(5, 15, 21, 60)] },
    { id: 'thruster', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'dumbbell', load_step_kg: 1, load_per: 'dumbbell',
        load_ratios: [0.06, 0.09, 0.12], levels: compound() },
    { id: 'jump_squat', kind: 'strength', group: 'full_body', icon: 'movement', equipment: 'body', load_ratios: [null, null, null],
        levels: [sets(2, 8, 9, 60), sets(3, 9, 12, 60), sets(5, 9, 12, 60)] },
    // One timed carry a round: the load is the person's own choice, the clock the prescription.
    { id: 'farmer_walk', kind: 'core', group: 'full_body', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 120 }, levels: timedHolds(['farmer_walk']) },
    // Gainage.
    // `positions`: in « Perso » each position has its own time, 0 s leaving it out of the round, one always kept (L5 C + O7 A,
    // validated 2026-10-28; #dashboard_training_custom.js).
    { id: 'plank', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, positions: ['front', 'side_left', 'side_right'],
        levels: timedHolds(['front']) },
    { id: 'wall_sit', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: false, hold_cap_s: 600 }, levels: timedHolds(['wall_sit']) },
    { id: 'dead_hang', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: false, hold_cap_s: 600 }, levels: timedHolds(['dead_hang']) },
    { id: 'superman_hold', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, levels: timedHolds(['superman']) },
    { id: 'hollow_hold', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, levels: timedHolds(['hollow']) },
    { id: 'bird_dog', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 60 }, levels: timedHolds(['left', 'right']) },
    { id: 'bridge_hold', kind: 'core', group: 'core', icon: 'movement', progression: { hold_weekly: true, hold_cap_s: 90 }, levels: timedHolds(['bridge']) },
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
])));
export const TRAINING_EXERCISE_IDS = Object.freeze(TRAINING_EXERCISES.map(exercise => exercise.id));
export const TRAINING_KINDS = Object.freeze(['core', 'strength', 'cardio']);
export const TRAINING_LEVELS = Object.freeze([1, 2, 3]);
// A cardio's goal (L7 a, validated 2026-10-28): free (no plan, Stop ends it), its level's time, a distance (the exercises
// with a `distance`: their usual speed, outdoors or not) or a programme (warm-up, efforts and recoveries, cool-down); and
// the figure the session shows, a pace (min/km) or a speed (km/h). Kept per exercise.
export const TRAINING_CARDIO_GOALS = Object.freeze(['free', 'time', 'distance', 'program']);
export const TRAINING_CARDIO_SHOW = Object.freeze(['pace', 'speed']);
// A programme's phases (R-005 Q44, validated 2026-10-30, temp/r005_mockups/out/r005_02a, r005_02b): its warm-up and cool-down
// (minutes, 0 leaving it out), and its efforts in time (`effort_s`) or in distance (`effort_m`, an exercise with a distance).
export const TRAINING_CARDIO_LIMITS = Object.freeze({ km: [1, 42], km_tenths: [10, 420], count: [1, 21], effort_s: [5, 600], rest_s: [0, 600],
    warmup_min: [0, 30], cooldown_min: [0, 30], effort_m: [100, 5000] });
export const TRAINING_CARDIO_EFFORTS = Object.freeze(['time', 'distance']);
// 300 m: a multiple of 3 (AGENTS.md rule 19), the user's choice of 2026-10-30.
export const TRAINING_CARDIO_DEFAULT = Object.freeze({ goal: 'time', show: 'pace', km: 5, program: Object.freeze({ count: 8, effort_s: 60, rest_s: 60,
    warmup_min: 5, cooldown_min: 5, effort: 'time', effort_m: 300 }), trip_id: null });
const PROGRAM_KEYS = Object.freeze(Object.keys(TRAINING_CARDIO_DEFAULT.program));
export const trainingCardioGoals = exercise => TRAINING_CARDIO_GOALS.filter(goal => goal !== 'distance' || exercise.distance);
// The efforts a programme offers: in distance only for an exercise with a distance.
export const trainingCardioEfforts = exercise => TRAINING_CARDIO_EFFORTS.filter(effort => effort !== 'distance' || exercise.distance);
// A programme kept before its phases were set (Q44) reads with the catalogue's warm-up, cool-down and timed efforts.
export const trainingCardio = (exerciseId, cardio) => {
    const exercise = trainingExercise(exerciseId), program = sameKeys(cardio?.program, PROGRAM_KEYS) ? { ...TRAINING_CARDIO_DEFAULT.program, ...cardio.program } : null;
    const within = (value, key) => Number.isInteger(value) && value >= TRAINING_CARDIO_LIMITS[key][0] && value <= TRAINING_CARDIO_LIMITS[key][1];
    // Kilometres keep a tenth: a chosen trip's own length (the « Km » slider sets whole ones).
    const tenths = value => Number.isFinite(value) && within(Math.round(value * 10), 'km_tenths');
    if (exercise.kind !== 'cardio' || !sameKeys(cardio, ['goal', 'show', 'km', 'program', 'trip_id']) || !trainingCardioGoals(exercise).includes(cardio.goal)
        || !TRAINING_CARDIO_SHOW.includes(cardio.show) || !tenths(cardio.km) || Math.abs(cardio.km * 10 - Math.round(cardio.km * 10)) > 1e-9 || !program
        || !['count', 'effort_s', 'rest_s'].every(key => Object.hasOwn(cardio.program, key))
        || ['count', 'effort_s', 'rest_s', 'warmup_min', 'cooldown_min', 'effort_m'].some(key => !within(program[key], key))
        || !trainingCardioEfforts(exercise).includes(program.effort)
        || !(cardio.trip_id === null || (typeof cardio.trip_id === 'string' && cardio.trip_id.length <= 200 && exercise.distance?.outdoor))) invalid();
    return { goal: cardio.goal, show: cardio.show, km: cardio.km, program, trip_id: cardio.trip_id };
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
// A rest between sets is 2 min at most and a set 30 repetitions at most, for every exercise (user, 2026-10-30, Q12).
export const TRAINING_CUSTOM_LIMITS = Object.freeze({ sets: [1, 10], reps: [1, 30], rest_s: [0, 120], rounds: [1, 10], hold_s: [5, 600],
    warmup_min: [0, 60], cooldown_min: [0, 60], steady_min: [1, 240], count: [1, 50], work_s: [5, 3600], recovery_s: [0, 3600] });
const within = (value, key) => Number.isInteger(value) && value >= TRAINING_CUSTOM_LIMITS[key][0] && value <= TRAINING_CUSTOM_LIMITS[key][1];
const zoneOk = zone => Number.isInteger(zone) && zone >= 1 && zone <= 5;
const invalid = () => { throw new Error('INVALID_ARGUMENT'); };
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
export const trainingCustomFrom = (id, level) => JSON.parse(JSON.stringify(trainingLevel(id, level)));
// A « Perso » as kept, brought within today's limits when read (a count or a time set before they narrowed, Q12).
const limited = (value, key) => Math.min(TRAINING_CUSTOM_LIMITS[key][1], Math.max(TRAINING_CUSTOM_LIMITS[key][0], value));
export const trainingCustomAsRead = (id, custom) => {
    const kind = trainingExercise(id).kind;
    if (kind === 'strength') return trainingCustomLevel(id, { ...custom, sets: limited(custom.sets, 'sets'), rest_s: limited(custom.rest_s, 'rest_s'),
        reps: Array.isArray(custom.reps) ? custom.reps.map(value => limited(value, 'reps')) : custom.reps });
    if (kind === 'core') return trainingCustomLevel(id, { ...custom, rounds: limited(custom.rounds, 'rounds'), rest_s: limited(custom.rest_s, 'rest_s'),
        holds: Array.isArray(custom.holds) ? custom.holds.map(hold => (Array.isArray(hold) ? [hold[0], limited(hold[1], 'hold_s')] : hold)) : custom.holds });
    const blocks = custom.intervals;
    return trainingCustomLevel(id, { ...custom, warmup_min: limited(custom.warmup_min, 'warmup_min'), cooldown_min: limited(custom.cooldown_min, 'cooldown_min'),
        ...(Array.isArray(custom.steady) ? { steady: [limited(custom.steady[0], 'steady_min'), custom.steady[1]] } : {}),
        ...(Array.isArray(blocks) && Array.isArray(blocks[1]) && Array.isArray(blocks[2])
            ? { intervals: [limited(blocks[0], 'count'), [limited(blocks[1][0], 'work_s'), blocks[1][1]], [limited(blocks[2][0], 'recovery_s'), blocks[2][1]]] } : {}) });
};
// The heaviest load an exercise's values offer (user, 2026-10-30, Q11): twice its level-3 load for the reference body weight,
// taken up to the next natural number its equipment's step reaches (AGENTS.md rule 19); null for an exercise without a load.
// One owner for the card, the session, the progression's forms and the commands' contract.
export const TRAINING_REFERENCE_BODY_WEIGHT_KG = 100;
export const trainingLoadMax = exercise => {
    const ratio = exercise.kind === 'strength' ? exercise.load_ratios.at(-1) : null;
    if (ratio === null || ratio === undefined) return null;
    const step = exercise.load_step_kg, twice = Math.round(2 * ratio * TRAINING_REFERENCE_BODY_WEIGHT_KG * 1000) / 1000;
    let value = (Math.floor(twice / step) + 1) * step;
    while (!isNaturalNumber(value)) value = Math.round((value + step) * 1000) / 1000;
    return value;
};
// The person's own load step (R-005 Q47, validated 2026-10-30, temp/r005_mockups/out/r005_05_pas_de_charge.png): the plates or
// dumbbells their gym has, kept per exercise; the progression, the forms and the « Charge » roller follow it. Its roller offers
// these, the exercise's own step among them, and any step typed within the limits (a hundredth of a kilogram).
export const TRAINING_LOAD_STEPS = Object.freeze([1.25, 2.5, 5]);
export const TRAINING_LOAD_STEP_LIMITS = Object.freeze([0.25, 10]);
export const trainingLoadStepValid = value => Number.isFinite(value) && value >= TRAINING_LOAD_STEP_LIMITS[0] && value <= TRAINING_LOAD_STEP_LIMITS[1]
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
// The step a load moves by: the person's own (`own`, null when none is kept), else the exercise's equipment's.
export const trainingLoadStep = (exercise, own = null) => own ?? exercise.load_step_kg;
// What the log's histogram shows of each session (user, 2026-10-30, Q16): its active minutes, its volume, its heaviest load, its repetitions.
export const TRAINING_LOG_METRICS = Object.freeze(['minutes', 'volume', 'load', 'reps']);
// The highest of them: the commands' contract bound before each exercise's own.
export const TRAINING_LOAD_CEILING_KG = Math.max(...TRAINING_EXERCISES.map(trainingLoadMax).filter(value => value !== null));
// A load kept, within its exercise's values when read (an exercise without a load has none).
export const trainingLoadAsRead = (exercise, kg) => (kg === null || kg === undefined ? kg : trainingLoadMax(exercise) === null ? null : Math.min(trainingLoadMax(exercise), kg));
export const trainingCustomLevel = (id, custom) => {
    const exercise = trainingExercise(id);
    // An exercise of several positions holds each of them in « Perso » though its levels hold only some.
    const variants = new Set([...exercise.levels.flatMap(level => level.holds?.map(([variant]) => variant) || [level.variant]), ...(exercise.positions || [])].filter(Boolean));
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
// session's beeps. Its one setting is « Rythme », the seconds of a repetition (user, V4 of 2026-10-30): the tempo is
// that rhythm as two equal halves (#trainingTempoOfRhythm). Without a chosen rhythm a repetition takes the default, three seconds.
export const TRAINING_TEMPO_DEFAULT = Object.freeze({ concentric_s: 1, eccentric_s: 2 });
// A repetition's seconds as set (a tenth of a second, as a measure gives it), and its halves.
export const TRAINING_RHYTHM_LIMITS = Object.freeze([0.5, 6]);
export const TRAINING_RHYTHM_STEP = 0.5;
export const TRAINING_TEMPO_LIMITS = Object.freeze([TRAINING_RHYTHM_LIMITS[0] / 2, TRAINING_RHYTHM_LIMITS[1]]);
const tenth = value => Math.round(value * 10) / 10;
export const trainingRhythmOfTempo = tempo => (tempo ? tenth(tempo.concentric_s + tempo.eccentric_s) : TRAINING_TEMPO_DEFAULT.concentric_s + TRAINING_TEMPO_DEFAULT.eccentric_s);
export const trainingTempoOfRhythm = seconds => {
    const rhythm = Math.min(TRAINING_RHYTHM_LIMITS[1], Math.max(TRAINING_RHYTHM_LIMITS[0], tenth(seconds)));
    return { concentric_s: rhythm / 2, eccentric_s: rhythm / 2 };
};
export const trainingTempo = tempo => {
    // A half to the twentieth of a second (a tenth of a rhythm, halved); the older whole seconds stay valid.
    const within = value => Number.isFinite(value) && Math.abs(value * 20 - Math.round(value * 20)) < 1e-9 && value >= TRAINING_TEMPO_LIMITS[0] && value <= TRAINING_TEMPO_LIMITS[1];
    if (!sameKeys(tempo, ['concentric_s', 'eccentric_s']) || !within(tempo.concentric_s) || !within(tempo.eccentric_s)) invalid();
    return { concentric_s: tempo.concentric_s, eccentric_s: tempo.eccentric_s };
};
// How a session signals its counts down (user, V5 of 2026-10-30): `beep` (three beeps and a long one) or `voice` (« 3, 2, 1,
// partez », said by the local voice); a set's repetitions keep their beeps either way, the steps are announced either way.
export const TRAINING_SIGNALS = Object.freeze(['beep', 'voice']);
// The prescription a session follows: a catalogue level, or the user's own.
export const trainingPrescription = (id, level, custom = null) => (level === TRAINING_CUSTOM_LEVEL ? trainingCustomLevel(id, custom) : trainingLevel(id, level));
// The body zones Musculation opens on (user's choice, 2026-10-21, by muscle group since 2026-10-28): chest,
// back, shoulders, arms, abs, glutes, legs, full body, then the holds (Gainage); Cardio and Souplesse stay one
// level. A zone is a target of the favourites and of the programme as `zone:<id>`, an exercise as its own id.
export const TRAINING_BODY_ZONES = Object.freeze(['chest', 'back', 'shoulders', 'arms', 'abs', 'glutes', 'lower', 'full_body', 'core']);
export const trainingBodyZone = exercise => (TRAINING_BODY_ZONES.includes(exercise.group) ? exercise.group : null);
export const trainingZoneExercises = zone => TRAINING_EXERCISES.filter(exercise => trainingBodyZone(exercise) === zone);
export const TRAINING_TARGETS = Object.freeze([...TRAINING_EXERCISE_IDS, ...TRAINING_BODY_ZONES.map(zone => `zone:${zone}`)]);
// The multi-joint exercises first, each part in its own order (Q17, the user's « reco » of 2026-10-30): the key exercises open
// a session (ACSM 2026); the person still moves them up or down.
export const trainingMultiJointFirst = exercises => [...exercises.filter(item => item.joints === 'multi'), ...exercises.filter(item => item.joints !== 'multi')];
// The exercises a target stands for: a zone's in catalogue order, its multi-joint ones first.
export const trainingTargetExercises = target => {
    if (!TRAINING_TARGETS.includes(target)) throw new Error('INVALID_ARGUMENT');
    return target.startsWith('zone:') ? trainingMultiJointFirst(trainingZoneExercises(target.slice(5))) : [trainingExercise(target)];
};
