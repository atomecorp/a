import { AtomeContractError } from './atome_contract_errors.js';
import { hasObjectShape, normalizeStringField } from './atome_universal_contract.js';

export const ACCESSIBLE_ATOM_NODE_VERSION = 1;

export const ACCESSIBLE_ATOM_ROLES = Object.freeze([
    'generic',
    'project',
    'group',
    'region',
    'text',
    'shape',
    'image',
    'video',
    'audio',
    'waveform',
    'button',
    'link',
    'input',
    'control',
    'none'
]);

export const ACCESSIBLE_ATOM_ACTIONS = Object.freeze([
    'activate',
    'focus',
    'select',
    'edit',
    'rename',
    'open',
    'close',
    'play',
    'pause',
    'increment',
    'decrement'
]);

export const ACCESSIBLE_ATOM_RELATIONS = Object.freeze([
    'labelled_by',
    'described_by',
    'controls',
    'owns',
    'contains',
    'child_of',
    'parent_of',
    'next',
    'previous'
]);

export const ACCESSIBLE_ATOM_NODE_SCHEMA = Object.freeze({
    id: 'string',
    role: ACCESSIBLE_ATOM_ROLES,
    label: 'string|null',
    description: 'string|null',
    alt_text: 'string|null',
    focusable: 'boolean',
    visible_to_accessibility: 'boolean',
    actions: 'AccessibleAtomAction[]',
    relations: 'AccessibleAtomRelation[]'
});

const ROLE_SET = new Set(ACCESSIBLE_ATOM_ROLES);
const ACTION_SET = new Set(ACCESSIBLE_ATOM_ACTIONS);
const RELATION_SET = new Set(ACCESSIBLE_ATOM_RELATIONS);
const DEFAULT_FOCUSABLE_ROLES = new Set(['button', 'link', 'input', 'control']);

const toKey = (value) => normalizeStringField(value) || null;

const toBoolean = (value, fallback = false) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return fallback;
};

const readProperties = (record = {}) => (
    hasObjectShape(record.properties) ? record.properties : {}
);

const readAccessibility = (record = {}) => {
    const properties = readProperties(record);
    if (hasObjectShape(record.accessibility)) return record.accessibility;
    return hasObjectShape(properties.accessibility) ? properties.accessibility : {};
};

const pushDiagnostic = (diagnostics, code, details = {}) => {
    diagnostics.push({ code, ...details });
};

const normalizeRole = (role, diagnostics) => {
    const normalized = toKey(role) || 'generic';
    if (ROLE_SET.has(normalized)) return normalized;
    pushDiagnostic(diagnostics, 'unsupported_role', { role: normalized });
    return 'generic';
};

const normalizeAction = (action, diagnostics) => {
    const source = hasObjectShape(action) ? action : { type: action };
    const type = toKey(source.type || source.action || source.id || source.name);
    if (!type || !ACTION_SET.has(type)) {
        pushDiagnostic(diagnostics, 'invalid_action', { action });
        return null;
    }
    return {
        type,
        label: toKey(source.label) || null,
        disabled: toBoolean(source.disabled, false)
    };
};

const normalizeActions = (actions, diagnostics) => {
    const seen = new Set();
    return (Array.isArray(actions) ? actions : [])
        .map((action) => normalizeAction(action, diagnostics))
        .filter(Boolean)
        .filter((action) => {
            if (seen.has(action.type)) return false;
            seen.add(action.type);
            return true;
        });
};

const normalizeRelation = (relation, diagnostics) => {
    const source = hasObjectShape(relation) ? relation : {};
    const type = toKey(source.type || source.relation);
    const targetId = toKey(source.target_id || source.targetId || source.id || source.target);
    if (!type || !RELATION_SET.has(type) || !targetId) {
        pushDiagnostic(diagnostics, 'invalid_relation', { relation });
        return null;
    }
    return {
        type,
        target_id: targetId
    };
};

const normalizeRelations = (relations, diagnostics) => {
    const seen = new Set();
    return (Array.isArray(relations) ? relations : [])
        .map((relation) => normalizeRelation(relation, diagnostics))
        .filter(Boolean)
        .filter((relation) => {
            const key = `${relation.type}:${relation.target_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

const inferRole = (record = {}, accessibility = {}) => (
    accessibility.role
    || record.role
    || record.type
    || record.kind
    || 'generic'
);

const inferLabel = (record = {}, properties = {}, accessibility = {}) => (
    toKey(accessibility.label)
    || toKey(accessibility.name)
    || toKey(record.label)
    || toKey(record.name)
    || toKey(record.meta?.name)
    || toKey(properties.label)
    || toKey(properties.name)
    || toKey(properties.text)
    || null
);

const inferDescription = (record = {}, properties = {}, accessibility = {}) => (
    toKey(accessibility.description)
    || toKey(record.description)
    || toKey(record.meta?.description)
    || toKey(properties.description)
    || null
);

const inferAltText = (properties = {}, accessibility = {}) => (
    toKey(accessibility.alt_text)
    || toKey(accessibility.altText)
    || toKey(properties.alt_text)
    || toKey(properties.altText)
    || toKey(properties.alt)
    || null
);

export function sanitizeAccessibleAtomNode(record = {}, options = {}) {
    const diagnostics = [];
    const properties = readProperties(record);
    const accessibility = readAccessibility(record);
    const id = toKey(record.id || record.atome_id || record.atomeId || accessibility.id || options.id);
    if (!id) pushDiagnostic(diagnostics, 'missing_id');

    const role = normalizeRole(inferRole(record, accessibility), diagnostics);
    const actions = normalizeActions(accessibility.actions || record.actions, diagnostics);
    const focusable = toBoolean(
        accessibility.focusable ?? record.focusable ?? properties.focusable,
        actions.length > 0 || DEFAULT_FOCUSABLE_ROLES.has(role)
    );
    const hidden = toBoolean(accessibility.hidden ?? accessibility.aria_hidden ?? accessibility.ariaHidden, false);
    const visibleToAccessibility = toBoolean(
        accessibility.visible_to_accessibility ?? accessibility.visibleToAccessibility,
        !hidden
    );
    const node = {
        id,
        version: ACCESSIBLE_ATOM_NODE_VERSION,
        role,
        label: inferLabel(record, properties, accessibility),
        description: inferDescription(record, properties, accessibility),
        alt_text: inferAltText(properties, accessibility),
        focusable,
        visible_to_accessibility: visibleToAccessibility,
        actions,
        relations: normalizeRelations(accessibility.relations || record.relations, diagnostics)
    };
    return {
        ok: diagnostics.length === 0,
        node,
        diagnostics
    };
}

export function assertAccessibleAtomNode(record = {}, options = {}) {
    const result = sanitizeAccessibleAtomNode(record, options);
    if (!result.ok) {
        throw new AtomeContractError('Invalid AccessibleAtomNode', {
            diagnostics: result.diagnostics
        });
    }
    return result.node;
}
