export const CONDITION_SCHEMA_VERSION = 1;
export const CONDITION_LIST_SCHEMA_VERSION = 1;
export const CONDITION_COMPUTED_PROPERTY_SCHEMA_VERSION = 1;

export const CONDITION_LIST_MODES = Object.freeze({
    STATIC: 'static',
    DYNAMIC: 'dynamic'
});

export const CONDITION_STATES = Object.freeze({
    TRUE: 'true',
    FALSE: 'false',
    UNKNOWN: 'unknown'
});

export const CONDITION_UNKNOWN_POLICIES = Object.freeze({
    EXCLUDE: 'exclude',
    DENY: 'deny',
    WAIT: 'wait'
});

export const CONDITION_DOMAINS = Object.freeze({
    SEARCH: 'search',
    CONTACTS: 'contacts',
    COMMUNICATION: 'communication',
    SHARING: 'sharing',
    PROFILE_VISIBILITY: 'profile_visibility',
    ACL: 'acl',
    CALENDAR: 'calendar',
    AUTOMATION: 'automation',
    REALTIME: 'realtime'
});

export const SECURITY_CONDITION_DOMAINS = Object.freeze(new Set([
    CONDITION_DOMAINS.SHARING,
    CONDITION_DOMAINS.PROFILE_VISIBILITY,
    CONDITION_DOMAINS.ACL,
    CONDITION_DOMAINS.REALTIME
]));

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeString = (value) => String(value == null ? '' : value).trim();
const normalizeStringArray = (value) => Array.from(new Set(
    (Array.isArray(value) ? value : []).map(normalizeString).filter(Boolean)
));

export const conditionNodeKind = (node) => {
    if (!isPlainObject(node)) return null;
    if (typeof node.combinator === 'string') return 'group';
    if (typeof node.source === 'string' && typeof node.field === 'string') return 'condition';
    return null;
};

export const normalizeUnknownPolicy = (value, domain = '') => {
    const candidate = String(value || '').trim().toLowerCase();
    if (Object.values(CONDITION_UNKNOWN_POLICIES).includes(candidate)) return candidate;
    if (SECURITY_CONDITION_DOMAINS.has(String(domain || '').trim().toLowerCase())) {
        return CONDITION_UNKNOWN_POLICIES.DENY;
    }
    if ([CONDITION_DOMAINS.CALENDAR, CONDITION_DOMAINS.AUTOMATION].includes(domain)) {
        return CONDITION_UNKNOWN_POLICIES.WAIT;
    }
    return CONDITION_UNKNOWN_POLICIES.EXCLUDE;
};

export const normalizeConditionSet = (input = {}) => {
    if (!isPlainObject(input)) throw new Error('condition_set_required');
    if (input.schemaVersion !== undefined && Number(input.schemaVersion) !== CONDITION_SCHEMA_VERSION) {
        throw new Error('condition_schema_version_unsupported');
    }
    const now = new Date().toISOString();
    const id = String(input.id || '').trim();
    const name = String(input.name || '').trim();
    if (!id) throw new Error('condition_set_id_required');
    if (!name) throw new Error('condition_set_name_required');
    return {
        schemaVersion: CONDITION_SCHEMA_VERSION,
        id,
        name,
        root: input.root,
        revision: Math.max(1, Number.parseInt(input.revision, 10) || 1),
        createdBy: String(input.createdBy || '').trim() || null,
        createdAt: String(input.createdAt || '').trim() || now,
        updatedAt: String(input.updatedAt || '').trim() || now
    };
};

export const normalizeConditionScope = (input = {}) => {
    if (!isPlainObject(input)) throw new Error('condition_scope_invalid');
    const candidateSource = normalizeString(input.candidateSource || input.candidate_source || 'atome').toLowerCase();
    if (!candidateSource) throw new Error('condition_scope_candidate_source_required');
    return {
        candidateSource,
        projectId: normalizeString(input.projectId || input.project_id) || null,
        rootIds: normalizeStringArray(input.rootIds || input.root_ids),
        types: normalizeStringArray(input.types).map((entry) => entry.toLowerCase()),
        includeShared: input.includeShared === true || input.include_shared === true
    };
};

