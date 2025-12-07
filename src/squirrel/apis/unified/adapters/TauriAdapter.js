/**
 * TauriAdapter.js
 * 
 * HTTP adapter for Tauri/Axum backend (localhost:3000)
 * Handles all communication with the local SQLite-backed server
 * 
 * @module unified/adapters/TauriAdapter
 */

const TAURI_BASE_URL = 'http://127.0.0.1:3000';
const TOKEN_KEY = 'local_auth_token';

/**
 * Get the stored authentication token
 * @returns {string|null} JWT token or null
 */
function getToken() {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(TOKEN_KEY);
    }
    return null;
}

/**
 * Store the authentication token
 * @param {string} token - JWT token to store
 */
function setToken(token) {
    if (typeof localStorage !== 'undefined' && token) {
        localStorage.setItem(TOKEN_KEY, token);
    }
}

/**
 * Remove the stored authentication token
 */
function clearToken() {
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
    }
}

/**
 * Check if Tauri backend is available
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    try {
        const response = await fetch(`${TAURI_BASE_URL}/api/server-info`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * Make an authenticated request to Tauri backend
 * @param {string} endpoint - API endpoint (e.g., '/api/auth/local/me')
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
async function request(endpoint, options = {}) {
    const url = `${TAURI_BASE_URL}${endpoint}`;
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (token && !options.skipAuth) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers,
    };

    if (options.body && typeof options.body === 'object') {
        config.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        // Store token if returned
        if (data.token) {
            setToken(data.token);
        }

        return {
            ok: response.ok,
            status: response.status,
            ...data
        };
    } catch (error) {
        return {
            ok: false,
            success: false,
            error: error.message || 'Network error',
            status: 0
        };
    }
}

// ============================================
// AUTH ENDPOINTS
// ============================================

const auth = {
    /**
     * Register a new user
     * @param {Object} data - { username, password, email? }
     */
    async register(data) {
        return request('/api/auth/local/register', {
            method: 'POST',
            body: data,
            skipAuth: true
        });
    },

    /**
     * Login user
     * @param {Object} data - { username, password }
     */
    async login(data) {
        return request('/api/auth/local/login', {
            method: 'POST',
            body: data,
            skipAuth: true
        });
    },

    /**
     * Logout current user
     */
    async logout() {
        clearToken();
        return { ok: true, success: true };
    },

    /**
     * Get current user profile
     */
    async me() {
        return request('/api/auth/local/me', {
            method: 'GET'
        });
    },

    /**
     * Change password
     * @param {Object} data - { currentPassword, newPassword }
     */
    async changePassword(data) {
        return request('/api/auth/local/change-password', {
            method: 'POST',
            body: data
        });
    },

    /**
     * Delete user account
     * @param {Object} data - { password, deleteData? }
     */
    async deleteAccount(data) {
        return request('/api/auth/local/delete-account', {
            method: 'DELETE',
            body: data
        });
    },

    /**
     * Refresh authentication token
     */
    async refreshToken() {
        return request('/api/auth/local/refresh', {
            method: 'POST'
        });
    }
};

// ============================================
// ATOME ENDPOINTS (ADOLE compliant)
// ============================================

