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
import crypto from 'crypto';

// =============================================================================
// AUTO-SYNC TO TAURI - Queue-based with retry
// =============================================================================

const TAURI_URL = process.env.TAURI_URL || 'http://localhost:3000';
const SYNC_SECRET = process.env.SYNC_SECRET || 'squirrel-sync-2024';

// Sync worker interval (30 seconds)
let syncWorkerInterval = null;

/**
 * Queue a sync operation for reliable delivery
 * If sync fails, it will be retried by the background worker
 */
async function queueSyncToTauri(atome, operation = 'create') {
    const now = new Date().toISOString();
    const payload = JSON.stringify({
        atomes: [{
            id: atome.id,
            kind: atome.kind,
            type: atome.type,
            data: atome.data || atome.properties || {},
            snapshot: atome.data || atome.properties || {},
            parent: atome.parent,
            owner: atome.owner,
            logical_clock: atome.logical_clock || 1,
            sync_status: 'synced',
            device_id: null,
            created_at: atome.created_at,
            updated_at: atome.updated_at,
            meta: {},
            deleted: false
        }]
    });

    try {
        await db.query('run', `
            INSERT INTO sync_queue (object_id, object_type, operation, payload, target_server, status, created_at, next_retry_at)
            VALUES (?, 'atome', ?, ?, 'tauri', 'pending', ?, ?)
            ON CONFLICT(object_id, operation, target_server) DO UPDATE SET
                payload = excluded.payload,
                status = 'pending',
                attempts = 0,
                error_message = NULL,
                next_retry_at = excluded.next_retry_at
        `, [atome.id, operation, payload, now, now]);

        console.log(`📥 [SyncQueue] Queued ${operation} for atome ${atome.id} to Tauri`);
    } catch (error) {
        console.error(`⚠️ [SyncQueue] Failed to queue: ${error.message}`);
    }
}

/**
 * Try to sync an atome to Tauri immediately, queue on failure
 */
async function syncAtomeToTauriWithQueue(atome, operation = 'create') {
    try {
        const syncPayload = {
            atomes: [{
                id: atome.id,
                kind: atome.kind,
                type: atome.type,
                data: atome.data || atome.properties || {},
                snapshot: atome.data || atome.properties || {},
                parent: atome.parent,
                owner: atome.owner,
                logical_clock: atome.logical_clock || 1,
                sync_status: 'synced',
                device_id: null,
                created_at: atome.created_at,
                updated_at: atome.updated_at,
                meta: {},
                deleted: operation === 'delete' // Mark as deleted for delete operation
            }]
        };

        const response = await fetch(`${TAURI_URL}/api/atome/sync/receive`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sync-Secret': SYNC_SECRET
            },
            body: JSON.stringify(syncPayload),
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            console.log(`🔄 [AutoSync] Synced atome ${atome.id} to Tauri`);
            // Remove from queue if it was there
            await db.query('run',
                `DELETE FROM sync_queue WHERE object_id = ? AND target_server = 'tauri'`,
                [atome.id]
            ).catch(() => { });
        } else {
            const body = await response.text();
            console.log(`⚠️ [AutoSync] Tauri returned ${response.status}: ${body}, queuing for retry`);
            await queueSyncToTauri(atome, operation);
        }
    } catch (error) {
        // Queue for retry - Tauri might be offline
        console.log(`⚠️ [AutoSync] Could not reach Tauri: ${error.message}, queuing for retry`);
        await queueSyncToTauri(atome, operation);
    }
}

/**
 * Process pending sync queue items (called by background worker)
 */
async function processSyncQueue() {
    const now = new Date().toISOString();

    try {
        // Get pending items ready for retry
        const pendingItems = await db.query('all', `
            SELECT id, object_id, payload FROM sync_queue 
            WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
            AND attempts < max_attempts
            ORDER BY created_at ASC
            LIMIT 10
        `, [now]);

        if (!pendingItems || pendingItems.length === 0) {
            return;
        }

        console.log(`🔄 [SyncWorker] Processing ${pendingItems.length} pending sync items`);

        for (const item of pendingItems) {
            try {
                const payload = JSON.parse(item.payload);

                const response = await fetch(`${TAURI_URL}/api/atome/sync/receive`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sync-Secret': SYNC_SECRET
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    console.log(`✅ [SyncWorker] Synced queued atome ${item.object_id} to Tauri`);
                    await db.query('run', `DELETE FROM sync_queue WHERE id = ?`, [item.id]);
                } else {
                    const body = await response.text();
                    await updateQueueRetry(item.id, `HTTP ${response.status}: ${body}`);
                }
            } catch (error) {
                await updateQueueRetry(item.id, error.message);
            }
        }
    } catch (error) {
        console.error(`⚠️ [SyncWorker] Error: ${error.message}`);
    }
}

/**
 * Update queue item for retry with exponential backoff
 */
