import { TauriAdapter, FastifyAdapter, generateUUID } from '../adole.js';
import {
  resolve_backend_plan,
  resolve_sync_policy,
  ensure_user_for_operation,
  ensure_secondary_user_match,
  ensure_fastify_token,
  is_anonymous_mode,
  is_tauri_runtime,
  resolveAtomePropertiesInput,
  resolveAtomePropertiesPayload,
  normalizeAtomeRecord,
  create_unauthenticated_result,
  queue_pending_delete
} from './core.js';

const with_callback = (result, callback) => {
  if (typeof callback === 'function') callback(result);
  return result;
};

const make_results = () => ({
  tauri: { success: false, data: null, error: null },
  fastify: { success: false, data: null, error: null }
});

const make_list_results = (dataPlan, includeShared) => ({
  tauri: { atomes: [], error: null },
  fastify: { atomes: [], error: null },
  meta: { source: dataPlan.source, includeShared }
});

const set_success = (results, key, data, extra = {}) => {
  results[key] = { success: true, data, error: null, ...extra };
};

const set_error = (results, key, error, extra = {}) => {
  results[key] = { success: false, data: null, error, ...extra };
};

async function create_atome(options, callback) {
    // Handle both object and callback-only signatures
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    const atomeType = options.type || 'shape';
    const atomeColor = options.color || 'blue';
    const projectId = options.projectId || options.project_id || null;
    const parentId = options.parentId || options.parent_id || projectId || null;
    const desiredId = options.id || generateUUID();
    const dataPlan = resolve_backend_plan('data');
    const syncPolicy = resolve_sync_policy();

    const results = make_results();

    // Get current user (anonymous allowed)
    const authCheck = await ensure_user_for_operation('create_atome', { allowAnonymous: true });
    const currentUserId = authCheck.user?.id || null;
    if (!authCheck.ok || !currentUserId) {
        const error = authCheck.error || 'No user logged in. Please log in first.';
        set_error(results, 'tauri', error);
        set_error(results, 'fastify', error);
        return with_callback(results, callback);
    }

    // Use provided ownerId if specified, otherwise use current user
    // This allows creating atomes for other users (e.g., messages to recipients)
    const ownerId = options.ownerId || currentUserId;

    // Check if sync mode is requested (bypasses ACL checks for import operations)
    const syncMode = options.sync === true;

    const properties = {
        color: atomeColor,
        created_at: new Date().toISOString(),
        ...resolveAtomePropertiesInput(options)
    };
    if (projectId) {
        properties.projectId = projectId;
        properties.project_id = projectId;
    }
    if (parentId) {
        properties.parentId = parentId;
        properties.parent_id = parentId;
    }

    const atomeData = {
        id: desiredId, // Always use a UUID so both backends match
        type: atomeType,
        ownerId: ownerId,
        parentId: parentId, // Link to project by default, or to explicit parent
        projectId: projectId,
        properties,
        sync: syncMode  // Pass sync flag to bypass ACL checks when needed
    };

    // Create on primary backend first.
    try {
        const primaryResult = await dataPlan.primary.atome.create(atomeData);
        if (primaryResult.ok || primaryResult.success) {
            set_success(results, dataPlan.source, primaryResult);
        } else {
            set_error(results, dataPlan.source, primaryResult.error);
        }
    } catch (e) {
        set_error(results, dataPlan.source, e.message);
    }

    // Real-time sync: also create on secondary backend if available.
    // This ensures immediate sync instead of waiting for batch sync.
    if (results[dataPlan.source]?.success && is_anonymous_mode()) {
        set_error(results, dataPlan.secondaryName, 'skipped', { skipped: true });
    } else if (results[dataPlan.source]?.success) {
        try {
            const secondaryAvailable = await dataPlan.secondary.isAvailable?.();
            const secondaryToken = dataPlan.secondary.getToken?.();
            if (secondaryAvailable && secondaryToken) {
                const secondaryUserMatch = await ensure_secondary_user_match(dataPlan.secondaryName, currentUserId);
                if (!secondaryUserMatch) {
                    set_error(results, dataPlan.secondaryName, 'secondary_user_mismatch', { skipped: true });
                } else {
                    const secondaryResult = await dataPlan.secondary.atome.create(atomeData);
                    if (secondaryResult.ok || secondaryResult.success) {
                        set_success(results, dataPlan.secondaryName, secondaryResult);
                    } else {
                        // Check if "already exists" - this is acceptable
                        const errMsg = String(secondaryResult.error || '').toLowerCase();
                        if (errMsg.includes('already') || errMsg.includes('exists')) {
                            set_success(results, dataPlan.secondaryName, secondaryResult, { alreadyExists: true });
                        } else {
                            set_error(results, dataPlan.secondaryName, secondaryResult.error, { skipped: false });
                        }
                    }
                }
            } else {
                set_error(results, dataPlan.secondaryName, 'secondary_unavailable', { skipped: true });
            }
        } catch (e) {
            set_error(results, dataPlan.secondaryName, e.message, { skipped: false });
        }
    } else {
        set_error(results, dataPlan.secondaryName, 'primary_failed', { skipped: true });
    }

    return with_callback(results, callback);
}

