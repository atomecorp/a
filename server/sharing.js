/**
 * Sharing & Permissions System
 * 
 * Manages sharing of projects, atomes, and files between users.
 * Supports read, write, and admin permissions.
 */

// In-memory shares store (in production, use database)
const sharesStore = new Map();

/**
 * Permission levels
 */
export const PERMISSION = {
    NONE: 0,
    READ: 1,
    WRITE: 2,
    ADMIN: 3
};

/**
 * Resource types
 */
export const RESOURCE_TYPE = {
    PROJECT: 'project',
    ATOME: 'atome',
    FILE: 'file'
};

/**
 * Create a share
 */
export function createShare(ownerId, resourceType, resourceId, targetUserId, permission) {
    const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const share = {
        id: shareId,
        owner_id: ownerId,
        resource_type: resourceType,
        resource_id: resourceId,
        target_user_id: targetUserId,
        permission: permission,
        created_at: new Date().toISOString(),
        expires_at: null
    };

    sharesStore.set(shareId, share);
    console.log(`📤 Share created: ${resourceType}/${resourceId} → user ${targetUserId} (${getPermissionName(permission)})`);

    return share;
}

/**
 * Revoke a share
 */
export function revokeShare(shareId, requesterId) {
    const share = sharesStore.get(shareId);
    if (!share) {
        return { success: false, error: 'Share not found' };
    }

    // Only owner can revoke
    if (share.owner_id !== requesterId) {
        return { success: false, error: 'Only owner can revoke shares' };
    }

    sharesStore.delete(shareId);
    console.log(`🚫 Share revoked: ${shareId}`);

    return { success: true };
}

/**
 * Get shares for a resource
 */
export function getSharesForResource(resourceType, resourceId) {
    const shares = [];
    for (const [id, share] of sharesStore) {
        if (share.resource_type === resourceType && share.resource_id === resourceId) {
            shares.push(share);
        }
    }
    return shares;
}

/**
 * Get shares for a user (resources shared with them)
 */
export function getSharesForUser(userId) {
    const shares = [];
    for (const [id, share] of sharesStore) {
        if (share.target_user_id === userId) {
            shares.push(share);
        }
    }
    return shares;
}

/**
 * Check if user has permission on resource
 */
export function checkPermission(userId, ownerId, resourceType, resourceId, requiredPermission) {
    // Owner has full access
    if (userId === ownerId) {
        return true;
    }

    // Check shares
    for (const [id, share] of sharesStore) {
        if (share.resource_type === resourceType &&
            share.resource_id === resourceId &&
            share.target_user_id === userId) {

            // Check expiration
            if (share.expires_at && new Date(share.expires_at) < new Date()) {
                continue;
            }

            if (share.permission >= requiredPermission) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Get all resources accessible by user
 */
export function getAccessibleResources(userId, resourceType, ownershipMap) {
    const accessible = new Set();

    // Add owned resources
    for (const [resourceId, ownerId] of ownershipMap) {
        if (ownerId === userId) {
            accessible.add(resourceId);
        }
    }

    // Add shared resources
    for (const [id, share] of sharesStore) {
        if (share.target_user_id === userId &&
            share.resource_type === resourceType &&
            share.permission >= PERMISSION.READ) {
            accessible.add(share.resource_id);
        }
    }

    return Array.from(accessible);
}

/**
 * Get permission name from level
 */
export function getPermissionName(level) {
    switch (level) {
        case PERMISSION.NONE: return 'none';
        case PERMISSION.READ: return 'read';
        case PERMISSION.WRITE: return 'write';
        case PERMISSION.ADMIN: return 'admin';
        default: return 'unknown';
    }
}

/**
 * Parse permission from string
 */
export function parsePermission(name) {
    switch (name?.toLowerCase()) {
        case 'read': return PERMISSION.READ;
        case 'write': return PERMISSION.WRITE;
        case 'admin': return PERMISSION.ADMIN;
        default: return PERMISSION.NONE;
    }
}

/**
 * Register sharing routes
 */
export function registerSharingRoutes(server, validateToken) {

    // Create share
    server.post('/api/share/create', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const { resource_type, resource_id, target_user_id, permission } = request.body;

        if (!resource_type || !resource_id || !target_user_id) {
            return reply.status(400).send({ success: false, error: 'Missing required fields' });
        }

        const userId = user.id || user.userId;
        const permLevel = typeof permission === 'string' ? parsePermission(permission) : (permission || PERMISSION.READ);

        const share = createShare(userId, resource_type, resource_id, target_user_id, permLevel);

        return { success: true, data: share };
    });

    // Revoke share
    server.delete('/api/share/:shareId', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const { shareId } = request.params;
        const userId = user.id || user.userId;

        const result = revokeShare(shareId, userId);

        if (!result.success) {
            return reply.status(403).send(result);
        }

        return result;
    });

    // Get my shares (resources I've shared)
    server.get('/api/share/my-shares', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const userId = user.id || user.userId;
        const shares = [];

        for (const [id, share] of sharesStore) {
            if (share.owner_id === userId) {
                shares.push(share);
            }
        }

        return { success: true, data: shares };
    });

    // Get shared with me
    server.get('/api/share/shared-with-me', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        const userId = user.id || user.userId;
        const shares = getSharesForUser(userId);

        return { success: true, data: shares };
    });

    console.log('🔧 Sharing routes registered');
}

export default {
    PERMISSION,
    RESOURCE_TYPE,
    createShare,
    revokeShare,
    getSharesForResource,
    getSharesForUser,
    checkPermission,
    getAccessibleResources,
    registerSharingRoutes
};
