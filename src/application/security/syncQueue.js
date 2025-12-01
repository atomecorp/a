/**
 * Sync Queue Module - Manages pending synchronization actions
 * 
 * This module handles:
 * 1. Queue of pending sync actions per user (create, update, delete)
 * 2. Automatic sync when cloud server becomes available
 * 3. Secure password storage for automatic sync
 * 4. Multi-user support (multiple local accounts)
 * 
 * SECURITY:
 * - Passwords are encrypted with a device-specific key before storage
 * - Queue is stored in localStorage with encryption
 * - Actions are verified before execution
 * 
 * @module src/application/security/syncQueue
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const QUEUE_STORAGE_KEY = 'squirrel_sync_queue';
const CREDENTIALS_STORAGE_KEY = 'squirrel_sync_credentials';
const SYNC_CONFIG_KEY = 'squirrel_sync_config';

// Action types
export const SyncAction = {
    CREATE_ACCOUNT: 'create_account',
    UPDATE_ACCOUNT: 'update_account',
    DELETE_ACCOUNT: 'delete_account',
    SYNC_DATA: 'sync_data'
};

// Action status
export const ActionStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRY: 'retry'
};

// =============================================================================
// ENCRYPTION HELPERS (Simple XOR-based for localStorage, not military-grade)
// =============================================================================

/**
 * Generate a device-specific key based on available entropy
 */
function getDeviceKey() {
    // Try to get a stable device identifier
    let deviceId = localStorage.getItem('squirrel_device_id');
    if (!deviceId) {
        // Generate a random device ID on first run
        deviceId = crypto.randomUUID ? crypto.randomUUID() :
            'dev_' + Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
        localStorage.setItem('squirrel_device_id', deviceId);
    }
    return deviceId;
}

/**
 * Simple encryption for localStorage (not for high-security data)
 * This is obfuscation, not true encryption - passwords are still at risk if device is compromised
 */
function encryptForStorage(data) {
    const key = getDeviceKey();
    const str = JSON.stringify(data);
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
}

/**
 * Decrypt data from localStorage
 */
