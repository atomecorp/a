/**
 * _shared.js
 * 
 * Shared utilities for all Unified API modules
 * Eliminates code duplication across UnifiedAuth, UnifiedAtome, UnifiedSync, etc.
 * 
 * @module unified/_shared
 */

// ============================================
// CONSTANTS
// ============================================

export const CONFIG = {
    TAURI_BASE_URL: 'http://127.0.0.1:3000',
    FASTIFY_BASE_URL: 'http://127.0.0.1:3001',
    TAURI_TOKEN_KEY: 'local_auth_token',
    FASTIFY_TOKEN_KEY: 'cloud_auth_token',
    CHECK_INTERVAL: 30000,      // 30 seconds backend check cache
    SYNC_COOLDOWN: 5000,        // 5 seconds cooldown between syncs
    RECONNECT_INITIAL_DELAY: 30000,
    RECONNECT_MAX_DELAY: 3600000,
    HEARTBEAT_INTERVAL: 30000,
    MAX_RECONNECT_ATTEMPTS: 3,
    LONG_POLL_INTERVAL: 300000,
    SILENT_MODE_AFTER_FAILURES: 1,
    PING_TIMEOUT: 2000,         // 2 seconds timeout for ping
    OFFLINE_CACHE_DURATION: 10000 // 10 seconds cache for offline state
};

// ============================================
// SILENT CONNECTION STATE (No console errors)
// ============================================

const _connectionState = {
    tauri: { online: null, lastCheck: 0, failCount: 0 },
    fastify: { online: null, lastCheck: 0, failCount: 0 }
};

/**
 * Silent ping - checks server availability WITHOUT console errors
 * Uses fetch with GET request which is less intrusive than WebSocket
 * @param {string} baseUrl - Server base URL (http://...)
 * @returns {Promise<boolean>} - true if online, false otherwise
 */
