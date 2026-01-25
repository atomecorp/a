/**
 * Sharing & Permissions System - ADOLE v3.0
 * 
 * Manages sharing of atomes (projects, documents, files) between users.
 * Uses the ADOLE permissions table for persistent, secure access control.
 * 
 * Features:
 * - Granular permissions (read, write, delete, share)
 * - Particle-level restrictions (optional)
 * - Expiration dates
 * - Full audit trail (granted_by, granted_at)
 * - WebSocket sync for real-time permission updates
 */

import db from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import { wsSendJsonToUser } from './wsApiState.js';
import { broadcastAtomeCreate } from './atomeRealtime.js';

/**
 * Permission levels (bitmask compatible)
 */
export const PERMISSION = {
    NONE: 0,
    READ: 1,
    WRITE: 2,
    DELETE: 4,
    SHARE: 8,
    CREATE: 16,
    ADMIN: 31  // READ | WRITE | DELETE | SHARE | CREATE
};

/**
 * Convert permission level to granular flags
 */
function permissionToFlags(level) {
    if (typeof level === 'object' && level) {
        // Normalize booleans/strings to SQLite-friendly integers.
        // sqlite3 does not accept boolean values as bound parameters.
        return {
            can_read: level.can_read ? 1 : 0,
            can_write: level.can_write ? 1 : 0,
            can_delete: level.can_delete ? 1 : 0,
            can_share: level.can_share ? 1 : 0,
            can_create: level.can_create ? 1 : 0
        };
    }

    return {
        can_read: (level & PERMISSION.READ) ? 1 : 0,
        can_write: (level & PERMISSION.WRITE) ? 1 : 0,
        can_delete: (level & PERMISSION.DELETE) ? 1 : 0,
        can_share: (level & PERMISSION.SHARE) ? 1 : 0,
        can_create: (level & PERMISSION.CREATE) ? 1 : 0
    };
}

/**
 * Convert granular flags to permission level
 */
function flagsToPermission(flags) {
    let level = 0;
    if (flags.can_read) level |= PERMISSION.READ;
    if (flags.can_write) level |= PERMISSION.WRITE;
    if (flags.can_delete) level |= PERMISSION.DELETE;
    if (flags.can_share) level |= PERMISSION.SHARE;
    if (flags.can_create) level |= PERMISSION.CREATE;
    return level;
}

/**
 * Emit permission change via WebSocket
 */
function emitPermissionChange(action, permission) {
    try {
        const eventBus = getABoxEventBus();
        if (eventBus) {
            eventBus.emit('event', {
                type: 'permission-change',
                action,
                permission: {
                    permission_id: permission.permission_id,
                    atome_id: permission.atome_id,
                    principal_id: permission.principal_id,
                    can_read: permission.can_read,
                    can_write: permission.can_write,
                    can_delete: permission.can_delete,
                    can_share: permission.can_share,
                    can_create: permission.can_create,
                    share_mode: permission.share_mode || null,
                    conditions: permission.conditions || null,
                    expires_at: permission.expires_at || null
                },
                timestamp: new Date().toISOString()
            });
        }
    } catch (e) {
        console.warn('Failed to emit permission change:', e.message);
    }
}

/**
 * Create or update a share (permission)
 * 
 * @param {string} grantorId - User granting the permission (must be owner or have can_share)
 * @param {string} atomeId - The atome being shared
 * @param {string} principalId - The user receiving permission
 * @param {number|object} permission - Permission level or flags object
 * @param {object} options - Optional: particleKey, expiresAt
 * @returns {object} Result with created/updated permission
 */
