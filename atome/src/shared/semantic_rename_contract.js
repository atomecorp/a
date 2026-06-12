import { AtomeContractError } from './atome_contract_errors.js';
import { hasObjectShape, normalizeStringField } from './atome_universal_contract.js';

export const SEMANTIC_RENAME_VERSION = 1;
export const SEMANTIC_RENAME_CANONICAL_PROPERTY = 'label';
export const SEMANTIC_RENAME_EVENT_KIND = 'set';

const toKey = (value) => normalizeStringField(value) || null;

const requireRecord = (record = {}) => {
    if (!hasObjectShape(record)) {
        throw new AtomeContractError('Semantic rename record must be an object', {
            code: 'semantic_rename_record_required'
        });
    }
    return record;
};

const recordId = (record = {}) => (
    toKey(record.id)
    || toKey(record.atome_id)
    || toKey(record.atomeId)
    || toKey(record.properties?.id)
);

const readProperties = (record = {}) => (
    hasObjectShape(record.properties) ? record.properties : {}
);

const readAccessibility = (properties = {}) => (
    hasObjectShape(properties.accessibility) ? properties.accessibility : {}
);

export const normalizeSemanticRenameValue = (value) => {
    const label = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!label) {
        throw new AtomeContractError('Semantic rename label is required', {
            code: 'semantic_rename_label_required'
        });
    }
    return label;
};

export const resolveSemanticLabel = (record = {}) => {
    const source = requireRecord(record);
    const properties = readProperties(source);
    const accessibility = readAccessibility(properties);
    return (
        toKey(properties.label)
        || toKey(accessibility.label)
        || toKey(source.meta?.name)
        || toKey(properties.name)
        || toKey(properties.title)
        || toKey(properties.text)
        || recordId(source)
        || null
    );
};

export const buildSemanticRenamePatch = (record = {}, value) => {
    const source = requireRecord(record);
    const properties = readProperties(source);
    const accessibility = readAccessibility(properties);
    const label = normalizeSemanticRenameValue(value);
    return Object.freeze({
        [SEMANTIC_RENAME_CANONICAL_PROPERTY]: label,
        accessibility: Object.freeze({
            ...accessibility,
            label
        })
    });
};

export const buildSemanticRenameEvent = (record = {}, value, options = {}) => {
    const source = requireRecord(record);
    const atomeId = recordId(source);
    const txId = toKey(options.tx_id);
    if (!atomeId) {
        throw new AtomeContractError('Semantic rename Atome id is required', {
            code: 'semantic_rename_atome_id_required'
        });
    }
    if (!txId) {
        throw new AtomeContractError('Semantic rename tx_id is required', {
            code: 'semantic_rename_tx_id_required'
        });
    }
    const gestureId = toKey(options.gesture_id);
    return Object.freeze({
        kind: SEMANTIC_RENAME_EVENT_KIND,
        atome_id: atomeId,
        props: buildSemanticRenamePatch(source, value),
        tx_id: txId,
        ...(gestureId ? { gesture_id: gestureId } : {})
    });
};

export const applySemanticRenameToRecord = (record = {}, value) => {
    const source = requireRecord(record);
    const properties = readProperties(source);
    const patch = buildSemanticRenamePatch(source, value);
    return Object.freeze({
        ...source,
        properties: Object.freeze({
            ...properties,
            ...patch
        })
    });
};