async function silentPing(baseUrl) {
    try {
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.PING_TIMEOUT);
        
        // Choose endpoint based on server (Tauri uses /local/, Fastify doesn't)
        const isTauriServer = baseUrl.includes(':3000');
        const pingEndpoint = isTauriServer ? '/api/auth/local/me' : '/api/auth/me';
        
        const response = await fetch(`${baseUrl}${pingEndpoint}`, {
            method: 'GET',
            signal: controller.signal,
            // Don't include credentials to avoid CORS preflight complexity
            credentials: 'omit',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        clearTimeout(timeoutId);
        // Any response (even 401/403) means server is online
        return true;
    } catch (e) {
        // Network error or timeout - server is offline
        // This doesn't show errors in console for network failures
        return false;
    }
}

/**
 * Check if we're in Tauri environment
 */
function isInTauri() {
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

/**
 * Check if we're on localhost (dev environment)
 */
function isLocalDev() {
    const hostname = window.location?.hostname || '';
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname === '' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.');
}

/**
 * Check connection state with caching to avoid spamming
 * @param {'tauri'|'fastify'} backend - Backend to check
 * @returns {Promise<boolean>} - true if online
 */
export async function checkConnection(backend) {
    const state = _connectionState[backend];
    const now = Date.now();

    // TAURI: Check if we're in Tauri environment OR on localhost (dev mode)
    // In dev mode, we might want to test cross-server from browser
    if (backend === 'tauri') {
        if (isInTauri()) {
            // In Tauri app, assume Tauri server is available
            state.online = true;
            state.lastCheck = now;
            return true;
        } else if (isLocalDev()) {
            // On localhost - try to ping Tauri server (might be running for dev)
            // Use cached state if recently checked
            const cacheMultiplier = Math.min(state.failCount + 1, 6);
            const effectiveCacheDuration = CONFIG.OFFLINE_CACHE_DURATION * cacheMultiplier;
            if (state.lastCheck && (now - state.lastCheck < effectiveCacheDuration)) {
                return state.online;
            }
            const isOnline = await silentPing(CONFIG.TAURI_BASE_URL);
            state.online = isOnline;
            state.lastCheck = now;
            state.failCount = isOnline ? 0 : state.failCount + 1;
            return isOnline;
        } else {
            // Not in Tauri and not on localhost - don't try to ping
            state.online = false;
            state.lastCheck = now;
            return false;
        }
    }

    // FASTIFY: Only check if on localhost
    if (backend === 'fastify' && !isLocalDev()) {
        state.online = false;
        state.lastCheck = now;
        return false;
    }

    // Use cached state if recently checked
    if (state.lastCheck && (now - state.lastCheck < CONFIG.OFFLINE_CACHE_DURATION)) {
        return state.online;
    }

    // If we've failed multiple times, extend cache duration
    const cacheMultiplier = Math.min(state.failCount + 1, 6); // Max 60 seconds cache
    const effectiveCacheDuration = CONFIG.OFFLINE_CACHE_DURATION * cacheMultiplier;

    if (state.lastCheck && (now - state.lastCheck < effectiveCacheDuration)) {
        return state.online;
    }

    // Perform silent ping (only for Fastify at this point)
    const baseUrl = CONFIG.FASTIFY_BASE_URL;
    const isOnline = await silentPing(baseUrl);

    // Update state
    state.online = isOnline;
    state.lastCheck = now;
    state.failCount = isOnline ? 0 : state.failCount + 1;

    return isOnline;
}

/**
 * Reset connection state (call when network changes)
 */
export function resetConnectionState() {
    _connectionState.tauri = { online: null, lastCheck: 0, failCount: 0 };
    _connectionState.fastify = { online: null, lastCheck: 0, failCount: 0 };
}

/**
 * Get current connection state (synchronous, uses cache)
 * @returns {{tauri: boolean|null, fastify: boolean|null}}
 */
export function getConnectionState() {
    return {
        tauri: _connectionState.tauri.online,
        fastify: _connectionState.fastify.online
    };
}

// ============================================
// BACKEND AVAILABILITY CACHE (Singleton)
// ============================================

const _backendState = {
    tauri: null,
    fastify: null,
    lastCheck: 0
};

/**
 * Check which backends are available (cached)
 * Uses silent ping to avoid console errors
 * @param {boolean} force - Force recheck even if recently checked
 * @returns {Promise<{tauri: boolean, fastify: boolean}>}
 */
export async function checkBackends(force = false) {
    const now = Date.now();
    if (!force && _backendState.lastCheck && (now - _backendState.lastCheck < CONFIG.CHECK_INTERVAL)) {
        return { tauri: _backendState.tauri, fastify: _backendState.fastify };
    }

    const [tauri, fastify] = await Promise.all([
        checkConnection('tauri'),
        checkConnection('fastify')
    ]);

    _backendState.tauri = tauri;
    _backendState.fastify = fastify;
    _backendState.lastCheck = now;

    return { tauri, fastify };
}

/**
 * Check if a server is available (uses silent ping)
 * @param {string} baseUrl - Server base URL
 * @returns {Promise<boolean>}
 */
export async function checkServerAvailable(baseUrl) {
    return silentPing(baseUrl);
}

// ============================================
// UUID GENERATION
// ============================================

/**
 * Generate a valid UUID v4
 * Compatible with both SQLite and PostgreSQL
 * @returns {string} UUID string
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback: generate UUID v4 manually
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a client ID for WebSocket connections
 * @returns {string} Client ID
 */
export function generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// TOKEN MANAGEMENT
// ============================================

/**
 * Get token from localStorage
 * @param {string} key - Storage key
 * @returns {string|null}
 */
export function getToken(key) {
    if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
    }
    return null;
}

/**
 * Store token in localStorage
 * @param {string} key - Storage key
 * @param {string} token - Token value
 */
export function setToken(key, token) {
    if (typeof localStorage !== 'undefined' && token) {
        localStorage.setItem(key, token);
    }
}

/**
 * Remove token from localStorage
 * @param {string} key - Storage key
 */
export function clearToken(key) {
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
    }
}

// ============================================
// HTTP REQUEST FACTORY
// ============================================

/**
 * Create a request function for a specific backend
 * Silent mode: checks connection before sending requests to avoid console errors
 * @param {string} baseUrl - Backend base URL
 * @param {string} tokenKey - LocalStorage key for auth token
 * @param {Object} options - Additional options
 * @returns {Function} Request function
 */
