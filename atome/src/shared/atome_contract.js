import { AtomeContractError } from './atome_contract_errors.js';
import {
    clonePlainObject,
    getAtomeType,
    hasObjectShape,
    listAtomeTypes,
    normalizeCapabilities,
    normalizeComposition,
    normalizeInterfaces,
    normalizeLifecycle,
    normalizePolicy,
    normalizeSchemaVersion,
    normalizeStringField,
    normalizeUniversalKind,
    normalizeUniversalMeta,
    readRegisteredAtomeType,
    registerAtomeType
} from './atome_universal_contract.js';

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
    'media_type',
    'mediaType',
    'visualType',
    'selected',
    'selection',
    'schema_version',
    'schemaVersion',
    'capabilities',
    'interfaces',
    'composition',
    'policy',
    'lifecycle',
    'last_sync',
    'lastSync',
    'sync_status',
    'syncStatus',
    'created_source',
    'createdSource'
]);

const readTypeDefinition = (type, typeDefinitions = {}) => {
    if (!type) return null;
    if (typeof typeDefinitions === 'function') {
        const definition = typeDefinitions(type);
        return hasObjectShape(definition) ? definition : null;
    }
    if (hasObjectShape(typeDefinitions) && hasObjectShape(typeDefinitions[type])) {
        return typeDefinitions[type];
    }
    const registered = readRegisteredAtomeType(type);
    if (registered) return registered;
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

const sanitizeAtomeEnvelope = (record = {}, options = {}) => {
    const source = hasObjectShape(record) ? record : {};
    const boundaryAdapter = options.boundaryAdapter === true;
    const universal = options.universal === true;
    const envelope = {};
    const meta = clonePlainObject(source.meta);
    const properties = resolveInputProperties(source, boundaryAdapter);
    const quarantined = {};
    const dropped = [];

    Object.entries(source).forEach(([key, value]) => {
        if (value === undefined) return;
        if ([
            'id',
            'atome_id',
            'atomeId',
            'type',
            'atome_type',
            'atomeType',
            'kind',
            'renderer',
            'schema_version',
            'schemaVersion',
            'traits',
            'capabilities',
            'interfaces',
            'composition',
            'policy',
            'lifecycle',
            'properties',
            'particles',
            'data',
            'meta'
        ].includes(key)) {
            envelope[key] = value;
            return;
        }
        if ([
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
            'created_by',
            'createdBy',
            'updated_at',
            'updatedAt',
            'updated_by',
            'updatedBy',
            'status',
            'name',
            'description'
        ].includes(key)) {
            if (universal || boundaryAdapter) meta[key] = value;
            else dropped.push(key);
            return;
        }
        quarantined[key] = value;
    });

    return {
        envelope,
        meta,
        properties,
        quarantined,
        dropped
    };
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
    const universal = options.universal === true;
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
    const envelope = sanitizeAtomeEnvelope(record, { boundaryAdapter, universal });
    const properties = sanitizeAtomeProperties(resolveInputProperties(record, boundaryAdapter), {
        schema,
        allowUnknownProperties,
        unknownPropertyMode: options.unknownPropertyMode || 'reject',
        quarantined,
        dropped
    });

    const definitionTraits = Array.isArray(typeDefinition?.traits) ? typeDefinition.traits : null;
    const atome = {
        id,
        type,
        kind: universal
            ? normalizeUniversalKind(typeDefinition?.kind || record.kind)
            : normalizeStringField(typeDefinition?.kind || record.kind),
        renderer: normalizeStringField(record.renderer),
        meta: universal
            ? normalizeUniversalMeta(envelope.meta, record.meta)
            : (hasObjectShape(record.meta) ? { ...record.meta } : {}),
        traits: definitionTraits ? definitionTraits.slice() : (Array.isArray(record.traits) ? record.traits.slice() : []),
        properties
    };
    if (universal) {
        atome.schema_version = normalizeSchemaVersion(record);
        atome.capabilities = normalizeCapabilities(record.capabilities, typeDefinition?.default_capabilities);
        atome.interfaces = normalizeInterfaces(record.interfaces);
        atome.composition = normalizeComposition(record.composition);
        atome.policy = normalizePolicy(record.policy, typeDefinition?.default_policy);
        atome.lifecycle = normalizeLifecycle(record.lifecycle);
    }
    return {
        atome,
        quarantined,
        dropped: [...dropped, ...envelope.dropped]
    };
};

const formatCanonicalAtome = (record = {}, options = {}) => {
    try {
        const normalized = normalizeCanonicalAtome(record, {
            boundaryAdapter: true,
            universal: options.universal === true,
            typeDefinitions: options.typeDefinitions,
            unknownPropertyMode: options.unknownPropertyMode
        });
        return normalized?.atome || null;
    } catch (_) {
        return null;
    }
};

const toolToUniversalAtome = (tool = {}) => {
    const id = normalizeStringField(tool.id || tool.tool_key || tool.toolKey);
    if (!id) throw new AtomeContractError('Tool projection requires id or tool_key');
    const toolKey = normalizeStringField(tool.tool_key || tool.toolKey || id);
    return normalizeCanonicalAtome({
        id,
        type: `tool.${toolKey}`,
        kind: 'tool',
        renderer: tool.renderer || 'dom',
        schema_version: 1,
        meta: {
            name: tool.name || tool.label || toolKey,
            description: tool.description || null,
            status: tool.status || 'validated'
        },
        traits: ['executable', 'inspectable', 'tool'],
        capabilities: Array.isArray(tool.capabilities)
            ? tool.capabilities.map((capability) => (
                hasObjectShape(capability)
                    ? capability
                    : { key: String(capability), effects: ['read'], risk_level: 'LOW' }
            ))
            : [],
        interfaces: {
            inputs: clonePlainObject(tool.inputs_schema || tool.inputsSchema),
            outputs: clonePlainObject(tool.outputs_schema || tool.outputsSchema),
            events: clonePlainObject(tool.events),
            commands: clonePlainObject(tool.bindings || tool.commands)
        },
        properties: {
            tool_definition: { ...tool, capabilities: undefined }
        },
        policy: tool.policy || {},
        lifecycle: tool.lifecycle || {}
    }, {
        universal: true
    }).atome;
};

export {
    AtomeContractError,
    assertCanonicalPropertyKey,
    formatCanonicalAtome,
    getAtomeType,
    listAtomeTypes,
    normalizeCanonicalAtome,
    registerAtomeType,
    resolveCanonicalProperties,
    sanitizeAtomeEnvelope,
    sanitizeAtomeProperties,
    toolToUniversalAtome,
};
