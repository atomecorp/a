/**
 * UnifiedAtome.js
 * 
 * Unified Atome (Document) API implementing ADOLE principles:
 * - Append-only: Never modify original data, only add alterations
 * - Versioned: Every change increments logical_clock
 * - Restorable: Can restore to any previous version
 * - Soft-delete: Delete marks as deleted, doesn't remove
 * 
 * Works seamlessly with both:
 * - Tauri/Axum backend (localhost:3000, SQLite)
 * - Fastify backend (localhost:3001, PostgreSQL)
 * 
 * Real-time sync via WebSocket when both backends are connected
 * 
 * @module unified/UnifiedAtome
 */

import TauriAdapter from './adapters/TauriAdapter.js';
import FastifyAdapter from './adapters/FastifyAdapter.js';
import SyncWebSocket from './SyncWebSocket.js';
import UnifiedSync from './UnifiedSync.js';

// ============================================
// BACKEND DETECTION
// ============================================

let _tauriAvailable = null;
let _fastifyAvailable = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Check which backends are available
 */
async function checkBackends(force = false) {
    const now = Date.now();
    if (!force && _lastCheck && (now - _lastCheck < CHECK_INTERVAL)) {
        return { tauri: _tauriAvailable, fastify: _fastifyAvailable };
    }

    const [tauri, fastify] = await Promise.all([
        TauriAdapter.isAvailable(),
        FastifyAdapter.isAvailable()
    ]);

    _tauriAvailable = tauri;
    _fastifyAvailable = fastify;
    _lastCheck = now;

    return { tauri, fastify };
}

/**
 * Generate a unique ID for atomes
 */
function generateId(prefix = 'atome') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// TAURI RECONNECTION SYNC
// ============================================

let _syncInProgress = false;
let _lastTauriSync = 0;
const SYNC_COOLDOWN = 5000; // 5 seconds cooldown between syncs

/**
 * Sync all Fastify atomes to Tauri when Tauri reconnects
 * This ensures atomes created while Tauri was offline get synced
 */
