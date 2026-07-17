import { TauriAdapter, FastifyAdapter, checkBackends, generateUUID } from '../adole.js';
import { isTauriRuntime } from './runtime.js';
import { sanitizeAtomeProperties } from '../../../../shared/atome_contract.js';
import {
    buildUpsertPayload,
    extractUserId,
    filterByOwner,
    getCurrentUserId,
    isAnonymous,
    isLoggedOut,
    listOnBackend,
    listStateCurrentOnBackend,
    normalizeAtomeRecord,
    resolveAtomeId,
    resolveAtomeParentId,
    resolveAtomeProjectId,
    resolveAtomeType,
    topologicalSortByParent
} from './atome_record_projection.js';

const adapters = {
    tauri: TauriAdapter,
    fastify: FastifyAdapter
};

const canUseFastify = async (currentUserId) => {
    if (!FastifyAdapter?.getToken?.()) return false;
    const me = await FastifyAdapter.auth.me();
    const id = extractUserId(me?.user || me?.data?.user || me?.user_data || null);
    if (id && currentUserId && String(id) === String(currentUserId)) return true;
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
        ? await listStateCurrentOnBackend(adapters, primary, options)
        : await listOnBackend(adapters, primary, options, currentUserId, allowCrossOwner);
    results[primary] = { atomes: primaryResult.list, error: primaryResult.error };

    if (runtimeTauri && !isAnonymous() && (options.includeShared || primaryResult.list.length === 0)) {
        const allowFastify = await canUseFastify(currentUserId);
        if (allowFastify) {
            const secondaryResult = shouldUseStateCurrent
                ? await listStateCurrentOnBackend(adapters, secondary, options)
                : await listOnBackend(adapters, secondary, options, currentUserId, allowCrossOwner);
            results[secondary] = { atomes: secondaryResult.list, error: secondaryResult.error };
            if (primaryResult.list.length === 0 && secondaryResult.list.length > 0) {
                results.meta.preferFastify = true;
            }
            if (options.includeShared && secondaryResult.list.length > 0) {
                const merged = new Map();
                primaryResult.list.forEach((item) => merged.set(resolveAtomeId(item), item));
                secondaryResult.list.forEach((item) => {
                    const key = resolveAtomeId(item);
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
    const atomeType = String(options.type || '').trim();
    if (!atomeType) {
        const error = 'Missing canonical atome type.';
        const result = {
            tauri: { success: false, error },
            fastify: { success: false, error }
        };
        if (typeof callback === 'function') callback(result);
        return result;
    }
    const projectId = options.projectId || options.project_id || null;
    const parentId = options.parentId || options.parent_id || projectId || null;
    const properties = sanitizeAtomeProperties(options.properties || {});

    const payload = {
        kind: 'set',
        atome_id: atomeId,
        project_id: projectId,
        parent_id: parentId,
        owner_id: options.owner_id || options.ownerId || currentUserId,
        actor: { type: 'user', id: String(options.owner_id || options.ownerId || currentUserId) },
        props: {
            ...properties,
            kind: options.kind || atomeType,
            ...(options.renderer ? { renderer: options.renderer } : {}),
            ...(options.meta && typeof options.meta === 'object' ? { meta: options.meta } : {}),
            ...(Array.isArray(options.traits) ? { traits: options.traits.slice() } : {})
        }
    };

    const primaryResult = await adapters[primary].atome.commit(payload);
    const okPrimary = !!(primaryResult?.ok || primaryResult?.success);
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    results[primary] = { success: okPrimary, data: primaryResult, error: okPrimary ? null : primaryResult?.error };

    if (okPrimary && runtimeTauri && !isAnonymous() && adapters[secondary]?.getToken?.()) {
        try {
            const secondaryResult = await adapters[secondary].atome.commit(payload);
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
    
        const localRes = await adapters.tauri.atome.list({
            type: 'project',
            owner_id: currentUserId,
            include_deleted: true,
            limit: 2000
        });
        tauriProjects = Array.isArray(localRes?.atomes) ? localRes.atomes.map(normalizeAtomeRecord) : [];
    

    
        const remoteRes = await adapters.fastify.atome.list({
            type: 'project',
            owner_id: currentUserId,
            include_deleted: true,
            limit: 2000
        });
        fastifyProjects = Array.isArray(remoteRes?.atomes) ? remoteRes.atomes.map(normalizeAtomeRecord) : [];
    

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
            const res = await FastifyAdapter.atome.commit({
                kind: 'set',
                atome_id: payload.id,
                project_id: payload.project_id || payload.id,
                parent_id: payload.parent_id || null,
                owner_id: payload.owner_id || currentUserId,
                actor: { type: 'user', id: String(payload.owner_id || currentUserId) },
                props: {
                    ...payload.properties,
                    kind: payload.kind || payload.type
                }
            });
            const ok = !!(res?.ok || res?.success);
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
            const res = await FastifyAdapter.atome.commit({
                kind: 'set',
                atome_id: payload.id,
                project_id: payload.project_id || null,
                parent_id: payload.parent_id || payload.project_id || null,
                owner_id: payload.owner_id || currentUserId,
                actor: { type: 'user', id: String(payload.owner_id || currentUserId) },
                props: {
                    ...payload.properties,
                    kind: payload.kind || payload.type
                }
            });
            const ok = !!(res?.ok || res?.success);
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

    const payload = sanitizeAtomeProperties(properties?.properties || properties?.particles || properties || {});

    const primaryResult = await adapters[primary].atome.commit({
        kind: 'set',
        atome_id: atomeId,
        props: payload,
        actor: { type: 'user', id: String(currentUserId) }
    });
    const okPrimary = !!(primaryResult?.ok || primaryResult?.success);
    const results = {
        tauri: { success: false, data: null, error: null },
        fastify: { success: false, data: null, error: null }
    };
    results[primary] = { success: okPrimary, data: primaryResult, error: okPrimary ? null : primaryResult?.error };

    if (okPrimary && runtimeTauri && !isAnonymous() && adapters[secondary]?.getToken?.()) {
        try {
            const secondaryResult = await adapters[secondary].atome.commit({
                kind: 'set',
                atome_id: atomeId,
                props: payload,
                actor: { type: 'user', id: String(currentUserId) }
            });
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