export function createRequest(baseUrl, tokenKey, options = {}) {
    // Determine which backend this is for connection checking
    const backendType = baseUrl.includes(':3000') ? 'tauri' : 'fastify';

    return async function request(endpoint, reqOptions = {}) {
        // Silent connection check before making request
        // Skip check for skipConnectionCheck option (used internally)
        if (!reqOptions.skipConnectionCheck) {
            const isOnline = await checkConnection(backendType);
            if (!isOnline) {
                return {
                    ok: false,
                    success: false,
                    error: 'Server unreachable',
                    status: 0,
                    offline: true
                };
            }
        }

        const url = `${baseUrl}${endpoint}`;
        const token = getToken(tokenKey);
        const wsClientId = getToken('squirrel_client_id');

        const headers = {
            'Content-Type': 'application/json',
            ...(reqOptions.headers || {}),
        };

        if (token && !reqOptions.skipAuth) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Include WebSocket client ID for deduplication
        if (wsClientId && options.includeClientId !== false) {
            headers['X-Client-Id'] = wsClientId;
        }

        const config = {
            ...reqOptions,
            headers,
        };

        if (reqOptions.body && typeof reqOptions.body === 'object') {
            config.body = JSON.stringify(reqOptions.body);
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            let data;
            try {
                data = await response.json();
            } catch {
                data = { success: response.ok };
            }

            // Store token if returned
            if (data.token) {
                setToken(tokenKey, data.token);
            }

            return {
                ok: response.ok,
                status: response.status,
                ...data
            };
        } catch (error) {
            // Update connection state on failure
            const state = _connectionState[backendType];
            if (state) {
                state.online = false;
                state.lastCheck = Date.now();
                state.failCount++;
            }

            return {
                ok: false,
                success: false,
                error: error.name === 'AbortError' ? 'Request timeout' : (error.message || 'Network error'),
                status: 0,
                offline: true
            };
        }
    };
}

// ============================================
// ADAPTER FACTORY
// ============================================

/**
 * Create a complete backend adapter
 * @param {Object} config - Adapter configuration
 * @param {string} config.baseUrl - Backend base URL
 * @param {string} config.tokenKey - LocalStorage key for auth token
 * @param {Object} config.authEndpoints - Auth endpoint mappings
 * @param {Object} config.syncEndpoints - Sync endpoint mappings (optional)
 * @returns {Object} Complete adapter
 */
