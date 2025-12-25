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
    FASTIFY_BASE_URL: null,
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

function getTauriHttpBaseUrl() {
    if (typeof window === 'undefined') return CONFIG.TAURI_BASE_URL;

    const port = window.__ATOME_LOCAL_HTTP_PORT__;
    if (port) return `http://127.0.0.1:${port}`;

    return CONFIG.TAURI_BASE_URL;
}

function getTauriWsUrl() {
    const httpBase = getTauriHttpBaseUrl();
    return httpBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/api';
}

function getFastifyHttpBaseUrl() {
    if (typeof window === 'undefined') return null;

    const custom = window.__SQUIRREL_FASTIFY_URL__;
    if (typeof custom === 'string' && custom.trim()) {
        return custom.trim().replace(/\/$/, '');
    }

    const loc = window.location;
    if (loc && loc.hostname && loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') {
        return loc.origin;
    }

    return null;
}

function getFastifyWsApiUrl() {
    if (typeof window === 'undefined') return null;

    const explicit = window.__SQUIRREL_FASTIFY_WS_API_URL__;
    if (typeof explicit === 'string' && explicit.trim()) {
        return explicit.trim();
    }

    const httpBase = getFastifyHttpBaseUrl();
    if (!httpBase) return null;
    return httpBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws/api';
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

    // TAURI: Only consider Tauri available inside a real Tauri runtime.
    // Browser/production must never assume localhost Tauri exists.
    if (backend === 'tauri') {
        if (isInTauri()) {
            // In Tauri app, assume Tauri server is available
            state.online = true;
            state.lastCheck = now;
            return true;
        } else {
            // Not in Tauri: don't try to ping/connect
            state.online = false;
            state.lastCheck = now;
            return false;
        }
    }

    // FASTIFY: allow same-origin production OR configured URL; avoid localhost assumptions
    if (backend === 'fastify' && !getFastifyHttpBaseUrl()) {
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
    const baseUrl = getFastifyHttpBaseUrl();
    if (!baseUrl) {
        state.online = false;
        state.lastCheck = now;
        return false;
    }
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
// WEBSOCKET ADAPTER FACTORY (ADOLE v3.0)
// ============================================

/**
 * WebSocket connection manager for Tauri
 * Single connection shared across all requests
 */
class TauriWebSocket {
    constructor(url) {
        this.url = url;
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.pendingRequests = new Map();
        this.requestCounter = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
    }

    connect() {
        return new Promise((resolve) => {
            if (this.isConnected) {
                resolve(true);
                return;
            }
            if (this.isConnecting) {
                // Wait for existing connection attempt
                const checkInterval = setInterval(() => {
                    if (this.isConnected) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(false);
                }, 5000);
                return;
            }

            this.isConnecting = true;

            try {
                this.socket = new WebSocket(this.url);

                this.socket.onopen = () => {
                    this.isConnecting = false;
                    this.isConnected = true;
                    this.startPing();
                    resolve(true);
                };

                this.socket.onclose = () => {
                    // Don't trigger handleDisconnect on normal close
                    // Only schedule silent reconnect
                    this.isConnected = false;
                    this.isConnecting = false;
                    this.stopPing();
                    resolve(false);
                };

                this.socket.onerror = () => {
                    // Silent - don't call handleDisconnect to avoid cascading reconnects
                    this.isConnecting = false;
                    resolve(false);
                };

                this.socket.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                // Timeout connection attempt
                setTimeout(() => {
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        resolve(false);
                    }
                }, 3000);

            } catch (e) {
                this.isConnecting = false;
                resolve(false);
            }
        });
    }

    handleDisconnect() {
        this.isConnected = false;
        this.isConnecting = false;
        this.stopPing();

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject({ ok: false, success: false, error: 'Connection lost', offline: true });
        }
        this.pendingRequests.clear();

        // Schedule silent reconnect (no logging, no error on failure)
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.silentConnect();
            }, 5000);
        }
    }

    // Silent connect - no error logging on failure
    silentConnect() {
        if (this.isConnected || this.isConnecting) return;
        this.isConnecting = true;

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                this.isConnecting = false;
                this.isConnected = true;
                this.startPing();
                console.log('[TauriWS] ✅ Reconnected');
            };

            this.socket.onclose = () => {
                this.isConnecting = false;
                this.isConnected = false;
                this.stopPing();
                // Silent retry after delay
                if (!this.reconnectTimer) {
                    this.reconnectTimer = setTimeout(() => {
                        this.reconnectTimer = null;
                        this.silentConnect();
                    }, 10000);
                }
            };

            this.socket.onerror = () => {
                // Silent - no error logging for reconnect attempts
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            setTimeout(() => {
                if (this.isConnecting) {
                    this.isConnecting = false;
                }
            }, 3000);

        } catch (e) {
            this.isConnecting = false;
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            // Handle pong
            if (message.type === 'pong') return;

            // Handle server-pushed console-only messages
            if (message.type === 'console-message') {
                const from = message.from?.phone || message.from?.userId || 'unknown';

                // Some console-messages are actually RemoteCommands encoded as JSON (e.g. share-sync realtime).
                // In browser Fastify runtimes, the ws/api adapter receives these messages; dispatch them here so
                // realtime collaboration works Fastify->Fastify without requiring a page refresh.
                try {
                    const text = message.message;
                    if (typeof text === 'string' && text.trim().startsWith('{')) {
                        const cmd = JSON.parse(text);
                        if (cmd && typeof cmd.command === 'string') {
                            const commandName = cmd.command;
                            const params = cmd.params || {};

                            const senderInfo = {
                                userId: message.from?.userId || message.from?.user_id || null,
                                phone: message.from?.phone || null,
                                username: message.from?.username || null,
                                timestamp: message.timestamp || null
                            };

                            const camel = String(commandName)
                                .replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());

                            const handler = (globalThis.BuiltinHandlers?.handlers?.[camel]) || null;
                            if (typeof handler === 'function') {
                                handler(params, senderInfo);
                                return;
                            }
                        }
                    }
                } catch (_) { }

                console.log('[Fastify Console Message]', { from, message: message.message, payload: message });
                return;
            }

            // Handle auth-response
            if (message.type === 'auth-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        user: message.user,
                        token: message.token,
                        userId: message.userId
                    });
                }
                return;
            }

            // Handle atome-response
            if (message.type === 'atome-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        // Server may reply with { atome } for create/get
                        atome: message.atome,
                        data: message.data ?? message.atome,
                        atomes: message.atomes,
                        count: message.count
                    });
                }
                return;
            }

            // Handle debug-response
            if (message.type === 'debug-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        tables: message.tables
                    });
                }
                return;
            }

            // Handle share-response (permissions system)
            if (message.type === 'share-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        data: message.data,
                        count: message.count,
                        atome_id: message.atome_id,
                        permission: message.permission,
                        granted: message.granted
                    });
                }
                return;
            }

            // Handle direct-message-response
            if (message.type === 'direct-message-response' && (message.request_id || message.requestId)) {
                const pending = this.pendingRequests.get(message.request_id || message.requestId);
                if (pending) {
                    this.pendingRequests.delete(message.request_id || message.requestId);
                    clearTimeout(pending.timeout);
                    pending.resolve({
                        ok: message.success,
                        success: message.success,
                        status: message.success ? 200 : 400,
                        error: message.error,
                        delivered: message.delivered
                    });
                }
                return;
            }

        } catch (e) {
            // Ignore parse errors
        }
    }

    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    async send(message) {
        const connected = await this.connect();
        if (!connected) {
            return { ok: false, success: false, error: 'Server unreachable', offline: true, status: 0 };
        }

        return new Promise((resolve, reject) => {
            const requestId = `ws_${++this.requestCounter}_${Date.now()}`;
            message.requestId = requestId;

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve({ ok: false, success: false, error: 'Request timeout', status: 0 });
            }, 10000);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

            try {
                this.socket.send(JSON.stringify(message));
            } catch (e) {
                this.pendingRequests.delete(requestId);
                clearTimeout(timeout);
                resolve({ ok: false, success: false, error: e.message, status: 0 });
            }
        });
    }

    async sendFireAndForget(message) {
        const connected = await this.connect();
        if (!connected) {
            return { ok: false, success: false, error: 'Server unreachable', offline: true, status: 0 };
        }

        try {
            this.socket.send(JSON.stringify(message));
            return { ok: true, success: true };
        } catch (e) {
            return { ok: false, success: false, error: e.message, status: 0 };
        }
    }

    async isAvailable() {
        if (this.isConnected) return true;
        return await this.connect();
    }
}