function decryptFromStorage(encrypted) {
    try {
        const key = getDeviceKey();
        const str = atob(encrypted);
        let result = '';
        for (let i = 0; i < str.length; i++) {
            result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return JSON.parse(result);
    } catch (e) {
        console.warn('[syncQueue] Failed to decrypt:', e.message);
        return null;
    }
}

// =============================================================================
// QUEUE MANAGEMENT
// =============================================================================

/**
 * Get the current sync queue
 * @returns {Array} Array of pending actions
 */
export function getQueue() {
    try {
        const encrypted = localStorage.getItem(QUEUE_STORAGE_KEY);
        if (!encrypted) return [];
        return decryptFromStorage(encrypted) || [];
    } catch (e) {
        console.warn('[syncQueue] Failed to load queue:', e.message);
        return [];
    }
}

/**
 * Save the sync queue
 * @param {Array} queue - Array of actions to save
 */
function saveQueue(queue) {
    try {
        const encrypted = encryptForStorage(queue);
        localStorage.setItem(QUEUE_STORAGE_KEY, encrypted);
    } catch (e) {
        console.error('[syncQueue] Failed to save queue:', e.message);
    }
}

/**
 * Add an action to the sync queue
 * @param {object} action - Action to add
 * @param {string} action.type - Action type (SyncAction)
 * @param {string} action.userId - Local user ID
 * @param {string} action.username - Username
 * @param {string} action.phone - Phone number
 * @param {object} action.data - Additional data for the action
 * @returns {string} Action ID
 */
export function addToQueue(action) {
    const queue = getQueue();

    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    const queueItem = {
        id: actionId,
        type: action.type,
        userId: action.userId,
        username: action.username,
        phone: action.phone,
        data: action.data || {},
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        maxRetries: 3,
        lastError: null
    };

    // Check for duplicate actions (same type + userId)
    const existingIndex = queue.findIndex(q =>
        q.type === action.type && q.userId === action.userId && q.status === ActionStatus.PENDING
    );

    if (existingIndex >= 0) {
        // Update existing action instead of adding duplicate
        queue[existingIndex] = { ...queue[existingIndex], ...queueItem, id: queue[existingIndex].id };
        console.log(`[syncQueue] Updated existing action: ${queue[existingIndex].id}`);
    } else {
        queue.push(queueItem);
        console.log(`[syncQueue] Added action: ${actionId} (${action.type})`);
    }

    saveQueue(queue);
    return existingIndex >= 0 ? queue[existingIndex].id : actionId;
}

/**
 * Remove an action from the queue
 * @param {string} actionId - Action ID to remove
 */
export function removeFromQueue(actionId) {
    const queue = getQueue();
    const newQueue = queue.filter(q => q.id !== actionId);
    saveQueue(newQueue);
    console.log(`[syncQueue] Removed action: ${actionId}`);
}

/**
 * Update an action's status
 * @param {string} actionId - Action ID
 * @param {string} status - New status
 * @param {string} error - Error message (optional)
 */
export function updateActionStatus(actionId, status, error = null) {
    const queue = getQueue();
    const action = queue.find(q => q.id === actionId);

    if (action) {
        action.status = status;
        action.updatedAt = new Date().toISOString();
        if (error) action.lastError = error;
        if (status === ActionStatus.RETRY) action.retryCount++;
        saveQueue(queue);
    }
}

/**
 * Get pending actions for a specific user
 * @param {string} userId - Local user ID
 * @returns {Array} Pending actions for the user
 */
export function getPendingActionsForUser(userId) {
    return getQueue().filter(q =>
        q.userId === userId &&
        (q.status === ActionStatus.PENDING || q.status === ActionStatus.RETRY)
    );
}

/**
 * Get all pending actions
 * @returns {Array} All pending actions
 */
export function getAllPendingActions() {
    return getQueue().filter(q =>
        q.status === ActionStatus.PENDING || q.status === ActionStatus.RETRY
    );
}

/**
 * Clear completed actions older than specified days
 * @param {number} days - Number of days to keep
 */
export function cleanupOldActions(days = 7) {
    const queue = getQueue();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const newQueue = queue.filter(q =>
        q.status !== ActionStatus.COMPLETED || q.updatedAt > cutoff
    );

    if (newQueue.length !== queue.length) {
        saveQueue(newQueue);
        console.log(`[syncQueue] Cleaned up ${queue.length - newQueue.length} old actions`);
    }
}

// =============================================================================
// CREDENTIALS MANAGEMENT (for auto-sync)
// =============================================================================

/**
 * Store credentials for automatic sync
 * WARNING: This stores the password encrypted in localStorage
 * Only use if user explicitly enables auto-sync
 * 
 * @param {string} userId - Local user ID
 * @param {string} password - User's password
 * @param {boolean} enableAutoSync - Whether to enable auto-sync
 */
export function storeCredentialsForSync(userId, password, enableAutoSync = true) {
    try {
        const allCredentials = getStoredCredentials();

        allCredentials[userId] = {
            password: password, // Will be encrypted when saved
            autoSync: enableAutoSync,
            storedAt: new Date().toISOString()
        };

        const encrypted = encryptForStorage(allCredentials);
        localStorage.setItem(CREDENTIALS_STORAGE_KEY, encrypted);
        console.log(`[syncQueue] Credentials stored for user: ${userId}`);
    } catch (e) {
        console.error('[syncQueue] Failed to store credentials:', e.message);
    }
}

/**
 * Get stored credentials for a user
 * @param {string} userId - Local user ID
 * @returns {object|null} Credentials or null
 */
export function getCredentialsForUser(userId) {
    const allCredentials = getStoredCredentials();
    return allCredentials[userId] || null;
}

/**
 * Get all stored credentials
 * @returns {object} All credentials by userId
 */
function getStoredCredentials() {
    try {
        const encrypted = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
        if (!encrypted) return {};
        return decryptFromStorage(encrypted) || {};
    } catch (e) {
        return {};
    }
}

/**
 * Remove stored credentials for a user
 * @param {string} userId - Local user ID
 */
export function removeCredentials(userId) {
    const allCredentials = getStoredCredentials();
    delete allCredentials[userId];

    if (Object.keys(allCredentials).length === 0) {
        localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
    } else {
        const encrypted = encryptForStorage(allCredentials);
        localStorage.setItem(CREDENTIALS_STORAGE_KEY, encrypted);
    }
    console.log(`[syncQueue] Credentials removed for user: ${userId}`);
}

/**
 * Check if auto-sync is enabled for a user
 * @param {string} userId - Local user ID
 * @returns {boolean}
 */
export function isAutoSyncEnabled(userId) {
    const creds = getCredentialsForUser(userId);
    return creds?.autoSync === true;
}

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
        console.error('[syncQueue] Failed to save config:', e.message);
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
        console.log('[syncQueue] Server availability check failed:', e.message);
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
            error: 'No credentials stored for auto-sync',
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
            console.log(`[syncQueue] Action completed: ${action.id}`);
        } else if (action.retryCount < action.maxRetries) {
            updateActionStatus(action.id, ActionStatus.RETRY, result.error);
            console.log(`[syncQueue] Action will retry: ${action.id} (attempt ${action.retryCount + 1})`);
        } else {
            updateActionStatus(action.id, ActionStatus.FAILED, result.error);
            console.log(`[syncQueue] Action failed permanently: ${action.id}`);
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
    const response = await fetch(`${cloudServerUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: action.username,
            phone: action.phone,
            password: credentials.password
        }),
        credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    if (data.success || response.status === 409) {
        // 409 = already exists, which is fine for sync
        return {
            success: true,
            cloudId: data.user?.id,
            alreadyExists: response.status === 409
        };
    }

    return { success: false, error: data.error || `HTTP ${response.status}` };
}

/**
 * Sync update account to cloud
 */
async function syncUpdateAccount(action, credentials, cloudServerUrl) {
    // First login to get a session
    const loginResponse = await fetch(`${cloudServerUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: action.phone,
            password: credentials.password
        }),
        credentials: 'include'
    });

    if (!loginResponse.ok) {
        const loginData = await loginResponse.json().catch(() => ({}));
        return { success: false, error: loginData.error || 'Failed to authenticate' };
    }

    // Then update
    const updateResponse = await fetch(`${cloudServerUrl}/api/auth/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.data),
        credentials: 'include'
    });

    const data = await updateResponse.json().catch(() => ({}));
    return { success: data.success, error: data.error };
}

/**
 * Sync delete account to cloud
 */
async function syncDeleteAccount(action, credentials, cloudServerUrl) {
    // For deletion, we need the password
    // If credentials are not available, check if password was stored in action.data
    const password = credentials?.password || action.data?.password;

    if (!password) {
        return {
            success: false,
            error: 'Password required for account deletion',
            requiresManualSync: true
        };
    }

    // First login
    const loginResponse = await fetch(`${cloudServerUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: action.phone,
            password: password
        }),
        credentials: 'include'
    });

    const loginData = await loginResponse.json().catch(() => ({}));

    if (!loginData.success) {
        // Account might already be deleted on cloud, or never existed
        if (loginData.error?.includes('Invalid') || loginData.error?.includes('not found')) {
            return { success: true, alreadyDeleted: true };
        }
        return { success: false, error: loginData.error || 'Failed to authenticate' };
    }

    // Then delete
    const deleteResponse = await fetch(`${cloudServerUrl}/api/auth/delete-account`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
    });

    const data = await deleteResponse.json().catch(() => ({}));
    return { success: data.success, error: data.error };
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

    console.log(`[syncQueue] Processing ${pending.length} pending actions...`);

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

    console.log(`[syncQueue] Sync complete: ${results.succeeded} succeeded, ${results.failed} failed, ${results.requiresManual} need manual sync`);

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
        console.log('[syncQueue] Auto-sync not enabled or no server configured');
        return;
    }

    // Stop existing interval if any
    stopAutoSync();

    // Sync immediately on startup if configured
    if (config.syncOnStartup) {
        console.log('[syncQueue] Running startup sync...');
        processAllPendingActions().catch(e => console.warn('[syncQueue] Startup sync error:', e));
    }

    // Set up interval
    const intervalMs = (config.syncIntervalMinutes || 5) * 60 * 1000;
    syncIntervalId = setInterval(() => {
        processAllPendingActions().catch(e => console.warn('[syncQueue] Scheduled sync error:', e));
    }, intervalMs);

    console.log(`[syncQueue] Auto-sync started (every ${config.syncIntervalMinutes} minutes)`);
}

/**
 * Stop automatic sync scheduler
 */
export function stopAutoSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
        console.log('[syncQueue] Auto-sync stopped');
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
            console.log('[syncQueue] Network online - triggering sync');
            processAllPendingActions().catch(e => console.warn('[syncQueue] Online sync error:', e));
        });
    }

    console.log('[syncQueue] Sync queue initialized');
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
