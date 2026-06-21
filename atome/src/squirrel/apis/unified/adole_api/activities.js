import { generateUUID } from '../adole.js';
import { list_atomes, create_atome, alter_atome, get_atome } from './atomes.js';
import {
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
} from './activities_support.js';
import {
    save_project_toolbox_state,
    get_project_toolbox_state,
    save_global_toolbox_state,
    get_global_toolbox_state,
    save_activity_toolbox_state,
    get_activity_toolbox_state
} from './activities_toolbox_state.js';

export {
    save_project_toolbox_state,
    get_project_toolbox_state,
    save_global_toolbox_state,
    get_global_toolbox_state,
    save_activity_toolbox_state,
    get_activity_toolbox_state
};

let currentActivityCache = null;

export async function create_activity(activityName, options = {}, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Please log in first.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const id = options.id || generateUUID();
    const name = String(activityName || options.name || '').trim() || 'activity';
    const key = normalizeKey(options.key || name || id);
    const properties = {
        name,
        activity_name: name,
        activity_key: key,
        icon: options.icon || null,
        order: Number.isFinite(options.order) ? options.order : 0,
        enabled: options.enabled !== false,
        created_at: new Date().toISOString()
    };

    const payload = {
        id,
        atome_id: id,
        type: 'activity',
        atome_type: 'activity',
        owner_id: currentUserId,
        properties
    };

    const result = await create_atome(payload);
    return with_callback(result, callback);
}

export async function list_activities(callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Cannot list activities.';
        const result = {
            tauri: { activities: [], error },
            fastify: { activities: [], error },
            meta: { source: null },
            all: { activities: [] }
        };
        return with_callback(result, callback);
    }

    const listResult = await list_atomes({
        type: 'activity',
        includeShared: false
    });

    const tauriActivities = sortActivities(
        toArray(listResult?.tauri?.atomes).map(normalizeActivity).filter(Boolean)
    );
    const fastifyActivities = sortActivities(
        toArray(listResult?.fastify?.atomes).map(normalizeActivity).filter(Boolean)
    );
    const allActivities = sortActivities(mergeById(tauriActivities, fastifyActivities));

    const result = {
        tauri: { activities: tauriActivities, error: listResult?.tauri?.error || null },
        fastify: { activities: fastifyActivities, error: listResult?.fastify?.error || null },
        meta: listResult?.meta || null,
        all: { activities: allActivities }
    };

    return with_callback(result, callback);
}

export function get_current_activity_id() {
    if (typeof window !== 'undefined' && window.__currentActivity?.id) {
        return window.__currentActivity.id;
    }
    return currentActivityCache?.id || null;
}

export function get_current_activity() {
    if (typeof window !== 'undefined' && window.__currentActivity) {
        return window.__currentActivity;
    }
    return currentActivityCache || null;
}

export async function set_current_activity(activityId, activityName = null, persist = true) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut() || !activityId) return false;

    const payload = {
        id: String(activityId),
        name: activityName || null,
        userId: currentUserId,
        updatedAt: Date.now()
    };

    currentActivityCache = payload;
    updateWindowActivity(payload);
    dispatchActivityChanged(payload);

    if (!persist) return true;

    await alter_atome(currentUserId, {
        current_activity_id: payload.id,
        currentActivityId: payload.id,
        current_activity_name: payload.name || null,
        currentActivityName: payload.name || null
    });

    return true;
}

export async function load_saved_current_activity() {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) return null;

    if (currentActivityCache?.id && (!currentActivityCache.userId || String(currentActivityCache.userId) === String(currentUserId))) {
        return { id: currentActivityCache.id, name: currentActivityCache.name || null };
    }

    const userAtome = await get_atome(currentUserId);
    const raw = userAtome?.atome || userAtome?.data || null;
    if (raw && typeof raw === 'object') {
        const props = raw.properties || raw.particles || raw.data || {};
        const savedId = props.current_activity_id || props.currentActivityId || null;
        const savedName = props.current_activity_name || props.currentActivityName || null;
        if (savedId) {
            const payload = { id: String(savedId), name: savedName || null, userId: currentUserId };
            currentActivityCache = payload;
            updateWindowActivity(payload);
            return { id: payload.id, name: payload.name };
        }
    }

    return null;
}

