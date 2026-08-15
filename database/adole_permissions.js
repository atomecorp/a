import {
    evaluatePermissionConditions,
    normalizePermissionConditions
} from '../atome/src/squirrel/conditions/permission_adapter.js';

export function createAdolePermissionApi({ query, getAtome, getEffectiveOwnerId, allowsPropertyRead = null }) {
    async function setPermission(
        atomeId,
        principalId,
        canRead = true,
        canWrite = false,
        canDelete = false,
        canShare = false,
        particleKey = null,
        grantedBy = null,
        options = {}
    ) {
        const now = new Date().toISOString();
        const canCreate = options.canCreate ? 1 : 0;
        const shareMode = options.shareMode ? String(options.shareMode) : null;
        const conditionsProvided = Object.prototype.hasOwnProperty.call(options, 'conditions');
        const normalizedConditions = conditionsProvided ? normalizePermissionConditions(options.conditions) : null;
        const conditions = normalizedConditions ? JSON.stringify(normalizedConditions) : null;
        const expiresAt = options.expiresAt || null;

        const existing = await query('get', `
            SELECT permission_id FROM permissions
            WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR (particle_key IS NULL AND ? IS NULL))
        `, [atomeId, principalId, particleKey, particleKey]);

        if (existing) {
            await query('run', `
                UPDATE permissions SET can_read = ?, can_write = ?, can_delete = ?, can_share = ?, can_create = ?,
                                       share_mode = COALESCE(?, share_mode),
                                       conditions = CASE WHEN ? = 1 THEN ? ELSE conditions END,
                                       expires_at = COALESCE(?, expires_at)
                WHERE permission_id = ?
            `, [
                canRead ? 1 : 0,
                canWrite ? 1 : 0,
                canDelete ? 1 : 0,
                canShare ? 1 : 0,
                canCreate,
                shareMode,
                conditionsProvided ? 1 : 0,
                conditions,
                expiresAt,
                existing.permission_id
            ]);
            return;
        }

        await query('run', `
            INSERT INTO permissions (atome_id, particle_key, principal_id, can_read, can_write, can_delete, can_share, can_create,
                                     granted_by, granted_at, share_mode, conditions, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            atomeId,
            particleKey,
            principalId,
            canRead ? 1 : 0,
            canWrite ? 1 : 0,
            canDelete ? 1 : 0,
            canShare ? 1 : 0,
            canCreate,
            grantedBy,
            now,
            shareMode,
            conditions,
            expiresAt
        ]);
    }

    async function isPermissionActive(permission, principalId, atomeId, operationName, particleKey) {
        if (!permission) return false;
        if (permission.expires_at) {
            const expiry = new Date(permission.expires_at).getTime();
            if (!Number.isNaN(expiry) && Date.now() > expiry) return false;
        }

        if (!permission.conditions) return true;

        const [userAtome, targetAtome] = await Promise.all([
            principalId ? getAtome(principalId) : null,
            atomeId ? getAtome(atomeId) : null
        ]);

        const context = {
            time: { now: new Date().toISOString() },
            user: userAtome ? (userAtome.properties || {}) : {},
            atome: targetAtome ? (targetAtome.properties || {}) : {},
            actor: { id: principalId },
            operation: { name: operationName, property: particleKey },
            property: { key: particleKey }
        };

        const decision = await evaluatePermissionConditions(permission.conditions, context);
        return decision.matched === true;
    }

    async function checkPermissionFlag(atomeId, principalId, particleKey, field, operationName) {
        const ownerId = await getEffectiveOwnerId(atomeId);
        if (ownerId && ownerId === principalId) return true;

        const perm = await query('get', `
            SELECT ${field} as flag, expires_at, conditions
            FROM permissions
            WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR particle_key IS NULL)
            ORDER BY particle_key DESC LIMIT 1
        `, [atomeId, principalId, particleKey]);

        if (!perm || perm.flag !== 1) return false;
        return await isPermissionActive(perm, principalId, atomeId, operationName, particleKey);
    }

    async function canRead(atomeId, principalId, particleKey = null) {
        const allowed = await checkPermissionFlag(atomeId, principalId, particleKey, 'can_read', 'read');
        if (!allowed) return false;
        // A property privacy rule can only narrow what the permission already allowed
        // (§12.5). It is consulted last and can never grant, so a property with no rule
        // behaves exactly as before this existed.
        if (!particleKey || typeof allowsPropertyRead !== 'function') return true;
        return await allowsPropertyRead(atomeId, particleKey, principalId, 'read');
    }

    async function canWrite(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_write', 'write');
    }

    async function canDelete(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_delete', 'delete');
    }

    async function canShare(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_share', 'share');
    }

    async function canCreate(atomeId, principalId, particleKey = null) {
        const ownerId = await getEffectiveOwnerId(atomeId);
        if (ownerId && ownerId === principalId) return true;

        const perm = await query('get', `
            SELECT can_create as flag, can_share as fallback, expires_at, conditions
            FROM permissions
            WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR particle_key IS NULL)
            ORDER BY particle_key DESC LIMIT 1
        `, [atomeId, principalId, particleKey]);

        if (!perm || (perm.flag !== 1 && perm.fallback !== 1)) return false;
        return await isPermissionActive(perm, principalId, atomeId, 'create', particleKey);
    }

    return {
        setPermission,
        canRead,
        canWrite,
        canDelete,
        canShare,
        canCreate
    };
}
