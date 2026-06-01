import { AtomeContractError } from './atome_contract_errors.js';

const UNIVERSAL_KINDS = new Set([
    'application',
    'ui',
    'tool',
    'api',
    'agent',
    'workflow',
    'service',
    'protocol',
    'data_model',
    'capability',
    'component',
    'connector',
    'automation',
    'pack',
    'policy',
    'visual',
    'media',
    'project',
    'user',
    'generic'
]);

const CAPABILITY_EFFECTS = new Set([
    'read',
    'write',
    'persistent',
    'external_write',
    'network',
    'execution'
]);

const CAPABILITY_RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const POLICY_VISIBILITIES = new Set([
    'private',
    'group',
    'enterprise',
    'public_free',
    'public_paid'
]);

const REGISTERED_ATOME_TYPES = new Map();

const hasObjectShape = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeStringField = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const clonePlainObject = (value, fallback = {}) => (
    hasObjectShape(value) ? { ...value } : { ...fallback }
);

const cloneArray = (value) => (Array.isArray(value) ? value.slice() : []);

const normalizeStringArray = (value) => (
    Array.isArray(value)
        ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
        : []
);

const readRegisteredAtomeType = (type) => {
    const key = normalizeStringField(type);
    return key && REGISTERED_ATOME_TYPES.has(key) ? REGISTERED_ATOME_TYPES.get(key) : null;
};

const normalizeSchemaVersion = (record = {}) => {
    const value = record.schema_version ?? record.schemaVersion ?? 1;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        throw new AtomeContractError('Atome schema_version must be a positive integer', {
            schema_version: value
        });
    }
    return number;
};

const normalizeUniversalKind = (kind) => {
    const normalized = normalizeStringField(kind) || 'generic';
    if (!UNIVERSAL_KINDS.has(normalized)) {
        throw new AtomeContractError(`Unsupported universal Atome kind: ${normalized}`, {
            kind: normalized
        });
    }
    return normalized;
};

const normalizeUniversalMeta = (record = {}, existingMeta = {}) => {
    const meta = clonePlainObject(existingMeta);
    const read = (...keys) => {
        for (const key of keys) {
            if (record[key] != null) return record[key];
            if (meta[key] != null) return meta[key];
        }
        return null;
    };
    return {
        name: normalizeStringField(read('name')) || null,
        description: normalizeStringField(read('description')) || null,
        created_at: normalizeStringField(read('created_at', 'createdAt')) || null,
        created_by: normalizeStringField(read('created_by', 'createdBy')) || null,
        updated_at: normalizeStringField(read('updated_at', 'updatedAt')) || null,
        updated_by: normalizeStringField(read('updated_by', 'updatedBy')) || null,
        owner_id: normalizeStringField(read('owner_id', 'ownerId', 'owner')) || null,
        parent_id: normalizeStringField(read('parent_id', 'parentId', 'parent')) || null,
        project_id: normalizeStringField(read('project_id', 'projectId')) || null,
        status: normalizeStringField(read('status')) || 'draft',
        ...Object.fromEntries(
            Object.entries(meta).filter(([key]) => ![
                'name',
                'description',
                'created_at',
                'createdAt',
                'created_by',
                'createdBy',
                'updated_at',
                'updatedAt',
                'updated_by',
                'updatedBy',
                'owner_id',
                'ownerId',
                'owner',
                'parent_id',
                'parentId',
                'parent',
                'project_id',
                'projectId',
                'status'
            ].includes(key))
        )
    };
};

