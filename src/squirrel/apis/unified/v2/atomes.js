import { TauriAdapter, FastifyAdapter, checkBackends, generateUUID } from '../adole.js';
import { isTauriRuntime } from './runtime.js';
import { getSessionState } from './session.js';

const adapters = {
    tauri: TauriAdapter,
    fastify: FastifyAdapter
};

const normalizeAtomeRecord = (record) => {
    if (!record || typeof record !== 'object') return null;
    const id = record.atome_id || record.id || null;
    const type = record.atome_type || record.type || record.kind || null;
    const ownerId = record.owner_id || record.ownerId || record.owner || null;
    const parentId = record.parent_id || record.parentId || record.parent || null;
    const properties = record.particles || record.properties || record.data || {};
    return {
        ...record,
        atome_id: id || record.atome_id,
        id: id || record.atome_id,
        atome_type: type || record.atome_type,
        type: type || record.atome_type,
        owner_id: ownerId || record.owner_id,
        parent_id: parentId || record.parent_id,
        particles: properties,
        properties,
        data: properties
    };
};

const extractUserId = (user) => {
    if (!user) return null;
    return user.user_id || user.userId || user.id || user.atome_id || null;
};

const getCurrentUserId = () => {
    const state = getSessionState();
    return state?.user?.id || null;
};

const isAnonymous = () => getSessionState().mode === 'anonymous';

const filterByOwner = (records, userId, { allowCreator = false } = {}) => {
    if (!Array.isArray(records) || !userId) return [];
    const resolved = String(userId);
    return records.filter((record) => {
        const ownerId = record.owner_id || record.ownerId || record.owner || record?.properties?.owner_id || null;
        if (ownerId && String(ownerId) === resolved) return true;
        if (allowCreator && !ownerId) {
            const creatorId = record.creator_id || record.creatorId || record?.properties?.creator_id || null;
            if (creatorId && String(creatorId) === resolved) return true;
        }
        const pendingOwner = record._pending_owner_id || record.pending_owner_id || record?.properties?._pending_owner_id || null;
        if (pendingOwner && String(pendingOwner) === resolved) return true;
        return false;
    });
};

const listOnBackend = async (backend, options, currentUserId, skipOwner) => {
    const adapter = adapters[backend];
    if (!adapter?.atome?.list) return { ok: false, list: [], error: 'backend_unavailable' };
    const explicitOwner = options.ownerId || options.owner_id || null;
    const query = {
        atomeType: options.type || options.atomeType || options.atome_type || null,
        ownerId: skipOwner ? (explicitOwner || null) : (explicitOwner || currentUserId || null),
        parentId: options.projectId || options.project_id || options.parentId || options.parent_id || null,
        limit: options.limit,
        offset: options.offset,
        includeDeleted: options.includeDeleted
    };
    const result = await adapter.atome.list(query);
    const ok = !!(result?.ok || result?.success);
    const list = Array.isArray(result?.atomes) ? result.atomes : Array.isArray(result?.data) ? result.data : [];
    return { ok, list: list.map(normalizeAtomeRecord).filter(Boolean), raw: result, error: ok ? null : (result?.error || 'list_failed') };
};

const canUseFastify = async (currentUserId) => {
    if (!FastifyAdapter?.getToken?.()) return false;
    try {
        const me = await FastifyAdapter.auth.me();
        const user = normalizeAtomeRecord(me?.user || me?.data?.user || me?.user_data || null);
        const id = extractUserId(me?.user || me?.data?.user || null);
        if (id && currentUserId && String(id) === String(currentUserId)) {
            return true;
        }
    } catch (_) { }
    return false;
};

