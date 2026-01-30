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
const isLoggedOut = () => getSessionState().mode === 'logged_out';

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

const resolveAtomeType = (record) => String(record?.atome_type || record?.type || record?.kind || '').toLowerCase();

const resolveAtomeId = (record) => record?.atome_id || record?.id || null;

const resolveAtomeParentId = (record) => (
    record?.parent_id
    || record?.parentId
    || record?.parent
    || record?.properties?.parent_id
    || record?.properties?.parentId
    || record?.particles?.parent_id
    || record?.particles?.parentId
    || null
);

const resolveAtomeProjectId = (record) => (
    record?.project_id
    || record?.projectId
    || record?.properties?.project_id
    || record?.properties?.projectId
    || record?.particles?.project_id
    || record?.particles?.projectId
    || null
);

const sanitizeProperties = (properties = {}) => {
    const cleaned = { ...(properties || {}) };
    delete cleaned.id;
    delete cleaned.atome_id;
    delete cleaned.atomeId;
    delete cleaned.owner_id;
    delete cleaned.ownerId;
    delete cleaned.parent_id;
    delete cleaned.parentId;
    delete cleaned.project_id;
    delete cleaned.projectId;
    delete cleaned.created_at;
    delete cleaned.updated_at;
    delete cleaned.deleted_at;
    delete cleaned.last_sync;
    return cleaned;
};

const buildUpsertPayload = (record, ownerIdFallback) => {
    const id = resolveAtomeId(record);
    if (!id) return null;
    const type = record?.atome_type || record?.type || record?.kind || 'atome';
    const ownerId = record?.owner_id || record?.ownerId || record?.owner || ownerIdFallback || null;
    const parentId = resolveAtomeParentId(record);
    const properties = sanitizeProperties(record?.properties || record?.particles || record?.data || {});
    return {
        id,
        atome_id: id,
        type,
        atome_type: type,
        owner_id: ownerId,
        parent_id: parentId,
        properties
    };
};

const isAlreadyExistsError = (payload) => {
    const msg = String(payload?.error || payload?.message || '').toLowerCase();
    return msg.includes('already') || msg.includes('exists');
};

const topologicalSortByParent = (items = []) => {
    const byId = new Map();
    items.forEach((item) => {
        const id = resolveAtomeId(item);
        if (id) byId.set(id, item);
    });
    const visited = new Set();
    const sorted = [];

    const visit = (item, stack = new Set()) => {
        const id = resolveAtomeId(item);
        if (!id || visited.has(id)) return;
        if (stack.has(id)) {
            sorted.push(item);
            visited.add(id);
            return;
        }
        stack.add(id);
        const parentId = resolveAtomeParentId(item);
        if (parentId && byId.has(parentId)) {
            visit(byId.get(parentId), stack);
        }
        stack.delete(id);
        if (!visited.has(id)) {
            sorted.push(item);
            visited.add(id);
        }
    };

    items.forEach((item) => visit(item));
    return sorted;
};

const listOnBackend = async (backend, options, currentUserId, skipOwner) => {
    const adapter = adapters[backend];
    if (!adapter?.atome?.list) return { ok: false, list: [], error: 'backend_unavailable' };
    const explicitOwner = options.ownerId || options.owner_id || null;
    const query = {
        atome_type: options.atome_type || options.type || options.atomeType || null,
        owner_id: skipOwner ? (explicitOwner || null) : (explicitOwner || currentUserId || null),
        parent_id: options.project_id || options.projectId || options.parent_id || options.parentId || null,
        limit: options.limit,
        offset: options.offset,
        include_deleted: options.include_deleted ?? options.includeDeleted
    };
    const result = await adapter.atome.list(query);
    const ok = !!(result?.ok || result?.success);
    const list = Array.isArray(result?.atomes) ? result.atomes : Array.isArray(result?.data) ? result.data : [];
    return { ok, list: list.map(normalizeAtomeRecord).filter(Boolean), raw: result, error: ok ? null : (result?.error || 'list_failed') };
};