/**
 * List atomes, optionally filtered by project or type
 * @param {Object} options - Filter options { type, projectId }
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of atomes from both backends
 */
async function list_atomes(options = {}, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    // Security guard: require authenticated user for listing atomes
    // Exception: allow listing 'user' type without authentication (for directory lookup)
    const atomeType = options.type || null;
    let authenticatedUser = null;
    if (atomeType !== 'user') {
        const authCheck = await ensure_user_for_operation('list_atomes', { allowAnonymous: true });
        if (!authCheck.ok) {
            const blockedResult = create_unauthenticated_result(authCheck.error);
            blockedResult.tauri = { atomes: [], error: authCheck.error };
            blockedResult.fastify = { atomes: [], error: authCheck.error };
            return with_callback(blockedResult, callback);
        }
        authenticatedUser = authCheck.user || null;
    }

    const projectId = options.projectId || options.project_id || null;
    let ownerId = options.ownerId || null;
    let currentUserId = authenticatedUser?.id || null;
    const includeShared = !!options.includeShared && !is_anonymous_mode();
    const dataPlan = resolve_backend_plan('data');
    const shouldMergeSources = is_tauri_runtime() && includeShared;

    const results = make_list_results(dataPlan, includeShared);

    // Default behavior: list current user's atomes.
    // Fastify WS list requires ownerId/userId or atomeType; otherwise it returns [].
    // Exception: when listing global users, do not force owner filtering.
    const skipOwnerFilter = !!options.skipOwner || ownerId === '*' || ownerId === 'all';
    if (atomeType !== 'user' && !currentUserId) {
        try {
            const currentUserResult = await current_user();
            currentUserId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
        } catch (e) {
            // Silent; will fallback to server behavior
        }
    }
    if (atomeType !== 'user' && !currentUserId) {
        const error = 'No authenticated user. Cannot list atomes.';
        const blockedResult = create_unauthenticated_result(error);
        blockedResult.tauri = { atomes: [], error };
        blockedResult.fastify = { atomes: [], error };
        return with_callback(blockedResult, callback);
    }
    if (!ownerId && atomeType !== 'user' && !skipOwnerFilter) {
        if (currentUserId) {
            ownerId = currentUserId;
        }
    }

    // Build query options with type and ownerId if provided
    const queryOptions = {};
    if (atomeType) queryOptions.type = atomeType;
    if (ownerId) queryOptions.owner_id = ownerId;
    if (projectId) queryOptions.parentId = projectId;
    if (options.limit !== undefined) queryOptions.limit = options.limit;
    if (options.offset !== undefined) queryOptions.offset = options.offset;
    if (options.includeDeleted !== undefined) queryOptions.includeDeleted = options.includeDeleted;
    if (projectId && queryOptions.limit === undefined) queryOptions.limit = 1000;

    const tauriQueryOptions = { ...queryOptions };
    const fastifyQueryOptions = { ...queryOptions };
    // In Tauri, avoid leaking other users' local projects when includeShared + skipOwner.
    if (is_tauri_runtime() && includeShared && skipOwnerFilter && currentUserId && !ownerId) {
        tauriQueryOptions.owner_id = currentUserId;
    }

    const canUseFastifyForShared = async () => {
        if (!is_tauri_runtime() || !includeShared) return true;
        if (!currentUserId) return false;
        if (!FastifyAdapter.getToken?.()) {
            try { await ensure_fastify_token(); } catch { }
        }
        const token = FastifyAdapter.getToken?.();
        if (!token) return false;
        try {
            const me = await FastifyAdapter.auth.me();
            const fastifyUserId = me?.user?.user_id || me?.user?.id || null;
            if (!fastifyUserId) return false;
            if (String(fastifyUserId) !== String(currentUserId)) {
                try { FastifyAdapter.clearToken?.(); } catch { }
                return false;
            }
            return true;
        } catch {
            return false;
        }
    };

    const allowCreatorFallback = is_tauri_runtime() && is_anonymous_mode();
    const filterOwnerIfNeeded = (list = []) => {
        if (skipOwnerFilter || !ownerId || atomeType !== 'project') return list;
        return list.filter((item) => {
            const normalized = normalizeAtomeRecord(item);
            const itemOwner = normalized?.owner_id
                || normalized?.ownerId
                || normalized?.pending_owner_id
                || normalized?.pendingOwnerId
                || null;
            const creatorId = normalized?.creator_id || normalized?.creatorId || item?.creator_id || null;
            if (itemOwner && String(itemOwner) === String(ownerId)) {
                return true;
            }
            if (allowCreatorFallback && creatorId && String(creatorId) === String(ownerId)) {
                return true;
            }
            return false;
        });
    };

    const normalize_list = (raw, source = null) => (Array.isArray(raw)
        ? raw.map((item) => {
            const normalized = normalizeAtomeRecord(item);
            if (source && normalized && typeof normalized === 'object') {
                normalized.__source = source;
            }
            return normalized;
        })
        : []);

    const getAtomeTimestamp = (item) => {
        if (!item || typeof item !== 'object') return null;
        const props = item.properties || item.particles || item.data || {};
        return item.updated_at
            || item.updatedAt
            || props.updated_at
            || props.updatedAt
            || item.created_at
            || item.createdAt
            || props.created_at
            || props.createdAt
            || null;
    };

    const parseTimestamp = (value) => {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const resolvePreferredBase = (existing, incoming, preferSource = null) => {
        if (preferSource) {
            const existingSource = existing?.__source || null;
            const incomingSource = incoming?.__source || null;
            if (existingSource === preferSource && incomingSource !== preferSource) return existing;
            if (incomingSource === preferSource && existingSource !== preferSource) return incoming;
        }

        const existingTime = parseTimestamp(getAtomeTimestamp(existing));
        const incomingTime = parseTimestamp(getAtomeTimestamp(incoming));
        if (existingTime && incomingTime) {
            return incomingTime > existingTime ? incoming : existing;
        }
        if (!existingTime && incomingTime) return incoming;
        if (existingTime && !incomingTime) return existing;

        const existingSource = existing?.__source || null;
        const incomingSource = incoming?.__source || null;
        if (existingSource === 'tauri' && incomingSource === 'fastify') return existing;
        if (existingSource === 'fastify' && incomingSource === 'tauri') return incoming;

        return existing;
    };

    const mergeRecords = (existing, incoming, preferSource = null) => {
        if (!existing) return incoming;
        if (!incoming) return existing;
        const base = resolvePreferredBase(existing, incoming, preferSource);
        const other = base === existing ? incoming : existing;
        const baseProps = base.properties || base.particles || base.data || {};
        const otherProps = other.properties || other.particles || other.data || {};
        const mergedProps = { ...otherProps, ...baseProps };
        return {
            ...other,
            ...base,
            properties: mergedProps,
            __source: base.__source || other.__source || null
        };
    };

    const filter_project = (list = []) => {
        if (!projectId) return list;
        const target = String(projectId);
        return list.filter((item) => {
            const parentId = item.parentId || item.parent_id || null;
            const properties = item.properties || item.particles || item.data || {};
            const propertyProjectId = properties.projectId || properties.project_id || null;
            return String(parentId || '') === target || String(propertyProjectId || '') === target;
        });
    };

    const list_tauri = async () => {
        try {
            const tauriResult = await TauriAdapter.atome.list(tauriQueryOptions);
            if (tauriResult.ok || tauriResult.success) {
                const rawAtomes = tauriResult.atomes || tauriResult.data || [];
                let normalized = normalize_list(rawAtomes, 'tauri');
                normalized = filterOwnerIfNeeded(normalized);
                return { ok: true, list: normalized };
            }
            return { ok: false, error: tauriResult.error };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    };

    const list_fastify = async () => {
        try {
            let fastifyResult = await FastifyAdapter.atome.list(fastifyQueryOptions);
            if (!(fastifyResult.ok || fastifyResult.success)) {
                const errMsg = String(fastifyResult.error || '').toLowerCase();
                const authError = errMsg.includes('unauth') || errMsg.includes('token') || errMsg.includes('login');
                if (is_tauri_runtime() && authError) {
                    try { await ensure_fastify_token(); } catch { }
                    fastifyResult = await FastifyAdapter.atome.list(fastifyQueryOptions);
                }
            }

            if (fastifyResult && (fastifyResult.ok || fastifyResult.success)) {
                const rawAtomes = fastifyResult.atomes || fastifyResult.data || [];
                let normalized = normalize_list(rawAtomes, 'fastify');
                normalized = filterOwnerIfNeeded(normalized);
                normalized = filter_project(normalized);
                return { ok: true, list: normalized };
            }
            return { ok: false, error: fastifyResult?.error || null };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    };

    const mergeAtomeLists = (primary = [], secondary = []) => {
        const byId = new Map();
        const addItem = (item, source) => {
            const normalized = item && typeof item === 'object' ? item : null;
            if (!normalized) return;
            if (source && typeof normalized === 'object') {
                normalized.__source = normalized.__source || source;
            }
            const id = normalized.id || normalized.atome_id || normalized.atomeId || null;
            if (!id) return;
            const existing = byId.get(id);
            if (!existing) {
                byId.set(id, normalized);
                return;
            }
            byId.set(id, mergeRecords(existing, normalized));
        };

        primary.forEach((item) => addItem(item, 'tauri'));
        secondary.forEach((item) => addItem(item, 'fastify'));
        return filterOwnerIfNeeded(Array.from(byId.values()));
    };

    const dedupeProjectsBySignature = (list = []) => {
        if (!Array.isArray(list) || list.length < 2) return list;
        const output = [];
        const signatureMap = new Map();

        for (const item of list) {
            if (!item || typeof item !== 'object') {
                output.push(item);
                continue;
            }

            const owner = item.owner_id || item.ownerId || null;
            const props = item.properties || item.particles || item.data || {};
            const createdAt = props.created_at || item.created_at || null;
            if (!owner || !createdAt) {
                output.push(item);
                continue;
            }

            const signature = `${owner}|${createdAt}`;
            const existingEntry = signatureMap.get(signature);
            if (!existingEntry) {
                signatureMap.set(signature, { index: output.length, item });
                output.push(item);
                continue;
            }

            const existingSource = existingEntry.item?.__source || null;
            const incomingSource = item?.__source || null;
            if (existingSource && incomingSource && existingSource === incomingSource) {
                output.push(item);
                continue;
            }

            const merged = mergeRecords(existingEntry.item, item, 'tauri');
            output[existingEntry.index] = merged;
            signatureMap.set(signature, { index: existingEntry.index, item: merged });
        }

        return output;
    };

    if (shouldMergeSources) {
        let tauriList = [];
        let fastifyList = [];

        const tauriRes = await list_tauri();
        if (tauriRes.ok) {
            tauriList = tauriRes.list;
        } else {
            results.tauri.error = tauriRes.error;
        }

        const allowFastify = await canUseFastifyForShared();
        if (!allowFastify) {
            results.fastify.error = 'fastify_user_mismatch';
        } else {
            const fastRes = await list_fastify();
            if (fastRes.ok) {
                fastifyList = fastRes.list;
            } else if (!results.fastify.error) {
                results.fastify.error = fastRes.error;
            }
        }

        results.fastify.atomes = fastifyList;
        results.tauri.atomes = mergeAtomeLists(tauriList, fastifyList);
        if (atomeType === 'project') {
            results.tauri.atomes = dedupeProjectsBySignature(results.tauri.atomes);
        }
        results.meta.merged = true;
    } else if (dataPlan.source === 'tauri') {
        const tauriRes = await list_tauri();
        if (tauriRes.ok) {
            results.tauri.atomes = tauriRes.list;
        } else {
            results.tauri.error = tauriRes.error;
        }
        results.fastify = { atomes: [], error: 'skipped', skipped: true };

        // Fallback: if Tauri has no data (or auth error) but Fastify does, prefer Fastify.
        const tauriEmpty = !results.tauri.atomes || results.tauri.atomes.length === 0;
        const tauriFailed = !!results.tauri.error;
        if ((tauriEmpty || tauriFailed) && currentUserId) {
            let allowFastify = true;
            try {
                allowFastify = await ensure_secondary_user_match('fastify', currentUserId);
            } catch {
                allowFastify = false;
            }
            if (allowFastify) {
                const fastRes = await list_fastify();
                if (fastRes.ok) {
                    results.fastify = { atomes: fastRes.list, error: null };
                    if (fastRes.list.length > 0) {
                        results.meta.preferFastify = true;
                    }
                } else if (!results.fastify.error) {
                    results.fastify.error = fastRes.error;
                }
            } else {
                results.fastify.error = results.fastify.error || 'fastify_user_mismatch';
            }
        }
    } else {
        const allowFastify = await canUseFastifyForShared();
        if (!allowFastify) {
            results.fastify.error = 'fastify_user_mismatch';
        } else {
            const fastRes = await list_fastify();
            if (fastRes.ok) {
                results.fastify.atomes = fastRes.list;
            } else if (!results.fastify.error) {
                results.fastify.error = fastRes.error;
            }
        }
        results.tauri = { atomes: [], error: 'skipped', skipped: true };
    }

    if (typeof callback === 'function') callback(results);
    return results;
}

/**
 * Delete an atome (soft delete to preserve history)
 * @param {string} atomeId - ID of the atome to delete (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function delete_atome(atomeId, callback) {
    // Handle callback-only call
    if (typeof atomeId === 'function') {
        callback = atomeId;
        atomeId = null;
    }

    // Security guard: require authenticated user for deleting atomes (anonymous allowed)
    const authCheck = await ensure_user_for_operation('delete_atome', { allowAnonymous: true });
    if (!authCheck.ok) {
        const blockedResult = create_unauthenticated_result(authCheck.error);
        return with_callback(blockedResult, callback);
    }

    // atomeId is required
    if (!atomeId) {
        const error = 'atomeId parameter is required';
        const results = make_results();
        set_error(results, 'tauri', error);
        set_error(results, 'fastify', error);
        return with_callback(results, callback);
    }

    const results = make_results();
    const dataPlan = resolve_backend_plan('data');
    const syncPolicy = resolve_sync_policy();

    let ownerId = null;
    try {
        const currentUserResult = await current_user();
        ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    } catch { }

    // Soft delete on primary backend first.
    try {
        const primaryResult = await dataPlan.primary.atome.softDelete(atomeId);
        if (primaryResult.ok || primaryResult.success) {
            set_success(results, dataPlan.source, primaryResult);
        } else {
            set_error(results, dataPlan.source, primaryResult.error);
        }
    } catch (e) {
        set_error(results, dataPlan.source, e.message);
    }

    // Real-time sync: also delete on secondary backend if available.
    if (results[dataPlan.source]?.success && is_anonymous_mode()) {
        set_error(results, dataPlan.secondaryName, 'skipped', { skipped: true });
    } else if (results[dataPlan.source]?.success) {
        try {
            const secondaryAvailable = await dataPlan.secondary.isAvailable?.();
            const secondaryToken = dataPlan.secondary.getToken?.();
            if (secondaryAvailable && secondaryToken) {
                const secondaryUserMatch = await ensure_secondary_user_match(dataPlan.secondaryName, ownerId);
                if (!secondaryUserMatch) {
                    set_error(results, dataPlan.secondaryName, 'secondary_user_mismatch', { skipped: true });
                } else {
                    const secondaryResult = await dataPlan.secondary.atome.softDelete(atomeId);
                    if (secondaryResult.ok || secondaryResult.success) {
                        set_success(results, dataPlan.secondaryName, secondaryResult);
                    } else {
                        // 404 is acceptable - atome may not exist on secondary
                        const errMsg = String(secondaryResult.error || '').toLowerCase();
                        if (errMsg.includes('not found') || secondaryResult.status === 404) {
                            set_success(results, dataPlan.secondaryName, null, { alreadyDeleted: true });
                        } else {
                            set_error(results, dataPlan.secondaryName, secondaryResult.error, { skipped: false });
                        }
                    }
                }
            } else {
                // Queue for later sync if secondary unavailable
                if (syncPolicy.to === 'fastify' && dataPlan.source === 'tauri' && ownerId && !is_anonymous_mode()) {
                    queue_pending_delete({ atomeId, ownerId, type: null });
                }
                set_error(results, dataPlan.secondaryName, 'secondary_unavailable', { skipped: true });
            }
        } catch (e) {
            set_error(results, dataPlan.secondaryName, e.message, { skipped: false });
        }
    } else {
        set_error(results, dataPlan.secondaryName, 'primary_failed', { skipped: true });
    }

    return with_callback(results, callback);
}

/**
 * Alter an atome's properties (update with history tracking)
 * The particles_versions table stores each change for undo functionality
 * @param {string} atomeId - ID of the atome to alter (REQUIRED)
 * @param {Object} newProperties - New property values to set/update (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function alter_atome(atomeId, newProperties, callback) {
    // Handle callback as second argument
    if (typeof newProperties === 'function') {
        callback = newProperties;
        newProperties = null;
    }

    // Security guard: require authenticated user for altering atomes (anonymous allowed)
    const authCheck = await ensure_user_for_operation('alter_atome', { allowAnonymous: true });
    if (!authCheck.ok) {
        const blockedResult = create_unauthenticated_result(authCheck.error);
        return with_callback(blockedResult, callback);
    }

    // Both atomeId and newParticles are required
    const payload = resolveAtomePropertiesPayload(newProperties);
    if (!atomeId || !payload || typeof payload !== 'object') {
        const error = !atomeId
            ? 'atomeId parameter is required'
            : 'properties object is required';
        const results = make_results();
        set_error(results, 'tauri', error);
        set_error(results, 'fastify', error);
        return with_callback(results, callback);
    }

    const results = make_results();
    const dataPlan = resolve_backend_plan('data');

    // Update on primary backend first.
    try {
        const primaryResult = await dataPlan.primary.atome.update(atomeId, payload);
        if (primaryResult.ok || primaryResult.success) {
            set_success(results, dataPlan.source, primaryResult);
        } else {
            set_error(results, dataPlan.source, primaryResult.error);
        }
    } catch (e) {
        set_error(results, dataPlan.source, e.message);
    }

    // Real-time sync: also update on secondary backend if available.
    if (results[dataPlan.source]?.success && is_anonymous_mode()) {
        set_error(results, dataPlan.secondaryName, 'skipped', { skipped: true });
    } else if (results[dataPlan.source]?.success) {
        try {
            const secondaryAvailable = await dataPlan.secondary.isAvailable?.();
            const secondaryToken = dataPlan.secondary.getToken?.();
            if (secondaryAvailable && secondaryToken) {
                const secondaryUserMatch = await ensure_secondary_user_match(dataPlan.secondaryName, authCheck.user?.id || null);
                if (!secondaryUserMatch) {
                    set_error(results, dataPlan.secondaryName, 'secondary_user_mismatch', { skipped: true });
                } else {
                    const secondaryResult = await dataPlan.secondary.atome.update(atomeId, payload);
                    if (secondaryResult.ok || secondaryResult.success) {
                        set_success(results, dataPlan.secondaryName, secondaryResult);
                    } else {
                        // 404 is acceptable - atome may not exist on secondary yet
                        const errMsg = String(secondaryResult.error || '').toLowerCase();
                        if (errMsg.includes('not found') || secondaryResult.status === 404) {
                            set_error(results, dataPlan.secondaryName, 'not_found_on_secondary', { skipped: true });
                        } else {
                            set_error(results, dataPlan.secondaryName, secondaryResult.error, { skipped: false });
                        }
                    }
                }
            } else {
                set_error(results, dataPlan.secondaryName, 'secondary_unavailable', { skipped: true });
            }
        } catch (e) {
            set_error(results, dataPlan.secondaryName, e.message, { skipped: false });
        }
    } else {
        set_error(results, dataPlan.secondaryName, 'primary_failed', { skipped: true });
    }

    return with_callback(results, callback);
}

/**
 * Broadcast-only realtime patch for an atome (no DB write)
 * Used for continuous drag so collaborators see movement immediately.
 * @param {string} atomeId
 * @param {Object} properties
 * @param {Function} [callback]
 */
async function realtime_patch(atomeId, properties, callback) {
    if (typeof properties === 'function') {
        callback = properties;
        properties = null;
    }

    const payload = resolveAtomePropertiesPayload(properties);
    if (!atomeId || !payload || typeof payload !== 'object') {
        const error = !atomeId ? 'atomeId parameter is required' : 'properties object is required';
        const results = make_results();
        set_error(results, 'tauri', error);
        set_error(results, 'fastify', error);
        return with_callback(results, callback);
    }

    const results = make_results();

    const isTauriRuntime = !!(typeof window !== 'undefined' && (window.__TAURI__ || window.__TAURI_INTERNALS__));

    const tasks = [];

    // Only call Tauri realtime when actually inside Tauri.
    if (isTauriRuntime && TauriAdapter?.atome?.realtime) {
        tasks.push((async () => {
            try {
                const tauriResult = await TauriAdapter.atome.realtime(atomeId, payload);
                if (tauriResult.ok || tauriResult.success) {
                    set_success(results, 'tauri', tauriResult);
                } else {
                    set_error(results, 'tauri', tauriResult.error);
                }
            } catch (e) {
                set_error(results, 'tauri', e.message);
            }
        })());
    }

    if (FastifyAdapter?.atome?.realtime) {
        tasks.push((async () => {
            try {
                const fastifyResult = await FastifyAdapter.atome.realtime(atomeId, payload);
                if (fastifyResult.ok || fastifyResult.success) {
                    set_success(results, 'fastify', fastifyResult);
                } else {
                    set_error(results, 'fastify', fastifyResult.error);
                }
            } catch (e) {
                set_error(results, 'fastify', e.message);
            }
        })());
    }

    if (tasks.length > 0) {
        try { await Promise.allSettled(tasks); } catch { }
    }

    return with_callback(results, callback);
}

export { create_atome, list_atomes, delete_atome, alter_atome, realtime_patch };