export async function save_tool_layer(layer = {}, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Please log in first.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const scope = String(layer.scope || '').trim().toLowerCase();
    if (!scope || !['global', 'activity', 'project'].includes(scope)) {
        const error = 'Invalid layer scope. Expected global, activity, or project.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const activityId = layer.activity_id || layer.activityId || null;
    const projectId = resolveProjectId(layer);
    if (scope === 'activity' && !activityId) {
        const error = 'Missing activity id for activity scope.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }
    if (scope === 'project' && !projectId) {
        const error = 'Missing project id for project scope.';
        return with_callback({
            tauri: { success: false, error },
            fastify: { success: false, error }
        }, callback);
    }

    const layerId = String(layer.id || [
        'tool_layer',
        sanitizeLayerIdPart(scope, 'global'),
        sanitizeLayerIdPart(currentUserId, 'user'),
        sanitizeLayerIdPart(activityId, 'all'),
        sanitizeLayerIdPart(projectId, 'all')
    ].join('_'));

    const props = {
        scope,
        activity_id: activityId || null,
        activityId: activityId || null,
        project_id: projectId || null,
        projectId: projectId || null,
        entries: normalizeEntries(layer.entries),
        removed_keys: normalizeRemovedKeys(layer.removed_keys || layer.removedKeys),
        updated_at: new Date().toISOString()
    };

    const existing = await get_atome(layerId).catch(() => null);
    const existingAtome = existing?.atome || existing?.data || null;
    if (existingAtome && typeof existingAtome === 'object') {
        const result = await alter_atome(layerId, props);
        return with_callback(result, callback);
    }

    const payload = {
        id: layerId,
        atome_id: layerId,
        type: 'tool_layer',
        atome_type: 'tool_layer',
        owner_id: currentUserId,
        parent_id: projectId || null,
        project_id: projectId || null,
        properties: props
    };
    const result = await create_atome(payload);
    return with_callback(result, callback);
}

export async function list_tool_layers(options = {}, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        const error = 'No user logged in. Cannot list tool layers.';
        const result = {
            tauri: { layers: [], error },
            fastify: { layers: [], error },
            meta: { source: null },
            all: { layers: [] }
        };
        return with_callback(result, callback);
    }

    const listResult = await list_atomes({
        type: 'tool_layer',
        includeShared: false
    });

    const filterLayer = (layer) => {
        const scopeFilter = String(options.scope || '').trim().toLowerCase();
        const activityFilter = options.activity_id || options.activityId || null;
        const projectFilter = options.project_id || options.projectId || null;
        if (scopeFilter && layer.scope !== scopeFilter) return false;
        if (activityFilter && String(layer.activity_id || '') !== String(activityFilter)) return false;
        if (projectFilter && String(layer.project_id || '') !== String(projectFilter)) return false;
        return true;
    };

    const tauriLayers = sortLayers(
        toArray(listResult?.tauri?.atomes).map(normalizeLayer).filter(Boolean).filter(filterLayer)
    );
    const fastifyLayers = sortLayers(
        toArray(listResult?.fastify?.atomes).map(normalizeLayer).filter(Boolean).filter(filterLayer)
    );
    const allLayers = sortLayers(mergeById(tauriLayers, fastifyLayers));

    const result = {
        tauri: { layers: tauriLayers, error: listResult?.tauri?.error || null },
        fastify: { layers: fastifyLayers, error: listResult?.fastify?.error || null },
        meta: listResult?.meta || null,
        all: { layers: allLayers }
    };
    return with_callback(result, callback);
}

const layersToMenuPatch = (entries = []) => {
    const patch = {};
    entries.forEach((entry) => {
        const key = String(entry?.key || '').trim();
        if (!key) return;
        const next = { ...entry };
        delete next.key;
        patch[key] = next;
    });
    return patch;
};

const mergeLayerEntries = (layers = []) => {
    const entriesByKey = new Map();
    layers.forEach((layer) => {
        const removed = new Set(normalizeRemovedKeys(layer?.removed_keys));
        removed.forEach((key) => {
            entriesByKey.delete(key);
        });
        const entries = normalizeEntries(layer?.entries);
        entries.forEach((entry) => {
            entriesByKey.set(entry.key, { ...entry });
        });
    });
    return Array.from(entriesByKey.values());
};

export async function resolve_tool_context(options = {}, callback) {
    const activityId = options.activity_id || options.activityId || get_current_activity_id() || null;
    const projectId = resolveProjectId(options);

    const layerList = await list_tool_layers();
    const allLayers = toArray(layerList?.all?.layers);

    const globalLayers = sortLayers(allLayers.filter((layer) => layer.scope === 'global'));
    const activityLayers = sortLayers(allLayers.filter((layer) => {
        if (layer.scope !== 'activity') return false;
        if (!activityId) return false;
        return String(layer.activity_id || '') === String(activityId);
    }));
    const projectLayers = sortLayers(allLayers.filter((layer) => {
        if (layer.scope !== 'project') return false;
        if (!projectId) return false;
        return String(layer.project_id || '') === String(projectId);
    }));

    // Additive resolution order:
    // main toolbox (immutable, already in UI) + global + activity + project.
    const orderedLayers = [...globalLayers, ...activityLayers, ...projectLayers];
    const entries = mergeLayerEntries(orderedLayers);
    const menuPatch = layersToMenuPatch(entries);

    const result = {
        ok: true,
        context: {
            activity_id: activityId || null,
            activityId: activityId || null,
            project_id: projectId || null,
            projectId: projectId || null
        },
        layers: {
            global: globalLayers,
            activity: activityLayers,
            project: projectLayers,
            ordered: orderedLayers
        },
        entries,
        menuPatch
    };

    return with_callback(result, callback);
}

export default {
    create_activity,
    list_activities,
    get_current_activity_id,
    get_current_activity,
    set_current_activity,
    load_saved_current_activity,
    save_tool_layer,
    list_tool_layers,
    resolve_tool_context,
    save_project_toolbox_state,
    get_project_toolbox_state,
    save_global_toolbox_state,
    get_global_toolbox_state,
    save_activity_toolbox_state,
    get_activity_toolbox_state
};