export async function createShare(grantorId, atomeId, principalId, permission, options = {}) {
    const { particleKey = null, expiresAt = null, shareMode = null, conditions = null } = options;

    // Verify grantor has permission to share
    const canShare = await checkCanShare(grantorId, atomeId);
    if (!canShare) {
        try {
            const atome = await db.query('get', `SELECT owner_id FROM atomes WHERE atome_id = ?`, [atomeId]);
            let pendingOwner = null;
            try {
                const pending = await db.query('get', `
                    SELECT particle_value
                    FROM particles
                    WHERE atome_id = ? AND particle_key = '_pending_owner_id'
                    LIMIT 1
                `, [atomeId]);
                if (pending?.particle_value) pendingOwner = JSON.parse(pending.particle_value);
            } catch (_) { }

            const hasSharePermission = await db.query('get', `
                SELECT can_share
                FROM permissions
                WHERE atome_id = ? AND principal_id = ?
                AND (expires_at IS NULL OR expires_at > datetime('now'))
                LIMIT 1
            `, [atomeId, grantorId]);

            console.warn('[sharing] createShare denied', {
                grantorId,
                atomeId,
                principalId,
                owner_id: atome?.owner_id || null,
                pending_owner_id: pendingOwner,
                grantor_can_share: hasSharePermission?.can_share || 0
            });
        } catch (_) { }
        return { success: false, error: 'You do not have permission to share this resource' };
    }

    const flags = permissionToFlags(permission);
    const now = new Date().toISOString();
    const resolvedShareMode = shareMode || permission?.share_mode || permission?.shareMode || null;
    const resolvedConditions = conditions || permission?.conditions || null;

    try {
        // Check if permission already exists
        const existing = await db.query('get', `
            SELECT permission_id FROM permissions 
            WHERE atome_id = ? AND principal_id = ? AND (particle_key IS NULL OR particle_key = ?)
        `, [atomeId, principalId, particleKey]);

        let permissionId;

        if (existing) {
            // Update existing permission
            await db.query('run', `
                UPDATE permissions SET
                    can_read = ?,
                    can_write = ?,
                    can_delete = ?,
                    can_share = ?,
                    can_create = ?,
                    granted_by = ?,
                    granted_at = ?,
                    expires_at = ?,
                    share_mode = COALESCE(?, share_mode),
                    conditions = COALESCE(?, conditions)
                WHERE permission_id = ?
            `, [
                flags.can_read,
                flags.can_write,
                flags.can_delete,
                flags.can_share,
                flags.can_create,
                grantorId,
                now,
                expiresAt,
                resolvedShareMode,
                resolvedConditions ? JSON.stringify(resolvedConditions) : null,
                existing.permission_id
            ]);
            permissionId = existing.permission_id;
            console.log(`Permission updated: ${atomeId} -> ${principalId}`);
        } else {
            // Create new permission
            await db.query('run', `
                INSERT INTO permissions (atome_id, particle_key, principal_id, can_read, can_write, can_delete, can_share, can_create, granted_by, granted_at, expires_at, share_mode, conditions)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                atomeId,
                particleKey,
                principalId,
                flags.can_read,
                flags.can_write,
                flags.can_delete,
                flags.can_share,
                flags.can_create,
                grantorId,
                now,
                expiresAt,
                resolvedShareMode,
                resolvedConditions ? JSON.stringify(resolvedConditions) : null
            ]);

            // Get the inserted ID
            const inserted = await db.query('get', `
                SELECT permission_id FROM permissions 
                WHERE atome_id = ? AND principal_id = ? ORDER BY permission_id DESC LIMIT 1
            `, [atomeId, principalId]);
            permissionId = inserted?.permission_id;
            console.log(`Permission created: ${atomeId} -> ${principalId}`);
        }

        const share = {
            permission_id: permissionId,
            atome_id: atomeId,
            particle_key: particleKey,
            principal_id: principalId,
            ...flags,
            granted_by: grantorId,
            granted_at: now,
            expires_at: expiresAt,
            share_mode: resolvedShareMode,
            conditions: resolvedConditions
        };

        emitPermissionChange(existing ? 'update' : 'create', share);

        return { success: true, data: share };

    } catch (error) {
        console.error('Failed to create share:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Revoke a share (delete permission)
 */
export async function revokeShare(grantorId, permissionId) {
    try {
        // Get the permission to verify ownership
        const permission = await db.query('get', `
            SELECT p.*, a.owner_id 
            FROM permissions p
            JOIN atomes a ON p.atome_id = a.atome_id
            WHERE p.permission_id = ?
        `, [permissionId]);

        if (!permission) {
            return { success: false, error: 'Permission not found' };
        }

        // Only owner or grantor can revoke
        if (permission.owner_id !== grantorId && permission.granted_by !== grantorId) {
            return { success: false, error: 'Only owner or grantor can revoke this permission' };
        }

        await db.query('run', `DELETE FROM permissions WHERE permission_id = ?`, [permissionId]);

        console.log(`Permission revoked: ${permissionId}`);
        emitPermissionChange('revoke', permission);

        return { success: true };

    } catch (error) {
        console.error('Failed to revoke share:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Check if user can share an atome (is owner or has can_share permission)
 */
async function checkCanShare(userId, atomeId) {
    if (!userId || !atomeId) {
        console.warn('[Share] checkCanShare: missing userId or atomeId:', { userId, atomeId });
        return false;
    }
    try {
        const result = await db.canShare(atomeId, userId);
        if (!result) {
            // Get atome details for debugging
            const atome = await db.getAtome(atomeId);
            console.warn('[Share] checkCanShare DENIED:', {
                userId,
                atomeId,
                atomeOwnerId: atome?.owner_id || 'NO_OWNER',
                atomeType: atome?.atome_type || 'UNKNOWN'
            });
        }
        return result;
    } catch (err) {
        console.error('[Share] checkCanShare error:', err);
        return false;
    }
}

/**
 * Check if user has specific permission on atome
 */
export async function checkPermission(userId, atomeId, requiredPermission = PERMISSION.READ) {
    const checks = [];
    if (requiredPermission & PERMISSION.READ) {
        checks.push(db.canRead(atomeId, userId));
    }
    if (requiredPermission & PERMISSION.WRITE) {
        checks.push(db.canWrite(atomeId, userId));
    }
    if (requiredPermission & PERMISSION.DELETE) {
        checks.push(db.canDelete(atomeId, userId));
    }
    if (requiredPermission & PERMISSION.SHARE) {
        checks.push(db.canShare(atomeId, userId));
    }
    if (requiredPermission & PERMISSION.CREATE) {
        checks.push(db.canCreate(atomeId, userId));
    }

    if (checks.length === 0) return false;
    const results = await Promise.all(checks);
    return results.every(Boolean);
}

/**
 * Get all shares for a specific atome
 */
export async function getSharesForAtome(atomeId) {
    const shares = await db.query('all', `
        SELECT p.*, a.atome_type as principal_type
        FROM permissions p
        LEFT JOIN atomes a ON p.principal_id = a.atome_id
        WHERE p.atome_id = ?
        ORDER BY p.granted_at DESC
    `, [atomeId]);

    return shares || [];
}

/**
 * Get all shares granted to a user (resources shared with them)
 */
export async function getSharesForUser(userId) {
    const shares = await db.query('all', `
        SELECT p.*, a.atome_type, a.owner_id
        FROM permissions p
        JOIN atomes a ON p.atome_id = a.atome_id
        WHERE p.principal_id = ?
        AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))
        ORDER BY p.granted_at DESC
    `, [userId]);

    return shares || [];
}

/**
 * Get all shares granted by a user (resources they shared)
 */
export async function getSharesGrantedByUser(userId) {
    const shares = await db.query('all', `
        SELECT p.*, a.atome_type
        FROM permissions p
        JOIN atomes a ON p.atome_id = a.atome_id
        WHERE p.granted_by = ?
        ORDER BY p.granted_at DESC
    `, [userId]);

    return shares || [];
}

/**
 * Get all atomes accessible by user (owned + shared)
 */
export async function getAccessibleAtomes(userId, atomeType = null) {
    let query = `
        SELECT DISTINCT a.* FROM atomes a
        LEFT JOIN permissions p ON a.atome_id = p.atome_id
        WHERE (a.owner_id = ? OR (p.principal_id = ? AND p.can_read = 1 AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))))
        AND a.deleted_at IS NULL
    `;
    const params = [userId, userId];

    if (atomeType) {
        query += ` AND a.atome_type = ?`;
        params.push(atomeType);
    }

    query += ` ORDER BY a.updated_at DESC`;

    const rows = await db.query('all', query, params) || [];
    const filtered = [];
    for (const row of rows) {
        const id = row?.atome_id ? String(row.atome_id) : null;
        if (!id) continue;
        const allowed = await db.canRead(id, userId);
        if (allowed) filtered.push(row);
    }
    return filtered;
}

function normalizeDurationToExpiry(duration) {
    if (!duration) return null;
    if (typeof duration === 'number' && Number.isFinite(duration)) {
        return new Date(Date.now() + (duration * 1000)).toISOString();
    }

    if (typeof duration !== 'string') return null;
    const trimmed = duration.trim();
    if (!trimmed) return null;

    const directDate = new Date(trimmed);
    if (!Number.isNaN(directDate.getTime())) {
        return directDate.toISOString();
    }

    const match = trimmed.match(/^(\d+)\s*([smhdw])$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    const seconds = amount * (multipliers[unit] || 0);
    if (!seconds) return null;
    return new Date(Date.now() + (seconds * 1000)).toISOString();
}

async function loadAtomesByOwnerWithParticles(ownerId, atomeType) {
    const rows = await db.getAtomesByOwner(ownerId, { type: atomeType, limit: 1000, offset: 0 });
    const results = [];
    for (const row of rows || []) {
        const id = row?.atome_id || row?.id;
        if (!id) continue;
        const full = await db.getAtome(id);
        if (full) results.push(full);
    }
    return results;
}

async function findSharePolicy(ownerId, peerUserId) {
    if (!ownerId || !peerUserId) return null;
    const policies = await loadAtomesByOwnerWithParticles(ownerId, 'share_policy');
    for (const policy of policies) {
        const particles = policy?.data || policy?.particles || {};
        const peer = particles.peerUserId || particles.peer_user_id || null;
        if (String(peer || '') === String(peerUserId)) {
            return { id: policy.atome_id || policy.id, particles };
        }
    }
    return null;
}

async function upsertSharePolicy(ownerId, peerUserId, policy, permissions) {
    if (!ownerId || !peerUserId || !policy) return null;
    const existing = await findSharePolicy(ownerId, peerUserId);
    const now = new Date().toISOString();
    const payload = {
        peerUserId: String(peerUserId),
        policy: String(policy),
        permissions: permissions || null,
        updatedAt: now,
        createdAt: existing?.particles?.createdAt || now
    };

    if (existing?.id) {
        await db.updateAtome(existing.id, payload);
        return existing.id;
    }

    const created = await db.createAtome({
        id: null,
        type: 'share_policy',
        parent: null,
        owner: ownerId,
        creator: ownerId,
        properties: payload
    });
    return created?.atome_id || created?.id || null;
}

function extractShareType(particles) {
    const direct = particles?.shareType || particles?.share_type || null;
    const override = particles?.propertyOverrides?.__shareType || particles?.propertyOverrides?.shareType || null;
    return String(direct || override || 'linked');
}

function extractShareMeta(particles) {
    const override = particles?.propertyOverrides?.__shareMeta || particles?.shareMeta || null;
    return override && typeof override === 'object' ? override : {};
}

function extractAtomeIdsFromRequest(particles) {
    const ids = Array.isArray(particles?.atomeIds) ? particles.atomeIds : [];
    if (ids.length) return ids.map(String);
    const shared = Array.isArray(particles?.sharedAtomes) ? particles.sharedAtomes : [];
    return shared
        .map((item) => item?.originalId || item?.original_atome_id || item?.originalAtomeId || item?.sharedAtomeId || item?.shared_atome_id || null)
        .filter(Boolean)
        .map(String);
}

const NON_SHAREABLE_TYPES = new Set(['share_request', 'share_link', 'share_policy']);

async function collectDescendants(rootId, expanded, visited) {
    const queue = [String(rootId)];
    const seen = visited || new Set();

    while (queue.length) {
        const current = queue.shift();
        if (!current || seen.has(current)) continue;
        seen.add(current);

        const rows = await db.query(
            'all',
            'SELECT atome_id, atome_type FROM atomes WHERE parent_id = ? AND deleted_at IS NULL',
            [current]
        );

        for (const row of rows || []) {
            const childId = row?.atome_id ? String(row.atome_id) : null;
            if (!childId || seen.has(childId)) continue;
            const childType = row?.atome_type ? String(row.atome_type) : '';
            if (NON_SHAREABLE_TYPES.has(childType)) continue;
            expanded.add(childId);
            queue.push(childId);
        }
    }
}

async function resolveShareAtomeIds(atomeIds) {
    const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : [];
    if (!ids.length) return { ids: [], error: 'No atomes to share' };

    const expanded = new Set();
    for (const id of ids) {
        const row = await db.query(
            'get',
            'SELECT atome_type FROM atomes WHERE atome_id = ? AND deleted_at IS NULL',
            [id]
        );
        if (!row) {
            return { ids: [], error: `Atome not found: ${id}` };
        }
        const type = row?.atome_type ? String(row.atome_type) : '';
        if (NON_SHAREABLE_TYPES.has(type)) {
            return { ids: [], error: `Atome type not shareable: ${type}` };
        }
        expanded.add(id);
        if (type === 'project') {
            await collectDescendants(id, expanded);
        }
    }

    return { ids: Array.from(expanded), error: null };
}

async function applyShareAcceptance({ sharerId, targetUserId, particles }) {
    console.log('[Share] applyShareAcceptance called:', { sharerId, targetUserId, particles: JSON.stringify(particles) });

    if (!sharerId || !targetUserId || !particles) {
        return { ok: false, error: 'Missing sharer or target' };
    }

    const shareType = extractShareType(particles);
    console.log('[Share] Extracted shareType:', shareType);

    const atomeIdsRaw = extractAtomeIdsFromRequest(particles);
    console.log('[Share] atomeIdsRaw:', atomeIdsRaw);

    const resolved = await resolveShareAtomeIds(atomeIdsRaw);
    if (resolved.error) return { ok: false, error: resolved.error };
    const atomeIds = resolved.ids;
    console.log('[Share] Resolved atomeIds:', atomeIds);

    if (!atomeIds.length) return { ok: false, error: 'No atomes to share' };

    const permissions = particles.permissions || {};
    const rawMode = particles.mode || 'real-time';
    const shareMode = (rawMode === 'validation-based' || rawMode === 'manual' || rawMode === 'non-real-time')
        ? 'manual'
        : 'real-time';
    const meta = extractShareMeta(particles);
    const expiresAt = normalizeDurationToExpiry(meta?.duration);
    const conditions = meta?.condition || null;

    console.log('[Share] shareType:', shareType, 'shareMode:', shareMode);

    console.log('[Share] shareType check:', { shareType, isLinked: shareType === 'linked' });
    console.log('[Share] receiverProjectId:', particles?.receiverProjectId || particles?.receiver_project_id || 'NONE');

    if (shareType !== 'linked') {
        console.log('[Share] Creating shared copies (non-linked)...');
        const receiverProjectId = particles?.receiverProjectId || particles?.receiver_project_id || null;
        console.log('[Share] receiverProjectId for copies:', receiverProjectId);
        const copied = await createSharedCopies({
            sharerId,
            targetUserId,
            atomeIds,
            receiverProjectId: receiverProjectId
        });
        console.log('[Share] createSharedCopies result:', JSON.stringify(copied));
        if (!copied?.ok) return copied;
        return { ok: true, copies: copied.copies || [], mapping: copied.mapping || {} };
    }

    console.log('[Share] Linked share - granting permissions only (no copies created)');
    const permissionPayload = {
        can_read: !!permissions.read,
        can_write: !!permissions.alter,
        can_delete: !!permissions.delete,
        can_share: false,
        can_create: !!permissions.create
    };

    for (const atomeId of atomeIds) {
        const res = await createShare(sharerId, atomeId, targetUserId, permissionPayload, {
            shareMode,
            conditions,
            expiresAt
        });
        if (!res?.success) {
            return { ok: false, error: res?.error || 'Failed to grant permissions' };
        }

        if (shareMode === 'real-time') {
            try {
                const atome = await db.getAtome(atomeId);
                if (atome) {
                    await broadcastAtomeCreate({
                        atomeId,
                        atomeType: atome.atome_type || atome.type || 'atome',
                        parentId: atome.parent_id || null,
                        particles: atome.data || {},
                        senderUserId: sharerId
                    });
                }
            } catch (_) { }
        }
    }

    return { ok: true };
}

async function createShareRequest({ sharerId, targetUserId, targetPhone, atomeIds, permissions, mode, shareType, propertyOverrides }) {
    if (!sharerId || !targetUserId) return { ok: false, error: 'Missing sharer or target' };

    const policyEntry = await findSharePolicy(targetUserId, sharerId);
    const policyValue = policyEntry?.particles?.policy || null;

    if (policyValue === 'block') {
        return { ok: false, error: 'blocked' };
    }

    const requestId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const status = (policyValue === 'always')
        ? (mode === 'real-time' ? 'active' : 'accepted')
        : (policyValue === 'never' ? 'rejected' : 'pending');

    const baseParticles = {
        requestId,
        targetPhone: targetPhone || null,
        targetUserId,
        sharerId,
        atomeIds: Array.isArray(atomeIds) ? atomeIds : [],
        permissions: permissions || {},
        mode: mode || 'real-time',
        shareType: shareType || 'linked',
        propertyOverrides: propertyOverrides || {},
        timestamp: new Date().toISOString()
    };

    const inbox = await db.createAtome({
        id: null,
        type: 'share_request',
        parent: null,
        owner: targetUserId,
        creator: sharerId,
        properties: { ...baseParticles, status, box: 'inbox' }
    });

    const outbox = await db.createAtome({
        id: null,
        type: 'share_request',
        parent: null,
        owner: sharerId,
        creator: sharerId,
        properties: { ...baseParticles, status, box: 'outbox' }
    });

    const inboxId = inbox?.atome_id || inbox?.id || null;
    const outboxId = outbox?.atome_id || outbox?.id || null;

    try {
        if (inboxId || outboxId) {
            const linkPayload = { inboxId, outboxId };
            if (inboxId) await db.updateAtome(inboxId, linkPayload);
            if (outboxId) await db.updateAtome(outboxId, linkPayload);
        }
    } catch (_) { }

    if (policyValue === 'always') {
        await applyShareAcceptance({ sharerId, targetUserId, particles: baseParticles });
    }

    return {
        ok: true,
        requestId,
        status,
        inboxId,
        outboxId
    };
}

async function createSharedCopies({ sharerId, targetUserId, atomeIds, receiverProjectId }) {
    if (!sharerId || !targetUserId) return { ok: false, error: 'Missing sharer or target' };
    const ids = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : [];
    if (!ids.length) return { ok: false, error: 'No atomes to copy' };

    const originals = new Map();
    for (const id of ids) {
        const atome = await db.getAtome(id);
        if (atome) originals.set(String(id), atome);
    }

    const pending = new Set(ids);
    const mapping = new Map();
    const copies = [];
    const reservedKeys = new Set(['_pending_owner_id', '_pending_parent_id']);
    let guard = 0;

    const pickParent = (originalParentId) => {
        if (!originalParentId) return receiverProjectId || null;
        if (mapping.has(originalParentId)) return mapping.get(originalParentId);
        if (pending.has(originalParentId)) return null;
        return receiverProjectId || null;
    };

    while (pending.size && guard < (ids.length * 2)) {
        guard += 1;
        let progress = false;
        for (const id of Array.from(pending)) {
            const original = originals.get(id);
            if (!original) {
                pending.delete(id);
                continue;
            }

            const parentId = original.parent_id || null;
            const resolvedParent = pickParent(parentId);
            if (parentId && pending.has(parentId) && !resolvedParent) {
                continue;
            }

            const properties = { ...(original.data || {}) };
            for (const key of reservedKeys) {
                if (key in properties) delete properties[key];
            }

            properties.sharedFrom = sharerId;
            properties.sharedAt = new Date().toISOString();
            properties.originalAtomeId = id;
            properties.shareType = 'copy';
            if (original.creator_id) properties.originalCreatorId = original.creator_id;

            console.log('[Share] Creating copy with parent:', resolvedParent, 'for owner:', targetUserId);
            const created = await db.createAtome({
                id: null,
                type: original.atome_type || original.type || 'shape',
                kind: original.kind || null,
                parent: resolvedParent,
                owner: targetUserId,
                creator: original.creator_id || sharerId,
                properties
            });
            console.log('[Share] Created copy result:', JSON.stringify(created));

            const newId = created?.atome_id || created?.id;
            if (newId) {
                mapping.set(id, newId);
                copies.push({ originalId: id, sharedAtomeId: newId });
            }

            pending.delete(id);
            progress = true;
        }

        if (!progress) break;
    }

    // Fallback for remaining entries (no parent ordering available)
    for (const id of Array.from(pending)) {
        const original = originals.get(id);
        if (!original) {
            pending.delete(id);
            continue;
        }

        const properties = { ...(original.data || {}) };
        for (const key of reservedKeys) {
            if (key in properties) delete properties[key];
        }
        properties.sharedFrom = sharerId;
        properties.sharedAt = new Date().toISOString();
        properties.originalAtomeId = id;
        properties.shareType = 'copy';
        if (original.creator_id) properties.originalCreatorId = original.creator_id;

        const created = await db.createAtome({
            id: null,
            type: original.atome_type || original.type || 'shape',
            kind: original.kind || null,
            parent: receiverProjectId || null,
            owner: targetUserId,
            creator: original.creator_id || sharerId,
            properties
        });

        const newId = created?.atome_id || created?.id;
        if (newId) {
            mapping.set(id, newId);
            copies.push({ originalId: id, sharedAtomeId: newId });
        }

        pending.delete(id);
    }

    return { ok: true, copies, mapping: Object.fromEntries(mapping) };
}

function normalizeShareMode(rawMode) {
    const mode = String(rawMode || '').toLowerCase();
    if (mode === 'validation-based' || mode === 'manual' || mode === 'non-real-time') return 'manual';
    return 'real-time';
}

async function lookupUserByPhone(phone) {
    const clean = String(phone || '').trim();
    if (!clean) return null;
    const raw = clean.replace(/\s+/g, '');
    const jsonValue = JSON.stringify(raw);

    const row = await db.query('get', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'user'
          AND p.particle_key = 'phone'
          AND (p.particle_value = ? OR p.particle_value = ?)
        LIMIT 1
    `, [jsonValue, raw]);

    return row?.atome_id || null;
}

