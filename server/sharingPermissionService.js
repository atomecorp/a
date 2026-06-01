import db from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import {
    atomeOwnerIdOf,
    atomeTypeOf
} from './sharingAtomeAccessors.js';

export const PERMISSION = {
    NONE: 0,
    READ: 1,
    WRITE: 2,
    DELETE: 4,
    SHARE: 8,
    CREATE: 16,
    ADMIN: 31
};

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

export function getPermissionName(level) {
    if (level === PERMISSION.ADMIN) return 'admin';
    if (level & PERMISSION.DELETE) return 'delete';
    if (level & PERMISSION.WRITE) return 'write';
    if (level & PERMISSION.CREATE) return 'create';
    if (level & PERMISSION.READ) return 'read';
    return 'none';
}

export async function createShare(grantorId, atomeId, principalId, permission, options = {}) {
    const { particleKey = null, expiresAt = null, shareMode = null, conditions = null } = options;
    const canGrantShare = await checkCanShare(grantorId, atomeId);
    if (!canGrantShare) {
        return { success: false, error: 'You do not have permission to share this resource' };
    }

    const flags = permissionToFlags(permission);
    const now = new Date().toISOString();
    const resolvedShareMode = shareMode || permission?.share_mode || permission?.shareMode || null;
    const resolvedConditions = conditions || permission?.conditions || null;

    try {
        const existing = await db.query('get', `
            SELECT permission_id FROM permissions
            WHERE atome_id = ? AND principal_id = ? AND (particle_key IS NULL OR particle_key = ?)
        `, [atomeId, principalId, particleKey]);

        let permissionId;

        if (existing) {
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
        } else {
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

            const inserted = await db.query('get', `
                SELECT permission_id FROM permissions
                WHERE atome_id = ? AND principal_id = ? ORDER BY permission_id DESC LIMIT 1
            `, [atomeId, principalId]);
            permissionId = inserted?.permission_id;
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
        return { success: false, error: error.message };
    }
}

export async function revokeShare(grantorId, permissionId) {
    try {
        const permission = await db.query('get', `
            SELECT p.*, a.owner_id
            FROM permissions p
            JOIN atomes a ON p.atome_id = a.atome_id
            WHERE p.permission_id = ?
        `, [permissionId]);

        if (!permission) {
            return { success: false, error: 'Permission not found' };
        }

        if (permission.owner_id !== grantorId && permission.granted_by !== grantorId) {
            return { success: false, error: 'Only owner or grantor can revoke this permission' };
        }

        await db.query('run', 'DELETE FROM permissions WHERE permission_id = ?', [permissionId]);
        emitPermissionChange('revoke', permission);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function checkPermission(userId, atomeId, requiredPermission = PERMISSION.READ) {
    const checks = [];
    if (requiredPermission & PERMISSION.READ) checks.push(db.canRead(atomeId, userId));
    if (requiredPermission & PERMISSION.WRITE) checks.push(db.canWrite(atomeId, userId));
    if (requiredPermission & PERMISSION.DELETE) checks.push(db.canDelete(atomeId, userId));
    if (requiredPermission & PERMISSION.SHARE) checks.push(db.canShare(atomeId, userId));
    if (requiredPermission & PERMISSION.CREATE) checks.push(db.canCreate(atomeId, userId));

    if (checks.length === 0) return false;
    const results = await Promise.all(checks);
    return results.every(Boolean);
}

export async function checkCanShare(userId, atomeId) {
    if (!userId || !atomeId) return false;
    try {
        return await db.canShare(atomeId, userId);
    } catch (error) {
        const atome = await db.getAtome(atomeId);
        throw new Error(`Share permission check failed for ${String(atomeId)} owned by ${String(atomeOwnerIdOf(atome) || 'unknown')} with type ${String(atomeTypeOf(atome) || 'unknown')}: ${error.message}`);
    }
}

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

export async function getAccessibleAtomes(userId, atomeType = null) {
    let sql = `
        SELECT DISTINCT a.* FROM atomes a
        LEFT JOIN permissions p ON a.atome_id = p.atome_id
        WHERE (a.owner_id = ? OR (p.principal_id = ? AND p.can_read = 1 AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))))
        AND a.deleted_at IS NULL
    `;
    const params = [userId, userId];

    if (atomeType) {
        sql += ' AND a.atome_type = ?';
        params.push(atomeType);
    }

    sql += ' ORDER BY a.updated_at DESC';

    const rows = await db.query('all', sql, params) || [];
    const filtered = [];
    for (const row of rows) {
        const id = row?.atome_id ? String(row.atome_id) : null;
        if (!id) continue;
        const allowed = await db.canRead(id, userId);
        if (allowed) filtered.push(row);
    }
    return filtered;
}

function permissionToFlags(level) {
    if (typeof level === 'object' && level) {
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

function emitPermissionChange(action, permission) {
    const eventBus = getABoxEventBus();
    if (!eventBus) return;
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
