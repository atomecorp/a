// The Programme bricks lived as one timed session (lot C, 28 Oct. 2026): a nap and a meditation, then
// Activité › Bien-être's breathing and relaxation (28 Oct. 2026). `minutes`: the session's length until the
// user turns the roller (the Sommeil routine places the nap and the meditation at this length too,
// sleep_routine_model.js); `min`, `max`, `step`: the roller's range, in minutes. `mindful`: its saved
// session's minutes are written to the health store as mindful minutes. `breath`: the breath it starts with
// (#breath_pattern.js); `bell`: the minutes between two strokes of its bell (0: none). Both are the user's
// own once set (`brick_session` of its Programme activity, #validateBrickSessionSettings).
import { BREATH_DEFAULT, BREATH_PATTERN_IDS, breathCustom } from './breath_pattern.js';

export const BRICK_SESSION_CATALOG = Object.freeze({
    nap: Object.freeze({ id: 'nap', icon: 'sleep', minutes: 20, min: 5, max: 90, step: 5, mindful: false }),
    meditation: Object.freeze({ id: 'meditation', icon: 'meditation', minutes: 10, min: 5, max: 60, step: 5, mindful: true, bell: 5 }),
    breathing: Object.freeze({ id: 'breathing', icon: 'wellbeing', minutes: 5, min: 5, max: 30, step: 5, mindful: true, breath: BREATH_DEFAULT }),
    relaxation: Object.freeze({ id: 'relaxation', icon: 'bed', minutes: 15, min: 5, max: 60, step: 5, mindful: false })
});
export const BRICK_SESSION_IDS = Object.freeze(Object.keys(BRICK_SESSION_CATALOG));
export const BRICK_SESSION_BELL_MAX = 21;
export const brickSession = id => {
    const brick = BRICK_SESSION_CATALOG[id];
    if (!brick) throw new Error('BRICK_SESSION_UNKNOWN');
    return brick;
};
// A brick's own settings as its Programme activity keeps them: `breath` and `custom` for a breathing,
// `bell` for a brick that has one.
export const validateBrickSessionSettings = (brickId, input) => {
    const brick = BRICK_SESSION_CATALOG[brickId];
    if (!brick || !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BRICK_SESSION_INVALID');
    for (const key of Object.keys(input)) {
        const allowed = key === 'bell' ? brick.bell !== undefined : ['breath', 'custom'].includes(key) && Boolean(brick.breath);
        if (!allowed) throw new Error('BRICK_SESSION_INVALID');
    }
    if (input.breath !== undefined && !BREATH_PATTERN_IDS.includes(input.breath)) throw new Error('BRICK_SESSION_INVALID');
    if (input.bell !== undefined && (!Number.isInteger(input.bell) || input.bell < 0 || input.bell > BRICK_SESSION_BELL_MAX)) throw new Error('BRICK_SESSION_INVALID');
    return { ...(input.breath === undefined ? {} : { breath: input.breath }), ...(input.custom === undefined ? {} : { custom: breathCustom(input.custom) }),
        ...(input.bell === undefined ? {} : { bell: input.bell }) };
};
