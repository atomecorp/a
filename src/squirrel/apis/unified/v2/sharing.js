import { TauriAdapter, FastifyAdapter } from '../adole.js';
import { isTauriRuntime } from './runtime.js';
import { getSessionState } from './session.js';

const adapters = { tauri: TauriAdapter, fastify: FastifyAdapter };

const with_callback = (result, callback) => {
    if (typeof callback === 'function') callback(result);
    return result;
};

const requireAuthenticatedUser = () => {
    const state = getSessionState();
    if (!state || state.mode === 'logged_out') {
        return { ok: false, error: 'not_authenticated', userId: null };
    }
    if (state.mode === 'anonymous') {
        return { ok: false, error: 'anonymous_not_allowed', userId: state.user?.id || null };
    }
    return { ok: true, userId: state.user?.id || null };
};

const extractProperties = (record) => {
    if (!record || typeof record !== 'object') return {};
    if (record.properties && typeof record.properties === 'object') return record.properties;
    if (record.particles && typeof record.particles === 'object') return record.particles;
    if (record.data && typeof record.data === 'object') return record.data;
    return {};
};

const normalizeAtome = (record) => {
    if (!record || typeof record !== 'object') return null;
    const id = record.atome_id || record.id || null;
    const type = record.atome_type || record.type || record.kind || null;
    const ownerId = record.owner_id || record.ownerId || record.owner || null;
    const parentId = record.parent_id || record.parentId || record.parent || null;
    return {
        id,
        type,
        ownerId,
        parentId,
        properties: extractProperties(record)
    };
};

const ensureFastifyAtomeExists = async (atomeId) => {
    if (!atomeId) return { ok: false, error: 'missing_atome_id' };
    try {
        const res = await FastifyAdapter.atome.get(atomeId);
        if (res?.ok || res?.success) return { ok: true, source: 'fastify' };
    } catch (_) { }

    if (!isTauriRuntime()) return { ok: false, error: 'fastify_atome_missing' };

    try {
        const localRes = await TauriAdapter.atome.get(atomeId);
        const raw = localRes?.atome || localRes?.data || null;
        const normalized = normalizeAtome(raw);
        if (!normalized?.id) return { ok: false, error: 'local_atome_missing' };
        const normalizedType = String(normalized.type || '').trim().toLowerCase();
        if (!normalizedType || normalizedType === 'atome') {
            return { ok: false, error: 'invalid_atome_type' };
        }
        const payload = {
            id: normalized.id,
            atome_id: normalized.id,
            type: normalizedType,
            atome_type: normalizedType,
            owner_id: normalized.ownerId,
            parent_id: normalized.parentId,
            properties: normalized.properties || {}
        };
        const createRes = await FastifyAdapter.atome.create(payload);
        const ok = !!(createRes?.ok || createRes?.success);
        return { ok, source: ok ? 'fastify' : 'fastify_create_failed' };
    } catch (e) {
        return { ok: false, error: e?.message || 'fastify_create_failed' };
    }
};

export async function grant_share_permission(atomeId, principalId, sharePermissions, options = {}, callback) {
    const authCheck = requireAuthenticatedUser();
    const results = {
        tauri: { success: false, data: null, error: 'Not supported (permissions are managed on Fastify)' },
        fastify: { success: false, data: null, error: null }
    };

    if (!authCheck.ok) {
        results.fastify.error = authCheck.error;
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

    const res = await FastifyAdapter.share.create({
        user_id: authCheck.userId,
        atome_id: String(atomeId),
        principal_id: String(principalId),
        permission: permissionPayload,
        particle_key: options?.particle_key || options?.particleKey || null,
        expires_at: options?.expires_at || options?.expiresAt || null
    });

    const ok = !!(res?.ok || res?.success);
    results.fastify = { success: ok, data: res, error: ok ? null : (res?.error || res?.message || 'Permission grant failed') };
    return with_callback(results, callback);
}

export async function share_atome(phoneNumber, atomeIds, sharePermissions, sharingMode, propertyOverrides = {}, currentProjectId = null, callback) {
    const authCheck = requireAuthenticatedUser();
    if (!authCheck.ok) {
        return with_callback({ tauri: { success: false, error: authCheck.error }, fastify: { success: false, error: authCheck.error } }, callback);
    }

    const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : (atomeIds ? [String(atomeIds)] : []);
    if (!phoneNumber || !ids.length) {
        return with_callback({ tauri: { success: false, error: 'missing_payload' }, fastify: { success: false, error: 'missing_payload' } }, callback);
    }

    for (const id of ids) {
        try { await ensureFastifyAtomeExists(id); } catch (_) { }
    }

    const permissions = {
        read: !!sharePermissions?.read,
        alter: !!sharePermissions?.alter,
        delete: !!sharePermissions?.delete,
        create: !!sharePermissions?.create
    };

    const overrides = propertyOverrides && typeof propertyOverrides === 'object' ? { ...propertyOverrides } : {};
    const shareType = String(overrides.__shareType || overrides.shareType || 'linked');
    if (!overrides.__shareType) overrides.__shareType = shareType;

    const payload = {
        target_phone: phoneNumber,
        atome_ids: ids,
        permissions,
        mode: sharingMode || 'real-time',
        share_type: shareType,
        property_overrides: overrides,
        current_project_id: currentProjectId || null
    };

    const fastifyRes = await FastifyAdapter.share.request(payload);
    const ok = !!(fastifyRes?.ok || fastifyRes?.success);
    const result = {
        tauri: { success: false, data: null, error: 'Share requests are handled by Fastify' },
        fastify: { success: ok, data: fastifyRes, error: ok ? null : (fastifyRes?.error || fastifyRes?.message || 'share_failed') }
    };

    return with_callback(result, callback);
}

export async function share_request(payload = {}, callback) {
    const authCheck = requireAuthenticatedUser();
    if (!authCheck.ok) {
        return with_callback({ ok: false, error: authCheck.error }, callback);
    }
    const res = await FastifyAdapter.share.request(payload);
    return with_callback(res, callback);
}

export async function share_respond(payload = {}, callback) {
    const authCheck = requireAuthenticatedUser();
    if (!authCheck.ok) {
        return with_callback({ ok: false, error: authCheck.error }, callback);
    }
    const res = await FastifyAdapter.share.respond(payload);
    return with_callback(res, callback);
}

export async function share_publish(payload = {}, callback) {
    const authCheck = requireAuthenticatedUser();
    if (!authCheck.ok) {
        return with_callback({ ok: false, error: authCheck.error }, callback);
    }
    const res = await FastifyAdapter.share.publish(payload);
    return with_callback(res, callback);
}

export async function share_policy(payload = {}, callback) {
    const authCheck = requireAuthenticatedUser();
    if (!authCheck.ok) {
        return with_callback({ ok: false, error: authCheck.error }, callback);
    }
    const res = await FastifyAdapter.share.policy(payload);
    return with_callback(res, callback);
}

export default {
    share_atome,
    share_request,
    share_respond,
    share_publish,
    share_policy,
    grant_share_permission
};
