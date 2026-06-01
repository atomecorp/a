export function atomeProperties(atome) {
    return atome?.properties && typeof atome.properties === 'object' ? atome.properties : {};
}

export function atomeIdOf(atome) {
    return atome?.id || null;
}

export function atomeTypeOf(atome) {
    return String(atome?.type || atome?.kind || '').trim().toLowerCase();
}

export function atomeParentIdOf(atome) {
    const properties = atomeProperties(atome);
    return atome?.meta?.parent_id || properties.parent_id || properties.parentId || null;
}

export function atomeOwnerIdOf(atome) {
    const properties = atomeProperties(atome);
    return atome?.meta?.owner_id || properties.owner_id || properties.ownerId || null;
}

export function atomeCreatorIdOf(atome) {
    const properties = atomeProperties(atome);
    return atome?.meta?.created_by || properties.creator_id || properties.creatorId || null;
}
