/** Activities a connected service measured (Strava first; register R-016 lot F, question 31): one record per person and
 *  civil day of their start, each activity once, by its service and its id there. Every value is `instrumented`
 *  (#video_train_contract.js VIDEO_TRAIN_MEASURE_SOURCES): the person's device measured it and the service passed it on.
 *  A re-import replaces an activity's entry only when the service changed it; nothing imported is erased (disconnecting
 *  the service keeps it). The assistant never reads them: the services' terms forbid it (the user, 2026-10-28). */
export const ACTIVITY_IMPORT_SOURCES = Object.freeze(['strava']);
export const ACTIVITY_IMPORT_MEASURE_SOURCE = 'instrumented';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The measures an activity may carry, each in its own unit: seconds moving, metres, metres climbed, beats per minute.
export const ACTIVITY_IMPORT_MEASURES = Object.freeze(['moving_s', 'distance_m', 'elevation_m', 'heart_avg', 'heart_max']);
const measure = { type: 'number', minimum: 0 };
const ENTRY = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['source', 'source_id', 'sport', 'start', 'end', 'measure_source', 'imported_at'], properties: {
        source: { type: 'string', enum: ACTIVITY_IMPORT_SOURCES }, source_id: { type: 'string', pattern: '^[0-9]{1,20}$' },
        sport: { type: 'string', pattern: '^[A-Za-z]{1,40}$' }, start: { type: 'string' }, end: { type: 'string' },
        ...Object.fromEntries(ACTIVITY_IMPORT_MEASURES.map(key => [key, measure])),
        measure_source: { type: 'string', enum: [ACTIVITY_IMPORT_MEASURE_SOURCE] }, imported_at: { type: 'string' }
    } });
export const ACTIVITY_IMPORT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['version', 'day', 'entries'],
    properties: { version: { type: 'number', enum: [1] }, day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        entries: { type: 'array', maxItems: 200, items: ENTRY } } });

const invalid = () => { throw Object.assign(new Error('activity_import_invalid'), { code: 'activity_import_invalid' }); };
/** One activity checked against the contract (its end never before its start). */
export const validateActivityImportEntry = entry => {
    const props = ENTRY.properties;
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !Object.hasOwn(props, key))
        || ENTRY.required.some(key => entry[key] === undefined)
        || !ACTIVITY_IMPORT_SOURCES.includes(entry.source) || !/^[0-9]{1,20}$/.test(entry.source_id) || !/^[A-Za-z]{1,40}$/.test(entry.sport)
        || ![entry.start, entry.end, entry.imported_at].every(value => typeof value === 'string' && ISO.test(value))
        || Date.parse(entry.end) < Date.parse(entry.start) || entry.measure_source !== ACTIVITY_IMPORT_MEASURE_SOURCE
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
/** Whether the service still says the same thing (the moment of the import aside). */
export const activityImportSame = (left, right) => Object.keys(ENTRY.properties).filter(key => key !== 'imported_at')
    .every(key => left[key] === right[key]);
