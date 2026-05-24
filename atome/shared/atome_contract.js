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

class AtomeContractError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'AtomeContractError';
        this.details = details;
    }
}

const normalizeStringField = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const readTypeDefinition = (type, typeDefinitions = {}) => {
    if (!type) return null;
    if (typeof typeDefinitions === 'function') {
        const definition = typeDefinitions(type);
        return hasObjectShape(definition) ? definition : null;
    }
    if (hasObjectShape(typeDefinitions) && hasObjectShape(typeDefinitions[type])) {
        return typeDefinitions[type];
    }
    return null;
};

const validateSchemaValue = (key, value, rule = {}) => {
    const type = String(rule.type || '').trim();
    if (!type || value == null) return;
    const actual = Array.isArray(value) ? 'array' : typeof value;
    const valid = (() => {
        if (type === 'array') return Array.isArray(value);
        if (type === 'object') return hasObjectShape(value);
        if (type === 'color') return typeof value === 'string';
        return actual === type;
    })();
    if (!valid) {
        throw new AtomeContractError(`Invalid Atome property type for ${key}`, {
            key,
            expected: type,
            actual
        });
    }
};

const sanitizeAtomeProperties = (properties = {}, options = {}) => {
    if (!hasObjectShape(properties)) return {};
    const schema = hasObjectShape(options.schema) ? options.schema : null;
    const allowUnknown = options.allowUnknownProperties !== false;
    const unknownMode = options.unknownPropertyMode || 'reject';
    const quarantined = hasObjectShape(options.quarantined) ? options.quarantined : null;
    const sanitized = {};
    Object.entries(properties).forEach(([key, value]) => {
        if (!key || value === undefined) return;
        if (RESERVED_PROPERTY_KEYS.has(key)) {
            if (Array.isArray(options.dropped)) options.dropped.push(key);
            return;
        }
        if (schema && !Object.prototype.hasOwnProperty.call(schema, key)) {
            if (allowUnknown) {
                sanitized[key] = value;
                return;
            }
            if (unknownMode === 'quarantine') {
                if (quarantined) quarantined[key] = value;
                return;
            }
            if (unknownMode === 'drop') {
                if (Array.isArray(options.dropped)) options.dropped.push(key);
                return;
            }
            throw new AtomeContractError(`Unknown Atome property: ${key}`, { key });
        }
        if (schema) validateSchemaValue(key, value, schema[key]);
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

const resolveInputProperties = (record = {}, boundaryAdapter = false) => {
    if (hasObjectShape(record.properties)) return record.properties;
    if (!boundaryAdapter) return {};
    if (hasObjectShape(record.particles)) return record.particles;
    if (hasObjectShape(record.data)) return record.data;
    return {};
};

const normalizeCanonicalAtome = (record = {}, options = {}) => {
    if (!hasObjectShape(record)) return null;
    const boundaryAdapter = options.boundaryAdapter === true;
    const usesAliases = record.atome_id != null
        || record.atomeId != null
        || record.atome_type != null
        || record.atomeType != null
        || record.particles != null
        || record.data != null;
    if (usesAliases && !boundaryAdapter) {
        throw new AtomeContractError('Transitional Atome aliases are only accepted at adapter boundaries');
    }

    const id = normalizeStringField(record.id || (boundaryAdapter ? record.atome_id || record.atomeId : null));
    const type = normalizeStringField(record.type || (boundaryAdapter ? record.atome_type || record.atomeType : null));
    if (!id || !type) {
        throw new AtomeContractError('Canonical Atome requires id and type');
    }
    if (options.expectedId && String(options.expectedId) !== id) {
        throw new AtomeContractError('Atome id is immutable', {
            expectedId: String(options.expectedId),
            actualId: id
        });
    }

    const typeDefinition = readTypeDefinition(type, options.typeDefinitions);
    const dropped = [];
    const quarantined = {};
    const schema = hasObjectShape(typeDefinition?.schema) ? typeDefinition.schema : null;
    const allowUnknownProperties = typeDefinition
        ? typeDefinition.allow_unknown_properties !== false && typeDefinition.allowUnknownProperties !== false
        : true;
    const properties = sanitizeAtomeProperties(resolveInputProperties(record, boundaryAdapter), {
        schema,
        allowUnknownProperties,
        unknownPropertyMode: options.unknownPropertyMode || 'reject',
        quarantined,
        dropped
    });

    const definitionTraits = Array.isArray(typeDefinition?.traits) ? typeDefinition.traits : null;
    return {
        atome: {
            id,
            type,
            kind: normalizeStringField(typeDefinition?.kind || record.kind),
            renderer: normalizeStringField(record.renderer),
            meta: hasObjectShape(record.meta) ? { ...record.meta } : {},
            traits: definitionTraits ? definitionTraits.slice() : (Array.isArray(record.traits) ? record.traits.slice() : []),
            properties
        },
        quarantined,
        dropped
    };
};

const formatCanonicalAtome = (record = {}) => {
    try {
        const normalized = normalizeCanonicalAtome(record, { boundaryAdapter: true });
        return normalized?.atome || null;
    } catch (_) {
        return null;
    }
};

export {
    AtomeContractError,
    assertCanonicalPropertyKey,
    formatCanonicalAtome,
    normalizeCanonicalAtome,
    resolveCanonicalProperties,
    sanitizeAtomeProperties
};
