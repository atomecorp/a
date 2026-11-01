/** The parameters a Sport discipline may record (Health cahier §51.20.4, P040 2; register R-104 D6), each with its one
 * unit, its kind and its bounds: a discipline names which of them it uses (#training_disciplines.js) and a record carries
 * only those. Rules of §51.20.4 kept as data:
 * - a value is typed by the person (`manual`) or read from a source they allowed (`device` = the machine's display,
 *   `watch`, `gps`, `sensor`); a parameter marked `sourced` is never typed (power in watts: only a device or a sensor
 *   emits it, never a conversion from a level);
 * - a level (`resistance_level`) belongs to one device: never compared between two machines, never turned into watts;
 * - speed, pace and distance from lengths are computed at read (#eVe/domains/training/training_discipline_metrics.js),
 *   never stored as measures, so an estimate is never shown as a measure.
 * No value here is a recommendation: the bounds only refuse what cannot be (a negative length, a 900 km/h run). */

export const TRAINING_SOURCES = Object.freeze(['manual', 'device', 'watch', 'gps', 'sensor']);
export const TRAINING_UNITS = Object.freeze(['s', 'm', 'km_h', 'count', 'level', 'percent', 'spm', 'rpm', 'w', 'kg', 'lb', 'bpm', 'rpe', 'choice', 'text']);

const integer = (unit, min, max, extra = {}) => Object.freeze({ unit, kind: 'integer', min, max, ...extra });
const number = (unit, min, max, extra = {}) => Object.freeze({ unit, kind: 'number', min, max, ...extra });
const choice = (values, extra = {}) => Object.freeze({ unit: 'choice', kind: 'choice', values: Object.freeze(values), ...extra });
const text = max => Object.freeze({ unit: 'text', kind: 'text', max });

export const TRAINING_PARAMS = Object.freeze({
    duration_s: integer('s', 1, 86400),
    active_s: integer('s', 0, 86400),
    pause_s: integer('s', 0, 86400),
    rest_s: integer('s', 0, 3600),
    work_s: integer('s', 1, 3600),
    hold_s: integer('s', 1, 3600),
    distance_m: number('m', 0, 1000000),
    // The real length of the pool (P045 2): a world-bound value, never invented for open water.
    pool_length_m: number('m', 10, 100),
    lengths: integer('count', 1, 2000),
    laps: integer('count', 1, 2000),
    sets: integer('count', 1, 21),
    reps: integer('count', 1, 300),
    rounds: integer('count', 1, 55),
    steps: integer('count', 1, 89),
    speed_kmh: number('km_h', 0, 120),
    incline_percent: number('percent', -10, 40),
    stroke_rate_spm: integer('spm', 1, 89),
    cadence_rpm: integer('rpm', 1, 233),
    step_rate_spm: integer('spm', 1, 300),
    resistance_level: integer('level', 1, 55, { device_bound: true }),
    power_w: integer('w', 1, 3000, { sourced: true }),
    elevation_m: number('m', 0, 10000),
    heart_rate_bpm: integer('bpm', 30, 240, { sourced: true }),
    load_kg: number('kg', 0, 500),
    load_lb: number('lb', 0, 1100),
    assistance_kg: number('kg', 0, 300),
    rpe: integer('rpe', 0, 10),
    side: choice(['left', 'right', 'both']),
    position: choice(['standing', 'seated', 'lying', 'kneeling', 'supported']),
    stroke: choice(['crawl', 'breaststroke', 'backstroke', 'butterfly', 'drills', 'aquagym', 'mixed']),
    terrain: choice(['road', 'track', 'trail', 'grass', 'snow', 'water', 'indoor']),
    match_kind: choice(['training', 'match', 'technique']),
    // A match's score and sets are optional and never read as a health result (P052 tests).
    score_for: integer('count', 0, 999),
    score_against: integer('count', 0, 999),
    sets_won: integer('count', 0, 9),
    sets_lost: integer('count', 0, 9),
    play_time_s: integer('s', 0, 86400),
    rallies: integer('count', 0, 9999),
    difficulty_declared: integer('count', 1, 5),
    conditions: text(200),
    equipment: text(200),
    partner: text(120),
    sequence: text(200),
    notes: text(2000)
});
export const TRAINING_PARAM_KEYS = Object.freeze(Object.keys(TRAINING_PARAMS));

// A person's own parameter (P053 2): a named value with an explicit unit, never code.
export const TRAINING_OWN_PARAM_PATTERN = /^own_[a-z0-9_]{1,24}$/u;
export const TRAINING_OWN_PARAM_UNITS = Object.freeze(TRAINING_UNITS.filter(unit => unit !== 'choice'));

const fail = code => Object.assign(new Error(code), { code });

/** `definition`: a parameter of the dictionary or a person's own ({ unit, kind }); `value` as recorded; `source` its origin.
 * Throws `TRAINING_VALUE_INVALID` / `TRAINING_VALUE_SOURCE_REQUIRED`; returns the value kept. */
export const trainingParamValue = (definition, value, source = 'manual') => {
    if (!TRAINING_SOURCES.includes(source)) throw fail('TRAINING_SOURCE_UNKNOWN');
    if (definition.sourced && source === 'manual') throw fail('TRAINING_VALUE_SOURCE_REQUIRED');
    if (definition.kind === 'choice') {
        if (!definition.values.includes(value)) throw fail('TRAINING_VALUE_INVALID');
        return value;
    }
    if (definition.kind === 'text') {
        if (typeof value !== 'string' || !value.trim() || value.length > (definition.max || 200)) throw fail('TRAINING_VALUE_INVALID');
        return value.trim();
    }
    const whole = definition.kind === 'integer';
    if (!Number.isFinite(value) || (whole && !Number.isInteger(value))) throw fail('TRAINING_VALUE_INVALID');
    const min = definition.min ?? 0, max = definition.max ?? Number.MAX_SAFE_INTEGER;
    if (value < min || value > max) throw fail('TRAINING_VALUE_INVALID');
    return value;
};
