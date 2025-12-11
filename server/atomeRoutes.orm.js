/**
 * Atome API Routes v3.0 - Using ADOLE v3.0 Schema
 * 
 * Server-side routes for Atome CRUD operations.
 * Uses the ADOLE data layer (atomes + particles tables).
 * Uses WebSocket EventBus for real-time sync (no POST).
 * Requires authentication for all operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { broadcastMessage } from './githubSync.js';
import { getABoxEventBus } from './aBoxServer.js';
import db from '../database/adole.js';
import crypto from 'crypto';

// =============================================================================
// WEBSOCKET SYNC - Using EventBus (replaces POST-based sync)
// =============================================================================

/**
 * Sync atome to connected clients via WebSocket EventBus
 * This is the new real-time sync mechanism that replaces POST to Tauri
 */
function syncAtomeViaWebSocket(atome, operation = 'create') {
    try {
        const eventBus = getABoxEventBus();
        if (!eventBus) {
            console.warn('⚠️ [AtomeSync] EventBus not available for sync');
            return;
        }

        // Emit sync event to all connected clients
        eventBus.emit('event', {
            type: 'atome-sync',
            operation,
            atome: {
                atome_id: atome.atome_id || atome.id,
                atome_type: atome.atome_type || atome.type,
                parent_id: atome.parent_id || atome.parent,
                owner_id: atome.owner_id || atome.owner,
                created_at: atome.created_at,
                updated_at: atome.updated_at,
                particles: atome.particles || atome.data || atome.properties || {},
                deleted: operation === 'delete'
            },
            timestamp: new Date().toISOString()
        });

        console.log(`🔄 [AtomeSync] Emitted ${operation} event for atome ${atome.atome_id || atome.id}`);
    } catch (error) {
        console.error(`⚠️ [AtomeSync] WebSocket emit failed: ${error.message}`);
    }
}

/**
 * Compute sync hash for a user (for integrity verification)
 * Uses ADOLE v3.0 schema (atomes + particles)
 */
async function computeUserSyncHash(userId) {
    const atomes = await db.query('all', `
        SELECT a.atome_id, a.updated_at
        FROM atomes a
        WHERE a.owner_id = ?
        ORDER BY a.atome_id
    `, [userId]);

    let hasherInput = '';
    let count = 0;

    for (const atome of atomes) {
        hasherInput += `${atome.atome_id}:${atome.updated_at};`;
        count++;
    }

    const hash = crypto.createHash('sha256').update(hasherInput).digest('hex').substring(0, 16);

    return { hash, count };
}

/**
 * Update the stored sync hash for a user (uses sync_state table)
 */
async function updateUserSyncHash(userId) {
    const { hash, count } = await computeUserSyncHash(userId);
    const now = new Date().toISOString();

    // Use ADOLE sync_state table
    await db.query('run', `
        INSERT INTO sync_state (atome_id, local_hash, sync_status, last_sync_at)
        VALUES (?, ?, 'synced', ?)
        ON CONFLICT(atome_id) DO UPDATE SET
            local_hash = excluded.local_hash,
            sync_status = excluded.sync_status,
            last_sync_at = excluded.last_sync_at
    `, [`user_sync_${userId}`, hash, now]);
}

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
 * Format atome to unified API response format (ADOLE v3.0 schema)
 */
function formatAtome(obj) {
    if (!obj) return null;

    // Support both old format and new ADOLE v3.0 format
    return {
        // ADOLE v3.0 format
        atome_id: obj.atome_id || obj.id,
        atome_type: obj.atome_type || obj.type,
        parent_id: obj.parent_id || obj.parent,
        owner_id: obj.owner_id || obj.owner,
        created_at: obj.created_at,
        updated_at: obj.updated_at,
        particles: obj.particles || obj.properties || obj.data || {},
        // Legacy format aliases for backward compatibility
        id: obj.atome_id || obj.id,
        type: obj.atome_type || obj.type,
        parent: obj.parent_id || obj.parent,
        owner: obj.owner_id || obj.owner,
        data: obj.particles || obj.properties || obj.data || {}
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

            // Update sync hash for this user
            updateUserSyncHash(user.id).catch(() => { });

            // Sync via WebSocket to connected clients (real-time, non-blocking)
            syncAtomeViaWebSocket(formatted, 'create');

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

            // Sync via WebSocket to connected clients (real-time, non-blocking)
            syncAtomeViaWebSocket(formatted, 'update');

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

            // Get the atome data before delete for sync
            const atomeBeforeDelete = await db.getAtome(id);
            const formattedForSync = atomeBeforeDelete ? formatAtome(atomeBeforeDelete) : null;

            await db.deleteObject(id);

            // Sync via WebSocket to connected clients (real-time, non-blocking)
            if (formattedForSync) {
                syncAtomeViaWebSocket(formattedForSync, 'delete');
            }

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

    // NOTE: All sync routes (pull, push, hash, reconcile, queue-status) are deprecated
    // Synchronization is now handled in real-time via WebSocket EventBus

    console.log('[Atome] Routes v3.0 registered (ADOLE v3.0 schema with WebSocket sync)');
}
