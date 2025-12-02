/**
 * Atome Sync Client
 * 
 * Client-side API for creating, updating, and syncing Atome objects
 * with the Fastify server. Works with authenticated users only.
 * 
 * NOTE: Atome API is ALWAYS on Fastify (port 3001), even in Tauri mode.
 * Authentication uses Axum (port 3000) in Tauri mode, but Atomes go to Fastify.
 * 
 * Usage:
 *   Atome.create({ id, kind, parent, properties })
 *   Atome.update({ id, properties })
 *   Atome.delete({ id })
 *   Atome.get({ id })
 *   Atome.sync()
 */

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================
function resolveAtomeConfig() {
    // Check for custom API base
    if (typeof window !== 'undefined' && window.SQUIRREL_API_BASE) {
        return { base: window.SQUIRREL_API_BASE, isLocal: false };
    }
    try {
        const stored = localStorage.getItem('squirrel_api_base');
        if (stored) return { base: stored, isLocal: false };
    } catch (e) { }

    // Detect Tauri environment
    let isTauri = false;
    if (typeof window !== 'undefined' && window.__TAURI__) isTauri = true;
    if (!isTauri) {
        try {
            const platform = typeof current_platform === 'function' ? current_platform() : '';
            if (typeof platform === 'string' && platform.toLowerCase().includes('taur')) isTauri = true;
        } catch (_) { }
    }
    if (!isTauri && typeof window !== 'undefined') {
        const port = window.location?.port;
        if (port === '1420' || port === '1430') isTauri = true;
    }

    // IMPORTANT: Atome API is ALWAYS on Fastify (3001), even in Tauri mode
    // Only auth goes to Axum (3000) in Tauri mode
    if (isTauri) {
        return {
            base: 'http://localhost:3001',  // Atomes go to Fastify
            isLocal: true,  // But we still use local_auth_token
            isTauri: true
        };
    }

    if (typeof window !== 'undefined') {
        const hostname = window.location?.hostname;
        const port = window.location?.port;
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
            return { base: 'http://localhost:3001', isLocal: false, isTauri: false };
        }
    }
    return { base: '', isLocal: false, isTauri: false };
}

const atomeConfig = resolveAtomeConfig();
const ATOME_API_BASE = atomeConfig.base + '/api/atome';
const TOKEN_KEY = atomeConfig.isLocal ? 'local_auth_token' : 'cloud_auth_token';

console.log('[Atome] Config:', {
    base: atomeConfig.base,
    isLocal: atomeConfig.isLocal,
    isTauri: atomeConfig.isTauri,
    TOKEN_KEY,
    ATOME_API_BASE
});

// Pending operations queue for offline support
let pendingOperations = [];
let isOnline = navigator.onLine;
let syncInProgress = false;

// Listen for online/offline events
window.addEventListener('online', () => {
    isOnline = true;
    console.log('[Atome] Online - syncing pending operations...');
    Atome.sync();
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log('[Atome] Offline - operations will be queued');
});

/**
 * Get authentication token from current session
 */
function getAuthToken() {
    // Try the environment-specific token key first
    const token = localStorage.getItem(TOKEN_KEY)
        || localStorage.getItem('local_auth_token')  // Fallback for Tauri
        || localStorage.getItem('cloud_auth_token')  // Fallback for cloud
        || localStorage.getItem('auth_token')        // Legacy fallback
        || sessionStorage.getItem('auth_token')
        || window.__SQUIRREL_AUTH_TOKEN__;

    if (!token) {
        console.warn('[Atome] No auth token found. User must be logged in.');
    }
    return token;
}

/**
 * Get current user ID from token or cached data
 */
function getCurrentUserId() {
    // Try localStorage first
    const userData = localStorage.getItem('user_data');
    if (userData) {
        try {
            return JSON.parse(userData).id;
        } catch (e) {
            // Invalid JSON
        }
    }

    // Try to decode from JWT token
    const token = getAuthToken();
    if (token) {
        try {
            const [, payload] = token.split('.');
            const decoded = JSON.parse(atob(payload));
            return decoded.id || decoded.userId || decoded.sub;
        } catch (e) {
            // Invalid token format
        }
    }

    return window.__SQUIRREL_USER_ID__ || null;
}

/**
 * Check if user is authenticated (just check for token presence)
 */
function isAuthenticated() {
    return !!getAuthToken();
}

/**
 * Make authenticated API request
 */
async function apiRequest(method, endpoint, data = null) {
    const token = getAuthToken();

    if (!token) {
        throw new Error('User must be authenticated to use Atome API');
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };

    // Only add Content-Type and body for methods that need it
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`${ATOME_API_BASE}${endpoint}`, options);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `API Error: ${response.status}`);
    }

    return response.json();
}