const mapStateCurrentToAtome = (state) => {
    if (!state || typeof state !== 'object') return null;
    const properties = state.properties || {};
    const atomeType = properties.type || properties.kind || state.atome_type || null;
    const parentId = properties.parent_id || properties.parentId || state.parent_id || null;
    const projectId = state.project_id || properties.project_id || properties.projectId || null;
    const record = {
        atome_id: state.atome_id || state.id || null,
        id: state.atome_id || state.id || null,
        atome_type: atomeType,
        type: atomeType,
        parent_id: parentId,
        owner_id: state.owner_id || state.ownerId || null,
        project_id: projectId,
        properties,
        particles: properties,
        data: properties
    };
    return normalizeAtomeRecord(record);
};

const resolveHttpBaseUrl = (backend, adapter) => {
    let base = adapter?.baseUrl || '';
    if (base.startsWith('ws://')) base = `http://${base.slice(5)}`;
    if (base.startsWith('wss://')) base = `https://${base.slice(6)}`;
    base = base.replace(/\/ws\/api\/?$/, '').replace(/\/$/, '');
    if (base) return base;
    if (typeof window === 'undefined') return '';
    if (backend === 'fastify') {
        return (window.__SQUIRREL_FASTIFY_URL__ || 'http://127.0.0.1:3001').replace(/\/$/, '');
    }
    const port = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT || 3000;
    return `http://127.0.0.1:${port}`;
};

