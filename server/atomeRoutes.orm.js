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
import {
    inheritPermissionsFromParent,
    broadcastAtomeCreate,
    broadcastAtomeDelete,
    broadcastAtomeRealtimePatch
} from './atomeRealtime.js';

const SYNC_DEBUG =
    process.env.SQUIRREL_SYNC_DEBUG !== '0'
    && process.env.SQUIRREL_SYNC_DEBUG !== 'false';

function syncDebugLog(message, data = null) {
    if (!SYNC_DEBUG) return;
    if (data === null || data === undefined) {
        console.log(`[SyncDebug] ${message}`);
        return;
    }
    console.log(`[SyncDebug] ${message}`, data);
}

// =============================================================================
// WEBSOCKET SYNC - Using EventBus (replaces POST-based sync)
// =============================================================================

/**
 * Sync atome to connected clients via WebSocket EventBus
 * This is the new real-time sync mechanism that replaces POST to Tauri
 * 
 * SECURITY: Events are broadcast to all clients for file sync purposes,
 * but clients MUST validate owner_id before mirroring to local DB.
 * This is defense in depth - see UnifiedSync.js for client-side validation.
 * 
 * For atome CRUD operations, the owner_id is always included so clients
 * can filter events that don't belong to them.
 */
function syncAtomeViaWebSocket(atome, operation = 'create') {
    try {
        const eventBus = getABoxEventBus();
        if (!eventBus) {
            syncDebugLog('EventBus not available for sync');
            return;
        }

        const atomeId = atome?.atome_id || atome?.id;
        if (!atomeId) {
            syncDebugLog('Missing atome id for sync payload');
            return;
        }
        const atomeType = atome?.atome_type || atome?.type || 'atome';
        const parentId = atome?.parent_id || atome?.parent || atome?.parentId || null;
        const ownerId = atome?.owner_id || atome?.owner || atome?.ownerId || null;
        const particles = atome?.particles || atome?.data || atome?.properties || {};

        // Emit sync event - clients MUST validate owner_id before local mirroring
        // The owner_id is critical for client-side security filtering
        eventBus.emit('event', {
            type: 'atome-sync',
            operation,
            atome: {
                atome_id: atomeId,
                atome_type: atomeType,
                parent_id: parentId,
                owner_id: ownerId,  // SECURITY: Clients filter on this field
                created_at: atome.created_at,
                updated_at: atome.updated_at,
                particles,
                deleted: operation === 'delete',
                id: atomeId,
                type: atomeType,
                parentId,
                ownerId,  // SECURITY: Duplicate for compatibility - clients filter on this field
                properties: particles,
                data: particles
            },
            timestamp: new Date().toISOString()
        });

        syncDebugLog('atome sync emitted', {
            operation,
            atome_id: atomeId,
            atome_type: atomeType,
            parent_id: parentId,
            owner_id: ownerId
        });
    } catch (error) {
        console.error(`[SyncDebug] WebSocket emit failed: ${error.message}`);
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
        const jwt = await import('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET || 'squirrel_jwt_secret_change_in_production';
        const decoded = jwt.default.verify(token, jwtSecret);
        return {
            id: decoded.sub || decoded.id || decoded.userId,
            userId: decoded.sub || decoded.id || decoded.userId,
            username: decoded.username,
            phone: decoded.phone
        };
    } catch (e) {
        console.error('[Atome] Token verify error:', e.message);
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

function resolveSyncOperation(kind) {
    if (!kind) return 'update';
    const normalized = String(kind).toLowerCase();
    if (normalized === 'delete') return 'delete';
    if (normalized === 'create') return 'create';
    return 'update';
}

async function resolveAtomeForSync(event) {
    const atomeId = event?.atome_id || event?.atomeId || null;
    if (!atomeId) return null;

    const [state, atome] = await Promise.all([
        db.getStateCurrent(atomeId),
        db.getAtome(atomeId)
    ]);

    const properties = state?.properties || atome?.data || atome?.properties || {};
    const atomeType = atome?.atome_type
        || properties.type
        || properties.kind
        || properties.atome_type
        || 'atome';
    const parentId = atome?.parent_id
        || properties.parent_id
        || properties.parentId
        || null;
    const ownerId = atome?.owner_id
        || properties.owner_id
        || properties.ownerId
        || null;

    return {
        atome_id: atomeId,
        atome_type: atomeType,
        parent_id: parentId,
        owner_id: ownerId,
        created_at: atome?.created_at || state?.updated_at || null,
        updated_at: state?.updated_at || atome?.updated_at || null,
        particles: properties,
        id: atomeId,
        type: atomeType,
        parentId,
        ownerId,
        properties
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

        const { id, type, kind, parentId, parent, data, ownerId, owner_id } = request.body;
        const objectId = id || uuidv4();
        const parentValue = parentId || parent || null;
        const resolvedOwnerId = ownerId || owner_id || user.id;

        try {
            if (parentValue) {
                const allowedCreate = await db.canCreate(parentValue, user.id);
                if (!allowedCreate) {
                    return reply.code(403).send({
                        success: false,
                        error: 'Access denied (create)'
                    });
                }
            }

            // Create object with properties
            const atome = await db.createAtome({
                id: objectId,
                type: type || 'shape',
                kind: kind || null,
                parent: parentValue,
                owner: resolvedOwnerId,
                properties: data || {},
                creator: user.id
            });

            const formatted = formatAtome(atome);

            try {
                const resolveResult = await db.resolvePendingOwners();
                if (resolveResult.resolved > 0) {
                    console.log('[Atome] Resolved', resolveResult.resolved, 'pending owner references');
                }
            } catch (resolveErr) {
                console.log('[Atome] Could not resolve pending owners:', resolveErr.message);
            }

            try {
                await inheritPermissionsFromParent({
                    parentId: parentValue,
                    childId: objectId,
                    childOwnerId: resolvedOwnerId,
                    grantorId: user.id
                });
            } catch (_) { }

            try {
                await broadcastAtomeCreate({
                    atomeId: objectId,
                    atomeType: type || 'shape',
                    parentId: parentValue,
                    particles: data || {},
                    senderUserId: user.id
                });
            } catch (_) { }

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
        const patch = (data && typeof data === 'object') ? data : null;

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

            try {
                if (patch) {
                    await broadcastAtomeRealtimePatch({
                        atomeId: id,
                        particles: patch,
                        senderUserId: user.id
                    });
                }
            } catch (_) { }

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
        const patch = {};

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
                    patch[key] = value;
                }
            }

            const updated = await db.getAtome(id);
            const formatted = formatAtome(updated);

            try {
                if (Object.keys(patch).length) {
                    await broadcastAtomeRealtimePatch({
                        atomeId: id,
                        particles: patch,
                        senderUserId: user.id
                    });
                }
            } catch (_) { }

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

            try {
                await broadcastAtomeDelete({
                    atomeId: id,
                    senderUserId: user.id
                });
            } catch (_) { }

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
    // EVENT LOG + STATE CURRENT (new pipeline)
    // ========================================================================

    server.post('/api/events/commit', async (request, reply) => {
        console.log('[Fastify] /api/events/commit received');
        const user = await validateToken(request);
        if (!user) {
            console.log('[Fastify] /api/events/commit UNAUTHORIZED - no valid token');
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const event = request.body;
        if (!event || typeof event !== 'object') {
            return reply.code(400).send({ success: false, error: 'Invalid event payload' });
        }

        const actor = event.actor || { type: 'user', id: user.id };
        console.log('[Fastify] /api/events/commit processing', {
            user_id: user.id,
            atome_id: event.atome_id || event.atomeId || null,
            kind: event.kind || null
        });
        syncDebugLog('commit received', {
            user_id: user.id,
            atome_id: event.atome_id || event.atomeId || null,
            kind: event.kind || null,
            project_id: event.project_id || event.projectId || null
        });

        try {
            const created = await db.appendEvent({ ...event, actor });
            syncDebugLog('commit stored', {
                atome_id: created?.atome_id || created?.atomeId || null,
                kind: created?.kind || null,
                event_id: created?.id || created?.event_id || null
            });
            if (created?.atome_id && created?.kind !== 'snapshot') {
                const syncAtome = await resolveAtomeForSync(created);
                if (syncAtome) {
                    const op = resolveSyncOperation(created.kind);
                    syncAtomeViaWebSocket(syncAtome, op);
                } else if (created.kind === 'delete') {
                    syncAtomeViaWebSocket({ atome_id: created.atome_id }, 'delete');
                }
            }
            return reply.send({ success: true, event: created });
        } catch (error) {
            console.error('[Events] Commit error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.post('/api/events/commit-batch', async (request, reply) => {
        console.log('[Fastify] /api/events/commit-batch received');
        const user = await validateToken(request);
        if (!user) {
            console.log('[Fastify] /api/events/commit-batch UNAUTHORIZED');
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const body = request.body || {};
        const events = Array.isArray(body) ? body : body.events;
        if (!Array.isArray(events)) {
            return reply.code(400).send({ success: false, error: 'Missing events array' });
        }

        const txId = body.tx_id || body.txId || null;
        const fallbackActor = body.actor || { type: 'user', id: user.id };
        const normalizedEvents = events.map((evt) => ({
            ...evt,
            actor: evt?.actor || fallbackActor
        }));
        console.log('[Fastify] /api/events/commit-batch processing', {
            user_id: user.id,
            count: normalizedEvents.length
        });
        syncDebugLog('commit-batch received', {
            user_id: user.id,
            count: normalizedEvents.length,
            tx_id: txId
        });

        try {
            const created = await db.appendEvents(normalizedEvents, { txId });
            syncDebugLog('commit-batch stored', {
                count: Array.isArray(created) ? created.length : 0,
                tx_id: txId
            });
            const latestByAtome = new Map();
            for (const evt of created || []) {
                const atomeId = evt?.atome_id || evt?.atomeId;
                if (!atomeId || evt?.kind === 'snapshot') continue;
                latestByAtome.set(atomeId, evt);
            }
            if (latestByAtome.size) {
                await Promise.all(Array.from(latestByAtome.values()).map(async (evt) => {
                    const syncAtome = await resolveAtomeForSync(evt);
                    if (syncAtome) {
                        syncAtomeViaWebSocket(syncAtome, resolveSyncOperation(evt.kind));
                    } else if (evt?.kind === 'delete' && evt?.atome_id) {
                        syncAtomeViaWebSocket({ atome_id: evt.atome_id }, 'delete');
                    }
                }));
            }
            return reply.send({ success: true, events: created });
        } catch (error) {
            console.error('[Events] Commit batch error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/events', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const {
            projectId,
            project_id,
            atomeId,
            atome_id,
            txId,
            tx_id,
            gestureId,
            gesture_id,
            since,
            until,
            limit,
            offset,
            order
        } = request.query || {};

        try {
            const events = await db.listEvents({
                projectId: projectId || project_id || null,
                atomeId: atomeId || atome_id || null,
                txId: txId || tx_id || null,
                gestureId: gestureId || gesture_id || null,
                since: since || null,
                until: until || null,
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined,
                order: order || 'asc'
            });

            return reply.send({ success: true, events });
        } catch (error) {
            console.error('[Events] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/state_current/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params || {};
        if (!id) {
            return reply.code(400).send({ success: false, error: 'Missing atome id' });
        }

        try {
            const entry = await db.getStateCurrent(id);
            if (!entry) {
                return reply.code(404).send({ success: false, error: 'State not found' });
            }
            return reply.send({ success: true, state: entry });
        } catch (error) {
            console.error('[State] Get error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/state_current', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { projectId, project_id, limit, offset } = request.query || {};

        try {
            const states = await db.listStateCurrent(projectId || project_id || null, {
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined,
                ownerId: user.id
            });

            return reply.send({ success: true, states });
        } catch (error) {
            console.error('[State] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.post('/api/snapshots', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const body = request.body || {};
        const projectId = body.projectId || body.project_id || null;
        const atomeId = body.atomeId || body.atome_id || null;
        const label = body.label || null;
        const actor = body.actor || { type: 'user', id: user.id };
        const state = body.state || body.state_blob || body.stateBlob || null;
        const snapshotType = body.snapshot_type || body.snapshotType || 'manual';

        if (!projectId && !atomeId) {
            return reply.code(400).send({ success: false, error: 'Missing projectId or atomeId' });
        }

        try {
            const snapshotId = await db.createStateSnapshot({
                projectId,
                atomeId,
                label,
                actor,
                state,
                snapshotType
            });

            if (projectId || atomeId) {
                try {
                    await db.appendEvent({
                        kind: 'snapshot',
                        atome_id: atomeId || projectId,
                        project_id: projectId,
                        actor,
                        payload: { snapshot_id: snapshotId, label }
                    });
                } catch (_) { }
            }

            return reply.send({ success: true, snapshotId });
        } catch (error) {
            console.error('[Snapshots] Create error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/snapshots', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { projectId, project_id, limit, offset } = request.query || {};
        const targetProject = projectId || project_id || null;
        if (!targetProject) {
            return reply.code(400).send({ success: false, error: 'Missing projectId' });
        }

        try {
            const snapshots = await db.listStateSnapshots(targetProject, {
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined
            });
            return reply.send({ success: true, snapshots });
        } catch (error) {
            console.error('[Snapshots] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/snapshots/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params || {};
        if (!id) {
            return reply.code(400).send({ success: false, error: 'Missing snapshot id' });
        }

        try {
            const snapshot = await db.getStateSnapshot(id);
            if (!snapshot) {
                return reply.code(404).send({ success: false, error: 'Snapshot not found' });
            }
            return reply.send({ success: true, snapshot });
        } catch (error) {
            console.error('[Snapshots] Get error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    // NOTE: All sync routes (pull, push, hash, reconcile, queue-status) are deprecated
    // Synchronization is now handled in real-time via WebSocket EventBus

    console.log('[Atome] Routes v3.0 registered (ADOLE v3.0 schema with WebSocket sync)');
}

export { syncAtomeViaWebSocket };
