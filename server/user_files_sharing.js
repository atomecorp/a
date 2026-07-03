/**
 * User file sharing — ADOLE v3.0
 *
 * Backward-compatibility wrappers that grant/revoke file shares through the
 * canonical sharing module. Split out of userFiles.js: one-way dependency on
 * `getFileMetadata` (file resolution), no back-import, so no cycle.
 */

import db from '../database/adole.js';
import { getFileMetadata } from './userFiles.js';

function normalizeFileSharePermissions(permissions) {
    if (typeof permissions === 'number') {
        return permissions;
    }

    if (typeof permissions === 'string') {
        const value = permissions.toLowerCase();
        if (value === 'write') {
            return { can_read: true, can_write: true, can_delete: false, can_share: false, can_create: false };
        }
        if (value === 'delete') {
            return { can_read: true, can_write: true, can_delete: true, can_share: false, can_create: false };
        }
        if (value === 'admin') {
            return { can_read: true, can_write: true, can_delete: true, can_share: true, can_create: true };
        }
        return { can_read: true, can_write: false, can_delete: false, can_share: false, can_create: false };
    }

    if (permissions && typeof permissions === 'object') {
        const read = permissions.can_read ?? permissions.canRead ?? permissions.read ?? false;
        const write = permissions.can_write ?? permissions.canWrite ?? permissions.write ?? false;
        const del = permissions.can_delete ?? permissions.canDelete ?? permissions.delete ?? false;
        const share = permissions.can_share ?? permissions.canShare ?? permissions.share ?? false;
        const create = permissions.can_create ?? permissions.canCreate ?? permissions.create ?? false;
        return { can_read: !!read, can_write: !!write, can_delete: !!del, can_share: !!share, can_create: !!create };
    }

    return { can_read: true, can_write: false, can_delete: false, can_share: false, can_create: false };
}

/**
 * Share a file with another user (backward compatibility wrapper)
 */
export async function shareFile(fileIdentifier, granterId, targetUserId, permissions) {
    const { createShare } = await import('./sharing.js');
    const meta = await getFileMetadata(fileIdentifier, { ownerId: granterId });
    if (!meta) {
        return { success: false, error: 'File not found' };
    }
    const payload = normalizeFileSharePermissions(permissions);
    const result = await createShare(granterId, meta.atome_id, targetUserId, payload);
    if (result?.success) {
        return { ...result, file: meta };
    }
    return result;
}

/**
 * Revoke file sharing (backward compatibility wrapper)
 */
export async function unshareFile(fileIdentifier, granterId, targetUserId) {
    const { revokeShare } = await import('./sharing.js');
    const meta = await getFileMetadata(fileIdentifier, { ownerId: granterId });
    if (!meta) {
        return { success: false, error: 'File not found' };
    }

    const permission = await db.query('get', `
        SELECT permission_id
        FROM permissions
        WHERE atome_id = ? AND principal_id = ?
        ORDER BY permission_id DESC
        LIMIT 1
    `, [meta.atome_id, targetUserId]);

    if (!permission?.permission_id) {
        return { success: false, error: 'Permission not found' };
    }

    const result = await revokeShare(granterId, permission.permission_id);
    if (result?.success) {
        return { ...result, file: meta };
    }
    return result;
}
