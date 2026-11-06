/** Typed Programme preferences and purpose permissions; values stay in Atomes. */
import { FOOD_ALLERGEN_KEYS } from './food_allergen_contract.js';
import { deviceAtomeId } from './device_scope_contract.js';

export const PROGRAM_PREFERENCE_KEYS = Object.freeze(['starting_state', 'allergies', 'equipment', 'intolerances', 'food_preferences', 'food_access', 'food_budget']);
export const PROGRAM_PREFERENCE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'key', 'status', 'value', 'date', 'provenance', 'uncertain'], properties: {
        version: { type: 'number', enum: [1] }, key: { type: 'string', enum: PROGRAM_PREFERENCE_KEYS },
        status: { type: 'string', enum: ['answered'] }, value: { type: 'string', maxLength: 4000 },
        date: { type: 'string' }, provenance: { type: 'string' }, uncertain: { type: 'boolean' }, review_after: { type: 'string' },
        // « allergies » alone: the regulatory allergens declared (food_allergen_contract.js), and whether their traces count too.
        allergens: { type: 'array', maxItems: FOOD_ALLERGEN_KEYS.length, uniqueItems: true, items: { type: 'string', enum: FOOD_ALLERGEN_KEYS } },
        traces: { type: 'boolean' }
    } });
export const PROGRAM_DATA_PERMISSION_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'purpose_id', 'source', 'allowed', 'date'], properties: {
        version: { type: 'number', enum: [1] }, purpose_id: { type: 'string', minLength: 1 },
        source: { type: 'string', enum: ['preferences', 'journal'] }, allowed: { type: 'boolean' }, date: { type: 'string' },
        answer_state: { type: 'string', enum: ['unknown', 'later'] }
    } });
/** The health part of the preferences: on the server, sealed for its owner alone (AGENTS.md rule 21, 4 Nov. 2026, which
 * replaces decision Q70 of 31 Oct. 2026 « this device only »; #eVe/domains/programs/health_profile_store.js). */
export const PROGRAM_PREFERENCE_HEALTH_KEYS = Object.freeze(['allergies', 'intolerances']);
/** A synced preference in clear: the others, and where the health ones lay before Q70 (read once by the move, then deleted). */
export const syncedProgramPreferenceId = (actor, key) => 'program_preference:' + encodeURIComponent(actor) + ':' + key;
/** Where Q70 kept the health ones, on one device (read once by the move, then deleted). */
export const deviceProgramPreferenceId = (actor, key) => deviceAtomeId('program_preference', String(actor), key);
export const HEALTH_PREFERENCE_PREFIX = 'health_preference:';
export const programPreferenceId = (actor, key) => PROGRAM_PREFERENCE_HEALTH_KEYS.includes(key)
    ? HEALTH_PREFERENCE_PREFIX + encodeURIComponent(actor) + ':' + key : syncedProgramPreferenceId(actor, key);
export const programDataPermissionId = (actor, purpose, source) =>
    'program_data_permission:' + encodeURIComponent(actor) + ':' + encodeURIComponent(purpose) + ':' + source;
export const collectionInstant = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
export const validateProgramPreference = input => {
    if (!input || input.version !== 1 || !PROGRAM_PREFERENCE_KEYS.includes(input.key)
        || input.status !== 'answered' || typeof input.uncertain !== 'boolean'
        || !Number.isFinite(collectionInstant(input.date)) || typeof input.provenance !== 'string' || !input.provenance.trim()
        || (input.review_after !== undefined && !Number.isFinite(collectionInstant(input.review_after)))
        || typeof input.value !== 'string' || input.value.length > 4000)
        throw new Error('program_preference_invalid');
    const allergens = input.allergens ?? [];
    if ((input.key !== 'allergies' && (input.allergens !== undefined || input.traces !== undefined))
        || !Array.isArray(allergens) || new Set(allergens).size !== allergens.length || allergens.some(key => !FOOD_ALLERGEN_KEYS.includes(key))
        || (input.traces !== undefined && typeof input.traces !== 'boolean')
        // An answer says something: a text, or at least one allergen declared.
        || (!input.value.trim() && !allergens.length))
        throw new Error('program_preference_invalid');
    if (Object.keys(input).some(key => !Object.hasOwn(PROGRAM_PREFERENCE_SCHEMA.properties, key))) throw new Error('program_preference_invalid');
    return { ...input, value: input.value?.trim() ?? null, provenance: input.provenance.trim(),
        ...(input.allergens !== undefined ? { allergens: FOOD_ALLERGEN_KEYS.filter(key => allergens.includes(key)) } : {}) };
};
