export function createAdolePermissionApi({ query, getAtome, getEffectiveOwnerId }) {
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
        const conditions = options.conditions ? JSON.stringify(options.conditions) : null;
        const expiresAt = options.expiresAt || null;

        const existing = await query('get', `
            SELECT permission_id FROM permissions
            WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR (particle_key IS NULL AND ? IS NULL))
        `, [atomeId, principalId, particleKey, particleKey]);

        if (existing) {
            await query('run', `
                UPDATE permissions SET can_read = ?, can_write = ?, can_delete = ?, can_share = ?, can_create = ?,
                                       share_mode = COALESCE(?, share_mode),
                                       conditions = COALESCE(?, conditions),
                                       expires_at = COALESCE(?, expires_at)
                WHERE permission_id = ?
            `, [
                canRead ? 1 : 0,
                canWrite ? 1 : 0,
                canDelete ? 1 : 0,
                canShare ? 1 : 0,
                canCreate,
                shareMode,
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

    async function isPermissionActive(permission, principalId, atomeId) {
        if (!permission) return false;
        if (permission.expires_at) {
            const expiry = new Date(permission.expires_at).getTime();
            if (!Number.isNaN(expiry) && Date.now() > expiry) return false;
        }

        const conditions = parseConditions(permission.conditions);
        if (!conditions) return true;

        const [userAtome, targetAtome] = await Promise.all([
            principalId ? getAtome(principalId) : null,
            atomeId ? getAtome(atomeId) : null
        ]);

        const context = {
            now: new Date(),
            user: userAtome ? (userAtome.properties || {}) : {},
            atome: targetAtome ? (targetAtome.properties || {}) : {}
        };

        return evaluateConditionNode(conditions, context);
    }

    async function checkPermissionFlag(atomeId, principalId, particleKey, field) {
        const ownerId = await getEffectiveOwnerId(atomeId);
        if (ownerId && ownerId === principalId) return true;

        const perm = await query('get', `
            SELECT ${field} as flag, expires_at, conditions
            FROM permissions
            WHERE atome_id = ? AND principal_id = ? AND (particle_key = ? OR particle_key IS NULL)
            ORDER BY particle_key DESC LIMIT 1
        `, [atomeId, principalId, particleKey]);

        if (!perm || perm.flag !== 1) return false;
        return await isPermissionActive(perm, principalId, atomeId);
    }

    async function canRead(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_read');
    }

    async function canWrite(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_write');
    }

    async function canDelete(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_delete');
    }

    async function canShare(atomeId, principalId, particleKey = null) {
        return await checkPermissionFlag(atomeId, principalId, particleKey, 'can_share');
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
        return await isPermissionActive(perm, principalId, atomeId);
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

function parseConditions(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return null;
    }
}

function coerceComparable(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') return value;
    const num = Number(value);
    if (!Number.isNaN(num)) return num;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.getTime();
    return String(value);
}

function compareValues(actual, op, expected) {
    const left = coerceComparable(actual);
    const right = coerceComparable(expected);

    switch (op) {
        case 'eq': return left === right;
        case 'ne': return left !== right;
        case 'gt': return left > right;
        case 'gte': return left >= right;
        case 'lt': return left < right;
        case 'lte': return left <= right;
        case 'in': return Array.isArray(expected) ? expected.map(coerceComparable).includes(left) : false;
        default: return false;
    }
}

function resolvePath(path, context) {
    if (!path || typeof path !== 'string') return undefined;
    const parts = path.split('.');
    let cur = context;
    for (const part of parts) {
        if (!cur || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}

function evaluateConditionNode(node, context) {
    if (!node || typeof node !== 'object') return true;

    if (Array.isArray(node)) {
        return node.every((child) => evaluateConditionNode(child, context));
    }

    if (node.all && Array.isArray(node.all)) {
        return node.all.every((child) => evaluateConditionNode(child, context));
    }
    if (node.any && Array.isArray(node.any)) {
        return node.any.some((child) => evaluateConditionNode(child, context));
    }

    if (node.after || node.before) {
        const now = context.now ? context.now.getTime() : Date.now();
        if (node.after && now < coerceComparable(node.after)) return false;
        if (node.before && now > coerceComparable(node.before)) return false;
        return true;
    }

    if (node.field && node.op) {
        const actual = resolvePath(node.field, context);
        return compareValues(actual, node.op, node.value);
    }

    if (node.user && typeof node.user === 'object') {
        return Object.entries(node.user).every(([key, rule]) => {
            if (rule && typeof rule === 'object' && rule.op) {
                return compareValues(resolvePath(`user.${key}`, context), rule.op, rule.value);
            }
            return compareValues(resolvePath(`user.${key}`, context), 'eq', rule);
        });
    }

    if (node.atome && typeof node.atome === 'object') {
        return Object.entries(node.atome).every(([key, rule]) => {
            if (rule && typeof rule === 'object' && rule.op) {
                return compareValues(resolvePath(`atome.${key}`, context), rule.op, rule.value);
            }
            return compareValues(resolvePath(`atome.${key}`, context), 'eq', rule);
        });
    }

    return true;
}
