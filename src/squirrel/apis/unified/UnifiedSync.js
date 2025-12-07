/**
 * UnifiedSync.js
 * 
 * Unified Synchronization Engine
 * Handles real-time sync between Tauri (local) and Fastify (cloud)
 * 
 * Features:
 * - Automatic sync when both backends available
 * - Offline queue for pending changes
 * - Conflict detection and resolution
 * - Real-time push/pull
 * 
 * @module unified/UnifiedSync
 */

import TauriAdapter from './adapters/TauriAdapter.js';
import FastifyAdapter from './adapters/FastifyAdapter.js';

// ============================================
// SYNC STATE
// ============================================

const syncState = {
    lastSyncTime: null,
    pendingChanges: [],
    conflicts: [],
    isSyncing: false
};

// ============================================
// BACKEND DETECTION
// ============================================

async function checkBackends() {
    const [tauri, fastify] = await Promise.all([
        TauriAdapter.isAvailable(),
        FastifyAdapter.isAvailable()
    ]);
    return { tauri, fastify };
}

// ============================================
// UNIFIED SYNC API
// ============================================

const UnifiedSync = {
    /**
     * Get current sync status
     * 
     * @returns {Promise<Object>} { tauri, fastify, pendingChanges, conflicts, lastSync }
     * 
     * @example
     * const status = await UnifiedSync.status();
     * console.log(status.tauri.available); // true/false
     * console.log(status.pendingChanges); // number of pending items
     */
    async status() {
        const { tauri, fastify } = await checkBackends();

        return {
            tauri: {
                available: tauri,
                authenticated: tauri && !!TauriAdapter.getToken(),
                lastSync: syncState.lastSyncTime
            },
            fastify: {
                available: fastify,
                authenticated: fastify && !!FastifyAdapter.getToken(),
                lastSync: syncState.lastSyncTime
            },
            pendingChanges: syncState.pendingChanges.length,
            conflicts: syncState.conflicts,
            isSyncing: syncState.isSyncing,
            lastSync: syncState.lastSyncTime
        };
    },

    /**
     * Force immediate sync between backends
     * 
     * @returns {Promise<Object>} { success, pushed, pulled, conflicts, syncedAt }
     * 
     * @example
     * const result = await UnifiedSync.syncNow();
     * console.log(`Pushed ${result.pushed}, pulled ${result.pulled}`);
     */
    async syncNow() {
        if (syncState.isSyncing) {
            return { success: false, error: 'Sync already in progress' };
        }

        const { tauri, fastify } = await checkBackends();

        if (!tauri || !fastify) {
            return {
                success: false,
                error: 'Both backends must be available for sync',
                tauri: tauri,
                fastify: fastify
            };
        }

        if (!TauriAdapter.getToken() || !FastifyAdapter.getToken()) {
            return {
                success: false,
                error: 'Must be authenticated on both backends',
                tauriAuth: !!TauriAdapter.getToken(),
                fastifyAuth: !!FastifyAdapter.getToken()
            };
        }

        syncState.isSyncing = true;
        let pushed = 0;
        let pulled = 0;
        const conflicts = [];

        try {
            // Step 1: Get pending changes from Tauri (local)
            const tauriPending = await TauriAdapter.sync.getPending();
            if (tauriPending.success && tauriPending.atomes?.length > 0) {
                // Push to Fastify
                const pushResult = await FastifyAdapter.sync.push({
                    atomes: tauriPending.atomes
                });

                if (pushResult.success) {
                    pushed = pushResult.synced || tauriPending.atomes.length;

                    // Acknowledge synced items on Tauri
                    if (pushResult.syncedIds?.length > 0) {
                        await TauriAdapter.sync.ack({ ids: pushResult.syncedIds });
                    }

                    // Handle conflicts
                    if (pushResult.conflicts?.length > 0) {
                        conflicts.push(...pushResult.conflicts.map(c => ({
                            ...c,
                            direction: 'push'
                        })));
                    }
                }
            }

            // Step 2: Get changes from Fastify (cloud)
            const fastifyChanges = await FastifyAdapter.sync.pull({
                since: syncState.lastSyncTime
            });

            if (fastifyChanges.success && fastifyChanges.atomes?.length > 0) {
                // Push to Tauri (local)
                const pullResult = await TauriAdapter.sync.push({
                    atomes: fastifyChanges.atomes
                });

                if (pullResult.success) {
                    pulled = pullResult.synced || fastifyChanges.atomes.length;

                    // Handle conflicts
                    if (pullResult.conflicts?.length > 0) {
                        conflicts.push(...pullResult.conflicts.map(c => ({
                            ...c,
                            direction: 'pull'
                        })));
                    }
                }
            }

            syncState.lastSyncTime = new Date().toISOString();
            syncState.conflicts = conflicts;
            syncState.isSyncing = false;

            return {
                success: true,
                pushed,
                pulled,
                conflicts,
                syncedAt: syncState.lastSyncTime
            };

        } catch (error) {
            syncState.isSyncing = false;
            return { success: false, error: error.message };
        }
    },

    /**
     * Resolve a sync conflict
     * 
     * @param {string} atomeId - The conflicting atome ID
     * @param {Object} options - Resolution options
     * @param {string} options.strategy - 'keep-local' | 'keep-remote' | 'merge'
     * @returns {Promise<Object>} { success, resolved }
     * 
     * @example
     * await UnifiedSync.resolveConflict("uuid-...", {
     *     strategy: "keep-local"
     * });
     */
    async resolveConflict(atomeId, options) {
        if (!atomeId) {
            return { success: false, error: 'Atome ID is required' };
        }
        if (!options.strategy) {
            return { success: false, error: 'Resolution strategy is required' };
        }

        const validStrategies = ['keep-local', 'keep-remote', 'merge'];
        if (!validStrategies.includes(options.strategy)) {
            return { success: false, error: `Invalid strategy. Use: ${validStrategies.join(', ')}` };
        }

        const { tauri, fastify } = await checkBackends();

        try {
            let result;

            switch (options.strategy) {
                case 'keep-local':
                    // Get local version and push to remote
                    if (tauri && TauriAdapter.getToken()) {
                        const local = await TauriAdapter.atome.get(atomeId);
                        if (local.success && fastify && FastifyAdapter.getToken()) {
                            result = await FastifyAdapter.atome.update(atomeId, local.atome);
                        }
                    }
                    break;

                case 'keep-remote':
                    // Get remote version and push to local
                    if (fastify && FastifyAdapter.getToken()) {
                        const remote = await FastifyAdapter.atome.get(atomeId);
                        if (remote.success && tauri && TauriAdapter.getToken()) {
                            result = await TauriAdapter.atome.update(atomeId, remote.atome);
                        }
                    }
                    break;

                case 'merge':
                    // Merge: keep latest changes from both
                    // This is a simplified merge - real implementation might need more sophistication
                    if (tauri && fastify) {
                        const local = await TauriAdapter.atome.get(atomeId);
                        const remote = await FastifyAdapter.atome.get(atomeId);

                        if (local.success && remote.success) {
                            const localClock = local.atome?.logical_clock || local.atome?.logicalClock || 0;
                            const remoteClock = remote.atome?.logical_clock || remote.atome?.logicalClock || 0;

                            if (localClock > remoteClock) {
                                result = await FastifyAdapter.atome.update(atomeId, local.atome);
                            } else {
                                result = await TauriAdapter.atome.update(atomeId, remote.atome);
                            }
                        }
                    }
                    break;
            }

            // Remove from conflicts list
            syncState.conflicts = syncState.conflicts.filter(c => c.id !== atomeId);

            return {
                success: true,
                resolved: true,
                strategy: options.strategy,
                atomeId
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Add a change to the pending sync queue
     * Used when backend is unavailable
     * 
     * @param {Object} change - Change to queue
     * @private
     */
    queueChange(change) {
        syncState.pendingChanges.push({
            ...change,
            queuedAt: new Date().toISOString()
        });
    },

    /**
     * Get all pending changes
     * 
     * @returns {Array} Pending changes
     */
    getPendingChanges() {
        return [...syncState.pendingChanges];
    },

    /**
     * Clear pending changes after successful sync
     * @private
     */
    clearPendingChanges() {
        syncState.pendingChanges = [];
    },

    /**
     * Set up automatic sync interval
     * 
     * @param {number} intervalMs - Sync interval in milliseconds (default: 60000)
     * @returns {number} Interval ID (use to clear with clearInterval)
     * 
     * @example
     * const intervalId = UnifiedSync.startAutoSync(30000); // every 30 seconds
     * // Later: clearInterval(intervalId);
     */
    startAutoSync(intervalMs = 60000) {
        return setInterval(async () => {
            const { tauri, fastify } = await checkBackends();
            if (tauri && fastify && !syncState.isSyncing) {
                await this.syncNow();
            }
        }, intervalMs);
    },

    /**
     * Get current conflicts
     * 
     * @returns {Array} List of conflicts
     */
    getConflicts() {
        return [...syncState.conflicts];
    }
};

export default UnifiedSync;
