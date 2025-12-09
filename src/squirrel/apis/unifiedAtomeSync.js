/**
 * Unified Atome Sync Module
 * 
 * Provides unified CRUD operations for Atome objects that work seamlessly
 * whether Tauri, Fastify, or both are running. Handles:
 * 
 * 1. Silent server detection (no console errors)
 * 2. Automatic fallback when one server is unavailable
 * 3. Bidirectional synchronization when both are available
 * 4. Offline queue with automatic retry
 * 5. Conflict resolution based on updated_at timestamps
 * 
 * @module src/squirrel/apis/unifiedAtomeSync
 */

import { getLocalServerUrl, getCloudServerUrl, isTauri } from './serverUrls.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Use getters to ensure URLs are resolved at call time, not import time
const CONFIG = {
    // Server URLs - use getters for dynamic resolution
    get TAURI_SERVER() { return getLocalServerUrl() || 'http://127.0.0.1:3000'; },
    get FASTIFY_SERVER() { return getCloudServerUrl() || 'http://localhost:3001'; },

    // Timing
    SERVER_CHECK_TIMEOUT: 800,      // Fast check timeout
    SYNC_DEBOUNCE_MS: 1000,         // Debounce sync operations
    RETRY_INTERVAL_MS: 30000,       // Retry failed syncs every 30s
    CACHE_VALIDITY_MS: 5000,        // Server availability cache duration

    // Features
    ENABLE_OFFLINE_QUEUE: true,
    ENABLE_AUTO_SYNC: true,
    MAX_QUEUE_SIZE: 1000
};

// =============================================================================
// STATE
// =============================================================================

const state = {
    // Server availability (cached)
    tauriAvailable: null,
    fastifyAvailable: null,
    lastServerCheck: 0,

    // Authentication
    tauriToken: null,
    fastifyToken: null,

    // Offline queue
    pendingOperations: [],

    // Sync state
    syncInProgress: false,
    lastSyncTime: 0,

    // Event listeners
    listeners: new Map()
};

// =============================================================================
// SILENT SERVER DETECTION
// =============================================================================

/**
 * Check if a server is available WITHOUT generating console errors
 * Uses a combination of techniques to avoid CORS/network error spam
 */