export const normalizeComputedProperty = (input = {}) => {
    if (!isPlainObject(input)) throw new Error('condition_computed_property_required');
    const id = normalizeString(input.id);
    const name = normalizeString(input.name);
    const resultType = normalizeString(input.resultType || input.result_type || 'any').toLowerCase();
    if (!id) throw new Error('condition_computed_property_id_required');
    if (!name) throw new Error('condition_computed_property_name_required');
    if (!isPlainObject(input.expression)) throw new Error('condition_computed_property_expression_required');
    const now = new Date().toISOString();
    return {
        schemaVersion: CONDITION_COMPUTED_PROPERTY_SCHEMA_VERSION,
        id,
        name,
        resultType,
        unit: normalizeString(input.unit) || null,
        expression: input.expression,
        scope: normalizeConditionScope(input.scope || {}),
        revision: Math.max(1, Number.parseInt(input.revision, 10) || 1),
        createdBy: normalizeString(input.createdBy || input.created_by) || null,
        createdAt: normalizeString(input.createdAt || input.created_at) || now,
        updatedAt: normalizeString(input.updatedAt || input.updated_at) || now
    };
};

export const normalizeConditionList = (input = {}) => {
    if (!isPlainObject(input)) throw new Error('condition_list_required');
    const id = normalizeString(input.id);
    const name = normalizeString(input.name);
    const mode = normalizeString(input.mode).toLowerCase();
    if (!id) throw new Error('condition_list_id_required');
    if (!name) throw new Error('condition_list_name_required');
    if (!Object.values(CONDITION_LIST_MODES).includes(mode)) throw new Error('condition_list_mode_invalid');
    const conditionSetId = normalizeString(input.conditionSetId || input.condition_set_id) || null;
    const memberIds = normalizeStringArray(input.memberIds || input.member_ids);
    if (mode === CONDITION_LIST_MODES.DYNAMIC && !conditionSetId) {
        throw new Error('condition_list_condition_set_required');
    }
    const now = new Date().toISOString();
    return {
        schemaVersion: CONDITION_LIST_SCHEMA_VERSION,
        id,
        name,
        mode,
        scope: normalizeConditionScope(input.scope || {}),
        conditionSetId: mode === CONDITION_LIST_MODES.DYNAMIC ? conditionSetId : null,
        memberIds: mode === CONDITION_LIST_MODES.STATIC ? memberIds : [],
        sort: isPlainObject(input.sort) ? { ...input.sort } : {},
        projection: normalizeStringArray(input.projection),
        revision: Math.max(1, Number.parseInt(input.revision, 10) || 1),
        createdBy: normalizeString(input.createdBy || input.created_by) || null,
        createdAt: normalizeString(input.createdAt || input.created_at) || now,
        updatedAt: normalizeString(input.updatedAt || input.updated_at) || now
    };
};

export const normalizeConditionBinding = (input = {}) => {
    if (!isPlainObject(input)) throw new Error('condition_binding_required');
    const id = String(input.id || '').trim();
    const conditionSetId = String(input.conditionSetId || '').trim();
    const domain = String(input.domain || '').trim().toLowerCase();
    if (!id) throw new Error('condition_binding_id_required');
    if (!conditionSetId) throw new Error('condition_set_id_required');
    if (!Object.values(CONDITION_DOMAINS).includes(domain)) throw new Error('condition_binding_domain_invalid');
    const conditionSetRevision = Math.max(1, Number.parseInt(input.conditionSetRevision, 10) || 1);
    return {
        id,
        conditionSetId,
        conditionSetRevision,
        domain,
        target: isPlainObject(input.target) ? { ...input.target } : {},
        unknownPolicy: normalizeUnknownPolicy(input.unknownPolicy, domain),
        enabled: input.enabled !== false,
        authorizedRevision: SECURITY_CONDITION_DOMAINS.has(domain)
            ? Math.max(0, Number.parseInt(input.authorizedRevision, 10) || 0)
            : conditionSetRevision
    };
};

export const isSecurityConditionDomain = (domain) => SECURITY_CONDITION_DOMAINS.has(
    String(domain || '').trim().toLowerCase()
);