const normalizeCapability = (capability = {}) => {
    if (!hasObjectShape(capability)) {
        throw new AtomeContractError('Atome capability must be an object');
    }
    const key = normalizeStringField(capability.key);
    if (!key) throw new AtomeContractError('Atome capability requires key');
    const effects = normalizeStringArray(capability.effects);
    effects.forEach((effect) => {
        if (!CAPABILITY_EFFECTS.has(effect)) {
            throw new AtomeContractError(`Unsupported Atome capability effect: ${effect}`, {
                key,
                effect
            });
        }
    });
    const riskLevel = String(capability.risk_level || capability.riskLevel || 'LOW').toUpperCase();
    if (!CAPABILITY_RISK_LEVELS.has(riskLevel)) {
        throw new AtomeContractError(`Unsupported Atome capability risk level: ${riskLevel}`, {
            key,
            risk_level: riskLevel
        });
    }
    return {
        key,
        description: normalizeStringField(capability.description) || null,
        inputs_schema: clonePlainObject(capability.inputs_schema || capability.inputsSchema),
        outputs_schema: clonePlainObject(capability.outputs_schema || capability.outputsSchema),
        effects,
        risk_level: riskLevel,
        permissions: normalizeStringArray(capability.permissions)
    };
};

const normalizeCapabilities = (recordCapabilities, definitionCapabilities) => (
    (Array.isArray(recordCapabilities) ? recordCapabilities : cloneArray(definitionCapabilities))
        .map((capability) => normalizeCapability(capability))
);

const normalizeInterfaces = (interfaces = {}) => ({
    inputs: clonePlainObject(interfaces.inputs),
    outputs: clonePlainObject(interfaces.outputs),
    events: clonePlainObject(interfaces.events),
    commands: clonePlainObject(interfaces.commands)
});

const normalizeComposition = (composition = {}) => ({
    dependencies: cloneArray(composition.dependencies),
    children: cloneArray(composition.children),
    ports: cloneArray(composition.ports),
    compatible_with: cloneArray(composition.compatible_with || composition.compatibleWith)
});

const normalizePolicy = (policy = {}, defaultPolicy = {}) => {
    const source = hasObjectShape(policy) ? policy : {};
    const defaults = hasObjectShape(defaultPolicy) ? defaultPolicy : {};
    const visibility = normalizeStringField(source.visibility || defaults.visibility) || 'private';
    if (!POLICY_VISIBILITIES.has(visibility)) {
        throw new AtomeContractError(`Unsupported Atome policy visibility: ${visibility}`, {
            visibility
        });
    }
    return {
        permissions: normalizeStringArray(source.permissions || defaults.permissions),
        visibility,
        license: normalizeStringField(source.license || defaults.license) || null,
        pricing: source.pricing ?? defaults.pricing ?? null,
        entitlements: cloneArray(source.entitlements || defaults.entitlements)
    };
};

const normalizeLifecycle = (lifecycle = {}) => ({
    version: normalizeStringField(lifecycle.version) || '1.0.0',
    migrations: cloneArray(lifecycle.migrations),
    compatibility: clonePlainObject(lifecycle.compatibility),
    deprecation: lifecycle.deprecation ?? null,
    archived_at: normalizeStringField(lifecycle.archived_at || lifecycle.archivedAt) || null
});

const registerAtomeType = (definition = {}) => {
    if (!hasObjectShape(definition)) {
        throw new AtomeContractError('Atome type definition must be an object');
    }
    const type = normalizeStringField(definition.type || definition.name);
    if (!type) throw new AtomeContractError('Atome type definition requires type');
    const kind = definition.kind ? normalizeUniversalKind(definition.kind) : null;
    const normalized = {
        ...definition,
        type,
        kind,
        schema: clonePlainObject(definition.schema),
        allow_unknown_properties: definition.allow_unknown_properties !== false && definition.allowUnknownProperties !== false,
        traits: normalizeStringArray(definition.traits || definition.default_traits || definition.defaultTraits),
        default_capabilities: normalizeCapabilities(definition.default_capabilities || definition.defaultCapabilities, []),
        default_policy: normalizePolicy(definition.default_policy || definition.defaultPolicy)
    };
    REGISTERED_ATOME_TYPES.set(type, normalized);
    return normalized;
};

const getAtomeType = (type) => readRegisteredAtomeType(type);

const listAtomeTypes = () => Array.from(REGISTERED_ATOME_TYPES.values());

export {
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
};