async function resolveTargetUserId({ targetUserId, targetPhone }) {
    if (targetUserId) return String(targetUserId);
    if (!targetPhone) return null;
    return await lookupUserByPhone(targetPhone);
}

async function loadShareRequestById(requestAtomeId) {
    if (!requestAtomeId) return null;
    return await db.getAtome(String(requestAtomeId));
}

async function loadShareRequestsByRequestId(requestId) {
    if (!requestId) return [];
    const raw = String(requestId);
    const jsonValue = JSON.stringify(raw);
    const rows = await db.query('all', `
        SELECT a.atome_id
        FROM atomes a
        JOIN particles p ON a.atome_id = p.atome_id
        WHERE a.atome_type = 'share_request'
          AND p.particle_key = 'requestId'
          AND (p.particle_value = ? OR p.particle_value = ?)
    `, [jsonValue, raw]);

    const out = [];
    for (const row of rows || []) {
        const item = await db.getAtome(row.atome_id);
        if (item) out.push(item);
    }
    return out;
}

function normalizeParticles(particles) {
    return particles && typeof particles === 'object' ? particles : {};
}

async function broadcastShareCommand({ recipients, senderUserId, command, params }) {
    if (!recipients || recipients.length === 0) return;
    const nowIso = new Date().toISOString();
    const payloadText = JSON.stringify({ command, params });

    for (const recipientId of recipients) {
        if (!recipientId) continue;
        const payload = {
            type: 'console-message',
            message: payloadText,
            from: { userId: String(senderUserId), phone: null, username: null },
            to: { userId: String(recipientId), phone: null },
            timestamp: nowIso
        };
        try {
            wsSendJsonToUser(String(recipientId), payload, { scope: 'ws/api', op: command, targetUserId: String(recipientId) });
        } catch (_) { }
    }
}

