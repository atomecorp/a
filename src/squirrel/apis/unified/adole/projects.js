import { TauriAdapter, FastifyAdapter, checkBackends } from '../adole.js';
import {
  resolve_backend_plan,
  resolve_sync_policy,
  ensure_user_for_operation,
  ensure_secondary_user_match,
  ensure_fastify_token,
  is_anonymous_mode,
  is_tauri_runtime,
  is_already_exists_error,
  queue_pending_delete,
  process_pending_deletes,
  request_sync,
  get_pending_delete_ids
} from './core.js';
import { list_atomes } from './atomes.js';

const with_callback = (result, callback) => {
  if (typeof callback === 'function') callback(result);
  return result;
};

const make_results = () => ({
  tauri: { success: false, data: null, error: null },
  fastify: { success: false, data: null, error: null }
});

const set_success = (results, key, data, extra = {}) => {
  results[key] = { success: true, data, error: null, ...extra };
};

const set_error = (results, key, error, extra = {}) => {
  results[key] = { success: false, data: null, error, ...extra };
};

async function create_project(projectName, callback) {
    const results = make_results();
    const dataPlan = resolve_backend_plan('data');

    // Get current user to set as owner (anonymous allowed)
    const authCheck = await ensure_user_for_operation('create_project', { allowAnonymous: true });
    const ownerId = authCheck.user?.id || null;

    if (!authCheck.ok || !ownerId) {
        const error = authCheck.error || 'No user logged in. Please log in first.';
        set_error(results, 'tauri', error);
        set_error(results, 'fastify', error);
        return with_callback(results, callback);
    }

    const projectProperties = {
        name: projectName,
        created_at: new Date().toISOString()
    };
    const projectData = {
        type: 'project',
        ownerId: ownerId,
        properties: projectProperties
    };

    try {
        const primaryResult = await dataPlan.primary.atome.create(projectData);
        if (primaryResult.ok || primaryResult.success) {
            set_success(results, dataPlan.source, primaryResult);
        } else {
            set_error(results, dataPlan.source, primaryResult.error);
        }
    } catch (e) {
        set_error(results, dataPlan.source, e.message);
    }

    set_error(results, dataPlan.secondaryName, 'skipped', { skipped: true });

    const primaryOk = results[dataPlan.source]?.success === true;
    if (primaryOk) {
        try {
            const backends = await checkBackends(true);
            const secondaryAvailable = dataPlan.secondaryName === 'fastify' ? backends.fastify : backends.tauri;

            if (secondaryAvailable && !is_anonymous_mode()) {
                const secondaryUserMatch = await ensure_secondary_user_match(dataPlan.secondaryName, ownerId);
                if (!secondaryUserMatch) {
                    set_error(results, dataPlan.secondaryName, 'secondary_user_mismatch', { skipped: true });
                } else if (dataPlan.secondaryName === 'fastify') {
                    try { await ensure_fastify_token(); } catch { }
                    const hasFastifyToken = !!FastifyAdapter.getToken?.();
                    if (!hasFastifyToken) {
                        set_error(results, 'fastify', 'fastify_token_missing');
                    } else {
                        const res = await FastifyAdapter.atome.create(projectData);
                        if (res && (res.ok || res.success || is_already_exists_error(res))) {
                            set_success(results, 'fastify', res, { alreadyExists: is_already_exists_error(res) });
                        } else {
                            set_error(results, 'fastify', res?.error || 'fastify_create_failed');
                        }
                    }
                } else {
                    const hasTauriToken = !!TauriAdapter.getToken?.();
                    if (!hasTauriToken) {
                        set_error(results, 'tauri', 'tauri_token_missing');
                    } else {
                        const res = await TauriAdapter.atome.create(projectData);
                        if (res && (res.ok || res.success || is_already_exists_error(res))) {
                            set_success(results, 'tauri', res, { alreadyExists: is_already_exists_error(res) });
                        } else {
                            set_error(results, 'tauri', res?.error || 'tauri_create_failed');
                        }
                    }
                }
            }
        } catch (_) {
            // Ignore secondary errors; primary success already recorded.
        }
    }

    if (is_tauri_runtime() && resolve_sync_policy().from === dataPlan.source && !is_anonymous_mode()) {
        try { await request_sync('create_project'); } catch { }
    }

    return with_callback(results, callback);
}

/**
 * List all projects accessible to the current user (owned + shared)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of projects from both backends
 */
