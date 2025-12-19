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

/**
 * Permission levels (bitmask compatible)
 */
export const PERMISSION = {
    NONE: 0,
    READ: 1,
    WRITE: 2,
    DELETE: 4,
    SHARE: 8,
    ADMIN: 15  // READ | WRITE | DELETE | SHARE
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
            can_share: level.can_share ? 1 : 0
        };
    }

    return {
        can_read: (level & PERMISSION.READ) ? 1 : 0,
        can_write: (level & PERMISSION.WRITE) ? 1 : 0,
        can_delete: (level & PERMISSION.DELETE) ? 1 : 0,
        can_share: (level & PERMISSION.SHARE) ? 1 : 0
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
                    can_share: permission.can_share
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
    const { particleKey = null, expiresAt = null } = options;

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
                    granted_by = ?,
                    granted_at = ?,
                    expires_at = ?
                WHERE permission_id = ?
            `, [
                flags.can_read, flags.can_write, flags.can_delete, flags.can_share,
                grantorId, now, expiresAt, existing.permission_id
            ]);
            permissionId = existing.permission_id;
            console.log(`Permission updated: ${atomeId} -> ${principalId}`);
        } else {
            // Create new permission
            await db.query('run', `
                INSERT INTO permissions (atome_id, particle_key, principal_id, can_read, can_write, can_delete, can_share, granted_by, granted_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                atomeId, particleKey, principalId,
                flags.can_read, flags.can_write, flags.can_delete, flags.can_share,
                grantorId, now, expiresAt
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
            expires_at: expiresAt
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
    // Check if user is owner (including pending owner when FK prevented setting owner_id)
    const atome = await db.query('get', `SELECT owner_id FROM atomes WHERE atome_id = ?`, [atomeId]);
    let ownerId = atome?.owner_id || null;

    if (!ownerId) {
        try {
            const pending = await db.query('get', `
                SELECT particle_value
                FROM particles
                WHERE atome_id = ? AND particle_key = '_pending_owner_id'
                LIMIT 1
            `, [atomeId]);
            if (pending?.particle_value) {
                ownerId = JSON.parse(pending.particle_value);
            }
        } catch (_) { }
    }

    if (ownerId === userId) return true;

    // Check if user has share permission
    const permission = await db.query('get', `
        SELECT can_share FROM permissions 
        WHERE atome_id = ? AND principal_id = ? AND can_share = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [atomeId, userId]);

    return permission?.can_share === 1;
}

/**
 * Check if user has specific permission on atome
 */
export async function checkPermission(userId, atomeId, requiredPermission = PERMISSION.READ) {
    // Owner always has full access
    const atome = await db.query('get', `SELECT owner_id FROM atomes WHERE atome_id = ?`, [atomeId]);
    if (atome?.owner_id === userId) return true;

    // Check permissions table
    const permission = await db.query('get', `
        SELECT can_read, can_write, can_delete, can_share 
        FROM permissions 
        WHERE atome_id = ? AND principal_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `, [atomeId, userId]);

    if (!permission) return false;

    const level = flagsToPermission(permission);
    return (level & requiredPermission) === requiredPermission;
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

    return await db.query('all', query, params) || [];
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
