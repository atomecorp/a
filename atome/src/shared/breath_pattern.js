// The breaths of the Respiration session (Activité › Bien-être, validated by the user on 28 Oct. 2026): a breath
// is a cycle of phases, in-breath, hold full, out-breath, hold empty, in seconds (0: no such phase), repeated until
// the session's length. Kapalabhati is its own cycle: 30 quick exhalations, one a second, then free breathing.
// Pure: the card (#dashboard_breath_session_view.js), the runtime (#brick_session_runtime.js) and the contract
// (#squirrel/brick_sessions/contracts.js) read the same table.
export const BREATH_PHASES = Object.freeze(['in', 'hold', 'out', 'empty']);
// The named breaths keep the world's own seconds (cardiac coherence, box breathing, 4-7-8, nadi shodhana).
const TIMED = Object.freeze({ coherence: [5, 0, 5, 0], square: [4, 4, 4, 4], '478': [4, 7, 8, 0], alternate: [4, 0, 4, 0] });
// In the roller's order (spelled out: an object puts the integer-like key '478' first).
export const BREATH_PATTERN_IDS = Object.freeze(['coherence', 'square', '478', 'alternate', 'kapalabhati', 'custom']);
export const BREATH_DEFAULT = 'coherence';
// « Perso »: the user's own seconds, natural numbers by default (AGENTS.md rule 19), 0 = no hold.
export const BREATH_CUSTOM_DEFAULT = Object.freeze({ in: 5, hold: 2, out: 6, empty: 0 });
export const BREATH_CUSTOM_RANGE = Object.freeze({ in: [1, 21], hold: [0, 21], out: [1, 21], empty: [0, 21] });
export const KAPALABHATI = Object.freeze({ strokes: 30, free_s: 30 });
// Cyclic hyperventilation can make one lose consciousness, above all in or near water (decision Q34, 30 Oct. 2026, study
// todo/etude_sante_plaisir_thalasso_2026-10-22.md § Sécurité respiratoire): Kapalabhati stays, never proposed in a water
// context (a Thalasso stay, a pool), its « i » saying its contraindications (pregnancy, epilepsy, heart, panic attacks).
export const BREATH_WATER_UNSAFE = Object.freeze(['kapalabhati']);
export const BREATH_INFO_KEYS = Object.freeze({ kapalabhati: 'eve.wellbeing.info.kapalabhati' });
/** The breaths eVe proposes, in the roller's order: all of them, or those safe near water (`water`). */
export const breathPatternIds = ({ water = false } = {}) => (water ? BREATH_PATTERN_IDS.filter(id => !BREATH_WATER_UNSAFE.includes(id)) : BREATH_PATTERN_IDS);

export const breathCustom = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !BREATH_PHASES.includes(key))
        || BREATH_PHASES.some(key => !Number.isInteger(input[key]) || input[key] < BREATH_CUSTOM_RANGE[key][0] || input[key] > BREATH_CUSTOM_RANGE[key][1]))
        throw new Error('BRICK_SESSION_INVALID');
    return Object.fromEntries(BREATH_PHASES.map(key => [key, input[key]]));
};

// The phases of one cycle, those of 0 s left out: { phase, seconds, strokes? }.
export const breathPhases = (breath, custom = BREATH_CUSTOM_DEFAULT) => {
    if (breath === 'kapalabhati') return [{ phase: 'pump', seconds: KAPALABHATI.strokes, strokes: KAPALABHATI.strokes }, { phase: 'free', seconds: KAPALABHATI.free_s }];
    const seconds = breath === 'custom' ? BREATH_PHASES.map(key => custom[key]) : TIMED[breath];
    if (!seconds) throw new Error('BRICK_SESSION_INVALID');
    return seconds.map((value, index) => ({ phase: BREATH_PHASES[index], seconds: value })).filter(item => item.seconds > 0);
};
export const breathCycleSeconds = phases => phases.reduce((sum, item) => sum + item.seconds, 0);

// Where a breath is `elapsed` seconds in: its cycle (from 0), its phase, the seconds into and left of it, the
// phase after it and, during the quick exhalations, the stroke under way (from 0).
export const breathMoment = (phases, elapsed) => {
    const cycleSeconds = breathCycleSeconds(phases), cycle = Math.floor(elapsed / cycleSeconds);
    let into = elapsed - cycle * cycleSeconds, index = 0;
    while (index < phases.length - 1 && into >= phases[index].seconds) { into -= phases[index].seconds; index += 1; }
    const current = phases[index];
    return { cycle, index, phase: current.phase, seconds: current.seconds, into, left: Math.max(0, current.seconds - into),
        stroke: current.strokes ? Math.min(current.strokes - 1, Math.floor(into * current.strokes / current.seconds)) : 0,
        next: phases[(index + 1) % phases.length] };
};
// Alternate nostrils: in by the left and out by the right, then in by the right and out by the left.
export const breathNostril = moment => ((moment.cycle + (moment.phase === 'in' ? 0 : 1)) % 2 ? 'right' : 'left');
