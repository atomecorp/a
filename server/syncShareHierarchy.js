const parseJson = (value, fallback = null) => {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
};

const ACTIVE_LINKED_SHARE_SQL = `status IN ('active', 'accepted')
    AND share_type = 'linked'
    AND (expires_at IS NULL OR expires_at > datetime('now'))`;

const stateParentId = (state) => {
    const properties = state?.properties || state?.particles || {};
    return properties.parent_id || properties.parentId
        || state?.meta?.parent_id || state?.meta?.parentId
        || state?.parent_id || state?.parentId || null;
};

const stateAtomeId = (state) => state?.atome_id || state?.atomeId || state?.id
    || state?.atome?.id || state?.atome?.atome_id || null;

// Programme instances are private while granular consent/ACL sharing is unverified.
const isPrivateProgramState = state => !!(state?.properties || state?.particles || {}).project_program;
const hasPrivateProgramAncestor = async ({ provider, ownerId, atomeId }) => {
    let cursor = String(atomeId || '').trim(); const visited = new Set();
    while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const state = await provider.request(ownerId, 'state:get', { atome_id: cursor });
        if (isPrivateProgramState(state)) return true;
        cursor = String(stateParentId(state) || '').trim();
    }
    return false;
};

const isWithinSharedRoot = async ({ provider, ownerId, atomeId, rootAtomeId }) => {
    let cursor = String(atomeId || '').trim();
    const root = String(rootAtomeId || '').trim();
    const visited = new Set();
    while (cursor && !visited.has(cursor)) {
        const state = await provider.request(ownerId, 'state:get', { atome_id: cursor });
        if (isPrivateProgramState(state)) return false;
        if (cursor === root) return !await hasPrivateProgramAncestor({ provider, ownerId, atomeId: cursor });
        visited.add(cursor);
        cursor = String(stateParentId(state) || '').trim();
    }
    return false;
};

const activeSharesForPrincipal = async (db, principalId, ownerId = null) => db.query(
    'all',
    `SELECT * FROM sync_share_requests
     WHERE principal_id = ? ${ownerId ? 'AND owner_id = ?' : ''} AND ${ACTIVE_LINKED_SHARE_SQL}
     ORDER BY updated_at DESC`,
    ownerId ? [principalId, ownerId] : [principalId]
);

const findShareForAtome = async ({ db, provider, principalId, ownerId, atomeId }) => {
    const shares = await activeSharesForPrincipal(db, principalId, ownerId);
    for (const share of shares || []) {
        if (await isWithinSharedRoot({
            provider,
            ownerId: share.owner_id,
            atomeId,
            rootAtomeId: share.atome_id
        })) return share;
    }
    return null;
};

const statesWithinSharedRoot = async ({ provider, ownerId, rootAtomeId }) => {
    const states = await provider.request(ownerId, 'state:list', {});
    const stateById = new Map((states || []).map((state) => [String(stateAtomeId(state)), state]));
    const within = (state) => {
        let cursor = String(stateAtomeId(state) || '').trim();
        const visited = new Set();
        while (cursor && !visited.has(cursor)) {
            if (isPrivateProgramState(stateById.get(cursor))) return false;
            if (cursor === String(rootAtomeId)) {
                let parent = String(stateParentId(stateById.get(cursor)) || '');
                const ancestors = new Set();
                while (parent && !ancestors.has(parent)) {
                    ancestors.add(parent);
                    if (isPrivateProgramState(stateById.get(parent))) return false;
                    parent = String(stateParentId(stateById.get(parent)) || '');
                }
                return true;
            }
            visited.add(cursor);
            cursor = String(stateParentId(stateById.get(cursor)) || '').trim();
        }
        return false;
    };
    return (states || []).filter(within);
};

const sharePermissions = (share) => parseJson(share?.permissions_json, {});

export {
    ACTIVE_LINKED_SHARE_SQL,
    hasPrivateProgramAncestor,
    findShareForAtome,
    isWithinSharedRoot,
    sharePermissions,
    stateAtomeId,
    stateParentId,
    statesWithinSharedRoot
};