// Singleton WebSocket instances
let _tauriWs = null;
let _fastifyWs = null;

const _noTauriWs = {
    async connect() { return false; },
    async isAvailable() { return false; },
    async send() {
        return {
            ok: false,
            success: false,
            status: 0,
            offline: true,
            error: 'Tauri backend is not available in this runtime'
        };
    },
    async sendFireAndForget() {
        return {
            ok: false,
            success: false,
            status: 0,
            offline: true,
            error: 'Tauri backend is not available in this runtime'
        };
    }
};

const _noFastifyWs = {
    async connect() { return false; },
    async isAvailable() { return false; },
    async send() {
        return {
            ok: false,
            success: false,
            status: 0,
            offline: true,
            error: 'Fastify backend is not configured (missing Fastify WebSocket URL)'
        };
    },
    async sendFireAndForget() {
        return {
            ok: false,
            success: false,
            status: 0,
            offline: true,
            error: 'Fastify backend is not configured (missing Fastify WebSocket URL)'
        };
    }
};

function getTauriWs() {
    if (!isInTauri()) {
        return _noTauriWs;
    }

    if (!_tauriWs) {
        _tauriWs = new TauriWebSocket(getTauriWsUrl());
    }
    return _tauriWs;
}

function getFastifyWs() {
    const wsUrl = getFastifyWsApiUrl();
    if (!wsUrl) {
        return _noFastifyWs;
    }

    if (!_fastifyWs) {
        _fastifyWs = new TauriWebSocket(wsUrl);
    }

    return _fastifyWs;
}

