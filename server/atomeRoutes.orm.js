/**
 * Atome API Routes (ORM Version)
 * 
 * Server-side routes for Atome CRUD operations.
 * Uses the unified ORM layer for database operations.
 * Requires authentication for all operations.
 * Broadcasts changes via WebSocket for real-time sync.
 */

import { v4 as uuidv4 } from 'uuid';
import { broadcastMessage } from './githubSync.js';
import orm from '../database/orm.js';

/**
 * Validate authentication token
 */
async function validateToken(request) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    // Decode JWT token
    try {
        const [, payload] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        console.log('[Atome] Token decoded:', JSON.stringify(decoded));

        // Normalize the user object - JWT uses 'sub' for user id
        return {
            id: decoded.sub || decoded.id || decoded.userId,
            userId: decoded.sub || decoded.id || decoded.userId,
            username: decoded.username,
            phone: decoded.phone
        };
    } catch (e) {
        console.error('[Atome] Token decode error:', e.message);
        return null;
    }
}

/**
 * Ensure user has a tenant and principal in the ORM
 * Creates them if they don't exist
 */
async function ensureUserInORM(user) {
    const phone = user.phone || user.id || user.userId;
    const userId = user.id || user.userId;

    // Get or create tenant for this user
    const tenant = await orm.getOrCreateTenant(phone);

    // Check if principal exists by phone first
    let principal = await orm.findPrincipalByPhone(phone);

    if (!principal) {
        // Also check by principal_id (in case phone wasn't set)
        principal = await orm.findPrincipalById(userId);
    }

    if (!principal) {
        // Create principal with try/catch for race conditions
        try {
            await orm.createPrincipal({
                principal_id: userId,
                tenant_id: tenant.tenant_id,
                kind: 'user',
                phone: phone,
                username: user.username
            });
            principal = await orm.findPrincipalById(userId);
        } catch (error) {
            // If duplicate key, try to find existing
            if (error.message.includes('duplicate key')) {
                principal = await orm.findPrincipalById(userId);
                if (!principal) {
                    principal = await orm.findPrincipalByPhone(phone);
                }
            }
            if (!principal) {
                throw error;
            }
        }
    }

    // Update phone if missing
    if (principal && !principal.phone && phone) {
        try {
            const db = orm.getDatabase();
            await db('principals')
                .where('principal_id', principal.principal_id)
                .update({ phone: phone });
        } catch (e) {
            console.warn('[Atome] Could not update phone:', e.message);
        }
    }

    return {
        tenant_id: tenant.tenant_id,
        principal_id: principal.principal_id
    };
}

/**
 * Register Atome API routes
 */