async function listShareRecipients(atomeId) {
    const recipients = new Set();
    const rows = await db.query(
        'all',
        "SELECT DISTINCT principal_id FROM permissions WHERE atome_id = ? AND can_read = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
        [atomeId]
    );

    for (const row of rows || []) {
        const principalId = row?.principal_id ? String(row.principal_id) : null;
        if (!principalId) continue;
        const allowed = await db.canRead(atomeId, principalId);
        if (!allowed) continue;
        recipients.add(principalId);
    }

    return Array.from(recipients);
}
/**
 * Parse permission from string
 */
export function parsePermission(name) {
    switch (name?.toLowerCase()) {
        case 'read': return PERMISSION.READ;
        case 'write': return PERMISSION.READ | PERMISSION.WRITE;
        case 'delete': return PERMISSION.READ | PERMISSION.WRITE | PERMISSION.DELETE;
        case 'share': return PERMISSION.READ | PERMISSION.SHARE;
        case 'create': return PERMISSION.READ | PERMISSION.CREATE;
        case 'admin': return PERMISSION.ADMIN;
        default: return PERMISSION.NONE;
    }
}

/**
 * Get permission name from level
 */
export function getPermissionName(level) {
    if (level === PERMISSION.ADMIN) return 'admin';
    if (level & PERMISSION.DELETE) return 'delete';
    if (level & PERMISSION.WRITE) return 'write';
    if (level & PERMISSION.CREATE) return 'create';
    if (level & PERMISSION.READ) return 'read';
    return 'none';
}