/**
 * Create a WebSocket-based adapter (ADOLE v3.0)
 * @param {string} tokenKey - LocalStorage key for auth token
 * @param {string} backend - 'tauri' (port 3000) or 'fastify' (port 3001)
 */
export function createWebSocketAdapter(tokenKey, backend = 'tauri') {
    const resolvedBackend = backend || (isInTauri() ? 'tauri' : 'fastify');

    // IMPORTANT:
    // Do NOT capture the WebSocket instance at module load time.
    // In browser mode, server_config.json is loaded asynchronously and the Fastify WS URL
    // may not exist yet. If we capture a no-op WS too early, the adapter stays broken forever.
    const getWs = () => (resolvedBackend === 'fastify' ? getFastifyWs() : getTauriWs());
    const getBaseUrl = () => {
        if (resolvedBackend === 'fastify') {
            const wsApi = getFastifyWsApiUrl();
            return wsApi ? wsApi.replace(/\/ws\/api$/, '') : '';
        }
        return getTauriWsUrl().replace(/\/ws\/api$/, '');
    };

    return {
        get baseUrl() { return getBaseUrl(); },
        tokenKey,

        isAvailable: () => getWs().isAvailable(),
        getToken: () => getToken(tokenKey),
        setToken: (token) => setToken(tokenKey, token),
        clearToken: () => clearToken(tokenKey),

        auth: {
            async register(data) {
                const result = await getWs().send({
                    type: 'auth',
                    action: 'register',
                    username: data.username,
                    phone: data.phone,
                    password: data.password,
                    visibility: data.visibility || 'public' // 'public' (default) or 'private'
                });
                if (result.token) setToken(tokenKey, result.token);
                return result;
            },
            async login(data) {
                const result = await getWs().send({
                    type: 'auth',
                    action: 'login',
                    phone: data.phone,
                    password: data.password
                });
                if (result.token) setToken(tokenKey, result.token);
                return result;
            },
            async logout() {
                clearToken(tokenKey);
                await getWs().send({ type: 'auth', action: 'logout' });
                return { ok: true, success: true };
            },
            async me() {
                const token = getToken(tokenKey);
                return getWs().send({ type: 'auth', action: 'me', token });
            },
            async changePassword(data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'auth',
                    action: 'change-password',
                    token,
                    currentPassword: data.currentPassword,
                    newPassword: data.newPassword
                });
            },
            async deleteAccount(data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'auth',
                    action: 'delete',
                    token,
                    password: data.password
                });
            },
            async refreshToken() {
                return { ok: true, success: true }; // JWT doesn't need refresh for local
            },
            async lookupPhone(data) {
                const phone = data?.phone;
                return getWs().send({
                    type: 'auth',
                    action: 'lookup-phone',
                    phone
                });
            }
        },

        atome: {
            async create(data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'create',
                    token,
                    id: data.id,  // Allow specifying ID for sync operations
                    atomeId: data.id,  // Also send as atomeId for compatibility
                    userId: data.ownerId || 'anonymous',
                    atomeType: data.type || data.kind,
                    parentId: data.parentId || data.parent,
                    particles: data.particles || data
                });
            },
            async get(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'get',
                    token,
                    atomeId: id
                });
            },
            async list(params = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'list',
                    token,
                    atomeType: params.type || params.kind,
                    parentId: params.parentId || params.parent,
                    ownerId: params.owner_id || params.ownerId,
                    since: params.since || params.updatedSince || params.updated_since || null,
                    includeDeleted: params.includeDeleted || false,
                    limit: params.limit,
                    offset: params.offset || ((params.page || 0) * (params.limit || 50))
                });
            },
            async softDelete(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'soft-delete',
                    token,
                    atomeId: id
                });
            },
            async alter(id, data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'alter',
                    token,
                    atomeId: id,
                    particles: data
                });
            },
            async update(id, data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'update',
                    token,
                    atomeId: id,
                    particles: data
                });
            },

            // Broadcast-only realtime patch (no DB write)
            async realtime(atomeId, particles) {
                const token = getToken(tokenKey);
                const ws = getWs();
                const message = {
                    type: 'atome',
                    action: 'realtime',
                    token,
                    atomeId,
                    particles,
                    noReply: true
                };

                if (ws && typeof ws.sendFireAndForget === 'function') {
                    return ws.sendFireAndForget(message);
                }
                return ws.send(message);
            },
            async delete(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'delete',
                    token,
                    atomeId: id
                });
            },
            async history(id) {
                // Not implemented in WebSocket version yet
                return { ok: true, success: true, versions: [] };
            },
            async restore(id, data) {
                // Not implemented in WebSocket version yet
                return { ok: false, success: false, error: 'Not implemented' };
            }
        },

        share: {
            async request(data) {
                return getWs().send({
                    type: 'share',
                    action: 'request',
                    targetUserId: data.targetUserId || data.target_user_id || null,
                    targetPhone: data.targetPhone || data.target_phone || null,
                    atomeIds: data.atomeIds || data.atome_ids || [],
                    permissions: data.permissions || {},
                    mode: data.mode || 'real-time',
                    shareType: data.shareType || data.share_type || null,
                    propertyOverrides: data.propertyOverrides || data.property_overrides || {}
                });
            },
            async respond(data) {
                return getWs().send({
                    type: 'share',
                    action: 'respond',
                    status: data.status || data.decision || null,
                    requestAtomeId: data.requestAtomeId || data.request_atome_id || data.atome_id || null,
                    requestId: data.requestId || data.request_id || null,
                    policy: data.policy || null,
                    receiverProjectId: data.receiverProjectId || data.receiver_project_id || null
                });
            },
            async publish(data) {
                return getWs().send({
                    type: 'share',
                    action: 'publish',
                    requestAtomeId: data.requestAtomeId || data.request_atome_id || data.atome_id || null,
                    requestId: data.requestId || data.request_id || null
                });
            },
            async policy(data) {
                return getWs().send({
                    type: 'share',
                    action: 'policy',
                    peerUserId: data.peerUserId || data.peer_user_id || null,
                    policy: data.policy || null,
                    permissions: data.permissions || null
                });
            },
            async create(data) {
                // Permissions sharing is handled server-side; token auth binds ws identity.
                return getWs().send({
                    type: 'share',
                    action: 'create',
                    userId: data.userId || data.user_id,
                    atome_id: data.atomeId || data.atome_id,
                    principal_id: data.principalId || data.principal_id,
                    permission: data.permission,
                    particle_key: data.particleKey || data.particle_key || null,
                    expires_at: data.expiresAt || data.expires_at || null
                });
            },
            async revoke(data) {
                return getWs().send({
                    type: 'share',
                    action: 'revoke',
                    userId: data.userId || data.user_id,
                    permission_id: data.permissionId || data.permission_id
                });
            },
            async accessible(data = {}) {
                return getWs().send({
                    type: 'share',
                    action: 'accessible',
                    userId: data.userId || data.user_id,
                    atome_type: data.atomeType || data.atome_type || null
                });
            },
            async sharedWithMe() {
                return getWs().send({ type: 'share', action: 'shared-with-me' });
            },
            async myShares() {
                return getWs().send({ type: 'share', action: 'my-shares' });
            },
            async check(data) {
                return getWs().send({
                    type: 'share',
                    action: 'check',
                    userId: data.userId || data.user_id,
                    atome_id: data.atomeId || data.atome_id,
                    permission: data.permission || 'read'
                });
            }
        },

        userData: {
            async deleteAll() {
                return { ok: false, success: false, error: 'Not implemented' };
            },
            async export() {
                return { ok: false, success: false, error: 'Not implemented' };
            }
        },

        sync: {
            async getPending() {
                return { ok: true, success: true, changes: [] };
            },
            async push(data) {
                return { ok: true, success: true };
            },
            async pull() {
                return { ok: true, success: true, changes: [] };
            },
            async ack() {
                return { ok: true, success: true };
            }
        },

        debug: {
            async listTables() {
                return getWs().send({
                    type: 'debug',
                    action: 'list-tables'
                });
            }
        }
    };
}

// ============================================
// PRE-BUILT ADAPTERS
// ============================================

/**
 * Tauri/Axum adapter (localhost:3000, SQLite) - WebSocket-only
 * Uses createWebSocketAdapter for full ADOLE v3.0 compliance
 */
export const TauriAdapter = createWebSocketAdapter(CONFIG.TAURI_TOKEN_KEY, 'tauri');

/**
 * Fastify adapter (config-driven, WebSocket-only)
 * Uses createWebSocketAdapter for full ADOLE v3.0 compliance
 */
export const FastifyAdapter = createWebSocketAdapter(CONFIG.FASTIFY_TOKEN_KEY, 'fastify');

export default {
    CONFIG,
    checkBackends,
    checkServerAvailable,
    generateUUID,
    generateClientId,
    getToken,
    setToken,
    clearToken,
    createWebSocketAdapter,
    TauriAdapter,
    FastifyAdapter
};
