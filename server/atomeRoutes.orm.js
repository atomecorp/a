/**
 * Atome API Routes v2.0 - Using ADOLE Schema
 * 
 * Server-side routes for Atome CRUD operations.
 * Uses the ADOLE data layer (objects + properties + versions).
 * Requires authentication for all operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { broadcastMessage } from './githubSync.js';
import db from '../database/adole.js';

/**
 * Validate authentication token and return user info
 */
async function validateToken(request) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);

    try {
        const [, payload] = token.split('.');
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
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
 * Format object to unified API response format
 */
function formatAtome(obj) {
    if (!obj) return null;

    return {
        id: obj.id,
        type: obj.type,
        kind: obj.kind,
        parentId: obj.parent,
        ownerId: obj.owner,
        creatorId: obj.creator,
        data: obj.properties || {},
        createdAt: obj.created_at,
        updatedAt: obj.updated_at
    };
}

/**
 * Register all atome routes
 */
export async function registerAtomeRoutes(server, dataSource = null) {
    // Initialize database (dataSource param is legacy, kept for API compatibility)
    await db.initDatabase();

    // ========================================================================
    // CREATE - POST /api/atome/create
    // ========================================================================
    server.post('/api/atome/create', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id, type, kind, parentId, parent, data } = request.body;
        const objectId = id || uuidv4();
        const parentValue = parentId || parent || null;

        try {
            // Create object with properties
            const atome = await db.createAtome({
                id: objectId,
                type: type || 'shape',
                kind: kind || null,
                parent: parentValue,
                owner: user.id,
                properties: data || {},
                author: user.id
            });

            const formatted = formatAtome(atome);

            // Broadcast to WebSocket clients
            broadcastMessage({
                type: 'atome-created',
                atome: formatted
            });

            return reply.code(201).send({
                success: true,
                message: 'Atome created successfully',
                atome: formatted,
                data: formatted
            });
        } catch (error) {
            console.error('[Atome] Create error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // LIST - GET /api/atome/list
    // ========================================================================
    server.get('/api/atome/list', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { type, kind, parentId, parent, limit = 100, offset = 0 } = request.query;
        const parentValue = parentId || parent;

        try {
            const options = {
                type,
                limit: parseInt(limit),
                offset: parseInt(offset)
            };

            // Handle parent filter
            if (parentValue === 'null' || parentValue === '') {
                options.parent = null;
            } else if (parentValue) {
                options.parent = parentValue;
            }

            const atomes = await db.listAtomes(user.id, options);

            // Filter by kind if specified
            let filtered = atomes;
            if (kind) {
                filtered = atomes.filter(a => a.kind === kind);
            }

            const formatted = filtered.map(formatAtome);

            return reply.send({
                success: true,
                atomes: formatted,
                total: formatted.length
            });
        } catch (error) {
            console.error('[Atome] List error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // GET - GET /api/atome/:id
    // ========================================================================
    server.get('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params;

        try {
            const atome = await db.getAtome(id);

            if (!atome) {
                return reply.code(404).send({
                    success: false,
                    error: 'Atome not found'
                });
            }

            // Check permission
            const hasAccess = atome.owner === user.id || await db.canRead(id, user.id);
            if (!hasAccess) {
                return reply.code(403).send({
                    success: false,
                    error: 'Access denied'
                });
            }

            const formatted = formatAtome(atome);

            return reply.send({
                success: true,
                atome: formatted,
                data: formatted
            });
        } catch (error) {
            console.error('[Atome] Get error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // UPDATE - PUT /api/atome/:id
    // ========================================================================
    server.put('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params;
        const { data, type, kind, parentId } = request.body;

        try {
            const existing = await db.getObjectById(id);
            if (!existing) {
                return reply.code(404).send({
                    success: false,
                    error: 'Atome not found'
                });
            }

            // Check permission
            const hasAccess = existing.owner === user.id || await db.canWrite(id, user.id);
            if (!hasAccess) {
                return reply.code(403).send({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Update object metadata if provided
            if (type || kind || parentId !== undefined) {
                await db.updateObject(id, {
                    type: type || undefined,
                    kind: kind || undefined,
                    parent: parentId !== undefined ? parentId : undefined
                });
            }

            // Update properties
            if (data && typeof data === 'object') {
                await db.setProperties(id, data, user.id);
            }

            const updated = await db.getAtome(id);
            const formatted = formatAtome(updated);

            // Broadcast
            broadcastMessage({
                type: 'atome-updated',
                atome: formatted
            });

            return reply.send({
                success: true,
                message: 'Atome updated successfully',
                atome: formatted,
                data: formatted
            });
        } catch (error) {
            console.error('[Atome] Update error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // ALTER - POST /api/atome/:id/alter (partial update)
    // ========================================================================
    server.post('/api/atome/:id/alter', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params;
        const changes = request.body;

        try {
            const existing = await db.getObjectById(id);
            if (!existing) {
                return reply.code(404).send({
                    success: false,
                    error: 'Atome not found'
                });
            }

            // Check permission
            const hasAccess = existing.owner === user.id || await db.canWrite(id, user.id);
            if (!hasAccess) {
                return reply.code(403).send({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Apply property changes
            for (const [key, value] of Object.entries(changes)) {
                if (key !== 'id' && key !== 'type' && key !== 'kind') {
                    await db.setProperty(id, key, value, user.id);
                }
            }

            const updated = await db.getAtome(id);
            const formatted = formatAtome(updated);

            // Broadcast
            broadcastMessage({
                type: 'atome-altered',
                atome: formatted
            });

            return reply.send({
                success: true,
                message: 'Atome altered successfully',
                atome: formatted
            });
        } catch (error) {
            console.error('[Atome] Alter error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // DELETE - DELETE /api/atome/:id
    // ========================================================================
    server.delete('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params;

        try {
            const existing = await db.getObjectById(id);
            if (!existing) {
                return reply.code(404).send({
                    success: false,
                    error: 'Atome not found'
                });
            }

            // Check permission - only owner can delete
            if (existing.owner !== user.id) {
                return reply.code(403).send({
                    success: false,
                    error: 'Access denied - only owner can delete'
                });
            }

            await db.deleteObject(id);

            // Broadcast
            broadcastMessage({
                type: 'atome-deleted',
                atomeId: id
            });

            return reply.send({
                success: true,
                message: 'Atome deleted successfully'
            });
        } catch (error) {
            console.error('[Atome] Delete error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // HISTORY - GET /api/atome/:id/history
    // ========================================================================
    server.get('/api/atome/:id/history', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params;
        const { property, limit = 50 } = request.query;

        try {
            const existing = await db.getObjectById(id);
            if (!existing) {
                return reply.code(404).send({
                    success: false,
                    error: 'Atome not found'
                });
            }

            // Check permission
            const hasAccess = existing.owner === user.id || await db.canRead(id, user.id);
            if (!hasAccess) {
                return reply.code(403).send({
                    success: false,
                    error: 'Access denied'
                });
            }

            let history;
            if (property) {
                history = await db.getPropertyHistory(id, property, parseInt(limit));
            } else {
                // Get all changes for this object
                history = await db.getChangesSince(0);
                history = history.filter(h => h.object_id === id).slice(0, parseInt(limit));
            }

            return reply.send({
                success: true,
                history,
                total: history.length
            });
        } catch (error) {
            console.error('[Atome] History error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // SNAPSHOT - POST /api/atome/:id/snapshot
    // ========================================================================
    server.post('/api/atome/:id/snapshot', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params;

        try {
            const existing = await db.getObjectById(id);
            if (!existing) {
                return reply.code(404).send({
                    success: false,
                    error: 'Atome not found'
                });
            }

            // Check permission
            if (existing.owner !== user.id) {
                return reply.code(403).send({
                    success: false,
                    error: 'Access denied - only owner can create snapshots'
                });
            }

            const snapshotId = await db.createSnapshot(id);

            return reply.send({
                success: true,
                message: 'Snapshot created',
                snapshotId
            });
        } catch (error) {
            console.error('[Atome] Snapshot error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // SYNC - GET /api/atome/sync/pull
    // ========================================================================
    server.get('/api/atome/sync/pull', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { since = 0 } = request.query;

        try {
            const changes = await db.getChangesSince(parseInt(since));

            // Filter to only user's objects
            const userChanges = changes.filter(c => c.owner === user.id);

            return reply.send({
                success: true,
                changes: userChanges,
                lastVersionId: userChanges.length > 0 ? userChanges[userChanges.length - 1].id : since
            });
        } catch (error) {
            console.error('[Atome] Sync pull error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // SYNC - POST /api/atome/sync/push
    // ========================================================================
    server.post('/api/atome/sync/push', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { changes } = request.body;

        if (!Array.isArray(changes)) {
            return reply.code(400).send({
                success: false,
                error: 'changes must be an array'
            });
        }

        try {
            let applied = 0;

            for (const change of changes) {
                const { objectId, name, value, version } = change;

                // Check if object exists
                let obj = await db.getObjectById(objectId);

                if (!obj) {
                    // Create object if it doesn't exist
                    await db.createObject({
                        id: objectId,
                        type: change.type || 'shape',
                        kind: change.kind || null,
                        parent: change.parent || null,
                        owner: user.id
                    });
                }

                // Apply property change
                await db.setProperty(objectId, name, value, user.id);
                applied++;
            }

            return reply.send({
                success: true,
                message: `Applied ${applied} changes`,
                applied
            });
        } catch (error) {
            console.error('[Atome] Sync push error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    console.log('[Atome] Routes v2.0 registered (ADOLE schema)');
}
