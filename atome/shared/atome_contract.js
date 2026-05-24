const RESERVED_PROPERTY_KEYS = new Set([
    'id',
    'atome_id',
    'atomeId',
    'type',
    'atome_type',
    'atomeType',
    'owner',
    'owner_id',
    'ownerId',
    'parent',
    'parent_id',
    'parentId',
    'project_id',
    'projectId',
    'creator_id',
    'creatorId',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
    'deleted_at',
    'deletedAt',
    'last_sync',
    'lastSync',
    'sync_status',
    'syncStatus',
    'created_source',
    'createdSource'
]);

const hasObjectShape = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const sanitizeAtomeProperties = (properties = {}) => {
    if (!hasObjectShape(properties)) return {};
    const sanitized = {};
    Object.entries(properties).forEach(([key, value]) => {
        if (!key || RESERVED_PROPERTY_KEYS.has(key) || value === undefined) return;
        sanitized[key] = value;
    });
    return sanitized;
};

const assertCanonicalPropertyKey = (key) => {
    const normalized = String(key || '').trim();
    if (!normalized) {
        throw new Error('Invalid empty Atome property key');
    }
    if (RESERVED_PROPERTY_KEYS.has(normalized)) {
        throw new Error(`Reserved Atome envelope field cannot be stored as property: ${normalized}`);
    }
    return normalized;
};

const resolveCanonicalProperties = (record = {}) => {
    if (hasObjectShape(record?.properties)) return sanitizeAtomeProperties(record.properties);
    return {};
};

const formatCanonicalAtome = (record = {}) => {
    if (!hasObjectShape(record)) return null;
    const id = record.id || record.atome_id || null;
    const type = record.type || record.atome_type || null;
    if (!id || !type) return null;
    return {
        id,
        type,
        kind: record.kind || null,
        renderer: record.renderer || null,
        meta: hasObjectShape(record.meta) ? record.meta : {},
        traits: Array.isArray(record.traits) ? record.traits.slice() : [],
        properties: resolveCanonicalProperties(record)
    };
};

export {
    assertCanonicalPropertyKey,
    formatCanonicalAtome,
    resolveCanonicalProperties,
    sanitizeAtomeProperties
};
