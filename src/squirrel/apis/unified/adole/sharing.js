import { TauriAdapter, FastifyAdapter } from '../adole.js';
import {
  is_anonymous_mode,
  is_tauri_runtime,
  ensure_fastify_ws_auth,
  ensure_fastify_token,
  require_authenticated_user,
  create_unauthenticated_result,
  current_user,
  lookup_user_by_phone,
  request_sync,
  extract_atome_properties,
  normalizeAtomeRecord,
  is_already_exists_error
} from './core.js';

const with_callback = (result, callback) => {
  if (typeof callback === 'function') callback(result);
  return result;
};

const fastify_share_call = async (method, payload, callback) => {
  if (is_anonymous_mode()) {
    return with_callback({ ok: false, success: false, error: 'Sharing is disabled in anonymous mode' }, callback);
  }

  let result = null;
  try {
    const authCheck = await ensure_fastify_ws_auth();
    if (!authCheck.ok) {
      result = { ok: false, success: false, error: authCheck.error };
    } else {
      result = await FastifyAdapter.share[method](payload || {});
    }
  } catch (e) {
    result = { ok: false, success: false, error: e.message };
  }

  return with_callback(result, callback);
};

const ensureFastifyAtomeExists = async (atomeId) => {
  if (!atomeId) return { ok: false, error: 'missing_atome_id' };

  try {
    const res = await FastifyAdapter.atome.get(atomeId);
    if (res?.ok || res?.success) {
      const atome = res.atome || res.data || null;
      return atome ? { ok: true, atome, source: 'fastify' } : { ok: false, error: 'atome_not_found' };
    }
  } catch { }

  if (is_tauri_runtime() && !FastifyAdapter.getToken?.()) {
    try { await ensure_fastify_token(); } catch { }
  }

  try {
    const tauriRes = await TauriAdapter.atome.get(atomeId);
    const raw = tauriRes?.atome || tauriRes?.data || null;
    if (!raw) return { ok: false, error: 'atome_not_found' };

    const normalized = normalizeAtomeRecord(raw) || raw;
    const normalizedType = String(
      normalized.atome_type || normalized.atomeType || normalized.type || normalized.kind || ''
    ).trim().toLowerCase();
    if (!normalizedType || normalizedType === 'atome') {
      return { ok: false, error: 'invalid_atome_type' };
    }
    const payload = {
      id: normalized.atome_id || normalized.atomeId || normalized.id || atomeId,
      type: normalizedType,
      ownerId: normalized.owner_id || normalized.ownerId || normalized.owner || normalized.userId || null,
      parentId: normalized.parent_id || normalized.parentId || normalized.parent || null,
      properties: extract_atome_properties(normalized),
      sync: true
    };

    const createRes = await FastifyAdapter.atome.create(payload);
    const ok = !!(createRes?.ok || createRes?.success || is_already_exists_error(createRes));
    return { ok, created: !!(createRes?.ok || createRes?.success), error: ok ? null : (createRes?.error || 'fastify_create_failed') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

/**
 * Grant Fastify share permissions WITHOUT creating share_request atomes.
 * Useful for project collaboration where children are added over time.
 * @param {string} atomeId
 * @param {string} principalId
 * @param {{read?:boolean, alter?:boolean, delete?:boolean, create?:boolean}} sharePermissions
 * @param {object} [options]
 * @param {string|null} [options.particleKey]
 * @param {string|null} [options.expiresAt]
 */
async function grant_share_permission(atomeId, principalId, sharePermissions, options = {}, callback) {
  const results = {
    tauri: { success: false, data: null, error: 'Not supported (permissions are managed on Fastify)' },
    fastify: { success: false, data: null, error: null }
  };

  if (is_anonymous_mode()) {
    results.fastify = { success: false, data: null, error: 'Sharing is disabled in anonymous mode' };
    return with_callback(results, callback);
  }

  try {
    const authCheck = await ensure_fastify_ws_auth();
    if (!authCheck.ok) {
      results.fastify.error = authCheck.error;
      return with_callback(results, callback);
    }

    const currentUserResult = await current_user();
    const sharerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;
    if (!sharerId) {
      results.fastify.error = 'No user logged in. Please log in first.';
      return with_callback(results, callback);
    }

    if (!atomeId || !principalId) {
      results.fastify.error = 'Missing atomeId or principalId';
      return with_callback(results, callback);
    }

    const ensureRes = await ensureFastifyAtomeExists(String(atomeId));
    if (!ensureRes.ok) {
      results.fastify.error = ensureRes.error || 'Atome not present on Fastify';
      return with_callback(results, callback);
    }

    const permissionPayload = {
      can_read: !!sharePermissions?.read,
      can_write: !!sharePermissions?.alter,
      can_delete: !!sharePermissions?.delete,
      can_share: false,
      can_create: !!sharePermissions?.create
    };

    const particleKey = options?.particleKey || options?.particle_key || null;
    const expiresAt = options?.expiresAt || options?.expires_at || null;

    const res = await FastifyAdapter.share.create({
      userId: sharerId,
      atomeId: String(atomeId),
      principalId: String(principalId),
      permission: permissionPayload,
      particleKey,
      expiresAt
    });

    const ok = !!(res?.ok || res?.success);
    results.fastify = { success: ok, data: res, error: ok ? null : (res?.error || res?.message || 'Permission grant failed') };
  } catch (e) {
    results.fastify.error = e.message;
  }

  return with_callback(results, callback);
}

/**
 * Share one or more Atomes with another user
 * @param {string} phoneNumber - Target user's phone number
 * @param {string|Array<string>} atomeIds - Atome IDs to share (single ID or array)
 * @param {Object} sharePermissions - Global permissions { read: boolean, alter: boolean, delete: boolean, create: boolean }
 * @param {string} sharingMode - 'real-time' or 'validation-based'
 * @param {Object} propertyOverrides - Optional property-level permission overrides
 * @param {string} [currentProjectId] - ID of the current project on screen (optional)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function share_atome(phoneNumber, atomeIds, sharePermissions, sharingMode, propertyOverrides = {}, currentProjectId = null, callback) {
  // Security guard: require authenticated user for sharing
  if (is_anonymous_mode()) {
    return with_callback(create_unauthenticated_result('Sharing is disabled in anonymous mode'), callback);
  }
  const authCheck = require_authenticated_user('share_atome');
  if (!authCheck.authenticated) {
    return with_callback(create_unauthenticated_result(authCheck.error), callback);
  }

  const results = {
    tauri: { success: false, data: null, error: 'Share requests are handled by Fastify' },
    fastify: { success: false, data: null, error: null }
  };

  const shareDebugContext = (extra = {}) => ({
    targetPhone: phoneNumber || null,
    atomeIds: Array.isArray(atomeIds) ? atomeIds : atomeIds ? [atomeIds] : [],
    mode: sharingMode || 'real-time',
    ...extra
  });

  if (!phoneNumber) {
    results.fastify.error = 'Phone number is required';
    return with_callback(results, callback);
  }

  const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : (atomeIds ? [String(atomeIds)] : []);
  if (!ids.length) {
    results.fastify.error = 'At least one Atome ID is required';
    return with_callback(results, callback);
  }

  if (!sharePermissions || typeof sharePermissions !== 'object') {
    results.fastify.error = 'Share permissions object is required';
    return with_callback(results, callback);
  }

  const mode = sharingMode || 'real-time';

  const permissions = {
    read: !!sharePermissions.read,
    alter: !!sharePermissions.alter,
    delete: !!sharePermissions.delete,
    create: !!sharePermissions.create
  };

  const overrides = propertyOverrides && typeof propertyOverrides === 'object'
    ? { ...propertyOverrides }
    : {};

  const shareType = String(overrides.__shareType || overrides.shareType || 'linked');
  if (!overrides.__shareType) overrides.__shareType = shareType;

  let targetUserId = overrides.__targetUserId || null;
  if (!targetUserId) {
    try {
      const found = await lookup_user_by_phone(phoneNumber);
      targetUserId = found?.user_id || found?.id || null;
    } catch (_) {
      targetUserId = null;
    }
  }

  try {
    const authCheckFastify = await ensure_fastify_ws_auth();
    if (!authCheckFastify.ok) {
      console.warn('[Share] Fastify auth failed', shareDebugContext({
        error: authCheckFastify.error || null,
        targetUserId
      }));
      results.fastify.error = authCheckFastify.error;
      return with_callback(results, callback);
    }

    try {
      await request_sync('share');
    } catch (e) {
      console.warn('[Share] Pre-share sync failed', shareDebugContext({
        error: e?.message || String(e),
        targetUserId
      }));
    }

    const payload = {
      targetUserId: targetUserId || null,
      targetPhone: phoneNumber,
      atomeIds: ids,
      permissions,
      mode,
      shareType,
      propertyOverrides: overrides
    };

    const fastifyResult = await FastifyAdapter.share.request(payload);
    const ok = !!(fastifyResult?.ok || fastifyResult?.success);
    if (!ok) {
      console.warn('[Share] Share request failed', shareDebugContext({
        error: fastifyResult?.error || fastifyResult?.message || 'Share request failed',
        targetUserId,
        payload
      }));
    }
    results.fastify = {
      success: ok,
      data: fastifyResult,
      error: ok ? null : (fastifyResult?.error || fastifyResult?.message || 'Share request failed')
    };
  } catch (e) {
    results.fastify.error = e.message;
  }

  return with_callback(results, callback);
}

const share_request = (payload, callback) => fastify_share_call('request', payload, callback);
const share_respond = (payload, callback) => fastify_share_call('respond', payload, callback);
const share_publish = (payload, callback) => fastify_share_call('publish', payload, callback);
const share_policy = (payload, callback) => fastify_share_call('policy', payload, callback);

export {
  share_atome,
  share_request,
  share_respond,
  share_publish,
  share_policy,
  grant_share_permission
};
