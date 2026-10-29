// Life profiles (user, 28 Oct. 2026): the contexts a person works in (Pro, Sport, Passion…), each
// an Atome of its own, synced with the account. Any item may carry `profiles`, the ids of the
// profiles it belongs to; an item without one belongs to every profile. A profile publishes
// nothing: it only files and filters.
export const LIFE_PROFILE_ATOME_TYPE = 'life_profile';
export const LIFE_PROFILE_NAME_MAX = 40;
export const LIFE_PROFILES_MAX = 60;

const PROFILE_ID_SCHEMA = Object.freeze({ type: 'string', minLength: 1, maxLength: 200 });
// The one property every Atome type accepts: the profiles the item belongs to.
export const LIFE_PROFILES_PROPERTY_SCHEMA = Object.freeze({
    profiles: Object.freeze({ type: 'array', maxItems: LIFE_PROFILES_MAX, items: PROFILE_ID_SCHEMA })
});
export const LIFE_PROFILE_TYPE = Object.freeze({ type: LIFE_PROFILE_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    name: { type: 'string', minLength: 1, maxLength: LIFE_PROFILE_NAME_MAX },
    // Its pastel, taken from the tiles' palette in creation order.
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    // The calendar created with it, under its name.
    calendar_id: { type: 'string', maxLength: 200 },
    // Its place in the row (creation order).
    order: { type: 'number', minimum: 0 },
    created_at: { type: 'string' },
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] }
} });

// The profile ids an item carries (its `profiles` property), cleaned.
export const lifeProfilesOf = (properties = {}) => (Array.isArray(properties?.profiles)
    ? [...new Set(properties.profiles.map(value => String(value || '').trim()).filter(Boolean))] : []);

// Whether an item shows under the active profiles. `active`: the ids active ([] = every profile);
// `known`: the ids of the profiles that exist. An item without a profile, or whose profiles were
// all deleted, belongs to every profile.
export const lifeProfileVisible = (properties, active = [], known = null) => {
    if (!active.length) return true;
    const own = lifeProfilesOf(properties).filter(id => !known || known.has(id));
    return !own.length || own.some(id => active.includes(id));
};
