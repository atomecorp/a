// Which fields of a user's card leave the account when the card is shared. One
// contract for the profile editor and for the server that publishes the card:
// the editor writes `profile.sharing.fields`, the server publishes exactly those
// fields and nothing else.

// A card that was never configured shares the name, the first name, the
// nickname and the photo.
export const DEFAULT_SHARED_PROFILE_FIELDS = Object.freeze(['name', 'first_name', 'nickname', 'user_face']);

export const SHAREABLE_PROFILE_FIELDS = Object.freeze([
    'name', 'first_name', 'nickname', 'user_face',
    'phone', 'email', 'custom_fields', 'bio', 'competences', 'passions', 'experiences'
]);

// Unknown keys are dropped and the list keeps the canonical order. An absent
// list means the owner never chose, so the default card applies; an empty list
// is a choice and shares nothing.
export const normalizeSharedProfileFields = (fields) => {
    if (!Array.isArray(fields)) return [...DEFAULT_SHARED_PROFILE_FIELDS];
    const requested = new Set(fields.map((field) => String(field || '').trim()));
    return SHAREABLE_PROFILE_FIELDS.filter((field) => requested.has(field));
};
