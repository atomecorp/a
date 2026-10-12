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

// The personal data that can be adopted. Authentication, permissions and account
// preferences are never imported from a local guest's card.
export const PERSONAL_PROFILE_PATHS = Object.freeze([
    'name', 'first_name', 'nickname', 'phone', 'email', 'user_face', 'display_name_source',
    'custom_fields', 'bio.birth', 'bio.weight', 'bio.height', 'bio.biometrics',
    'profile.competences', 'profile.passions', 'profile.experiences'
]);
const profileObject = value => {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};
const readPath = (value, path) => path.split('.').reduce((owner, part) => owner?.[part], value);
const writePath = (value, path, item) => {
    const parts = path.split('.');
    const last = parts.pop();
    const parent = parts.reduce((owner, part) => owner[part] ||= {}, value);
    parent[last] = item;
};
const personalValue = value => Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object').map(item => ({
        label: String(item.label || '').trim(), value: String(item.value || '').trim(),
        ...(item.pro === true ? { pro: true } : {})
    })).filter(item => item.label || item.value)
    : typeof value === 'string' ? value.trim() : '';
const emptyValue = value => value == null || value === '' || (typeof value === 'string' && !value.trim())
    || (Array.isArray(value) && !value.length);

export const personalProfileFromProperties = (properties = {}) => {
    const stored = profileObject(properties.eve_profile);
    const profile = {};
    for (const path of PERSONAL_PROFILE_PATHS) {
        const raw = path === 'user_face' ? properties.user_face ?? stored.user_face
            : readPath(stored, path) ?? properties[path];
        const value = personalValue(raw);
        if (!emptyValue(value)) writePath(profile, path, value);
    }
    return profile;
};

export const mergeGuestProfileProperties = (target = {}, guest = {}) => {
    const profile = structuredClone(profileObject(target.eve_profile));
    const props = {};
    for (const path of PERSONAL_PROFILE_PATHS) {
        const value = personalValue(readPath(guest, path));
        const current = path === 'user_face' ? target.user_face ?? profile.user_face : readPath(profile, path) ?? target[path];
        const legacyFirstName = path === 'first_name' ? profile.firstname || target.firstname || target.firstName : null;
        if (!emptyValue(current) || !emptyValue(target[path]) || !emptyValue(legacyFirstName) || emptyValue(value)) continue;
        if (path === 'user_face') props.user_face = value;
        else {
            writePath(profile, path, value);
            if (['name', 'first_name', 'nickname', 'email'].includes(path)) props[path] = value;
            if (path === 'first_name') Object.assign(props, { firstname: value, firstName: value });
        }
    }
    if (!Object.keys(props).length && JSON.stringify(profile) === JSON.stringify(profileObject(target.eve_profile))) return null;
    // Keep a legacy target photo while converging to its sole canonical property.
    if (profile.user_face && !target.user_face && !props.user_face) props.user_face = profile.user_face;
    delete profile.user_face;
    props.eve_profile = profile;
    return props;
};
