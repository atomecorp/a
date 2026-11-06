// The readings of a share row and of a state that Fastify still needs (shop delivery,
// the sharing service). Which share covers an object, and what it shows, is the vault
// router's (atome/servers/atome-server/src/vault_router/shares.rs).

// Share rows store permissions and property lists as JSON text; one reader for every share module.
export const parseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
};

export const stateParentId = (state) => {
    const properties = state?.properties || state?.particles || {};
    return properties.parent_id || properties.parentId
        || state?.meta?.parent_id || state?.meta?.parentId
        || state?.parent_id || state?.parentId || null;
};

export const stateAtomeId = (state) => state?.atome_id || state?.atomeId || state?.id
    || state?.atome?.id || state?.atome?.atome_id || null;