async function list_projects(callback) {
    const results = {
        tauri: { projects: [], error: null },
        fastify: { projects: [], error: null }
    };
    const dataPlan = resolve_backend_plan('data');
    const syncPolicy = resolve_sync_policy();

    const authCheck = await ensure_user_for_operation('list_projects', { allowAnonymous: true });
    const currentUserId = authCheck.user?.id || null;
    if (!authCheck.ok || !currentUserId) {
        const error = authCheck.error || 'No user logged in. Cannot list projects.';
        results.tauri.error = error;
        results.fastify.error = error;
        return with_callback(results, callback);
    }

    if (is_tauri_runtime() && syncPolicy.from === dataPlan.source && !is_anonymous_mode()) {
        try { await request_sync('list_projects'); } catch { }
    }

    // SECURITY: never list projects owned by other users unless explicit share support exists.
    const listResult = await list_atomes({
        type: 'project',
        includeShared: !is_anonymous_mode(),
        ownerId: currentUserId
    });
    results.tauri.projects = Array.isArray(listResult.tauri.atomes) ? listResult.tauri.atomes : [];
    results.fastify.projects = Array.isArray(listResult.fastify.atomes) ? listResult.fastify.atomes : [];
    results.tauri.error = listResult.tauri.error || null;
    results.fastify.error = listResult.fastify.error || null;
    results.meta = listResult.meta || null;

    const normalizeAnonOwner = (project) => {
        if (!project || !currentUserId) return project;
        const ownerId = project?.owner_id
            || project?.ownerId
            || project?.pending_owner_id
            || project?._pending_owner_id
            || project?.properties?.owner_id
            || project?.properties?._pending_owner_id
            || project?.particles?.owner_id
            || project?.particles?._pending_owner_id
            || null;
        if (ownerId) return project;
        const properties = (project.properties && typeof project.properties === 'object')
            ? { ...project.properties, owner_id: currentUserId }
            : { owner_id: currentUserId };
        return { ...project, owner_id: currentUserId, properties };
    };

    // Retry once if Tauri returned empty (WS not ready or auth race)
    if (is_tauri_runtime() && (!results.tauri.projects || results.tauri.projects.length === 0)) {
        try {
            await new Promise((resolve) => setTimeout(resolve, 120));
            const retry = await list_atomes({
                type: 'project',
                includeShared: !is_anonymous_mode(),
                ownerId: currentUserId
            });
            const retryProjects = Array.isArray(retry?.tauri?.atomes) ? retry.tauri.atomes : [];
            if (retryProjects.length) {
                results.tauri.projects = retryProjects;
                if (retry?.tauri?.error) {
                    results.tauri.error = retry.tauri.error;
                }
            }
        } catch (_) { }
    }

    // Tauri anonymous fallback: some local setups fail to return projects when owner filtering is enforced.
    // Re-list with ownerId="*" (server returns all local projects), then filter client-side by owner.
    if (is_tauri_runtime()
        && is_anonymous_mode()
        && (!results.tauri.projects || results.tauri.projects.length === 0)) {
        try {
            const relaxed = await list_atomes({
                type: 'project',
                ownerId: '*',
                skipOwner: true,
                includeShared: false
            });
            const relaxedProjects = Array.isArray(relaxed?.tauri?.atomes) ? relaxed.tauri.atomes : [];
            if (relaxedProjects.length) {
                results.tauri.projects = relaxedProjects.filter((p) => {
                    const ownerId = p?.owner_id
                        || p?.ownerId
                        || p?.pending_owner_id
                        || p?._pending_owner_id
                        || p?.properties?.owner_id
                        || p?.properties?._pending_owner_id
                        || p?.particles?.owner_id
                        || p?.particles?._pending_owner_id
                        || null;
                    return !ownerId || String(ownerId) === String(currentUserId);
                }).map(normalizeAnonOwner);
            }
            if (!results.tauri.projects.length && relaxed?.tauri?.error) {
                results.tauri.error = relaxed.tauri.error;
            }
        } catch (_) { }
    }

    // SECURITY: Double-check owner filtering on Fastify projects to prevent cross-user data leakage
    // This is a defensive layer in case the server returns more than it should
    if (currentUserId && results.fastify.projects.length > 0) {
        results.fastify.projects = results.fastify.projects.filter(p => {
            const ownerId = p?.owner_id || p?.ownerId || p?.properties?.owner_id || p?.particles?.owner_id || null;
            // Allow if owner matches OR if no owner is set (shared/legacy projects)
            if (!ownerId) return true;
            return String(ownerId) === String(currentUserId);
        });
    }

    // If local deletions are pending, hide those projects from the Fastify list
    // so they don't "reappear" before the delete sync completes.
    try {
        const pendingDeletes = get_pending_delete_ids();
        if (pendingDeletes.size > 0) {
            results.fastify.projects = results.fastify.projects.filter(p => {
                const id = p?.atome_id || p?.id;
                return id ? !pendingDeletes.has(String(id)) : true;
            });
        }
    } catch { }

    return with_callback(results, callback);
}

/**
 * Delete a project and all its contents (soft delete)
 * @param {string} projectId - ID of the project to delete
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function delete_project(projectId, callback) {
    const results = make_results();
    const dataPlan = resolve_backend_plan('data');
    const syncPolicy = resolve_sync_policy();

    if (!projectId) {
        const error = 'No project ID provided';
        set_error(results, 'tauri', error);
        set_error(results, 'fastify', error);
        return with_callback(results, callback);
    }

    let ownerId = null;
    try {
        const authCheck = await ensure_user_for_operation('delete_project', { allowAnonymous: true });
        ownerId = authCheck.user?.id || null;
        if (!authCheck.ok) {
            const error = authCheck.error || 'No user logged in. Please log in first.';
            set_error(results, 'tauri', error);
            set_error(results, 'fastify', error);
            return with_callback(results, callback);
        }
    } catch { }

    // Soft delete on primary backend only.
    try {
        const primaryResult = await dataPlan.primary.atome.softDelete(projectId);
        if (primaryResult.ok || primaryResult.success) {
            set_success(results, dataPlan.source, primaryResult);
        } else {
            set_error(results, dataPlan.source, primaryResult.error);
        }
    } catch (e) {
        set_error(results, dataPlan.source, e.message);
    }

    set_error(results, dataPlan.secondaryName, 'skipped', { skipped: true });

    if (syncPolicy.to === 'fastify' && dataPlan.source === 'tauri' && ownerId && !is_anonymous_mode()) {
        queue_pending_delete({ atomeId: projectId, ownerId, type: 'project' });
    }

    if (is_tauri_runtime() && syncPolicy.from === dataPlan.source && !is_anonymous_mode()) {
        try { await process_pending_deletes(); } catch { }
        try { await request_sync('delete_project'); } catch { }
    }

    return with_callback(results, callback);
}

export { create_project, list_projects, delete_project };