/**
 * Flatten nested object for storage
 * { css: { color: 'red' } } → { 'css.color': 'red' }
 */
function flattenProperties(obj, prefix = '') {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            Object.assign(result, flattenProperties(value, newKey));
        } else {
            result[newKey] = value;
        }
    }

    return result;
}

/**
 * Unflatten properties for reconstruction
 * { 'css.color': 'red' } → { css: { color: 'red' } }
 */
function unflattenProperties(obj) {
    const result = {};

    for (const [key, value] of Object.entries(obj)) {
        const parts = key.split('.');
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in current)) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = value;
    }

    return result;
}

/**
 * Generate unique ID
 */
function generateId() {
    return `atome_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Queue operation for later sync
 */
function queueOperation(operation) {
    operation.timestamp = Date.now();
    operation.userId = getCurrentUserId();
    pendingOperations.push(operation);

    // Persist to localStorage
    try {
        localStorage.setItem('atome_pending_ops', JSON.stringify(pendingOperations));
    } catch (e) {
        console.warn('[Atome] Could not persist pending operations');
    }

    console.log('[Atome] Operation queued:', operation.type, operation.id);
}

/**
 * Load pending operations from storage
 */
function loadPendingOperations() {
    try {
        const stored = localStorage.getItem('atome_pending_ops');
        if (stored) {
            pendingOperations = JSON.parse(stored);
        }
    } catch (e) {
        pendingOperations = [];
    }
}

// Load on init
loadPendingOperations();

/**
 * Main Atome API
 */
const Atome = {
    /**
     * Create a new Atome object
     * @param {Object} options - { id?, kind, tag?, parent?, properties }
     */
    async create(options) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to create Atome objects');
        }

        const atomeData = {
            id: options.id || generateId(),
            kind: options.kind || 'generic',
            tag: options.tag || 'div',
            parent: options.parent || null,
            properties: flattenProperties(options.properties || {}),
            user_id: getCurrentUserId(),
            created_at: new Date().toISOString()
        };

        if (!isOnline) {
            queueOperation({ type: 'create', ...atomeData });
            return { success: true, queued: true, data: atomeData };
        }

        try {
            const result = await apiRequest('POST', '/create', atomeData);
            console.log('[Atome] Created:', atomeData.id);

            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('atome:created', { detail: result }));

            return result;
        } catch (error) {
            console.error('[Atome] Create failed, queuing:', error.message);
            queueOperation({ type: 'create', ...atomeData });
            return { success: false, queued: true, error: error.message, data: atomeData };
        }
    },

    /**
     * Update an existing Atome object
     * @param {Object} options - { id, properties }
     */
    async update(options) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to update Atome objects');
        }

        if (!options.id) {
            throw new Error('Atome ID is required for update');
        }

        const updateData = {
            id: options.id,
            properties: flattenProperties(options.properties || {}),
            updated_at: new Date().toISOString(),
            updated_by: getCurrentUserId()
        };

        if (!isOnline) {
            queueOperation({ type: 'update', ...updateData });
            return { success: true, queued: true, data: updateData };
        }

        try {
            const result = await apiRequest('PUT', `/${options.id}`, updateData);
            console.log('[Atome] Updated:', options.id);

            window.dispatchEvent(new CustomEvent('atome:updated', { detail: result }));

            return result;
        } catch (error) {
            console.error('[Atome] Update failed, queuing:', error.message);
            queueOperation({ type: 'update', ...updateData });
            return { success: false, queued: true, error: error.message, data: updateData };
        }
    },

    /**
     * Delete an Atome object
     * @param {Object} options - { id }
     */
    async delete(options) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to delete Atome objects');
        }

        if (!options.id) {
            throw new Error('Atome ID is required for delete');
        }

        const deleteData = {
            id: options.id,
            deleted_at: new Date().toISOString(),
            deleted_by: getCurrentUserId()
        };

        if (!isOnline) {
            queueOperation({ type: 'delete', ...deleteData });
            return { success: true, queued: true };
        }

        try {
            const result = await apiRequest('DELETE', `/${options.id}`);
            console.log('[Atome] Deleted:', options.id);

            window.dispatchEvent(new CustomEvent('atome:deleted', { detail: { id: options.id } }));

            return result;
        } catch (error) {
            console.error('[Atome] Delete failed, queuing:', error.message);
            queueOperation({ type: 'delete', ...deleteData });
            return { success: false, queued: true, error: error.message };
        }
    },

    /**
     * Get an Atome object by ID
     * @param {Object} options - { id }
     */
    async get(options) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to get Atome objects');
        }

        if (!options.id) {
            throw new Error('Atome ID is required');
        }

        const result = await apiRequest('GET', `/${options.id}`);

        // Unflatten properties for client use
        if (result.data && result.data.properties) {
            result.data.properties = unflattenProperties(result.data.properties);
        }

        return result;
    },

    /**
     * List Atome objects with filters
     * @param {Object} options - { project_id?, kind?, parent? }
     */
    async list(options = {}) {
        if (!isAuthenticated()) {
            throw new Error('User must be logged in to list Atome objects');
        }

        const params = new URLSearchParams();
        if (options.project_id) params.append('project_id', options.project_id);
        if (options.kind) params.append('kind', options.kind);
        if (options.parent) params.append('parent', options.parent);

        const result = await apiRequest('GET', `/list?${params.toString()}`);

        // Unflatten properties for each item
        if (result.data && Array.isArray(result.data)) {
            result.data = result.data.map(item => ({
                ...item,
                properties: unflattenProperties(item.properties || {})
            }));
        }

        return result;
    },

    /**
     * Sync pending operations with server
     */
    async sync() {
        if (!isOnline) {
            console.log('[Atome] Cannot sync - offline');
            return { success: false, reason: 'offline' };
        }

        if (syncInProgress) {
            console.log('[Atome] Sync already in progress');
            return { success: false, reason: 'sync_in_progress' };
        }

        if (pendingOperations.length === 0) {
            console.log('[Atome] No pending operations to sync');
            return { success: true, synced: 0 };
        }

        syncInProgress = true;
        console.log('[Atome] Syncing', pendingOperations.length, 'pending operations...');

        const results = [];
        const failedOps = [];

        for (const op of pendingOperations) {
            try {
                let result;
                switch (op.type) {
                    case 'create':
                        result = await apiRequest('POST', '/create', op);
                        break;
                    case 'update':
                        result = await apiRequest('PUT', `/${op.id}`, op);
                        break;
                    case 'delete':
                        result = await apiRequest('DELETE', `/${op.id}`);
                        break;
                }
                results.push({ op: op.type, id: op.id, success: true });
            } catch (error) {
                console.error('[Atome] Sync failed for:', op.type, op.id, error.message);
                failedOps.push(op);
                results.push({ op: op.type, id: op.id, success: false, error: error.message });
            }
        }

        // Keep only failed operations
        pendingOperations = failedOps;
        localStorage.setItem('atome_pending_ops', JSON.stringify(pendingOperations));

        syncInProgress = false;

        console.log('[Atome] Sync complete:', results.filter(r => r.success).length, 'succeeded,', failedOps.length, 'failed');

        window.dispatchEvent(new CustomEvent('atome:synced', { detail: { results, pending: failedOps.length } }));

        return { success: true, results, pending: failedOps.length };
    },

    /**
     * Reconstruct a Squirrel element from Atome data
     * @param {Object} atomeData - Atome object from server
     */
    toSquirrel(atomeData) {
        const props = unflattenProperties(atomeData.properties || {});

        return $(atomeData.tag || 'div', {
            id: atomeData.id,
            parent: atomeData.parent ? `#${atomeData.parent}` : '#view',
            ...props
        });
    },

    /**
     * Create Atome from existing Squirrel element
     * @param {HTMLElement} element - DOM element
     * @param {Object} options - { kind, parent?, project_id? }
     */
    fromSquirrel(element, options = {}) {
        const computedStyle = window.getComputedStyle(element);
        const properties = {};

        // Extract relevant CSS properties
        const cssProps = ['color', 'backgroundColor', 'width', 'height', 'margin', 'padding',
            'borderRadius', 'fontSize', 'fontWeight', 'position', 'top', 'left'];

        cssProps.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (value && value !== 'auto' && value !== 'normal') {
                properties[`css.${prop}`] = value;
            }
        });

        // Get text content
        if (element.textContent) {
            properties.text = element.textContent;
        }

        return this.create({
            id: element.id || generateId(),
            kind: options.kind || 'element',
            tag: element.tagName.toLowerCase(),
            parent: options.parent,
            properties
        });
    },

    /**
     * Get pending operations count
     */
    getPendingCount() {
        return pendingOperations.length;
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated,

    /**
     * Utility functions
     */
    utils: {
        flattenProperties,
        unflattenProperties,
        generateId
    }
};

// Expose globally
window.Atome = Atome;

// Also expose on Squirrel namespace
window.Squirrel = window.Squirrel || {};
window.Squirrel.Atome = Atome;

export default Atome;
export { Atome, flattenProperties, unflattenProperties };
