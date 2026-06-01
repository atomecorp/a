import { normalizeCanonicalAtome, sanitizeAtomeProperties } from '../atome/shared/atome_contract.js';

const hasObjectShape = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

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

const safeParseJson = (value) => {
    if (value == null) return null;
    if (hasObjectShape(value)) return value;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
};

const normalizeStoredProperties = (properties = {}) => (
    sanitizeAtomeProperties(hasObjectShape(properties) ? properties : {})
);

const coerceStoredKind = (candidate, type) => {
    const value = String(candidate || '').trim();
    if (UNIVERSAL_KINDS.has(value)) return value;
    const typeFamily = String(type || '').split('.')[0];
    if (UNIVERSAL_KINDS.has(typeFamily)) return typeFamily;
    if (['shape', 'text', 'rect', 'circle', 'svg'].includes(value) || ['shape', 'text', 'rect', 'circle', 'svg'].includes(typeFamily)) {
        return 'visual';
    }
    if (['image', 'video', 'audio', 'waveform'].includes(value) || ['image', 'video', 'audio', 'waveform'].includes(typeFamily)) {
        return 'media';
    }
    return 'generic';
};

const projectStoredAtome = ({ row, properties = {}, kind = null } = {}) => {
    if (!row || typeof row !== 'object') return null;
    const atomeId = row.id || row.atome_id || null;
    const atomeType = row.type || row.atome_type || kind || null;
    if (!atomeId || !atomeType) return null;
    return normalizeCanonicalAtome({
        id: atomeId,
        type: atomeType,
        kind: coerceStoredKind(kind || row.kind, atomeType),
        renderer: row.renderer || properties.renderer || null,
        meta: {
            owner_id: row.owner_id || row.ownerId || null,
            parent_id: row.parent_id || row.parentId || null,
            created_at: row.created_at || row.createdAt || null,
            updated_at: row.updated_at || row.updatedAt || null,
            created_by: row.creator_id || row.creatorId || null,
            deleted_at: row.deleted_at || row.deletedAt || null,
            sync_status: row.sync_status || row.syncStatus || null,
            last_sync: row.last_sync || row.lastSync || null,
            created_source: row.created_source || row.createdSource || null
        },
        properties: normalizeStoredProperties(properties)
    }, {
        universal: true
    }).atome;
};

const projectStoredStateCurrent = (row = {}) => {
    if (!row || typeof row !== 'object') return null;
    const properties = normalizeStoredProperties(safeParseJson(row.properties) || {});
    const atomeType = row.type || row.atome_type || row.kind || properties.kind || 'generic';
    const kind = coerceStoredKind(row.kind || properties.kind, atomeType);
    return normalizeCanonicalAtome({
        id: row.id || row.atome_id,
        type: atomeType,
        kind,
        meta: {
            owner_id: row.owner_id || row.ownerId || null,
            parent_id: row.parent_id || row.parentId || null,
            project_id: row.project_id || row.projectId || null,
            updated_at: row.updated_at || row.updatedAt || null,
            version: row.version || null
        },
        properties
    }, {
        universal: true
    }).atome;
};

const projectStoredEvent = (row = {}) => {
    if (!row || typeof row !== 'object') return null;
    return {
        id: row.id,
        ts: row.ts,
        atome_id: row.atome_id || null,
        project_id: row.project_id || null,
        kind: row.kind,
        payload: safeParseJson(row.payload) || {},
        actor: safeParseJson(row.actor) || null,
        tx_id: row.tx_id || null,
        gesture_id: row.gesture_id || null
    };
};

export {
    projectStoredAtome,
    projectStoredEvent,
    projectStoredStateCurrent
};
