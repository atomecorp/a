/** Typed Programme preferences and purpose permissions; values stay in Atomes. */
export const PROGRAM_PREFERENCE_KEYS = Object.freeze(['starting_state', 'allergies', 'equipment', 'intolerances', 'food_preferences', 'food_access', 'food_budget']);
export const PROGRAM_PREFERENCE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'key', 'status', 'value', 'date', 'provenance', 'uncertain'], properties: {
        version: { type: 'number', enum: [1] }, key: { type: 'string', enum: PROGRAM_PREFERENCE_KEYS },
        status: { type: 'string', enum: ['answered'] }, value: { type: 'string', maxLength: 4000 },
        date: { type: 'string' }, provenance: { type: 'string' }, uncertain: { type: 'boolean' }, review_after: { type: 'string' }
    } });
export const PROGRAM_DATA_PERMISSION_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'purpose_id', 'source', 'allowed', 'date'], properties: {
        version: { type: 'number', enum: [1] }, purpose_id: { type: 'string', minLength: 1 },
        source: { type: 'string', enum: ['preferences', 'journal'] }, allowed: { type: 'boolean' }, date: { type: 'string' },
        answer_state: { type: 'string', enum: ['unknown', 'later'] }
    } });
export const programPreferenceId = (actor, key) => 'program_preference:' + encodeURIComponent(actor) + ':' + key;
export const programDataPermissionId = (actor, purpose, source) =>
    'program_data_permission:' + encodeURIComponent(actor) + ':' + encodeURIComponent(purpose) + ':' + source;
export const collectionInstant = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
export const validateProgramPreference = input => {
    if (!input || input.version !== 1 || !PROGRAM_PREFERENCE_KEYS.includes(input.key)
        || input.status !== 'answered' || typeof input.uncertain !== 'boolean'
        || !Number.isFinite(collectionInstant(input.date)) || typeof input.provenance !== 'string' || !input.provenance.trim()
        || (input.review_after !== undefined && !Number.isFinite(collectionInstant(input.review_after)))
        || typeof input.value !== 'string' || !input.value.trim() || input.value.length > 4000)
        throw new Error('program_preference_invalid');
    if (Object.keys(input).some(key => !Object.hasOwn(PROGRAM_PREFERENCE_SCHEMA.properties, key))) throw new Error('program_preference_invalid');
    return { ...input, value: input.value?.trim() ?? null, provenance: input.provenance.trim() };
};