export async function list_atomes(options = {}, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        const error = 'No authenticated user. Cannot list atomes.';
        const result = {
            tauri: { atomes: [], error },
            fastify: { atomes: [], error },
            meta: { source: null }
        };
        if (typeof callback === 'function') callback(result);
        return result;
    }

    const runtimeTauri = isTauriRuntime();
    const primary = runtimeTauri ? 'tauri' : 'fastify';
    const secondary = runtimeTauri ? 'fastify' : 'tauri';
    const atomeType = options.type || options.atomeType || options.atome_type || null;
    const skipOwnerFilter = options.skipOwner === true || options.ownerId === '*' || options.owner_id === '*' || options.ownerId === 'all' || options.owner_id === 'all';
    const allowCrossOwner = skipOwnerFilter && (options.includeShared === true || atomeType === 'user' || atomeType === 'share_request' || atomeType === 'share_policy' || atomeType === 'share_permission');
    const allowCreatorMatch = options.allowCreator !== false;

    const results = {
        tauri: { atomes: [], error: null },
        fastify: { atomes: [], error: null },
        meta: { source: primary }
    };

    const primaryResult = await listOnBackend(primary, options, currentUserId, allowCrossOwner);
    results[primary] = { atomes: primaryResult.list, error: primaryResult.error };

    if (runtimeTauri && !isAnonymous() && (options.includeShared || primaryResult.list.length === 0)) {
        const allowFastify = await canUseFastify(currentUserId);
        if (allowFastify) {
            const secondaryResult = await listOnBackend(secondary, options, currentUserId, allowCrossOwner);
            results[secondary] = { atomes: secondaryResult.list, error: secondaryResult.error };
            if (primaryResult.list.length === 0 && secondaryResult.list.length > 0) {
                results.meta.preferFastify = true;
            }
            if (options.includeShared && secondaryResult.list.length > 0) {
                const merged = new Map();
                primaryResult.list.forEach((item) => merged.set(item.atome_id || item.id, item));
                secondaryResult.list.forEach((item) => {
                    const key = item.atome_id || item.id;
                    if (!merged.has(key)) merged.set(key, item);
                });
                results[primary].atomes = Array.from(merged.values());
                results.meta.merged = true;
            }
        }
    }

    if (!allowCrossOwner) {
        const filteredPrimary = filterByOwner(results[primary].atomes, currentUserId, { allowCreator: allowCreatorMatch });
        results[primary].atomes = filteredPrimary;
        if (results[secondary]?.atomes?.length) {
            results[secondary].atomes = filterByOwner(results[secondary].atomes, currentUserId, { allowCreator: allowCreatorMatch });
        }
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

export async function create_atome(options = {}, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
        const error = 'No user logged in. Please log in first.';
        const result = {
            tauri: { success: false, error },
            fastify: { success: false, error }
        };
        if (typeof callback === 'function') callback(result);
        return result;
    }

    const runtimeTauri = isTauriRuntime();
    const primary = runtimeTauri ? 'tauri' : 'fastify';
    const secondary = runtimeTauri ? 'fastify' : 'tauri';

    const atomeId = options.id || generateUUID();
    const atomeType = options.type || options.kind || 'shape';
    const projectId = options.projectId || options.project_id || null;
    const parentId = options.parentId || options.parent_id || projectId || null;
    const properties = options.properties || options.particles || options.data || options || {};

    const payload = {
        id: atomeId,
        atomeId,
        atome_id: atomeId,
        type: atomeType,
        atomeType: atomeType,
        parentId,
        parent_id: parentId,
        ownerId: options.ownerId || options.owner_id || currentUserId,
        properties
    };

    const primaryResult = await adapters[primary].atome.create(payload);
    const okPrimary = !!(primaryResult?.ok || primaryResult?.success);
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    results[primary] = { success: okPrimary, data: primaryResult, error: okPrimary ? null : primaryResult?.error };

    if (okPrimary && runtimeTauri && !isAnonymous() && adapters[secondary]?.getToken?.()) {
        try {
            const secondaryResult = await adapters[secondary].atome.create(payload);
            const okSecondary = !!(secondaryResult?.ok || secondaryResult?.success);
            results[secondary] = { success: okSecondary, data: secondaryResult, error: okSecondary ? null : secondaryResult?.error };
        } catch (e) {
            results[secondary] = { success: false, data: null, error: e?.message || 'secondary_failed' };
        }
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

export async function alter_atome(atomeId, properties = {}, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !atomeId) {
        const error = 'Missing atomeId or user.';
        const result = {
            tauri: { success: false, error },
            fastify: { success: false, error }
        };
        if (typeof callback === 'function') callback(result);
        return result;
    }

    const runtimeTauri = isTauriRuntime();
    const primary = runtimeTauri ? 'tauri' : 'fastify';
    const secondary = runtimeTauri ? 'fastify' : 'tauri';

    const payload = properties?.properties || properties?.particles || properties || {};

    const primaryResult = await adapters[primary].atome.alter(atomeId, payload);
    const okPrimary = !!(primaryResult?.ok || primaryResult?.success);
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    results[primary] = { success: okPrimary, data: primaryResult, error: okPrimary ? null : primaryResult?.error };

    if (okPrimary && runtimeTauri && !isAnonymous() && adapters[secondary]?.getToken?.()) {
        try {
            const secondaryResult = await adapters[secondary].atome.alter(atomeId, payload);
            const okSecondary = !!(secondaryResult?.ok || secondaryResult?.success);
            results[secondary] = { success: okSecondary, data: secondaryResult, error: okSecondary ? null : secondaryResult?.error };
        } catch (e) {
            results[secondary] = { success: false, data: null, error: e?.message || 'secondary_failed' };
        }
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

export async function delete_atome(atomeId, callback) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !atomeId) {
        const error = 'Missing atomeId or user.';
        const result = {
            tauri: { success: false, error },
            fastify: { success: false, error }
        };
        if (typeof callback === 'function') callback(result);
        return result;
    }

    const runtimeTauri = isTauriRuntime();
    const primary = runtimeTauri ? 'tauri' : 'fastify';
    const secondary = runtimeTauri ? 'fastify' : 'tauri';

    const primaryResult = await adapters[primary].atome.softDelete(atomeId);
    const okPrimary = !!(primaryResult?.ok || primaryResult?.success);
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    results[primary] = { success: okPrimary, data: primaryResult, error: okPrimary ? null : primaryResult?.error };

    if (okPrimary && runtimeTauri && !isAnonymous() && adapters[secondary]?.getToken?.()) {
        try {
            const secondaryResult = await adapters[secondary].atome.softDelete(atomeId);
            const okSecondary = !!(secondaryResult?.ok || secondaryResult?.success);
            results[secondary] = { success: okSecondary, data: secondaryResult, error: okSecondary ? null : secondaryResult?.error };
        } catch (e) {
            results[secondary] = { success: false, data: null, error: e?.message || 'secondary_failed' };
        }
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

export async function realtime_patch(atomeId, properties = {}, callback) {
    const runtimeTauri = isTauriRuntime();
    const primary = runtimeTauri ? 'tauri' : 'fastify';
    const adapter = adapters[primary];
    if (!adapter?.atome?.realtime) {
        const result = { success: false, error: 'realtime_unavailable' };
        if (typeof callback === 'function') callback(result);
        return result;
    }
    const payload = properties?.properties || properties?.particles || properties || {};
    const res = await adapter.atome.realtime(atomeId, payload);
    if (typeof callback === 'function') callback(res);
    return res;
}

export async function get_atome(atomeId, callback) {
    const runtimeTauri = isTauriRuntime();
    const primary = runtimeTauri ? 'tauri' : 'fastify';
    const adapter = adapters[primary];
    if (!adapter?.atome?.get) {
        const result = { ok: false, error: 'get_unavailable' };
        if (typeof callback === 'function') callback(result);
        return result;
    }
    const res = await adapter.atome.get(atomeId);
    if (typeof callback === 'function') callback(res);
    return res;
}

export default {
    list_atomes,
    create_atome,
    alter_atome,
    delete_atome,
    realtime_patch,
    get_atome
};