/**
 * Handle sharing WebSocket messages
 * All sharing operations go through WebSocket via EventBus
 * 
 * Message format:
 * {
 *   type: 'share',
 *   action: 'create' | 'revoke' | 'get-atome' | 'my-shares' | 'shared-with-me' | 'accessible' | 'check',
 *   requestId: string,
 *   ...params
 * }
 */
export async function handleShareMessage(message, userId) {
    const { action, requestId } = message;

    if (!userId) {
        return { requestId, success: false, error: 'Unauthorized' };
    }

    try {
        switch (action) {
            case 'request': {
                const {
                    targetUserId,
                    targetPhone,
                    atomeIds,
                    permissions,
                    mode,
                    shareType,
                    propertyOverrides
                } = message || {};

                const resolvedTargetUserId = await resolveTargetUserId({ targetUserId, targetPhone });
                if (!resolvedTargetUserId) {
                    return { requestId, success: false, error: 'Target user not found' };
                }

                const idsInput = Array.isArray(atomeIds) ? atomeIds.map(String).filter(Boolean) : (atomeIds ? [String(atomeIds)] : []);
                const resolvedIds = await resolveShareAtomeIds(idsInput);
                if (resolvedIds.error) {
                    return { requestId, success: false, error: resolvedIds.error };
                }
                const ids = resolvedIds.ids;
                if (!ids.length) return { requestId, success: false, error: 'No atomes to share' };

                console.log('[Share] Checking permissions for share request:', { userId, targetUserId: resolvedTargetUserId, atomeIds: ids });

                for (const atomeId of ids) {
                    const allowed = await checkCanShare(userId, atomeId);
                    console.log('[Share] checkCanShare result:', { userId, atomeId, allowed });
                    if (!allowed) {
                        console.warn('[Share] Share request failed:', {
                            targetPhone,
                            atomeIds: ids,
                            mode,
                            error: 'Access denied (share)',
                            targetUserId: resolvedTargetUserId,
                            failedAtomeId: atomeId
                        });
                        return { requestId, success: false, error: 'Access denied (share)' };
                    }
                }

                const resolvedShareType = extractShareType({ shareType, propertyOverrides });
                const res = await createShareRequest({
                    sharerId: userId,
                    targetUserId: resolvedTargetUserId,
                    targetPhone: targetPhone || null,
                    atomeIds: ids,
                    permissions: permissions || {},
                    mode: mode || 'real-time',
                    shareType: resolvedShareType,
                    propertyOverrides: propertyOverrides || {}
                });

                return { requestId, success: res.ok, data: res, error: res.error || null };
            }

            case 'respond': {
                const statusRaw = String(message?.status || message?.decision || '').toLowerCase();
                const requestAtomeId = message?.requestAtomeId || message?.request_atome_id || message?.atome_id || null;
                const requestIdValue = message?.requestId || message?.request_id || null;
                const receiverProjectId = message?.receiverProjectId || message?.receiver_project_id || null;
                const policy = message?.policy || null;

                if (!requestAtomeId && !requestIdValue) {
                    return { requestId, success: false, error: 'Missing request identifier' };
                }

                const inboxRequest = requestAtomeId
                    ? await loadShareRequestById(requestAtomeId)
                    : null;

                let requestRecord = inboxRequest;
                if (!requestRecord && requestIdValue) {
                    const candidates = await loadShareRequestsByRequestId(requestIdValue);
                    requestRecord = candidates.find(r => String(r.owner_id || '') === String(userId)) || null;
                }

                if (!requestRecord) {
                    return { requestId, success: false, error: 'Share request not found' };
                }

                const particles = normalizeParticles(requestRecord.data || requestRecord.particles || {});
                if (String(particles.box || '') !== 'inbox') {
                    return { requestId, success: false, error: 'Not an inbox request' };
                }

                const sharerId = particles.sharerId || particles.sharer_id || null;
                const requestIdResolved = particles.requestId || requestIdValue;
                const modeValue = normalizeShareMode(particles.mode || 'real-time');
                const shareType = extractShareType(particles);

                if (!sharerId || !requestIdResolved) {
                    return { requestId, success: false, error: 'Invalid share request data' };
                }

                const newStatus = (statusRaw === 'accepted')
                    ? (shareType === 'linked' && modeValue === 'real-time' ? 'active' : 'accepted')
                    : (statusRaw === 'rejected' ? 'rejected' : null);

                if (!newStatus) {
                    return { requestId, success: false, error: 'Unsupported status' };
                }

                if (policy && policy !== 'one-shot') {
                    await upsertSharePolicy(userId, sharerId, policy, particles.permissions || {});
                }

                let acceptanceResult = { ok: true };
                if (newStatus === 'active' || newStatus === 'accepted') {
                    console.log('[Share] Processing accept - receiverProjectId from message:', receiverProjectId);
                    console.log('[Share] Processing accept - particles.receiverProjectId:', particles.receiverProjectId);
                    console.log('[Share] Processing accept - particles.receiver_project_id:', particles.receiver_project_id);
                    const acceptanceParticles = {
                        ...particles,
                        receiverProjectId: receiverProjectId || particles.receiverProjectId || particles.receiver_project_id || null
                    };
                    console.log('[Share] acceptanceParticles.receiverProjectId:', acceptanceParticles.receiverProjectId);
                    acceptanceResult = await applyShareAcceptance({
                        sharerId,
                        targetUserId: userId,
                        particles: acceptanceParticles
                    });
                    if (!acceptanceResult?.ok) {
                        return { requestId, success: false, error: acceptanceResult.error || 'Acceptance failed' };
                    }
                }

                const updates = {
                    status: newStatus,
                    statusUpdatedAt: new Date().toISOString(),
                    acceptedAt: newStatus === 'accepted' || newStatus === 'active' ? new Date().toISOString() : undefined,
                    rejectedAt: newStatus === 'rejected' ? new Date().toISOString() : undefined,
                    receiverProjectId: receiverProjectId || particles.receiverProjectId || null,
                    receiver_project_id: receiverProjectId || particles.receiver_project_id || null
                };

                if (acceptanceResult?.copies?.length) {
                    updates.importedAtomeIds = acceptanceResult.copies.map(c => c.sharedAtomeId);
                    updates.importedAtomesCount = acceptanceResult.copies.length;
                    updates.linkMappings = acceptanceResult.mapping || {};
                }

                const inboxId = particles.inboxId || requestRecord.atome_id || requestRecord.id;
                const outboxId = particles.outboxId || null;

                if (inboxId) await db.updateAtome(inboxId, updates);
                if (outboxId) await db.updateAtome(outboxId, updates);

                if (!outboxId && requestIdResolved) {
                    const related = await loadShareRequestsByRequestId(requestIdResolved);
                    for (const item of related) {
                        if (String(item.owner_id || '') !== String(sharerId)) continue;
                        const id = item.atome_id || item.id;
                        if (!id) continue;
                        await db.updateAtome(id, updates);
                    }
                }

                return {
                    requestId,
                    success: true,
                    status: newStatus,
                    data: acceptanceResult || null
                };
            }

            case 'publish': {
                const requestAtomeId = message?.requestAtomeId || message?.request_atome_id || message?.atome_id || null;
                const requestIdValue = message?.requestId || message?.request_id || null;

                const sourceRequest = requestAtomeId
                    ? await loadShareRequestById(requestAtomeId)
                    : null;

                let requestRecord = sourceRequest;
                if (!requestRecord && requestIdValue) {
                    const candidates = await loadShareRequestsByRequestId(requestIdValue);
                    requestRecord = candidates.find(r => String(r.owner_id || '') === String(userId)) || null;
                }

                if (!requestRecord) {
                    return { requestId, success: false, error: 'Share request not found' };
                }

                const particles = normalizeParticles(requestRecord.data || requestRecord.particles || {});
                const targetUserId = particles.targetUserId || particles.target_user_id || null;
                const shareMode = normalizeShareMode(particles.mode || 'real-time');
                const atomeIds = Array.isArray(particles.atomeIds) ? particles.atomeIds : [];

                if (!targetUserId || !atomeIds.length) {
                    return { requestId, success: false, error: 'Invalid share request payload' };
                }

                if (shareMode === 'real-time') {
                    return { requestId, success: false, error: 'Real-time shares do not require publish' };
                }

                const items = [];
                for (const id of atomeIds) {
                    const atome = await db.getAtome(String(id));
                    if (!atome) continue;
                    items.push({
                        atomeId: String(id),
                        parentId: atome.parent_id || null,
                        atomeType: atome.atome_type || atome.type || null
                    });
                }

                await broadcastShareCommand({
                    recipients: [String(targetUserId)],
                    senderUserId: userId,
                    command: 'share-publish',
                    params: {
                        requestId: particles.requestId || requestIdValue || null,
                        items,
                        at: new Date().toISOString()
                    }
                });

                await db.updateAtome(requestRecord.atome_id || requestRecord.id, { publishedAt: new Date().toISOString() });

                return { requestId, success: true };
            }

            case 'policy': {
                const peerUserId = message?.peerUserId || message?.peer_user_id || null;
                const policy = message?.policy || null;
                const permissions = message?.permissions || null;
                if (!peerUserId || !policy) {
                    return { requestId, success: false, error: 'Missing peerUserId or policy' };
                }
                const policyId = await upsertSharePolicy(userId, peerUserId, policy, permissions);
                return { requestId, success: true, policyId };
            }

            case 'create': {
                const { atome_id, principal_id, permission, particle_key, expires_at } = message;
                if (!atome_id || !principal_id) {
                    return { requestId, success: false, error: 'Missing atome_id or principal_id' };
                }
                const permLevel = typeof permission === 'string' ? parsePermission(permission) : (permission || PERMISSION.READ);
                const result = await createShare(userId, atome_id, principal_id, permLevel, {
                    particleKey: particle_key,
                    expiresAt: expires_at
                });
                return { requestId, ...result };
            }

            case 'revoke': {
                const { permission_id } = message;
                if (!permission_id) {
                    return { requestId, success: false, error: 'Missing permission_id' };
                }
                const result = await revokeShare(userId, parseInt(permission_id));
                return { requestId, ...result };
            }

            case 'get-atome': {
                const { atome_id } = message;
                if (!atome_id) {
                    return { requestId, success: false, error: 'Missing atome_id' };
                }
                const canView = await checkCanShare(userId, atome_id);
                if (!canView) {
                    return { requestId, success: false, error: 'Access denied' };
                }
                const shares = await getSharesForAtome(atome_id);
                return { requestId, success: true, data: shares };
            }

            case 'my-shares': {
                const shares = await getSharesGrantedByUser(userId);
                return { requestId, success: true, data: shares };
            }

            case 'shared-with-me': {
                const shares = await getSharesForUser(userId);
                return { requestId, success: true, data: shares };
            }

            case 'accessible': {
                const { atome_type } = message;
                const atomes = await getAccessibleAtomes(userId, atome_type || null);
                return { requestId, success: true, data: atomes, count: atomes.length };
            }

            case 'check': {
                const { atome_id, permission } = message;
                if (!atome_id) {
                    return { requestId, success: false, error: 'Missing atome_id' };
                }
                const permLevel = parsePermission(permission || 'read');
                const hasPermission = await checkPermission(userId, atome_id, permLevel);
                return {
                    requestId,
                    success: true,
                    atome_id,
                    user_id: userId,
                    permission: permission || 'read',
                    granted: hasPermission
                };
            }

            default:
                return { requestId, success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error('Share message error:', error.message);
        return { requestId, success: false, error: error.message };
    }
}

/**
 * Register sharing WebSocket handler with EventBus
 */
export function registerSharingWebSocket() {
    const eventBus = getABoxEventBus();
    if (!eventBus) {
        console.warn('EventBus not available, sharing WebSocket handler not registered');
        return;
    }

    eventBus.on('share', async (message, socket) => {
        const userId = socket?.userId || message.userId;
        const response = await handleShareMessage(message, userId);

        if (socket && typeof socket.send === 'function') {
            socket.send(JSON.stringify({ type: 'share-response', ...response }));
        }
    });

    console.log('Sharing WebSocket handler registered (ADOLE v3.0)');
}

/**
 * Register sharing routes (backward compatibility)
 * In ADOLE v3.0, sharing is handled via WebSocket, not HTTP routes
 */
export function registerSharingRoutes(server, validateToken) {
    // Register WebSocket handler
    registerSharingWebSocket();
    console.log('Sharing routes registered (ADOLE v3.0 - WebSocket mode)');
}

export default {
    PERMISSION,
    createShare,
    revokeShare,
    checkPermission,
    getSharesForAtome,
    getSharesForUser,
    getSharesGrantedByUser,
    getAccessibleAtomes,
    parsePermission,
    getPermissionName,
    handleShareMessage,
    registerSharingWebSocket,
    registerSharingRoutes
};
