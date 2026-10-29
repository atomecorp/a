/** How the person feels (the « Ressenti »): Forme, Force and Humeur, each with an optional free note. One record per
 *  person and civil day, its entries appended and never erased: an aspect reads as its day's last entry, so a skipped
 *  question keeps the value before it and a new day starts with every aspect « Non renseigné ». */
import { healthDeclarationDay } from './health_declaration_contract.js';

export const HEALTH_FEELING_ASPECTS = Object.freeze(['form', 'strength', 'mood']);
/** Forme and Force: five levels, 1 the lowest (Au plus bas, Fébrile) to 5 the highest (Excellente, Maximale). */
export const HEALTH_FEELING_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
export const HEALTH_FEELING_MOODS = Object.freeze(['joy', 'calm', 'neutral', 'fatigue', 'stress', 'anxiety', 'anger', 'sadness', 'fear']);
/** When it was said: the morning, before an activity, during a rest, at the end of a session. */
export const HEALTH_FEELING_MOMENTS = Object.freeze(['day', 'activity_start', 'rest', 'session_end']);
export const HEALTH_FEELING_NOTE_MAX = 280;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY_PROPERTIES = Object.freeze({
    id: { type: 'string', minLength: 1, maxLength: 80 }, aspect: { type: 'string', enum: HEALTH_FEELING_ASPECTS },
    level: { type: 'number', enum: HEALTH_FEELING_LEVELS },
    moods: { type: 'array', minItems: 1, maxItems: HEALTH_FEELING_MOODS.length, items: { type: 'string', enum: HEALTH_FEELING_MOODS } },
    note: { type: 'string', minLength: 1, maxLength: HEALTH_FEELING_NOTE_MAX },
    moment: { type: 'string', enum: HEALTH_FEELING_MOMENTS }, session_id: { type: 'string', minLength: 1 }, at: { type: 'string' }
});
export const HEALTH_FEELING_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'day', 'entries'], properties: {
        version: { type: 'number', enum: [1] }, day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        entries: { type: 'array', maxItems: 500, items: { type: 'object', additionalProperties: false,
            required: ['id', 'aspect', 'moment', 'at'], properties: ENTRY_PROPERTIES } }
    } });

export const healthFeelingId = (actor, day) => `health_feeling:${encodeURIComponent(actor)}:${day}`;

const unique = list => new Set(list).size === list.length;
// A level belongs to Forme and Force, moods to Humeur; the note may stand alone.
const validEntry = (entry, day) => Object.keys(entry).every(key => Object.hasOwn(ENTRY_PROPERTIES, key))
    && typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 80 && HEALTH_FEELING_ASPECTS.includes(entry.aspect)
    && (entry.level === undefined || (entry.aspect !== 'mood' && HEALTH_FEELING_LEVELS.includes(entry.level)))
    && (entry.moods === undefined || (entry.aspect === 'mood' && Array.isArray(entry.moods) && entry.moods.length > 0
        && unique(entry.moods) && entry.moods.every(mood => HEALTH_FEELING_MOODS.includes(mood))))
    && (entry.note === undefined || (typeof entry.note === 'string' && entry.note.length > 0 && entry.note.length <= HEALTH_FEELING_NOTE_MAX))
    && (entry.level !== undefined || entry.moods !== undefined || entry.note !== undefined)
    && HEALTH_FEELING_MOMENTS.includes(entry.moment) && (entry.session_id === undefined || (typeof entry.session_id === 'string' && entry.session_id))
    && ISO.test(entry.at) && healthDeclarationDay(Date.parse(entry.at)) === day;

export const validateHealthFeeling = record => {
    const valid = record?.version === 1 && DAY.test(record.day) && Array.isArray(record.entries) && record.entries.length <= 500
        && Object.keys(record).every(key => Object.hasOwn(HEALTH_FEELING_SCHEMA.properties, key))
        && record.entries.every(entry => entry && typeof entry === 'object' && validEntry(entry, record.day));
    if (!valid) throw new Error('health_feeling_invalid');
    return record;
};

/** The day's feeling, aspect by aspect: its last entry, or null (« Non renseigné »). */
export const healthFeelingState = record => Object.freeze(Object.fromEntries(HEALTH_FEELING_ASPECTS.map(aspect =>
    [aspect, (record?.entries || []).findLast(entry => entry.aspect === aspect) || null])));
