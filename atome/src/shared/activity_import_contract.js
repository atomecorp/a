/** Activities measured outside atome and imported into the person's records: a connected service (Strava, register
 *  R-016 lot F, question 31) or this device's health store (Apple Health / HealthKit on iOS, Health Connect on Android;
 *  D18 improvement 6). One record per person and civil day of their start, each activity once, by its source and its id
 *  there. Every value is `instrumented` (#video_train_contract.js VIDEO_TRAIN_MEASURE_SOURCES): a device measured it and
 *  the source passed it on; a measure the source does not give is absent, never estimated. `origin` is the app that
 *  recorded it (a bundle id, a package name) and `device` the device model the source names. A re-import replaces an
 *  activity's entry only when the source changed it; nothing imported is erased (disconnecting the source keeps it).
 *  The same session given by two sources (or two apps of one store) is kept twice, its provenance intact, the later one
 *  marked `duplicate_of` the first: readers count it once. The assistant never reads them (the user, 2026-10-28). */
export const ACTIVITY_IMPORT_SOURCES = Object.freeze(['strava', 'apple_health', 'health_connect']);
export const ACTIVITY_IMPORT_MEASURE_SOURCE = 'instrumented';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Each source's own identifier of an activity: Strava's number, a HealthKit object UUID, a Health Connect record id.
const SOURCE_IDS = Object.freeze({ strava: '^[0-9]{1,20}$', apple_health: '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$',
    health_connect: '^[A-Za-z0-9-]{1,64}$' });
const SOURCE_ID = new RegExp(Object.values(SOURCE_IDS).map(pattern => `(?:${pattern})`).join('|'));
const ORIGIN = '^[A-Za-z0-9._-]{1,120}$', DEVICE = '^[^\\u0000-\\u001f]{1,60}$';
const KEY = '^[a-z_]{1,20}:[A-Za-z0-9-]{1,64}$';
// The measures an activity may carry, each in its own unit: seconds moving, metres, metres climbed, beats per minute,
// kilocalories burned actively, steps.
export const ACTIVITY_IMPORT_MEASURES = Object.freeze(['moving_s', 'distance_m', 'elevation_m', 'heart_avg', 'heart_max', 'active_kcal', 'steps']);
const measure = { type: 'number', minimum: 0 };
const ENTRY = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['source', 'source_id', 'sport', 'start', 'end', 'measure_source', 'imported_at'], properties: {
        source: { type: 'string', enum: ACTIVITY_IMPORT_SOURCES }, source_id: { type: 'string', pattern: SOURCE_ID.source },
        sport: { type: 'string', pattern: '^[A-Za-z]{1,40}$' }, start: { type: 'string' }, end: { type: 'string' },
        ...Object.fromEntries(ACTIVITY_IMPORT_MEASURES.map(key => [key, measure])),
        origin: { type: 'string', pattern: ORIGIN }, device: { type: 'string', pattern: DEVICE },
        duplicate_of: { type: 'string', pattern: KEY },
        measure_source: { type: 'string', enum: [ACTIVITY_IMPORT_MEASURE_SOURCE] }, imported_at: { type: 'string' }
    } });
export const ACTIVITY_IMPORT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['version', 'day', 'entries'],
    properties: { version: { type: 'number', enum: [1] }, day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        entries: { type: 'array', maxItems: 200, items: ENTRY } } });

