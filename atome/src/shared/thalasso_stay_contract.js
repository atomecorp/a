/** A Thalasso stay (decision Q26, 30 Oct. 2026; study todo/etude_sante_plaisir_thalasso_2026-10-22.md § 2 H-04 and § 4): its
 *  dates and its place said once, then each care added to one day of the stay. One stay per person at a time, an account-global
 *  record through the one mutation pipeline; a new stay replaces it, history keeps the old one. Pure: neither render nor network.
 *  A care is a wellness practice, never a treatment: no benefit is promised (the study's evidence levels), its precautions name
 *  health profile categories (#health_profile_contract.js), `water`: it takes place in or beside water, where no water-unsafe
 *  breath is ever proposed (#breath_pattern.js, decision Q34); `brick`: the timed brick it is lived as (#brick_session_catalog.js). */
import { HEALTH_PROFILE_CATEGORY_IDS } from './health_profile_contract.js';
import { BRICK_SESSION_CATALOG } from './brick_session_catalog.js';
import { breathPatternIds } from './breath_pattern.js';

export const THALASSO_CARES = Object.freeze([
    { id: 'sea_bath', water: true, precautions: ['heart', 'pregnancy', 'skin'] },
    { id: 'jet_bath', water: true, precautions: ['heart', 'pregnancy', 'skin'] },
    { id: 'seaweed_wrap', water: false, precautions: ['allergies', 'metabolism', 'skin', 'pregnancy'] },
    { id: 'aqua_gym', water: true, precautions: ['heart', 'breathing', 'joints'] },
    { id: 'marine_relaxation', water: false, precautions: ['breathing'] },
    // Slow breathing out of the water, at the cardiac coherence; never a hyperventilation, never an apnoea.
    { id: 'slow_breathing', water: false, precautions: ['breathing', 'heart', 'pregnancy'], brick: 'breathing', breath: 'coherence' },
    { id: 'nap', water: false, precautions: [], brick: 'nap' }
].map(care => Object.freeze({ ...care, precautions: Object.freeze(care.precautions), label_key: `eve.wellbeing.care.${care.id}` })));
export const THALASSO_CARE_IDS = Object.freeze(THALASSO_CARES.map(care => care.id));
// Checked once, at load: a broken reference is an explicit error, never a silent gap.
if (THALASSO_CARES.some(care => care.precautions.some(id => !HEALTH_PROFILE_CATEGORY_IDS.includes(id))
    || (care.brick && !BRICK_SESSION_CATALOG[care.brick]) || (care.breath && !breathPatternIds({ water: true }).includes(care.breath))))
    throw new Error('thalasso_care_catalog_invalid');

export const THALASSO_STAY_MAX_DAYS = 31;
export const THALASSO_STAY_MAX_CARES = 144;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const dayMs = day => Date.parse(`${day}T00:00:00Z`);
const validDay = day => typeof day === 'string' && DAY.test(day) && new Date(dayMs(day)).toISOString().slice(0, 10) === day;
/** The days of a stay, first to last (civil days, `YYYY-MM-DD`). */
export const thalassoStayDays = ({ start_day: start, end_day: end }) => Array.from({ length: (dayMs(end) - dayMs(start)) / 86400000 + 1 },
    (_unused, index) => new Date(dayMs(start) + index * 86400000).toISOString().slice(0, 10));
export const thalassoStayId = actor => `thalasso_stay:${encodeURIComponent(actor)}`;

const validPlace = place => place && typeof place === 'object' && Object.keys(place).every(key => ['label', 'lat', 'lon'].includes(key))
    && typeof place.label === 'string' && place.label.trim().length > 0 && place.label.length <= 120
    && (place.lat === undefined) === (place.lon === undefined)
    && (place.lat === undefined || (Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && Number.isFinite(place.lon) && Math.abs(place.lon) <= 180));
const validCare = (care, days) => care && typeof care === 'object'
    && Object.keys(care).every(key => ['id', 'care_id', 'day', 'time', 'done_at'].includes(key))
    && typeof care.id === 'string' && care.id.length > 0 && care.id.length <= 80 && THALASSO_CARE_IDS.includes(care.care_id) && days.includes(care.day)
    && (care.time === undefined || TIME.test(care.time)) && (care.done_at === undefined || ISO.test(care.done_at));

/** A stay as stored: `{ version: 1, start_day, end_day, place: { label, lat?, lon? }, cares: [{ id, care_id, day, time?, done_at? }] }`. */
export const validateThalassoStay = stay => {
    const valid = stay?.version === 1 && Object.keys(stay).every(key => ['version', 'start_day', 'end_day', 'place', 'cares'].includes(key))
        && validDay(stay.start_day) && validDay(stay.end_day) && dayMs(stay.end_day) >= dayMs(stay.start_day)
        && (dayMs(stay.end_day) - dayMs(stay.start_day)) / 86400000 < THALASSO_STAY_MAX_DAYS && validPlace(stay.place)
        && Array.isArray(stay.cares) && stay.cares.length <= THALASSO_STAY_MAX_CARES;
    if (!valid) throw new Error('THALASSO_STAY_INVALID');
    const days = thalassoStayDays(stay);
    if (!stay.cares.every(care => validCare(care, days)) || new Set(stay.cares.map(care => care.id)).size !== stay.cares.length)
        throw new Error('THALASSO_STAY_INVALID');
    return stay;
};
/** The stay's days, each with its cares in their order (by time, untimed last): what a screen or the assistant lays. */
export const thalassoStayPlan = stay => thalassoStayDays(stay).map(day => ({ day, cares: stay.cares.filter(care => care.day === day)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')) }));