async function updateQueueRetry(queueId, error) {
    try {
        const item = await db.query('get', `SELECT attempts FROM sync_queue WHERE id = ?`, [queueId]);
        const attempts = (item?.attempts || 0) + 1;
        const backoffSeconds = 30 * Math.pow(2, Math.min(attempts - 1, 4)); // 30s, 60s, 120s, 240s, 480s
        const nextRetry = new Date(Date.now() + backoffSeconds * 1000).toISOString();
        const now = new Date().toISOString();
        const status = attempts >= 5 ? 'failed' : 'pending';

        await db.query('run', `
            UPDATE sync_queue SET attempts = ?, last_attempt_at = ?, next_retry_at = ?, error_message = ?, status = ? WHERE id = ?
        `, [attempts, now, nextRetry, error, status, queueId]);

        if (status === 'failed') {
            console.log(`❌ [SyncQueue] Queue item ${queueId} failed after ${attempts} attempts`);
        }
    } catch (e) {
        console.error(`⚠️ [SyncQueue] Failed to update retry: ${e.message}`);
    }
}

/**
 * Compute sync hash for a user (for integrity verification)
 */
async function computeUserSyncHash(userId) {
    const atomes = await db.query('all', `
        SELECT o.id, COALESCE(p.version, 1) as logical_clock, o.updated_at
        FROM objects o
        LEFT JOIN properties p ON o.id = p.object_id AND p.name = 'name'
        WHERE o.owner = ?
        ORDER BY o.id
    `, [userId]);

    let hasherInput = '';
    let count = 0;
    let maxClock = 0;

    for (const atome of atomes) {
        hasherInput += `${atome.id}:${atome.logical_clock}:${atome.updated_at};`;
        count++;
        if (atome.logical_clock > maxClock) {
            maxClock = atome.logical_clock;
        }
    }

    const hash = crypto.createHash('sha256').update(hasherInput).digest('hex').substring(0, 16);

    return { hash, count, maxClock };
}

/**
 * Update the stored sync hash for a user
 */
async function updateUserSyncHash(userId) {
    const { hash, count, maxClock } = await computeUserSyncHash(userId);
    const now = new Date().toISOString();

    await db.query('run', `
        INSERT INTO sync_state_hash (user_id, hash, atome_count, max_logical_clock, last_update)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            hash = excluded.hash,
            atome_count = excluded.atome_count,
            max_logical_clock = excluded.max_logical_clock,
            last_update = excluded.last_update
    `, [userId, hash, count, maxClock, now]);
}

/**
 * Start the background sync worker
 */