export function createAdapter(config) {
    const { baseUrl, tokenKey, authEndpoints = {}, syncEndpoints = {} } = config;
    const request = createRequest(baseUrl, tokenKey);

    // Default auth endpoints (can be overridden)
    const defaultAuthEndpoints = {
        register: '/api/auth/register',
        login: '/api/auth/login',
        me: '/api/auth/me',
        changePassword: '/api/auth/change-password',
        deleteAccount: '/api/auth/delete-account',
        refresh: '/api/auth/refresh'
    };

    const authPaths = { ...defaultAuthEndpoints, ...authEndpoints };

    return {
        baseUrl,
        tokenKey,

        isAvailable: () => checkServerAvailable(baseUrl),
        getToken: () => getToken(tokenKey),
        setToken: (token) => setToken(tokenKey, token),
        clearToken: () => clearToken(tokenKey),
        request,

        auth: {
            async register(data) {
                return request(authPaths.register, {
                    method: 'POST',
                    body: data,
                    skipAuth: true
                });
            },
            async login(data) {
                return request(authPaths.login, {
                    method: 'POST',
                    body: data,
                    skipAuth: true
                });
            },
            async logout() {
                clearToken(tokenKey);
                return { ok: true, success: true };
            },
            async me() {
                return request(authPaths.me, { method: 'GET' });
            },
            async changePassword(data) {
                return request(authPaths.changePassword, {
                    method: 'POST',
                    body: data
                });
            },
            async deleteAccount(data) {
                return request(authPaths.deleteAccount, {
                    method: 'DELETE',
                    body: data
                });
            },
            async refreshToken() {
                return request(authPaths.refresh, { method: 'POST' });
            }
        },

        atome: {
            async create(data) {
                return request('/api/atome/create', {
                    method: 'POST',
                    body: data
                });
            },
            async get(id) {
                return request(`/api/atome/${id}`, { method: 'GET' });
            },
            async list(params = {}) {
                const query = new URLSearchParams();
                ['kind', 'type', 'page', 'limit', 'sortBy', 'sortOrder', 'parentId'].forEach(key => {
                    if (params[key]) query.append(key, params[key]);
                });
                const qs = query.toString();
                return request(`/api/atome/list${qs ? '?' + qs : ''}`, { method: 'GET' });
            },
            async alter(id, data) {
                return request(`/api/atome/${id}/alter`, {
                    method: 'POST',
                    body: data
                });
            },
            async update(id, data) {
                return request(`/api/atome/${id}`, {
                    method: 'PUT',
                    body: data
                });
            },
            async rename(id, data) {
                return request(`/api/atome/${id}/rename`, {
                    method: 'POST',
                    body: data
                });
            },
            async delete(id, data = {}) {
                return request(`/api/atome/${id}`, {
                    method: 'DELETE',
                    body: data
                });
            },
            async history(id, params = {}) {
                const query = new URLSearchParams();
                if (params.page) query.append('page', params.page);
                if (params.limit) query.append('limit', params.limit);
                const qs = query.toString();
                return request(`/api/atome/${id}/history${qs ? '?' + qs : ''}`, { method: 'GET' });
            },
            async restore(id, data) {
                return request(`/api/atome/${id}/restore`, {
                    method: 'POST',
                    body: data
                });
            }
        },

        userData: {
            async deleteAll(data) {
                return request('/api/user-data/delete-all', {
                    method: 'DELETE',
                    body: data
                });
            },
            async export(params = {}) {
                const query = new URLSearchParams();
                if (params.format) query.append('format', params.format);
                if (params.kinds) query.append('kinds', params.kinds.join(','));
                const qs = query.toString();
                return request(`/api/user-data/export${qs ? '?' + qs : ''}`, { method: 'GET' });
            }
        },

        sync: {
            async getPending() {
                const endpoint = syncEndpoints.getPending || '/api/atome/sync/pull';
                return request(endpoint, { method: 'GET' });
            },
            async push(data) {
                const endpoint = syncEndpoints.push || '/api/sync/push';
                return request(endpoint, {
                    method: 'POST',
                    body: data
                });
            },
            async pull(params = {}) {
                const endpoint = syncEndpoints.pull || '/api/sync/pull';
                const query = new URLSearchParams();
                if (params.since) query.append('since', params.since);
                const qs = query.toString();
                return request(`${endpoint}${qs ? '?' + qs : ''}`, { method: 'GET' });
            },
            async ack(data) {
                const endpoint = syncEndpoints.ack || '/api/atome/sync/ack';
                return request(endpoint, {
                    method: 'POST',
                    body: data
                });
            }
        }
    };
}

// ============================================
// PRE-BUILT ADAPTERS
// ============================================

/**
 * Tauri/Axum adapter (localhost:3000, SQLite)
 */
export const TauriAdapter = createAdapter({
    baseUrl: CONFIG.TAURI_BASE_URL,
    tokenKey: CONFIG.TAURI_TOKEN_KEY,
    authEndpoints: {
        register: '/api/auth/local/register',
        login: '/api/auth/local/login',
        me: '/api/auth/local/me',
        changePassword: '/api/auth/local/change-password',
        deleteAccount: '/api/auth/local/delete-account',
        refresh: '/api/auth/local/refresh'
    },
    syncEndpoints: {
        getPending: '/api/atome/sync/pull',
        push: '/api/atome/sync/push',
        ack: '/api/atome/sync/ack'
    }
});

/**
 * Fastify adapter (localhost:3001, PostgreSQL)
 */
export const FastifyAdapter = createAdapter({
    baseUrl: CONFIG.FASTIFY_BASE_URL,
    tokenKey: CONFIG.FASTIFY_TOKEN_KEY,
    authEndpoints: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        me: '/api/auth/me',
        changePassword: '/api/auth/change-password',
        deleteAccount: '/api/auth/delete-account',
        refresh: '/api/auth/refresh'
    },
    syncEndpoints: {
        getPending: '/api/sync/changes',
        push: '/api/sync/push',
        pull: '/api/sync/pull'
    }
});

export default {
    CONFIG,
    checkBackends,
    checkServerAvailable,
    generateUUID,
    generateClientId,
    getToken,
    setToken,
    clearToken,
    createRequest,
    createAdapter,
    TauriAdapter,
    FastifyAdapter
};
