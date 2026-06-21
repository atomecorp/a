import { getSessionState } from './session.js';

const with_callback = (result, callback) => {
    if (typeof callback === 'function') callback(result);
    return result;
};

const getCurrentUserId = () => {
    const state = getSessionState();
    return state?.user?.id || null;
};

const isLoggedOut = () => getSessionState().mode === 'logged_out';

const normalizeKey = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeEntries = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => (entry && typeof entry === 'object' ? { ...entry } : null))
        .filter(Boolean)
        .map((entry) => {
            const key = String(entry.key || '').trim();
            if (!key) return null;
            return { ...entry, key };
        })
        .filter(Boolean);
};

const normalizeRemovedKeys = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => String(entry || '').trim())
        .filter(Boolean);
};

const toArray = (value) => {
    if (Array.isArray(value)) return value;
    return [];
};

const mergeById = (left = [], right = []) => {
    const map = new Map();
    toArray(left).forEach((item) => {
        const id = item?.id || item?.atome_id;
        if (!id) return;
        map.set(String(id), item);
    });
    toArray(right).forEach((item) => {
        const id = item?.id || item?.atome_id;
        if (!id) return;
        if (!map.has(String(id))) {
            map.set(String(id), item);
        }
    });
    return Array.from(map.values());
};

const resolveProjectId = (options = {}) => {
    const explicit = options.projectId || options.project_id || null;
    if (explicit) return explicit;
    if (typeof window !== 'undefined' && window.__currentProject?.id) {
        return window.__currentProject.id;
    }
    if (typeof window !== 'undefined' && window.AdoleAPI?.projects?.getCurrentId) {
        return window.AdoleAPI.projects.getCurrentId();
    }
    return null;
};

const normalizeActivity = (record) => {
    if (!record || typeof record !== 'object') return null;
    const id = record.atome_id || record.id || null;
    const props = record.properties || record.particles || record.data || {};
    const name = String(props.name || props.activity_name || record.name || '').trim();
    const key = normalizeKey(props.activity_key || props.key || name || id || '');
    if (!id || !key) return null;
    return {
        ...record,
        id,
        atome_id: id,
        name: name || key,
        key,
        icon: props.icon || null,
        order: Number.isFinite(props.order) ? props.order : 0,
        enabled: props.enabled !== false,
        properties: props,
        particles: props,
        data: props
    };
};

const normalizeLayer = (record) => {
    if (!record || typeof record !== 'object') return null;
    const id = record.atome_id || record.id || null;
    if (!id) return null;
    const props = record.properties || record.particles || record.data || {};
    const scope = String(props.scope || 'global').trim().toLowerCase();
    if (!scope) return null;
    return {
        ...record,
        id,
        atome_id: id,
        scope,
        activity_id: props.activity_id || props.activityId || null,
        project_id: props.project_id || props.projectId || null,
        entries: normalizeEntries(props.entries),
        removed_keys: normalizeRemovedKeys(props.removed_keys || props.removedKeys),
        updated_at: props.updated_at || props.updatedAt || record.updated_at || record.updatedAt || null,
        properties: props,
        particles: props,
        data: props
    };
};

const sortActivities = (activities = []) => activities.slice().sort((a, b) => {
    const orderA = Number.isFinite(a?.order) ? a.order : 0;
    const orderB = Number.isFinite(b?.order) ? b.order : 0;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = String(a?.name || '').toLowerCase();
    const nameB = String(b?.name || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
});

const sortLayers = (layers = []) => layers.slice().sort((a, b) => {
    const tsA = Date.parse(String(a?.updated_at || '')) || 0;
    const tsB = Date.parse(String(b?.updated_at || '')) || 0;
    if (tsA !== tsB) return tsA - tsB;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
});

const updateWindowActivity = (activity) => {
    if (typeof window === 'undefined') return;
    if (!activity) {
        delete window.__currentActivity;
        return;
    }
    window.__currentActivity = activity;
};

const dispatchActivityChanged = (detail = {}) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('squirrel:activity-changed', { detail }));
};

const sanitizeLayerIdPart = (value, fallback = 'all') => {
    const normalized = normalizeKey(value || fallback);
    return normalized || fallback;
};

export {
    with_callback,
    getCurrentUserId,
    isLoggedOut,
    normalizeKey,
    normalizeEntries,
    normalizeRemovedKeys,
    toArray,
    mergeById,
    resolveProjectId,
    normalizeActivity,
    normalizeLayer,
    sortActivities,
    sortLayers,
    updateWindowActivity,
    dispatchActivityChanged,
    sanitizeLayerIdPart
};