function startSyncWorker() {
    if (syncWorkerInterval) {
        return; // Already running
    }

    console.log('🔄 [SyncWorker] Started background sync worker (30s interval)');
    syncWorkerInterval = setInterval(processSyncQueue, 30000);

    // Also run immediately on startup
    setTimeout(processSyncQueue, 5000);
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
 * Format object to unified API response format (ADOLE schema)
 */
function formatAtome(obj) {
    if (!obj) return null;

    return {
        id: obj.id,
        type: obj.type,
        kind: obj.kind,
        parent: obj.parent,
        owner: obj.owner,
        creator: obj.creator,
        data: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.updated_at
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

            // Auto-sync to Tauri in background with queue fallback (non-blocking)
            syncAtomeToTauriWithQueue(formatted, 'create').catch(() => { });

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

            // Auto-sync UPDATE to Tauri in background with queue fallback (non-blocking)
            syncAtomeToTauriWithQueue(formatted, 'update').catch(() => { });

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

            // Auto-sync DELETE to Tauri in background with queue fallback (non-blocking)
            if (formattedForSync) {
                syncAtomeToTauriWithQueue(formattedForSync, 'delete').catch(() => { });
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

    // ========================================================================
    // SYNC - POST /api/atome/sync/receive - Receive full atomes from Tauri
    // This endpoint accepts ADOLE-formatted atomes for cross-server sync
    // Supports both JWT auth (for client) and sync-secret (for server-to-server)
    // ========================================================================
    server.post('/api/atome/sync/receive', async (request, reply) => {
        // Check for sync-secret header first (server-to-server sync)
        const syncSecret = request.headers['x-sync-secret'];
        const expectedSecret = process.env.SYNC_SECRET || 'squirrel-sync-2024';

        let userId;

        if (syncSecret === expectedSecret) {
            // Server-to-server sync - use owner from first atome
            const { atomes } = request.body;
            if (atomes && atomes.length > 0) {
                userId = atomes[0].owner;
            }
            if (!userId) {
                return reply.code(400).send({ success: false, error: 'No owner in atomes' });
            }
        } else {
            // Regular JWT auth
            const user = await validateToken(request);
            if (!user) {
                return reply.code(401).send({ success: false, error: 'Unauthorized' });
            }
            userId = user.id;
        }

        const { atomes } = request.body;

        if (!Array.isArray(atomes)) {
            return reply.code(400).send({
                success: false,
                error: 'atomes must be an array'
            });
        }

        try {
            let synced = 0;

            for (const atome of atomes) {
                // Check if atome already exists
                const existing = await db.getAtome(atome.id);

                // Check if parent exists (to avoid FK constraint error)
                let parentValue = atome.parent || null;
                if (parentValue) {
                    const parentExists = await db.getAtome(parentValue);
                    if (!parentExists) {
                        console.log(`[Sync] Parent ${parentValue} not found, setting to null`);
                        parentValue = null;
                    }
                }

                if (existing) {
                    // Check if this is a delete sync
                    if (atome.deleted === true) {
                        // Delete the atome
                        await db.deleteObject(atome.id);
                        console.log(`[Sync] Deleted atome ${atome.id} (synced from Tauri)`);
                        synced++;
                        continue;
                    }

                    // Update if incoming has higher logical_clock
                    const existingClock = existing.logical_clock || 1;
                    const incomingClock = atome.logical_clock || 1;

                    if (incomingClock > existingClock) {
                        // updateAtome takes (id, properties, author)
                        await db.updateAtome(atome.id, atome.data || {}, userId);
                        synced++;
                    }
                } else {
                    // If deleted is true and doesn't exist, skip creation
                    if (atome.deleted === true) {
                        console.log(`[Sync] Skipping deleted atome ${atome.id} (doesn't exist locally)`);
                        continue;
                    }

                    // Create new atome
                    await db.createAtome({
                        id: atome.id,
                        type: atome.type || 'shape',
                        kind: atome.kind || null,
                        parent: parentValue,
                        owner: atome.owner || userId,
                        properties: atome.data || {},
                        author: userId
                    });
                    synced++;
                }
            }

            console.log(`[Sync] Received ${synced} atomes from Tauri for user ${userId}`);

            return reply.send({
                success: true,
                message: `Synced ${synced} atomes`,
                synced
            });
        } catch (error) {
            console.error('[Atome] Sync receive error:', error);
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

    // ========================================================================
    // SYNC HASH - GET /api/sync/hash
    // Get current sync hash for authenticated user
    // ========================================================================
    server.get('/api/sync/hash', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            const { hash, count, maxClock } = await computeUserSyncHash(user.id);
            const now = new Date().toISOString();

            return reply.send({
                success: true,
                user_id: user.id,
                hash,
                atome_count: count,
                max_logical_clock: maxClock,
                last_update: now
            });
        } catch (error) {
            console.error('[Sync] Hash error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // SYNC RECONCILE - POST /api/sync/reconcile
    // Compare hashes and determine if sync is needed
    // ========================================================================
    server.post('/api/sync/reconcile', async (request, reply) => {
        // Check for sync secret (server-to-server) or JWT
        const syncSecret = request.headers['x-sync-secret'];
        const user = syncSecret === SYNC_SECRET ?
            { id: request.headers['x-user-id'] || 'unknown' } :
            await validateToken(request);

        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { remote_hash, remote_atome_count, remote_max_clock } = request.body;

        try {
            const { hash: localHash, count: localCount, maxClock: localMaxClock } = await computeUserSyncHash(user.id);

            if (localHash === remote_hash) {
                return reply.send({
                    success: true,
                    in_sync: true,
                    message: 'Databases are in sync',
                    local_hash: localHash,
                    remote_hash
                });
            }

            // Determine which side is ahead
            const needsPull = remote_max_clock > localMaxClock;
            const needsPush = localMaxClock > remote_max_clock;

            return reply.send({
                success: true,
                in_sync: false,
                message: 'Databases out of sync, reconciliation needed',
                local_hash: localHash,
                remote_hash,
                local_count: localCount,
                remote_count: remote_atome_count,
                local_max_clock: localMaxClock,
                remote_max_clock: remote_max_clock,
                needs_pull: needsPull,
                needs_push: needsPush
            });
        } catch (error) {
            console.error('[Sync] Reconcile error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // ========================================================================
    // SYNC QUEUE STATUS - GET /api/sync/queue-status
    // Get pending sync queue status
    // ========================================================================
    server.get('/api/sync/queue-status', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        try {
            const pending = await db.query('get',
                `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`, []);
            const failed = await db.query('get',
                `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`, []);
            const total = await db.query('get',
                `SELECT COUNT(*) as count FROM sync_queue`, []);

            const items = await db.query('all', `
                SELECT id, object_id, operation, status, attempts, error_message, created_at 
                FROM sync_queue ORDER BY created_at DESC LIMIT 20
            `, []);

            return reply.send({
                success: true,
                pending: pending?.count || 0,
                failed: failed?.count || 0,
                total: total?.count || 0,
                items: items || []
            });
        } catch (error) {
            console.error('[Sync] Queue status error:', error);
            return reply.code(500).send({
                success: false,
                error: error.message
            });
        }
    });

    // Start the background sync worker
    startSyncWorker();

    console.log('[Atome] Routes v2.0 registered (ADOLE schema with robust sync)');
}