const atome = {
    /**
     * Create a new atome
     * @param {Object} data - { kind, type?, data, meta? }
     */
    async create(data) {
        return request('/api/atome/create', {
            method: 'POST',
            body: data
        });
    },

    /**
     * Get a single atome by ID
     * @param {string} id - Atome UUID
     */
    async get(id) {
        return request(`/api/atome/${id}`, {
            method: 'GET'
        });
    },

    /**
     * List atomes with optional filters
     * @param {Object} params - { kind?, type?, page?, limit?, sortBy?, sortOrder? }
     */
    async list(params = {}) {
        const query = new URLSearchParams();
        if (params.kind) query.append('kind', params.kind);
        if (params.type) query.append('type', params.type);
        if (params.page) query.append('page', params.page);
        if (params.limit) query.append('limit', params.limit);
        if (params.sortBy) query.append('sortBy', params.sortBy);
        if (params.sortOrder) query.append('sortOrder', params.sortOrder);
        if (params.parentId) query.append('parentId', params.parentId);

        const queryString = query.toString();
        return request(`/api/atome/list${queryString ? '?' + queryString : ''}`, {
            method: 'GET'
        });
    },

    /**
     * Alter an atome (ADOLE: adds alteration, increments version)
     * @param {string} id - Atome UUID
     * @param {Object} data - { operation, changes, reason? }
     */
    async alter(id, data) {
        return request(`/api/atome/${id}/alter`, {
            method: 'POST',
            body: data
        });
    },

    /**
     * Update an atome (simple update, for backward compatibility)
     * @param {string} id - Atome UUID
     * @param {Object} data - Fields to update
     */
    async update(id, data) {
        return request(`/api/atome/${id}`, {
            method: 'PUT',
            body: data
        });
    },

    /**
     * Rename an atome
     * @param {string} id - Atome UUID
     * @param {Object} data - { newName }
     */
    async rename(id, data) {
        return request(`/api/atome/${id}/rename`, {
            method: 'POST',
            body: data
        });
    },

    /**
     * Soft delete an atome
     * @param {string} id - Atome UUID
     * @param {Object} data - { reason? }
     */
    async delete(id, data = {}) {
        return request(`/api/atome/${id}`, {
            method: 'DELETE',
            body: data
        });
    },

    /**
     * Get atome alteration history
     * @param {string} id - Atome UUID
     * @param {Object} params - { page?, limit? }
     */
    async history(id, params = {}) {
        const query = new URLSearchParams();
        if (params.page) query.append('page', params.page);
        if (params.limit) query.append('limit', params.limit);

        const queryString = query.toString();
        return request(`/api/atome/${id}/history${queryString ? '?' + queryString : ''}`, {
            method: 'GET'
        });
    },

    /**
     * Restore atome to a specific version
     * @param {string} id - Atome UUID
     * @param {Object} data - { version, reason? }
     */
    async restore(id, data) {
        return request(`/api/atome/${id}/restore`, {
            method: 'POST',
            body: data
        });
    }
};

// ============================================
// USER DATA ENDPOINTS
// ============================================

const userData = {
    /**
     * Delete all user data (keeps account)
     * @param {Object} data - { password, kinds? }
     */
    async deleteAll(data) {
        return request('/api/user-data/delete-all', {
            method: 'DELETE',
            body: data
        });
    },

    /**
     * Export all user data
     * @param {Object} params - { format?, kinds? }
     */
    async export(params = {}) {
        const query = new URLSearchParams();
        if (params.format) query.append('format', params.format);
        if (params.kinds) query.append('kinds', params.kinds.join(','));

        const queryString = query.toString();
        return request(`/api/user-data/export${queryString ? '?' + queryString : ''}`, {
            method: 'GET'
        });
    }
};

// ============================================
// SYNC ENDPOINTS
// ============================================

const sync = {
    /**
     * Get pending changes for sync
     */
    async getPending() {
        return request('/api/atome/sync/pull', {
            method: 'GET'
        });
    },

    /**
     * Push changes to sync
     * @param {Object} data - { atomes: [...] }
     */
    async push(data) {
        return request('/api/atome/sync/push', {
            method: 'POST',
            body: data
        });
    },

    /**
     * Acknowledge synced atomes
     * @param {Object} data - { ids: [...] }
     */
    async ack(data) {
        return request('/api/atome/sync/ack', {
            method: 'POST',
            body: data
        });
    }
};

export default {
    TAURI_BASE_URL,
    TOKEN_KEY,
    isAvailable,
    request,
    getToken,
    setToken,
    clearToken,
    auth,
    atome,
    userData,
    sync
};