async function syncFastifyToTauri() {
    // Prevent concurrent syncs
    if (_syncInProgress) {
        console.log('[UnifiedAtome] Sync already in progress, skipping');
        return;
    }

    // Cooldown to prevent rapid re-syncs
    const now = Date.now();
    if (now - _lastTauriSync < SYNC_COOLDOWN) {
        console.log('[UnifiedAtome] Sync cooldown active, skipping');
        return;
    }

    _syncInProgress = true;
    _lastTauriSync = now;

    try {
        console.log('[UnifiedAtome] Starting bidirectional sync...');

        // Check both backends are available
        const [tauriOk, fastifyOk] = await Promise.all([
            TauriAdapter.isAvailable(),
            FastifyAdapter.isAvailable()
        ]);

        // Check tokens
        const tauriToken = TauriAdapter.getToken();
        const fastifyToken = FastifyAdapter.getToken();

        console.log(`[UnifiedAtome] Backend status - Tauri: ${tauriOk} (token: ${!!tauriToken}), Fastify: ${fastifyOk} (token: ${!!fastifyToken})`);

        if (!tauriOk && !fastifyOk) {
            console.log('[UnifiedAtome] No backends available, cannot sync');
            return;
        }

        // Get all atomes from available backends
        let fastifyAtomes = [];
        let tauriAtomes = [];

        if (fastifyOk && fastifyToken) {
            try {
                const result = await FastifyAdapter.atome.list();
                console.log('[UnifiedAtome] Fastify list raw result:', JSON.stringify(result).substring(0, 500));
                if (result.success) {
                    fastifyAtomes = result.atomes || result.data || [];
                    // Log kinds for debugging
                    const kinds = {};
                    fastifyAtomes.forEach(a => {
                        const kind = a.kind || a.properties?.kind || 'unknown';
                        kinds[kind] = (kinds[kind] || 0) + 1;
                    });
                    console.log('[UnifiedAtome] Fastify atomes by kind:', JSON.stringify(kinds));
                }
            } catch (err) {
                console.warn('[UnifiedAtome] Failed to get Fastify atomes:', err.message);
            }
        }

        if (tauriOk && tauriToken) {
            try {
                const result = await TauriAdapter.atome.list();
                console.log('[UnifiedAtome] Tauri list raw result:', JSON.stringify(result).substring(0, 500));
                if (result.success) {
                    tauriAtomes = result.atomes || result.data || [];
                }
            } catch (err) {
                console.warn('[UnifiedAtome] Failed to get Tauri atomes:', err.message);
            }
        }

        console.log(`[UnifiedAtome] Fastify has ${fastifyAtomes.length} atomes (total for user), Tauri has ${tauriAtomes.length} atomes`);

        // If Tauri is down, we can only access Fastify atomes
        if (!tauriOk || !tauriToken) {
            console.log('[UnifiedAtome] Note: Tauri is unavailable. Atomes stored only on Tauri will sync when Tauri reconnects.');
        }

        // Build maps for quick lookup
        const tauriMap = new Map();
        for (const atome of tauriAtomes) {
            if (atome.id) tauriMap.set(atome.id, atome);
        }

        const fastifyMap = new Map();
        for (const atome of fastifyAtomes) {
            if (atome.id) fastifyMap.set(atome.id, atome);
        }

        let tauriCreated = 0;
        let tauriUpdated = 0;
        let fastifyCreated = 0;
        let fastifyUpdated = 0;

        // Sync Fastify → Tauri (if Tauri is available)
        if (tauriOk && tauriToken) {
            for (const fastifyAtome of fastifyAtomes) {
                if (!fastifyAtome.id) continue;
                const tauriAtome = tauriMap.get(fastifyAtome.id);

                if (!tauriAtome) {
                    // Atome doesn't exist on Tauri - create it
                    try {
                        await TauriAdapter.atome.create(fastifyAtome);
                        tauriCreated++;
                        console.log(`[UnifiedAtome] Created on Tauri: ${fastifyAtome.id}`);
                    } catch (err) {
                        console.error(`[UnifiedAtome] Failed to create ${fastifyAtome.id} on Tauri:`, err.message);
                    }
                } else {
                    // Atome exists - check logical clock
                    const fastifyClock = fastifyAtome.logicalClock || fastifyAtome.logical_clock || 0;
                    const tauriClock = tauriAtome.logicalClock || tauriAtome.logical_clock || 0;

                    if (fastifyClock > tauriClock) {
                        try {
                            await TauriAdapter.atome.update(fastifyAtome.id, fastifyAtome);
                            tauriUpdated++;
                            console.log(`[UnifiedAtome] Updated on Tauri: ${fastifyAtome.id}`);
                        } catch (err) {
                            console.error(`[UnifiedAtome] Failed to update ${fastifyAtome.id} on Tauri:`, err.message);
                        }
                    }
                }
            }
        }

        // Sync Tauri → Fastify (if Fastify is available)
        if (fastifyOk && fastifyToken) {
            for (const tauriAtome of tauriAtomes) {
                if (!tauriAtome.id) continue;
                const fastifyAtome = fastifyMap.get(tauriAtome.id);

                if (!fastifyAtome) {
                    // Atome doesn't exist on Fastify - create it
                    try {
                        await FastifyAdapter.atome.create(tauriAtome);
                        fastifyCreated++;
                        console.log(`[UnifiedAtome] Created on Fastify: ${tauriAtome.id}`);
                    } catch (err) {
                        console.error(`[UnifiedAtome] Failed to create ${tauriAtome.id} on Fastify:`, err.message);
                    }
                } else {
                    // Atome exists - check logical clock
                    const tauriClock = tauriAtome.logicalClock || tauriAtome.logical_clock || 0;
                    const fastifyClock = fastifyAtome.logicalClock || fastifyAtome.logical_clock || 0;

                    if (tauriClock > fastifyClock) {
                        try {
                            await FastifyAdapter.atome.update(tauriAtome.id, tauriAtome);
                            fastifyUpdated++;
                            console.log(`[UnifiedAtome] Updated on Fastify: ${tauriAtome.id}`);
                        } catch (err) {
                            console.error(`[UnifiedAtome] Failed to update ${tauriAtome.id} on Fastify:`, err.message);
                        }
                    }
                }
            }
        }

        // Process queued changes
        const pendingChanges = UnifiedSync.getPendingChanges();
        if (pendingChanges.length > 0) {
            console.log(`[UnifiedAtome] Processing ${pendingChanges.length} queued changes...`);
            let processed = 0;

            for (const change of pendingChanges) {
                try {
                    if (change.type === 'create') {
                        if (change.targetBackend === 'fastify' && fastifyOk && fastifyToken) {
                            await FastifyAdapter.atome.create(change.atome);
                            processed++;
                            console.log(`[UnifiedAtome] Queued create synced to Fastify: ${change.atome.id}`);
                        } else if (change.targetBackend === 'tauri' && tauriOk && tauriToken) {
                            await TauriAdapter.atome.create(change.atome);
                            processed++;
                            console.log(`[UnifiedAtome] Queued create synced to Tauri: ${change.atome.id}`);
                        }
                    }
                    // Add more change types as needed (update, alter, delete)
                } catch (err) {
                    console.error(`[UnifiedAtome] Failed to process queued change:`, err.message);
                }
            }

            if (processed > 0) {
                UnifiedSync.clearPendingChanges();
                console.log(`[UnifiedAtome] Processed ${processed} queued changes`);
            }
        }

        console.log(`[UnifiedAtome] Sync complete - Tauri: +${tauriCreated}/~${tauriUpdated}, Fastify: +${fastifyCreated}/~${fastifyUpdated}`);

    } catch (err) {
        console.error('[UnifiedAtome] Sync failed:', err);
    } finally {
        _syncInProgress = false;
    }
}

