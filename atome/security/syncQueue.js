/**
 * Sync Queue Module - Manages pending synchronization actions
 * 
 * This module handles:
 * 1. Queue of pending sync actions per user (create, update, delete)
 * 2. Automatic sync when cloud server becomes available
 * 3. Auto-sync metadata without password persistence
 * 4. Multi-user support (multiple local accounts)
 * 
 * SECURITY:
 * - Queue is stored in localStorage with device-local obfuscation
 * - Actions are verified before execution
 * 
 * @module atome/security/syncQueue
 */

import {
    ActionStatus,
    SYNC_CONFIG_KEY,
    SyncAction
} from './sync_queue_constants.js';
import {
    addToQueue,
    cleanupOldActions,
    getAllPendingActions,
    getPendingActionsForUser,
    getQueue,
    removeFromQueue,
    updateActionStatus
} from './sync_queue_items.js';
import {
    getCredentialsForUser,
    isAutoSyncEnabled,
    removeCredentials,
    storeCredentialsForSync
} from './sync_queue_credentials.js';

export {
    ActionStatus,
    SyncAction,
    addToQueue,
    cleanupOldActions,
    getAllPendingActions,
    getCredentialsForUser,
    getPendingActionsForUser,
    getQueue,
    isAutoSyncEnabled,
    removeCredentials,
    removeFromQueue,
    storeCredentialsForSync,
    updateActionStatus
};

// =============================================================================
// SYNC CONFIGURATION
// =============================================================================

/**
 * Get sync configuration
 * @returns {object} Sync configuration
 */
export function getSyncConfig() {
    try {
        const config = localStorage.getItem(SYNC_CONFIG_KEY);
        return config ? JSON.parse(config) : {
            cloudServerUrl: '',
            autoSyncEnabled: false,
            syncOnStartup: true,
            syncIntervalMinutes: 5,
            lastSyncAttempt: null,
            lastSuccessfulSync: null
        };
    } catch (e) {
        return {
            cloudServerUrl: '',
            autoSyncEnabled: false,
            syncOnStartup: true,
            syncIntervalMinutes: 5,
            lastSyncAttempt: null,
            lastSuccessfulSync: null
        };
    }
}

/**
 * Save sync configuration
 * @param {object} config - Configuration to save
 */
export function saveSyncConfig(config) {
    try {
        const current = getSyncConfig();
        const updated = { ...current, ...config };
        localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(updated));
    } catch (e) {
    }
}

// =============================================================================
// SYNC EXECUTION
// =============================================================================

/**
 * Check if cloud server is available
 * @param {string} serverUrl - Cloud server URL
 * @returns {Promise<boolean>}
 */