const listStateCurrentOnBackend = async (backend, options) => {
    const adapter = adapters[backend];
    const baseUrl = resolveHttpBaseUrl(backend, adapter);
    const token = adapter?.getToken?.();
    if (!baseUrl || !token) return { ok: false, list: [], error: 'state_current_unavailable' };
    const params = new URLSearchParams();
    const projectId = options.project_id || options.projectId || options.parent_id || options.parentId || null;
    if (projectId) params.set('project_id', projectId);
    if (options.limit != null) params.set('limit', String(options.limit));
    if (options.offset != null) params.set('offset', String(options.offset));
    const url = `${baseUrl}/api/state_current${params.toString() ? `?${params.toString()}` : ''}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include'
        });
        if (!response.ok) {
            return { ok: false, list: [], error: `state_current_http_${response.status}` };
        }
        const payload = await response.json().catch(() => null);
        const listRaw = Array.isArray(payload?.states) ? payload.states : Array.isArray(payload?.state_current) ? payload.state_current : [];
        const list = listRaw.map(mapStateCurrentToAtome).filter(Boolean);
        return { ok: true, list, raw: payload };
    } catch (e) {
        return { ok: false, list: [], error: e?.message || 'state_current_failed' };
    }
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

    const shouldUseStateCurrent = !!(options.projectId || options.project_id || options.parentId || options.parent_id);
    const primaryResult = shouldUseStateCurrent
        ? await listStateCurrentOnBackend(primary, options)
        : await listOnBackend(primary, options, currentUserId, allowCrossOwner);
    results[primary] = { atomes: primaryResult.list, error: primaryResult.error };

    if (runtimeTauri && !isAnonymous() && (options.includeShared || primaryResult.list.length === 0)) {
        const allowFastify = await canUseFastify(currentUserId);
        if (allowFastify) {
            const secondaryResult = shouldUseStateCurrent
                ? await listStateCurrentOnBackend(secondary, options)
                : await listOnBackend(secondary, options, currentUserId, allowCrossOwner);
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

    if (!allowCrossOwner && !shouldUseStateCurrent) {
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
        atome_id: atomeId,
        type: atomeType,
        atome_type: atomeType,
        parent_id: parentId,
        owner_id: options.owner_id || options.ownerId || currentUserId,
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

export async function syncLocalProjectsToFastify({ reason = 'auto' } = {}) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || isLoggedOut()) {
        return { ok: false, reason: 'no_user' };
    }
    if (!isTauriRuntime()) {
        return { ok: false, reason: 'not_tauri' };
    }
    if (isAnonymous()) {
        return { ok: false, reason: 'anonymous' };
    }
    if (!FastifyAdapter?.getToken?.()) {
        return { ok: false, reason: 'missing_fastify_token' };
    }

    const availability = await checkBackends(true);
    if (!availability.fastify) {
        return { ok: false, reason: 'fastify_unavailable' };
    }
    if (!availability.tauri) {
        return { ok: false, reason: 'tauri_unavailable' };
    }

    let tauriProjects = [];
    let fastifyProjects = [];
    try {
        const localRes = await adapters.tauri.atome.list({
            type: 'project',
            owner_id: currentUserId,
            include_deleted: true,
            limit: 2000
        });
        tauriProjects = Array.isArray(localRes?.atomes) ? localRes.atomes.map(normalizeAtomeRecord) : [];
    } catch (_) { }

    try {
        const remoteRes = await adapters.fastify.atome.list({
            type: 'project',
            owner_id: currentUserId,
            include_deleted: true,
            limit: 2000
        });
        fastifyProjects = Array.isArray(remoteRes?.atomes) ? remoteRes.atomes.map(normalizeAtomeRecord) : [];
    } catch (_) { }

    const fastifyProjectIds = new Set(
        fastifyProjects.map(resolveAtomeId).filter(Boolean).map(String)
    );
    const missingProjects = tauriProjects.filter((proj) => {
        const id = resolveAtomeId(proj);
        if (!id) return false;
        const deleted = proj?.deleted_at || proj?.deletedAt;
        if (deleted) return false;
        return !fastifyProjectIds.has(String(id));
    });

    if (!missingProjects.length) {
        return { ok: true, reason: 'no_missing_projects' };
    }

    const localAtomesRes = await adapters.tauri.atome.list({
        owner_id: currentUserId,
        include_deleted: true,
        limit: 5000
    });
    const localAtomes = Array.isArray(localAtomesRes?.atomes)
        ? localAtomesRes.atomes.map(normalizeAtomeRecord)
        : [];

    const missingProjectIds = new Set(missingProjects.map((p) => String(resolveAtomeId(p))));
    const childrenToSync = localAtomes.filter((record) => {
        const id = resolveAtomeId(record);
        if (!id) return false;
        const type = resolveAtomeType(record);
        if (type === 'project') return false;
        if (record?.deleted_at || record?.deletedAt) return false;
        const projectId = resolveAtomeProjectId(record);
        const parentId = resolveAtomeParentId(record);
        if (projectId && missingProjectIds.has(String(projectId))) return true;
        if (parentId && missingProjectIds.has(String(parentId))) return true;
        return false;
    });

    const orderedProjects = topologicalSortByParent(missingProjects);
    const orderedChildren = topologicalSortByParent(childrenToSync);

    const result = {
        ok: true,
        reason,
        projects: { created: 0, failed: 0, errors: [] },
        atomes: { created: 0, failed: 0, errors: [] }
    };

    for (const project of orderedProjects) {
        const payload = buildUpsertPayload(project, currentUserId);
        if (!payload) continue;
        try {
            const res = await FastifyAdapter.atome.create(payload);
            const ok = !!(res?.ok || res?.success) || isAlreadyExistsError(res);
            if (ok) {
                result.projects.created += 1;
            } else {
                result.projects.failed += 1;
                result.projects.errors.push({ id: payload.id, error: res?.error || 'create_failed' });
            }
        } catch (e) {
            result.projects.failed += 1;
            result.projects.errors.push({ id: payload.id, error: e?.message || 'create_failed' });
        }
    }

    for (const record of orderedChildren) {
        const payload = buildUpsertPayload(record, currentUserId);
        if (!payload) continue;
        try {
            const res = await FastifyAdapter.atome.create(payload);
            const ok = !!(res?.ok || res?.success) || isAlreadyExistsError(res);
            if (ok) {
                result.atomes.created += 1;
            } else {
                result.atomes.failed += 1;
                result.atomes.errors.push({ id: payload.id, error: res?.error || 'create_failed' });
            }
        } catch (e) {
            result.atomes.failed += 1;
            result.atomes.errors.push({ id: payload.id, error: e?.message || 'create_failed' });
        }
    }

    return result;
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
    get_atome,
    syncLocalProjectsToFastify
};