// Listen for events to trigger sync
if (typeof window !== 'undefined') {
    // Sync when Tauri reconnects
    window.addEventListener('squirrel:tauri-reconnected', () => {
        console.log('[UnifiedAtome] Tauri reconnected, initiating sync...');
        syncFastifyToTauri();
    });

    // Sync after user logs in (with a small delay to ensure tokens are set)
    window.addEventListener('squirrel:user-logged-in', () => {
        console.log('[UnifiedAtome] User logged in, initiating sync...');
        // Reset the cooldown to allow immediate sync after login
        _lastTauriSync = 0;
        setTimeout(() => {
            syncFastifyToTauri();
        }, 500);
    });

    // NOTE: Removed automatic sync on page load
    // Sync is now triggered only after successful authentication
    // to avoid using stale tokens from previous sessions
}

// ============================================
// UNIFIED ATOME API
// ============================================

const UnifiedAtome = {
    /**
     * Create a new atome (document)
     * Creates on Tauri first (local-first), then syncs to Fastify
     * 
     * @param {Object} data - Atome data
     * @param {string} data.kind - Type of atome (e.g., 'code_file', 'shape', 'note')
     * @param {string} [data.type] - Subtype (e.g., 'javascript', 'python')
     * @param {Object} data.data - Atome content (name, content, etc.)
     * @param {Object} [data.meta] - Optional metadata (tags, description)
     * @param {string} [data.parentId] - Parent atome ID (for hierarchies)
     * @returns {Promise<Object>} { success, id, version, atome, backends }
     * 
     * @example
     * const doc = await UnifiedAtome.create({
     *     kind: "code_file",
     *     type: "javascript",
     *     data: {
     *         name: "hello.js",
     *         content: "console.log('Hello');"
     *     }
     * });
     */
    async create(data) {
        if (!data.kind) {
            return { success: false, error: 'Kind is required' };
        }
        if (!data.data) {
            return { success: false, error: 'Data is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Log backend availability
        const tauriToken = TauriAdapter.getToken();
        const fastifyToken = FastifyAdapter.getToken();
        console.log(`[UnifiedAtome.create] Backends - Tauri: ${tauri} (token: ${!!tauriToken}), Fastify: ${fastify} (token: ${!!fastifyToken})`);

        // Prepare atome data
        const atomeData = {
            kind: data.kind,
            type: data.type || 'generic',
            data: data.data,
            meta: data.meta || {},
            parentId: data.parentId || null,
            logicalClock: 1,
            deviceId: this._getDeviceId()
        };

        // Create on Tauri first (local-first)
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.create(atomeData);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Create on Fastify (cloud backup)
        if (fastify && FastifyAdapter.getToken()) {
            try {
                // Use same ID if created on Tauri
                if (primaryResult && primaryResult.id) {
                    atomeData.id = primaryResult.id;
                    console.log(`[UnifiedAtome.create] Using Tauri ID for Fastify: ${primaryResult.id}`);
                }
                console.log(`[UnifiedAtome.create] Sending to Fastify:`, JSON.stringify(atomeData).substring(0, 300));
                results.fastify = await FastifyAdapter.atome.create(atomeData);
                console.log(`[UnifiedAtome.create] Fastify response:`, JSON.stringify(results.fastify).substring(0, 300));
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        } else if (primaryResult && primaryResult.success) {
            // Fastify unavailable but Tauri succeeded - queue for later sync
            console.log('[UnifiedAtome.create] Fastify unavailable, queuing for sync...');
            UnifiedSync.queueChange({
                type: 'create',
                atome: { ...atomeData, id: primaryResult.id },
                targetBackend: 'fastify'
            });
        }

        // Also queue for Tauri if Tauri was unavailable but Fastify succeeded
        if (!tauri && results.fastify?.success) {
            console.log('[UnifiedAtome.create] Tauri unavailable, queuing for sync...');
            UnifiedSync.queueChange({
                type: 'create',
                atome: { ...atomeData, id: results.fastify.id },
                targetBackend: 'tauri'
            });
        }

        if (primaryResult && primaryResult.success) {
            const resultAtome = primaryResult.atome || { ...atomeData, id: primaryResult.id };

            // Broadcast via WebSocket for real-time sync
            if (SyncWebSocket.isConnected()) {
                SyncWebSocket.broadcastCreate(resultAtome);
            }

            const createResult = {
                success: true,
                id: primaryResult.id || primaryResult.atome?.id,
                version: 1,
                atome: resultAtome,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                },
                queued: (!results.tauri?.success || !results.fastify?.success) ? true : false
            };
            console.log(`[UnifiedAtome.create] Success - ID: ${createResult.id}, Tauri: ${createResult.backends.tauri}, Fastify: ${createResult.backends.fastify}, Queued: ${createResult.queued}`);
            return createResult;
        }

        const error = results.tauri?.error || results.fastify?.error || 'Create failed';
        console.log(`[UnifiedAtome.create] Failed - Tauri: ${results.tauri?.error || 'N/A'}, Fastify: ${results.fastify?.error || 'N/A'}`);
        return { success: false, error, backends: results };
    },

    /**
     * Get a single atome by ID
     * 
     * @param {string} id - Atome UUID
     * @returns {Promise<Object>} { success, atome }
     * 
     * @example
     * const doc = await UnifiedAtome.get("uuid-...");
     * console.log(doc.atome.data.content);
     */
    async get(id) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }

        const { tauri, fastify } = await checkBackends();

        // Try Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.atome.get(id);
                if (result.success) {
                    return { ...result, source: 'tauri' };
                }
            } catch (error) {
                // Fall through
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.atome.get(id);
                if (result.success) {
                    return { ...result, source: 'fastify' };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Atome not found' };
    },

    /**
     * List atomes with optional filters
     * Merges results from both backends, preferring the most recent version
     * 
     * @param {Object} [params] - Filter parameters
     * @param {string} [params.kind] - Filter by kind
     * @param {string} [params.type] - Filter by type
     * @param {string} [params.parentId] - Filter by parent
     * @param {string} [params.search] - Search in name/content
     * @param {number} [params.page=1] - Page number
     * @param {number} [params.limit=20] - Items per page
     * @param {string} [params.sortBy='updatedAt'] - Sort field
     * @param {string} [params.sortOrder='desc'] - Sort order
     * @returns {Promise<Object>} { success, data, total, page, pages }
     * 
     * @example
     * const files = await UnifiedAtome.list({
     *     kind: "code_file",
     *     limit: 10
     * });
     */
    async list(params = {}) {
        const { tauri, fastify } = await checkBackends();
        const allAtomes = new Map(); // Use Map to deduplicate by ID

        // Log backend availability
        const tauriToken = TauriAdapter.getToken();
        const fastifyToken = FastifyAdapter.getToken();
        console.log(`[UnifiedAtome.list] Backends - Tauri: ${tauri} (token: ${!!tauriToken}), Fastify: ${fastify} (token: ${!!fastifyToken})`);

        // Fetch from Tauri
        if (tauri && tauriToken) {
            try {
                const result = await TauriAdapter.atome.list(params);
                console.log(`[UnifiedAtome.list] Tauri returned: ${result.success}, count: ${(result.atomes || result.data || []).length}`);
                if (result.success) {
                    const items = result.atomes || result.data || [];
                    for (const atome of items) {
                        const id = atome.id || atome.object_id;
                        if (id) {
                            allAtomes.set(id, { ...atome, _source: 'tauri' });
                        }
                    }
                }
            } catch (error) {
                console.warn('[UnifiedAtome] Tauri list failed:', error.message);
            }
        }

        // Fetch from Fastify and merge
        if (fastify && fastifyToken) {
            try {
                const result = await FastifyAdapter.atome.list(params);
                console.log(`[UnifiedAtome.list] Fastify returned: ${result.success}, count: ${(result.atomes || result.data || []).length}`);
                if (result.success) {
                    const items = result.atomes || result.data || [];
                    for (const atome of items) {
                        const id = atome.id || atome.object_id;
                        if (id) {
                            const existing = allAtomes.get(id);
                            if (existing) {
                                // Compare versions - keep the most recent
                                const existingClock = existing.logicalClock || existing.logical_clock || 0;
                                const newClock = atome.logicalClock || atome.logical_clock || 0;
                                if (newClock > existingClock) {
                                    allAtomes.set(id, { ...atome, _source: 'fastify' });
                                }
                            } else {
                                // Atome only exists on Fastify
                                allAtomes.set(id, { ...atome, _source: 'fastify' });
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('[UnifiedAtome] Fastify list failed:', error.message);
            }
        }

        // Convert Map to array
        const items = Array.from(allAtomes.values());
        console.log(`[UnifiedAtome.list] Total merged atomes: ${items.length}`);

        // Sort by updated time (most recent first)
        items.sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.updated_at || a.createdAt || a.created_at || 0).getTime();
            const bTime = new Date(b.updatedAt || b.updated_at || b.createdAt || b.created_at || 0).getTime();
            return bTime - aTime;
        });

        // Always return success: true with the items array (even if empty)
        // This allows the UI to know the query succeeded but there are no atomes
        return {
            success: true,
            data: items,
            atomes: items,
            total: items.length,
            source: items.length > 0 ? 'merged' : 'empty'
        };
    },

    /**
     * Alter an atome (ADOLE compliant)
     * Never modifies original - creates a new alteration version
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Alteration data
     * @param {string} data.operation - Operation type: 'update' | 'patch' | 'rename' | 'tag'
     * @param {Object} data.changes - The changes to apply
     * @param {string} [data.reason] - Reason for the change (for audit)
     * @returns {Promise<Object>} { success, id, version, alteration }
     * 
     * @example
     * const result = await UnifiedAtome.alter("uuid-...", {
     *     operation: "update",
     *     changes: { content: "console.log('Updated!');" },
     *     reason: "Fixed typo"
     * });
     */
    async alter(id, data) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }
        if (!data.operation) {
            return { success: false, error: 'Operation is required' };
        }
        if (!data.changes) {
            return { success: false, error: 'Changes are required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        const alterData = {
            operation: data.operation,
            changes: data.changes,
            reason: data.reason || '',
            deviceId: this._getDeviceId(),
            timestamp: new Date().toISOString()
        };

        // Alter on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.alter(id, alterData);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Alter on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.alter(id, alterData);

                // If atome not found on Fastify (404), try to sync it first from Tauri
                if (!results.fastify.success && results.fastify.status === 404 && results.tauri?.success) {
                    console.log('[UnifiedAtome] Atome not on Fastify, syncing from Tauri...');
                    // Get the full atome from Tauri (which already contains the alteration)
                    const tauriAtome = await TauriAdapter.atome.get(id);
                    console.log('[UnifiedAtome] Tauri atome structure:', JSON.stringify(tauriAtome.atome, null, 2));

                    if (tauriAtome.success && tauriAtome.atome) {
                        // Transform Tauri atome to Fastify format
                        // Tauri uses 'data' field for properties, Fastify expects 'properties'
                        const atomeForFastify = {
                            id: tauriAtome.atome.id,
                            kind: tauriAtome.atome.kind || 'generic',
                            tag: tauriAtome.atome.data?.tag || 'div',
                            parent: tauriAtome.atome.parent_id || tauriAtome.atome.data?.parent || null,
                            // Merge all data fields into properties for Fastify
                            properties: {
                                ...(tauriAtome.atome.data || {}),
                                ...(tauriAtome.atome.snapshot || {})
                            }
                        };

                        console.log('[UnifiedAtome] Transformed for Fastify:', JSON.stringify(atomeForFastify, null, 2));

                        const createResult = await FastifyAdapter.atome.create(atomeForFastify);
                        if (createResult.success) {
                            // The atome is now on Fastify with the complete state from Tauri
                            // No need to alter again - the alteration is already included
                            results.fastify = {
                                success: true,
                                synced: true,
                                message: 'Atome synced from Tauri (alteration already applied)'
                            };
                        } else {
                            console.log('[UnifiedAtome] Failed to create on Fastify:', createResult.error);
                        }
                    }
                }

                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        if (primaryResult && primaryResult.success) {
            // Broadcast via WebSocket for real-time sync
            if (SyncWebSocket.isConnected()) {
                SyncWebSocket.broadcastAlter(id, alterData, primaryResult.atome);
            }

            return {
                success: true,
                id: id,
                version: primaryResult.version || primaryResult.logicalClock,
                alteration: primaryResult.alteration,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Alter failed';
        return { success: false, error, backends: results };
    },

    /**
     * Update an atome (simple update for backward compatibility)
     * For ADOLE compliance, prefer using alter()
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Fields to update
     * @returns {Promise<Object>} { success, atome }
     */
    async update(id, data) {
        // Internally use alter with 'update' operation
        return this.alter(id, {
            operation: 'update',
            changes: data,
            reason: 'Direct update'
        });
    },

    /**
     * Rename an atome (shorthand for alter with rename operation)
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Rename data
     * @param {string} data.newName - New name for the atome
     * @returns {Promise<Object>} { success, id, version, oldName, newName }
     * 
     * @example
     * await UnifiedAtome.rename("uuid-...", { newName: "renamed.js" });
     */
    async rename(id, data) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }
        if (!data.newName) {
            return { success: false, error: 'New name is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Rename on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.rename(id, data);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Rename on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.rename(id, data);
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        if (primaryResult && primaryResult.success) {
            // Broadcast via WebSocket for real-time sync
            if (SyncWebSocket.isConnected()) {
                SyncWebSocket.broadcastAlter(id, { operation: 'rename', newName: data.newName }, primaryResult.atome);
            }

            return {
                success: true,
                id: id,
                version: primaryResult.version,
                oldName: primaryResult.oldName,
                newName: data.newName,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Rename failed';
        return { success: false, error, backends: results };
    },

    /**
     * Soft delete an atome (ADOLE compliant)
     * Marks as deleted but keeps in database for history
     * 
     * @param {string} id - Atome UUID
     * @param {Object} [data] - Delete options
     * @param {string} [data.reason] - Reason for deletion
     * @returns {Promise<Object>} { success, id, deletedAt, restorable }
     * 
     * @example
     * await UnifiedAtome.delete("uuid-...", { reason: "No longer needed" });
     */
    async delete(id, data = {}) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Delete on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.delete(id, data);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Delete on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.delete(id, data);
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                // 404 is expected if atome was never synced to Fastify - not an error
                if (error.message?.includes('404') || error.message?.includes('not found')) {
                    results.fastify = { success: true, skipped: true, reason: 'Atome not on Fastify' };
                } else {
                    results.fastify = { success: false, error: error.message };
                }
            }
        }

        if (primaryResult && primaryResult.success) {
            // Broadcast via WebSocket for real-time sync
            if (SyncWebSocket.isConnected()) {
                SyncWebSocket.broadcastDelete(id);
            }

            return {
                success: true,
                id: id,
                deletedAt: new Date().toISOString(),
                restorable: true,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Delete failed';
        return { success: false, error, backends: results };
    },

    /**
     * Get atome alteration history
     * 
     * @param {string} id - Atome UUID
     * @param {Object} [params] - Pagination options
     * @param {number} [params.page=1] - Page number
     * @param {number} [params.limit=50] - Items per page
     * @returns {Promise<Object>} { success, id, currentVersion, alterations }
     * 
     * @example
     * const history = await UnifiedAtome.history("uuid-...");
     * console.log(history.alterations);
     */
    async history(id, params = {}) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }

        const { tauri, fastify } = await checkBackends();

        // Try Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                const result = await TauriAdapter.atome.history(id, params);
                if (result.success) {
                    return { ...result, source: 'tauri' };
                }
            } catch (error) {
                // Fall through
            }
        }

        // Try Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                const result = await FastifyAdapter.atome.history(id, params);
                if (result.success) {
                    return { ...result, source: 'fastify' };
                }
            } catch (error) {
                // Fall through
            }
        }

        return { success: false, error: 'Failed to get history' };
    },

    /**
     * Restore atome to a specific version
     * Creates a new version with content from the specified version
     * 
     * @param {string} id - Atome UUID
     * @param {Object} data - Restore options
     * @param {number} data.version - Version number to restore to
     * @param {string} [data.reason] - Reason for restoration
     * @returns {Promise<Object>} { success, id, restoredToVersion, newVersion, data }
     * 
     * @example
     * await UnifiedAtome.restore("uuid-...", {
     *     version: 2,
     *     reason: "Reverting accidental changes"
     * });
     */
    async restore(id, data) {
        if (!id) {
            return { success: false, error: 'ID is required' };
        }
        if (!data.version) {
            return { success: false, error: 'Version is required' };
        }

        const { tauri, fastify } = await checkBackends(true);
        const results = { tauri: null, fastify: null };
        let primaryResult = null;

        // Restore on Tauri first
        if (tauri && TauriAdapter.getToken()) {
            try {
                results.tauri = await TauriAdapter.atome.restore(id, data);
                if (results.tauri.success) {
                    primaryResult = results.tauri;
                }
            } catch (error) {
                results.tauri = { success: false, error: error.message };
            }
        }

        // Restore on Fastify
        if (fastify && FastifyAdapter.getToken()) {
            try {
                results.fastify = await FastifyAdapter.atome.restore(id, data);
                if (results.fastify.success && !primaryResult) {
                    primaryResult = results.fastify;
                }
            } catch (error) {
                results.fastify = { success: false, error: error.message };
            }
        }

        if (primaryResult && primaryResult.success) {
            return {
                success: true,
                id: id,
                restoredToVersion: data.version,
                newVersion: primaryResult.newVersion || primaryResult.version,
                data: primaryResult.data,
                backends: {
                    tauri: results.tauri?.success || false,
                    fastify: results.fastify?.success || false
                }
            };
        }

        const error = results.tauri?.error || results.fastify?.error || 'Restore failed';
        return { success: false, error, backends: results };
    },

    /**
     * Get device ID for ADOLE tracking
     * @private
     */
    _getDeviceId() {
        if (typeof localStorage !== 'undefined') {
            let deviceId = localStorage.getItem('squirrel_device_id');
            if (!deviceId) {
                deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                localStorage.setItem('squirrel_device_id', deviceId);
            }
            return deviceId;
        }
        return 'unknown_device';
    },

    /**
     * Get pending operations count (for offline sync queue)
     * @returns {number} Number of pending operations
     */
    getPendingCount() {
        // For now, return 0 as the unified API handles sync differently
        // This can be enhanced to track pending operations if needed
        if (typeof localStorage !== 'undefined') {
            try {
                const pending = localStorage.getItem('unified_pending_ops');
                if (pending) {
                    const ops = JSON.parse(pending);
                    return Array.isArray(ops) ? ops.length : 0;
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
        return 0;
    },

    /**
     * Manually trigger bidirectional sync between Fastify and Tauri
     * Useful after extended offline periods or to force sync
     * @returns {Promise<void>}
     */
    async sync() {
        return syncFastifyToTauri();
    }
};

export default UnifiedAtome;