async function checkServerSilently(url) {
    // Skip if we're not in the right environment
    if (url === CONFIG.TAURI_SERVER && !shouldCheckTauri()) {
        return false;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.SERVER_CHECK_TIMEOUT);

        const response = await fetch(`${url}/api/server-info`, {
            method: 'GET',
            signal: controller.signal,
            mode: 'cors',
            cache: 'no-store'
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch {
        // Silently return false - this is expected when server is down
        return false;
    }
}

/**
 * Determine if we should check Tauri server
 * Only check if we're in a Tauri environment
 */
function shouldCheckTauri() {
    if (typeof window === 'undefined') return false;

    // Check for Tauri globals
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return true;

    // Check for custom port
    if (window.__ATOME_LOCAL_HTTP_PORT__) return true;

    // Check user agent
    if (navigator?.userAgent && /tauri/i.test(navigator.userAgent)) return true;

    // Check port (Tauri dev server)
    if (window.location?.port === '1420' || window.location?.port === '1430') return true;

    return false;
}

/**
 * Get cached server availability or refresh if stale
 */
async function getServerAvailability(forceRefresh = false) {
    const now = Date.now();
    const cacheValid = (now - state.lastServerCheck) < CONFIG.CACHE_VALIDITY_MS;

    if (!forceRefresh && cacheValid && state.tauriAvailable !== null && state.fastifyAvailable !== null) {
        return {
            tauri: state.tauriAvailable,
            fastify: state.fastifyAvailable
        };
    }

    // Check servers in parallel
    const checkTauri = shouldCheckTauri();
    const [tauri, fastify] = await Promise.all([
        checkTauri ? checkServerSilently(CONFIG.TAURI_SERVER) : Promise.resolve(false),
        checkServerSilently(CONFIG.FASTIFY_SERVER)
    ]);

    state.tauriAvailable = tauri;
    state.fastifyAvailable = fastify;
    state.lastServerCheck = now;

    // Debug log (not error)
    console.debug('[UnifiedAtome] Server availability:', {
        tauri: checkTauri ? (tauri ? 'UP' : 'DOWN') : 'SKIPPED',
        fastify: fastify ? 'UP' : 'DOWN'
    });

    return { tauri, fastify };
}

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Get tokens for both servers
 */
function getTokens() {
    return {
        tauri: localStorage.getItem('local_auth_token'),
        fastify: localStorage.getItem('cloud_auth_token')
    };
}

/**
 * Get best available token
 */
function getBestToken() {
    const tokens = getTokens();
    return tokens.tauri || tokens.fastify || localStorage.getItem('auth_token');
}

/**
 * Check if user is authenticated on at least one server
 */
function isAuthenticated() {
    const tokens = getTokens();
    return !!(tokens.tauri || tokens.fastify);
}

/**
 * Get current user ID from token or localStorage
 */
function getCurrentUserId() {
    // Try localStorage first
    try {
        const userData = localStorage.getItem('user_data');
        if (userData) {
            const parsed = JSON.parse(userData);
            if (parsed.id) return parsed.id;
        }
    } catch { }

    // Try to decode from JWT
    const token = getBestToken();
    if (token) {
        try {
            const [, payload] = token.split('.');
            const decoded = JSON.parse(atob(payload));
            return decoded.id || decoded.userId || decoded.sub;
        } catch { }
    }

    return null;
}

// =============================================================================
// API REQUEST HELPERS
// =============================================================================

/**
 * Make API request to a specific server
 * Returns null on failure (no throw for graceful degradation)
 */
async function apiRequest(serverUrl, token, method, endpoint, data = null) {
    if (!token) return null;

    try {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: serverUrl.includes('3001') ? 'include' : 'omit'
        };

        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            options.body = JSON.stringify(data);
        }

        console.log(`[apiRequest] 📤 ${method} ${serverUrl}${endpoint}`);
        const response = await fetch(`${serverUrl}${endpoint}`, options);
        console.log(`[apiRequest] 📥 Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.debug(`[UnifiedAtome] ${method} ${endpoint} failed on ${serverUrl}:`, error);
            return null;
        }

        console.log(`[apiRequest] 📦 Parsing JSON...`);
        const result = await response.json();
        console.log(`[apiRequest] ✅ JSON parsed successfully`);
        return result;
    } catch (error) {
        console.error(`[apiRequest] ❌ Request to ${serverUrl} failed:`, error.message, error);
        return null;
    }
}

/**
 * Make request to Tauri server
 */
async function tauriRequest(method, endpoint, data = null) {
    const { tauri } = await getServerAvailability();
    if (!tauri) return null;

    const token = getTokens().tauri;
    console.log('[tauriRequest] Token available:', !!token, 'for', method, endpoint);
    if (!token) {
        console.debug('[UnifiedAtome] No Tauri token available, skipping request');
        return null;
    }
    return apiRequest(CONFIG.TAURI_SERVER, token, method, endpoint, data);
}

/**
 * Make request to Fastify server
 */
async function fastifyRequest(method, endpoint, data = null) {
    const { fastify } = await getServerAvailability();
    if (!fastify) return null;

    const token = getTokens().fastify;
    if (!token) {
        console.debug('[UnifiedAtome] No Fastify token available, skipping request');
        return null;
    }
    return apiRequest(CONFIG.FASTIFY_SERVER, token, method, endpoint, data);
}

// =============================================================================
// OFFLINE QUEUE
// =============================================================================

/**
 * Load pending operations from localStorage
 */
function loadPendingOperations() {
    try {
        const stored = localStorage.getItem('unified_atome_pending_ops');
        if (stored) {
            state.pendingOperations = JSON.parse(stored);
        }
    } catch {
        state.pendingOperations = [];
    }
}

/**
 * Save pending operations to localStorage
 */
function savePendingOperations() {
    try {
        // Limit queue size
        if (state.pendingOperations.length > CONFIG.MAX_QUEUE_SIZE) {
            state.pendingOperations = state.pendingOperations.slice(-CONFIG.MAX_QUEUE_SIZE);
        }
        localStorage.setItem('unified_atome_pending_ops', JSON.stringify(state.pendingOperations));
    } catch { }
}

/**
 * Queue an operation for later execution
 */
function queueOperation(operation) {
    if (!CONFIG.ENABLE_OFFLINE_QUEUE) return;

    operation.queuedAt = Date.now();
    operation.userId = getCurrentUserId();
    state.pendingOperations.push(operation);
    savePendingOperations();

    console.debug('[UnifiedAtome] Operation queued:', operation.type, operation.id);
}

/**
 * Process pending operations
 */
async function processPendingOperations() {
    if (state.pendingOperations.length === 0) return;

    const { tauri, fastify } = await getServerAvailability(true);
    if (!tauri && !fastify) return; // No server available

    console.debug(`[UnifiedAtome] Processing ${state.pendingOperations.length} pending operations`);

    const remaining = [];

    for (const op of state.pendingOperations) {
        let success = false;

        try {
            switch (op.type) {
                case 'create':
                    success = await UnifiedAtome.create(op.data, { skipQueue: true });
                    break;
                case 'update':
                    success = await UnifiedAtome.update(op.id, op.data, { skipQueue: true });
                    break;
                case 'delete':
                    success = await UnifiedAtome.delete(op.id, { skipQueue: true });
                    break;
            }
        } catch (error) {
            console.debug('[UnifiedAtome] Failed to process queued operation:', error.message);
        }

        if (!success) {
            remaining.push(op);
        }
    }

    state.pendingOperations = remaining;
    savePendingOperations();
}

// =============================================================================
// BIDIRECTIONAL SYNC
// =============================================================================

/**
 * Synchronize data between Tauri and Fastify
 * Uses updated_at timestamps to resolve conflicts
 */
async function synchronizeServers() {
    const { tauri, fastify } = await getServerAvailability(true);

    // Need both servers for sync
    if (!tauri || !fastify) {
        console.debug('[UnifiedAtome] Skipping sync - not all servers available');
        return;
    }

    if (state.syncInProgress) {
        console.debug('[UnifiedAtome] Sync already in progress');
        return;
    }

    state.syncInProgress = true;

    try {
        console.debug('[UnifiedAtome] Starting bidirectional sync...');

        // Get all atomes from both servers
        const [tauriAtomes, fastifyAtomes] = await Promise.all([
            tauriRequest('GET', '/api/atome/list'),
            fastifyRequest('GET', '/api/atome/list')
        ]);

        if (!tauriAtomes?.data || !fastifyAtomes?.data) {
            console.debug('[UnifiedAtome] Could not fetch atomes from both servers');
            return;
        }

        // Build maps for comparison
        const tauriMap = new Map(tauriAtomes.data.map(a => [a.id, a]));
        const fastifyMap = new Map(fastifyAtomes.data.map(a => [a.id, a]));

        // Find differences
        const onlyInTauri = [];
        const onlyInFastify = [];
        const conflicts = [];

        // Check Tauri atomes
        for (const [id, tauriAtome] of tauriMap) {
            if (!fastifyMap.has(id)) {
                onlyInTauri.push(tauriAtome);
            } else {
                const fastifyAtome = fastifyMap.get(id);
                const tauriTime = new Date(tauriAtome.updated_at || tauriAtome.updatedAt).getTime();
                const fastifyTime = new Date(fastifyAtome.updated_at || fastifyAtome.updatedAt).getTime();

                if (Math.abs(tauriTime - fastifyTime) > 1000) {
                    conflicts.push({
                        id,
                        tauri: tauriAtome,
                        fastify: fastifyAtome,
                        newerOn: tauriTime > fastifyTime ? 'tauri' : 'fastify'
                    });
                }
            }
        }

        // Check Fastify atomes
        for (const [id, fastifyAtome] of fastifyMap) {
            if (!tauriMap.has(id)) {
                onlyInFastify.push(fastifyAtome);
            }
        }

        // Sync: Copy missing atomes to other server
        for (const atome of onlyInTauri) {
            console.debug(`[UnifiedAtome] Syncing ${atome.id} from Tauri to Fastify`);
            await fastifyRequest('POST', '/api/atome/create', formatAtomeForServer(atome));
        }

        for (const atome of onlyInFastify) {
            console.debug(`[UnifiedAtome] Syncing ${atome.id} from Fastify to Tauri`);
            await tauriRequest('POST', '/api/atome/create', formatAtomeForServer(atome));
        }

        // Resolve conflicts (newer wins)
        for (const conflict of conflicts) {
            const source = conflict.newerOn === 'tauri' ? conflict.tauri : conflict.fastify;
            const target = conflict.newerOn === 'tauri' ? 'fastify' : 'tauri';

            console.debug(`[UnifiedAtome] Resolving conflict for ${conflict.id} - ${conflict.newerOn} is newer`);

            if (target === 'fastify') {
                await fastifyRequest('PUT', `/api/atome/${conflict.id}`, formatAtomeForServer(source));
            } else {
                await tauriRequest('PUT', `/api/atome/${conflict.id}`, formatAtomeForServer(source));
            }
        }

        state.lastSyncTime = Date.now();
        console.debug('[UnifiedAtome] Sync complete:', {
            syncedToFastify: onlyInTauri.length,
            syncedToTauri: onlyInFastify.length,
            conflictsResolved: conflicts.length
        });

        // Emit sync complete event
        emitEvent('sync:complete', {
            syncedToFastify: onlyInTauri.length,
            syncedToTauri: onlyInFastify.length,
            conflictsResolved: conflicts.length
        });

    } finally {
        state.syncInProgress = false;
    }
}

/**
 * Format atome data for server API (uses camelCase)
 */
function formatAtomeForServer(atome) {
    return {
        id: atome.id,
        kind: atome.kind || 'generic',
        tag: atome.tag || 'div',
        data: atome.data || atome.properties || {},
        properties: atome.properties || atome.data || {},
        parentId: atome.parentId || atome.parent_id,
        createdAt: atome.createdAt || atome.created_at,
        updatedAt: atome.updatedAt || atome.updated_at
    };
}

// =============================================================================
// EVENT SYSTEM
// =============================================================================

/**
 * Emit event to listeners
 */
function emitEvent(type, data) {
    // Dispatch DOM event
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(`atome:${type}`, { detail: data }));
    }

    // Call registered listeners
    const listeners = state.listeners.get(type) || [];
    for (const listener of listeners) {
        try {
            listener(data);
        } catch { }
    }
}

// =============================================================================
// MAIN API
// =============================================================================

const UnifiedAtome = {
    /**
     * Initialize the sync module
     */
    async init() {
        loadPendingOperations();

        // Check server availability
        await getServerAvailability(true);

        // Process any pending operations
        await processPendingOperations();

        // Set up auto-sync if both servers are available
        if (CONFIG.ENABLE_AUTO_SYNC) {
            // Listen for server availability changes
            window.addEventListener('squirrel:server-available', () => {
                getServerAvailability(true).then(() => {
                    processPendingOperations();
                    synchronizeServers();
                });
            });

            // Listen for online event
            window.addEventListener('online', () => {
                processPendingOperations();
                synchronizeServers();
            });
        }

        console.debug('[UnifiedAtome] Initialized');
    },

    /**
     * Create a new atome
     * Creates on all available servers
     */
    async create(data, options = {}) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to create atomes');
        }

        const { tauri, fastify } = await getServerAvailability();

        if (!tauri && !fastify) {
            if (!options.skipQueue) {
                queueOperation({ type: 'create', data });
            }
            return { success: false, queued: true, error: 'No server available' };
        }

        const atomeData = {
            id: data.id || crypto.randomUUID(),
            kind: data.kind || 'generic',
            tag: data.tag || 'div',
            data: data.data || data.properties || {},
            properties: data.properties || data.data || {},
            parentId: data.parentId || data.parent_id,
            projectId: data.projectId || data.project_id
        };

        let created = false;
        let result = null;

        // Create on Tauri if available
        if (tauri) {
            try {
                const tauriResult = await tauriRequest('POST', '/api/atome/create', atomeData);
                if (tauriResult?.success) {
                    created = true;
                    result = tauriResult;
                }
            } catch (e) {
                console.error('[UnifiedAtome] tauriRequest error:', e);
            }
        }

        // Create on Fastify if available
        if (fastify) {
            const fastifyResult = await fastifyRequest('POST', '/api/atome/create', atomeData);
            if (fastifyResult?.success) {
                created = true;
                if (!result) result = fastifyResult;
            }
        }

        if (created) {
            emitEvent('created', { data: atomeData, result });
            return { success: true, data: atomeData };
        }

        if (!options.skipQueue) {
            queueOperation({ type: 'create', data: atomeData });
        }
        return { success: false, queued: true, error: 'Failed to create on available servers' };
    },

    /**
     * Update an existing atome
     * Updates on all available servers
     */
    async update(id, data, options = {}) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to update atomes');
        }

        const { tauri, fastify } = await getServerAvailability();

        if (!tauri && !fastify) {
            if (!options.skipQueue) {
                queueOperation({ type: 'update', id, data });
            }
            return { success: false, queued: true, error: 'No server available' };
        }

        const updateData = {
            id,
            data: data.data || data.properties || data,
            properties: data.properties || data.data || data,
            kind: data.kind,
            parentId: data.parentId || data.parent_id
        };

        let updated = false;
        let result = null;

        // Update on Tauri
        if (tauri) {
            const tauriResult = await tauriRequest('PUT', `/api/atome/${id}`, updateData);
            if (tauriResult?.success) {
                updated = true;
                result = tauriResult;
                console.debug('[UnifiedAtome] Updated on Tauri:', id);
            }
        }

        // Update on Fastify
        if (fastify) {
            const fastifyResult = await fastifyRequest('PUT', `/api/atome/${id}`, updateData);
            if (fastifyResult?.success) {
                updated = true;
                if (!result) result = fastifyResult;
                console.debug('[UnifiedAtome] Updated on Fastify:', id);
            }
        }

        if (updated) {
            emitEvent('updated', { id, data: updateData, result });
            return { success: true, id, data: updateData };
        }

        if (!options.skipQueue) {
            queueOperation({ type: 'update', id, data: updateData });
        }
        return { success: false, queued: true, error: 'Failed to update on available servers' };
    },

    /**
     * Delete an atome
     * Deletes from all available servers
     */
    async delete(id, options = {}) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to delete atomes');
        }

        const { tauri, fastify } = await getServerAvailability();

        if (!tauri && !fastify) {
            if (!options.skipQueue) {
                queueOperation({ type: 'delete', id });
            }
            return { success: false, queued: true, error: 'No server available' };
        }

        let deleted = false;

        // Delete on Tauri
        if (tauri) {
            const tauriResult = await tauriRequest('DELETE', `/api/atome/${id}`);
            if (tauriResult?.success) {
                deleted = true;
                console.debug('[UnifiedAtome] Deleted on Tauri:', id);
            }
        }

        // Delete on Fastify
        if (fastify) {
            const fastifyResult = await fastifyRequest('DELETE', `/api/atome/${id}`);
            if (fastifyResult?.success) {
                deleted = true;
                console.debug('[UnifiedAtome] Deleted on Fastify:', id);
            }
        }

        if (deleted) {
            emitEvent('deleted', { id });
            return { success: true, id };
        }

        if (!options.skipQueue) {
            queueOperation({ type: 'delete', id });
        }
        return { success: false, queued: true, error: 'Failed to delete on available servers' };
    },

    /**
     * Get a single atome by ID
     * Returns from first available server
     */
    async get(id) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to get atomes');
        }

        const { tauri, fastify } = await getServerAvailability();

        // Try Tauri first (faster local access)
        if (tauri) {
            const result = await tauriRequest('GET', `/api/atome/${id}`);
            if (result?.success) return result;
        }

        // Fallback to Fastify
        if (fastify) {
            const result = await fastifyRequest('GET', `/api/atome/${id}`);
            if (result?.success) return result;
        }

        return { success: false, error: 'Atome not found or no server available' };
    },

    /**
     * List atomes with optional filters
     * Merges results from all available servers
     */
    async list(options = {}) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to list atomes');
        }

        const { tauri, fastify } = await getServerAvailability();

        const queryParams = new URLSearchParams();
        if (options.kind) queryParams.set('kind', options.kind);
        if (options.parentId) queryParams.set('parentId', options.parentId);
        if (options.limit) queryParams.set('limit', options.limit);
        if (options.offset) queryParams.set('offset', options.offset);

        const endpoint = `/api/atome/list${queryParams.toString() ? '?' + queryParams : ''}`;

        const allAtomes = new Map();

        // Get from Tauri
        if (tauri) {
            const result = await tauriRequest('GET', endpoint);
            if (result?.success && result.data) {
                result.data.forEach(atome => allAtomes.set(atome.id, atome));
            }
        }

        // Get from Fastify (will override duplicates with potentially newer data)
        if (fastify) {
            const result = await fastifyRequest('GET', endpoint);
            if (result?.success && result.data) {
                result.data.forEach(atome => {
                    const existing = allAtomes.get(atome.id);
                    if (!existing) {
                        allAtomes.set(atome.id, atome);
                    } else {
                        // Keep the newer one
                        const existingTime = new Date(existing.updated_at || existing.updatedAt || 0).getTime();
                        const newTime = new Date(atome.updated_at || atome.updatedAt || 0).getTime();
                        if (newTime > existingTime) {
                            allAtomes.set(atome.id, atome);
                        }
                    }
                });
            }
        }

        const data = Array.from(allAtomes.values());
        return { success: true, data, total: data.length };
    },

    /**
     * Force synchronization between servers
     */
    async sync() {
        return synchronizeServers();
    },

    /**
     * Get current server availability
     */
    async getServerStatus() {
        return getServerAvailability(true);
    },

    /**
     * Get pending operations count
     */
    getPendingCount() {
        return state.pendingOperations.length;
    },

    /**
     * Register event listener
     */
    on(event, callback) {
        if (!state.listeners.has(event)) {
            state.listeners.set(event, []);
        }
        state.listeners.get(event).push(callback);
    },

    /**
     * Remove event listener
     */
    off(event, callback) {
        const listeners = state.listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }
};

// Initialize on load
if (typeof window !== 'undefined') {
    // Defer init to avoid blocking
    setTimeout(() => UnifiedAtome.init(), 100);
}

// Export
export default UnifiedAtome;
export { UnifiedAtome, getServerAvailability, isAuthenticated, getCurrentUserId };
