import {
    formatCanonicalAtome,
    normalizeCanonicalAtome
} from '../atome/shared/atome_contract.js';

function sanitizeBoundaryAtomeProperties(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    const id = source.id || source.atome_id || source.atomeId || 'boundary_atome';
    const type = source.type || source.atome_type || source.atomeType || source.kind || 'generic';
    return normalizeCanonicalAtome({
        id,
        type,
        properties: source.properties,
        particles: source.particles,
        data: source.data
    }, {
        boundaryAdapter: true
    }).atome.properties;
}

const resolveSyncAtomeType = (...candidates) => {
    for (const candidate of candidates) {
        const value = String(candidate == null ? '' : candidate).trim().toLowerCase();
        if (!value || value === 'atome') continue;
        return value;
    }
    return null;
};

function formatAtome(obj) {
    if (!obj) return null;
    const properties = sanitizeBoundaryAtomeProperties(obj);
    return formatCanonicalAtome({
        id: obj.id || obj.atome_id,
        type: obj.type || obj.atome_type,
        kind: obj.kind || properties.kind || null,
        renderer: obj.renderer || properties.renderer || null,
        meta: {
            ...(obj.meta && typeof obj.meta === 'object' ? obj.meta : {}),
            owner_id: obj.meta?.owner_id || obj.owner_id || obj.owner || null,
            parent_id: obj.meta?.parent_id || obj.parent_id || obj.parent || null,
            project_id: obj.meta?.project_id || obj.project_id || null,
            created_at: obj.meta?.created_at || obj.created_at || null,
            updated_at: obj.meta?.updated_at || obj.updated_at || null
        },
        traits: Array.isArray(obj.traits) ? obj.traits : [],
        properties
    }, {
        universal: true
    });
}

export {
    formatAtome,
    resolveSyncAtomeType,
    sanitizeBoundaryAtomeProperties
};