const invalid = () => { throw Object.assign(new Error('activity_import_invalid'), { code: 'activity_import_invalid' }); };
const matches = (pattern, value) => value === undefined || (typeof value === 'string' && new RegExp(pattern).test(value));
/** One activity checked against the contract (its end never before its start, its id in its source's own form). */
export const validateActivityImportEntry = entry => {
    const props = ENTRY.properties;
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !Object.hasOwn(props, key))
        || ENTRY.required.some(key => entry[key] === undefined)
        || !ACTIVITY_IMPORT_SOURCES.includes(entry.source) || !new RegExp(SOURCE_IDS[entry.source]).test(entry.source_id)
        || !/^[A-Za-z]{1,40}$/.test(entry.sport)
        || ![entry.start, entry.end, entry.imported_at].every(value => typeof value === 'string' && ISO.test(value))
        || Date.parse(entry.end) < Date.parse(entry.start) || entry.measure_source !== ACTIVITY_IMPORT_MEASURE_SOURCE
        || !matches(ORIGIN, entry.origin) || !matches(DEVICE, entry.device) || !matches(KEY, entry.duplicate_of)
        || entry.duplicate_of === activityImportKey(entry)
        || ACTIVITY_IMPORT_MEASURES.some(key => entry[key] !== undefined && !(Number.isFinite(entry[key]) && entry[key] >= 0))) invalid();
    return entry;
};
/** A day's record: its entries valid, each started that civil day (device calendar), each activity once. */
export const validateActivityImport = (record, dayOf) => {
    if (!record || record.version !== 1 || !DAY.test(record.day) || !Array.isArray(record.entries) || record.entries.length > 200
        || Object.keys(record).some(key => !Object.hasOwn(ACTIVITY_IMPORT_SCHEMA.properties, key))) invalid();
    record.entries.forEach(entry => { validateActivityImportEntry(entry); if (dayOf(Date.parse(entry.start)) !== record.day) invalid(); });
    if (new Set(record.entries.map(activityImportKey)).size !== record.entries.length) invalid();
    return record;
};
export const activityImportId = (actor, day) => `activity_import:${encodeURIComponent(actor)}:${day}`;
export const activityImportKey = entry => `${entry.source}:${entry.source_id}`;
/** Whether the source still says the same thing (the moment of the import aside). */
export const activityImportSame = (left, right) => Object.keys(ENTRY.properties).filter(key => key !== 'imported_at')
    .every(key => left[key] === right[key]);
// Two recordings are one session when their times overlap by four fifths of their union (a watch and a phone app
// starting a few seconds apart). Two entries of one source and one app are never the same session: that app said two.
const SAME_SESSION_OVERLAP = 0.8;
export const activityImportSameSession = (left, right) => {
    if (activityImportKey(left) === activityImportKey(right) || (left.source === right.source && left.origin === right.origin)) return false;
    const [a0, a1, b0, b1] = [left.start, left.end, right.start, right.end].map(Date.parse);
    const union = Math.max(a1, b1) - Math.min(a0, b0), common = Math.min(a1, b1) - Math.max(a0, b0);
    return union > 0 && common / union >= SAME_SESSION_OVERLAP;
};
// The training discipline (#training_disciplines.js) of an imported activity's sport, by the source's own names (Strava's
// `sport_type`, this device's store's words): its name and glyph on Sport › Journal's row (R-115); a sport no discipline
// names is the discipline « Autre » ('other').
const SPORT_DISCIPLINES = Object.freeze({ run: 'run', trailrun: 'run', virtualrun: 'run', running: 'run', ride: 'bike', virtualride: 'bike',
    ebikeride: 'bike', emountainbikeride: 'bike', mountainbikeride: 'bike', gravelride: 'bike', handcycle: 'bike', velomobile: 'bike', cycling: 'bike',
    walk: 'walk', walking: 'walk', hike: 'outdoor', hiking: 'outdoor', swim: 'swim', swimming: 'swim', rowing: 'rower', virtualrow: 'rower',
    elliptical: 'indoor_cardio', stairstepper: 'indoor_cardio', stairs: 'indoor_cardio', weighttraining: 'strength', strength: 'strength',
    crossfit: 'fitness', hiit: 'fitness', workout: 'fitness', yoga: 'yoga_pilates', pilates: 'yoga_pilates', tennis: 'racket', badminton: 'racket',
    squash: 'racket', tabletennis: 'racket', pickleball: 'racket', soccer: 'team', basketball: 'team', volleyball: 'team', dance: 'dance',
    boxing: 'combat', martialarts: 'combat' });
export const activityImportDiscipline = sport => SPORT_DISCIPLINES[String(sport).toLowerCase()] || 'other';