export async function isCloudServerAvailable(serverUrl) {
    if (!serverUrl) return false;

    try {
        // Use /api/server-info which exists on Fastify
        const response = await fetch(`${serverUrl}/api/server-info`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Process a single sync action
 * @param {object} action - Action to process
 * @param {string} cloudServerUrl - Cloud server URL
 * @returns {Promise<object>} Result of the action
 */
export async function processAction(action, cloudServerUrl) {
    const credentials = getCredentialsForUser(action.userId);

    if (!credentials && action.type !== SyncAction.DELETE_ACCOUNT) {
        return {
            success: false,
            error: 'Manual authentication required for auto-sync',
            requiresManualSync: true
        };
    }

    updateActionStatus(action.id, ActionStatus.IN_PROGRESS);

    try {
        let result;

        switch (action.type) {
            case SyncAction.CREATE_ACCOUNT:
                result = await syncCreateAccount(action, credentials, cloudServerUrl);
                break;

            case SyncAction.UPDATE_ACCOUNT:
                result = await syncUpdateAccount(action, credentials, cloudServerUrl);
                break;

            case SyncAction.DELETE_ACCOUNT:
                result = await syncDeleteAccount(action, credentials, cloudServerUrl);
                break;

            case SyncAction.SYNC_DATA:
                // SYNC_DATA is same as CREATE_ACCOUNT - ensures account exists on cloud
                result = await syncCreateAccount(action, credentials, cloudServerUrl);
                break;

            default:
                result = { success: false, error: `Unknown action type: ${action.type}` };
        }

        if (result.success) {
            updateActionStatus(action.id, ActionStatus.COMPLETED);
        } else if (action.retryCount < action.maxRetries) {
            updateActionStatus(action.id, ActionStatus.RETRY, result.error);
        } else {
            updateActionStatus(action.id, ActionStatus.FAILED, result.error);
        }

        return result;

    } catch (e) {
        const error = e.message || 'Unknown error';
        if (action.retryCount < action.maxRetries) {
            updateActionStatus(action.id, ActionStatus.RETRY, error);
        } else {
            updateActionStatus(action.id, ActionStatus.FAILED, error);
        }
        return { success: false, error };
    }
}

/**
 * Sync create account to cloud
 */
async function syncCreateAccount(action, credentials, cloudServerUrl) {
    return {
        success: false,
        error: 'Manual authentication required for account creation sync',
        requiresManualSync: true
    };
}

/**
 * Sync update account to cloud
 */
async function syncUpdateAccount(action, credentials, cloudServerUrl) {
    return {
        success: false,
        error: 'Manual authentication required for account update sync',
        requiresManualSync: true
    };
}

/**
 * Sync delete account to cloud
 */
async function syncDeleteAccount(action, credentials, cloudServerUrl) {
    return {
        success: false,
        error: 'Manual authentication required for account deletion sync',
        requiresManualSync: true
    };
}

/**
 * Process all pending actions
 * @param {string} cloudServerUrl - Cloud server URL (optional, uses config if not provided)
 * @returns {Promise<object>} Summary of processed actions
 */
export async function processAllPendingActions(cloudServerUrl = null) {
    const config = getSyncConfig();
    const serverUrl = cloudServerUrl || config.cloudServerUrl;

    if (!serverUrl) {
        return { success: false, error: 'No cloud server configured', processed: 0 };
    }

    // Check server availability
    const available = await isCloudServerAvailable(serverUrl);
    if (!available) {
        saveSyncConfig({ lastSyncAttempt: new Date().toISOString() });
        return { success: false, error: 'Cloud server not available', processed: 0 };
    }

    const pending = getAllPendingActions();
    if (pending.length === 0) {
        return { success: true, message: 'No pending actions', processed: 0 };
    }


    const results = {
        success: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        requiresManual: 0,
        details: []
    };

    for (const action of pending) {
        const result = await processAction(action, serverUrl);
        results.processed++;

        if (result.success) {
            results.succeeded++;
        } else if (result.requiresManualSync) {
            results.requiresManual++;
        } else {
            results.failed++;
        }

        results.details.push({
            actionId: action.id,
            type: action.type,
            userId: action.userId,
            ...result
        });
    }

    saveSyncConfig({
        lastSyncAttempt: new Date().toISOString(),
        lastSuccessfulSync: results.failed === 0 ? new Date().toISOString() : config.lastSuccessfulSync
    });


    return results;
}

// =============================================================================
// AUTO-SYNC SCHEDULER
// =============================================================================

let syncIntervalId = null;

/**
 * Start automatic sync scheduler
 */
export function startAutoSync() {
    const config = getSyncConfig();

    if (!config.autoSyncEnabled || !config.cloudServerUrl) {
        return;
    }

    // Stop existing interval if any
    stopAutoSync();

    // Sync immediately on startup if configured
    if (config.syncOnStartup) {
        processAllPendingActions().catch(() => { });
    }

    // Set up interval
    const intervalMs = (config.syncIntervalMinutes || 5) * 60 * 1000;
    syncIntervalId = setInterval(() => {
        processAllPendingActions().catch(() => { });
    }, intervalMs);

}

/**
 * Stop automatic sync scheduler
 */
export function stopAutoSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
}

/**
 * Initialize sync queue module
 * Call this on app startup
 */
export function initSyncQueue() {
    // Cleanup old completed actions
    cleanupOldActions(7);

    // Start auto-sync if enabled
    const config = getSyncConfig();
    if (config.autoSyncEnabled) {
        startAutoSync();
    }

    // Listen for online events
    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            processAllPendingActions().catch(() => { });
        });
    }

}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
    // Constants
    SyncAction,
    ActionStatus,

    // Queue management
    getQueue,
    addToQueue,
    removeFromQueue,
    updateActionStatus,
    getPendingActionsForUser,
    getAllPendingActions,
    cleanupOldActions,

    // Credentials
    storeCredentialsForSync,
    getCredentialsForUser,
    removeCredentials,
    isAutoSyncEnabled,

    // Config
    getSyncConfig,
    saveSyncConfig,

    // Sync execution
    isCloudServerAvailable,
    processAction,
    processAllPendingActions,

    // Auto-sync
    startAutoSync,
    stopAutoSync,
    initSyncQueue
};