export function registerAtomeRoutes(server, dataSource) {
    // Initialize ORM (non-blocking, will complete before first request)
    orm.initDatabase().catch(err => {
        console.error('[Atome] ORM initialization error:', err.message);
    });

    // =========================================================================
    // CREATE - POST /api/atome/create
    // =========================================================================
    server.post('/api/atome/create', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            // Ensure ORM is initialized
            await orm.initDatabase();

            // Ensure user exists in ORM
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id, kind, tag, parent, properties, project_id } = request.body;

            // Generate UUID if not provided (must be valid UUID for PostgreSQL)
            // If client provides an ID, check if it's a valid UUID, otherwise generate one
            let atomeId;
            if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
                atomeId = id;
            } else {
                atomeId = uuidv4();
            }

            // Build properties to store (include original id if provided for reference)
            const allProperties = {
                ...(properties || {}),
                kind: kind || 'generic',
                tag: tag || 'div',
                parent: parent || null,
                project_id: project_id || null,
                original_id: id || null  // Keep original ID if provided
            };

            // Create atome via ORM
            const { object_id } = await orm.createAtome({
                object_id: atomeId,
                tenant_id: tenant_id,
                created_by: principal_id,
                kind: kind || 'generic',
                parent_id: parent || null,
                properties: allProperties
            });

            console.log(`✅ [Atome] Created: ${object_id} (${kind})`);

            // Broadcast to all connected clients for real-time sync
            broadcastMessage('atome:created', {
                atome: {
                    id: object_id,
                    kind,
                    tag,
                    parent,
                    properties,
                    created_at: new Date().toISOString(),
                    created_by: principal_id
                }
            });

            return {
                success: true,
                data: {
                    id: object_id,
                    kind,
                    tag,
                    parent,
                    properties,
                    created_at: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Create error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // UPDATE - PUT /api/atome/:id
    // =========================================================================
    server.put('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            const { properties } = request.body;

            // Check if atome exists
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership
            if (atome.created_by !== principal_id) {
                // Check ACL
                const hasAccess = await orm.hasPermission(principal_id, id, 'write');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Update properties
            if (properties && typeof properties === 'object') {
                await orm.updateAtome(id, properties, principal_id);
            }

            const now = new Date().toISOString();
            console.log(`✅ [Atome] Updated: ${id} (${Object.keys(properties || {}).length} properties)`);

            // Broadcast to all connected clients for real-time sync
            broadcastMessage('atome:updated', {
                atome: {
                    id,
                    properties,
                    updated_at: now,
                    updated_by: principal_id
                }
            });

            return {
                success: true,
                data: {
                    id,
                    properties,
                    updated_at: now
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Update error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // DELETE - DELETE /api/atome/:id
    // =========================================================================
    server.delete('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;

            // Check if atome exists
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership
            console.log(`[Atome] DELETE check - principal_id: ${principal_id}, atome.created_by: ${atome.created_by}`);

            if (atome.created_by && atome.created_by !== principal_id) {
                // Check ACL
                const hasAccess = await orm.hasPermission(principal_id, id, 'delete');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Soft delete
            await orm.deleteAtome(id);
            const deletedAt = new Date().toISOString();

            console.log(`✅ [Atome] Deleted: ${id}`);

            // Broadcast to all connected clients for real-time sync
            broadcastMessage('atome:deleted', {
                atome: {
                    id,
                    deleted_at: deletedAt,
                    deleted_by: principal_id
                }
            });

            return {
                success: true,
                data: { id, deleted_at: deletedAt }
            };

        } catch (error) {
            console.error('❌ [Atome] Delete error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // GET - GET /api/atome/:id
    // =========================================================================
    server.get('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;

            // Get atome
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            // Check ownership or ACL
            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'read');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            return {
                success: true,
                data: {
                    id: atome.object_id,
                    kind: atome.properties.kind,
                    tag: atome.properties.tag,
                    parent: atome.properties.parent,
                    properties: atome.properties,
                    created_at: atome.created_at,
                    created_by: atome.created_by
                }
            };

        } catch (error) {
            console.error('❌ [Atome] Get error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // LIST - GET /api/atome/list
    // =========================================================================
    server.get('/api/atome/list', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { project_id, kind, parent } = request.query;

            console.log(`[Atome] LIST - Looking for atomes for user: ${principal_id}`);

            // Get all atomes for this user
            const atomes = await orm.getAtomesByUser(principal_id);

            // Apply filters
            let results = atomes.map(atome => ({
                id: atome.object_id,
                kind: atome.properties.kind || atome.kind,
                tag: atome.properties.tag,
                parent: atome.properties.parent,
                properties: atome.properties,
                created_at: atome.created_at,
                created_by: atome.created_by
            }));

            // Filter by project_id
            if (project_id) {
                results = results.filter(a => a.properties.project_id === project_id);
            }

            // Filter by kind
            if (kind) {
                results = results.filter(a => a.kind === kind);
            }

            // Filter by parent
            if (parent) {
                results = results.filter(a => a.parent === parent);
            }

            console.log(`📋 [Atome] List for user ${principal_id}: ${results.length} atomes`);

            return {
                success: true,
                data: results,
                count: results.length
            };

        } catch (error) {
            console.error('❌ [Atome] List error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    // =========================================================================
    // HISTORY - GET /api/atome/:id/history
    // =========================================================================
    server.get('/api/atome/:id/history', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.status(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            await orm.initDatabase();
            const { tenant_id, principal_id } = await ensureUserInORM(user);

            const { id } = request.params;
            const { key } = request.query;

            // Check atome exists and user has access
            const atome = await orm.getAtome(id);
            if (!atome) {
                return reply.status(404).send({ success: false, error: 'Atome not found' });
            }

            if (atome.created_by !== principal_id) {
                const hasAccess = await orm.hasPermission(principal_id, id, 'read');
                if (!hasAccess) {
                    return reply.status(403).send({ success: false, error: 'Access denied' });
                }
            }

            // Get property history
            let versions = [];

            if (key) {
                // History for specific property
                const history = await orm.getPropertyHistory(id, key);
                versions = history.map(h => ({
                    key: h.key,
                    value: JSON.parse(h.value || 'null'),
                    previous_value: h.previous_value ? JSON.parse(h.previous_value) : null,
                    changed_at: h.changed_at,
                    changed_by: h.changed_by,
                    change_type: h.change_type
                }));
            } else {
                // Get all properties and their histories
                const allProperties = await orm.getAllProperties(id);
                for (const propKey of Object.keys(allProperties)) {
                    const history = await orm.getPropertyHistory(id, propKey, 10);
                    for (const h of history) {
                        versions.push({
                            key: h.key,
                            value: JSON.parse(h.value || 'null'),
                            previous_value: h.previous_value ? JSON.parse(h.previous_value) : null,
                            changed_at: h.changed_at,
                            changed_by: h.changed_by,
                            change_type: h.change_type
                        });
                    }
                }
            }

            // Sort by changed_at descending
            versions.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));

            return {
                success: true,
                data: versions,
                count: versions.length
            };

        } catch (error) {
            console.error('❌ [Atome] History error:', error.message);
            return reply.status(500).send({ success: false, error: error.message });
        }
    });

    console.log('🔧 Atome API routes registered (ORM version)');
}

export default registerAtomeRoutes;
