/**
 * UnifiedSync.js
 *
 * Centralized, high-performance WebSocket API for real-time sync and sharing.
 *
 * Design goals:
 * - WebSocket-first communications for sync + sharing.
 * - Offline-first queue with deterministic replay.
 * - Bidirectional sync (Fastify ↔ Tauri) without fallbacks.
 * - Property-level sharing controls and secure direct messaging.
 * - Minimal footprint (single module) with compatibility shims.
 *
 * This module intentionally replaces legacy sync and command modules.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULTS = {
    realtime: {
        heartbeatMs: 30000,
        reconnectBaseMs: 1000,
        reconnectMaxMs: 30000
    },
    rpc: {
        requestTimeoutMs: 15000,
        queueMax: 200,
        queueMaxAgeMs: 5 * 60 * 1000
    },
    auth: {
        authTimeoutMs: 8000
    }
};

const STORAGE_KEYS = {
    clientId: 'squirrel_client_id',
    queue: 'squirrel_sync_queue_v2'
};

// =============================================================================
// UTILITIES
// =============================================================================

const nowIso = () => new Date().toISOString();

const safeJsonParse = (value) => {
    try {
        return JSON.parse(value);
    } catch (_) {
        return null;
    }
};

const getClientId = () => {
    try {
        const cached = localStorage.getItem(STORAGE_KEYS.clientId);
        if (cached) return cached;
        const next = `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem(STORAGE_KEYS.clientId, next);
        return next;
    } catch (_) {
        return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
};

const detectRuntime = () => {
    if (typeof window === 'undefined') return 'unknown';
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return 'tauri';
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return 'electron';
    return 'browser';
};

const isLocalHostname = (hostname) => hostname === '127.0.0.1' || hostname === 'localhost';

const resolveFastifyHttpBase = () => {
    if (typeof window === 'undefined') return '';
    const explicit = typeof window.__SQUIRREL_FASTIFY_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
    return explicit ? explicit.replace(/\/$/, '') : '';
};

const resolveFastifyWsSyncUrl = () => {
    if (typeof window === 'undefined') return '';

    const explicit = typeof window.__SQUIRREL_FASTIFY_WS_SYNC_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_WS_SYNC_URL__.trim()
        : '';
    if (explicit) return explicit;

    const base = resolveFastifyHttpBase();
    if (!base) return '';

    return base
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/sync';
};

const resolveFastifyWsApiUrl = () => {
    if (typeof window === 'undefined') return '';

    const explicit = typeof window.__SQUIRREL_FASTIFY_WS_API_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_WS_API_URL__.trim()
        : '';
    if (explicit) return explicit;

    const base = resolveFastifyHttpBase();
    if (!base) return '';

    return base
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/api';
};

const resolveTauriWsApiUrl = () => {
    if (typeof window === 'undefined') return '';
    if (!(window.__TAURI__ || window.__TAURI_INTERNALS__)) return '';

    const port = window.__ATOME_LOCAL_HTTP_PORT__ || window.ATOME_LOCAL_HTTP_PORT;
    if (!port) return '';
    return `ws://127.0.0.1:${port}/ws/api`;
};

const getFastifyToken = () => {
    try {
        return localStorage.getItem('cloud_auth_token') || '';
    } catch (_) {
        return '';
    }
};

const getTauriToken = () => {
    try {
        return localStorage.getItem('local_auth_token') || '';
    } catch (_) {
        return '';
    }
};

const getCurrentUserId = () => {
    try {
        if (window.AdoleAPI?.auth?.getCurrentInfo) {
            const info = window.AdoleAPI.auth.getCurrentInfo();
            return info?.user_id || info?.atome_id || info?.id || null;
        }
    } catch (_) { }
    return null;
};

const readQueue = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.queue);
        const parsed = safeJsonParse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
};

const writeQueue = (queue) => {
    try {
        localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(queue));
    } catch (_) { }
};

// =============================================================================
// GENERIC WEBSOCKET CLIENT
// =============================================================================

class WsClient {
    constructor(options = {}) {
        this.purpose = options.purpose || 'generic';
        this.resolveUrl = typeof options.resolveUrl === 'function' ? options.resolveUrl : () => options.url || '';
        this.heartbeatMs = options.heartbeatMs || DEFAULTS.realtime.heartbeatMs;
        this.reconnectBaseMs = options.reconnectBaseMs || DEFAULTS.realtime.reconnectBaseMs;
        this.reconnectMaxMs = options.reconnectMaxMs || DEFAULTS.realtime.reconnectMaxMs;
        this.requestTimeoutMs = options.requestTimeoutMs || DEFAULTS.rpc.requestTimeoutMs;
        this.queueMax = options.queueMax || DEFAULTS.rpc.queueMax;
        this.queueMaxAgeMs = options.queueMaxAgeMs || DEFAULTS.rpc.queueMaxAgeMs;

        this.socket = null;
        this.state = {
            connected: false,
            connecting: false,
            endpoint: null,
            lastError: null,
            reconnectDelayMs: this.reconnectBaseMs
        };

        this.listeners = new Set();
        this.pending = new Map();
        this.queue = [];
        this.heartbeatTimer = null;
        this.reconnectTimer = null;
    }

    getState() {
        return { ...this.state };
    }

    connect() {
        if (this.state.connecting || this.state.connected) return;

        const url = this.resolveUrl();
        this.state.endpoint = url;

        if (!url) {
            this.state.lastError = 'missing-endpoint';
            this.scheduleReconnect();
            return;
        }

        this.state.connecting = true;
        try {
            this.socket = new WebSocket(url);
        } catch (error) {
            this.state.connecting = false;
            this.state.lastError = error?.message || 'connection-failed';
            this.scheduleReconnect();
            return;
        }

        this.socket.addEventListener('open', () => this.onOpen());
        this.socket.addEventListener('message', (event) => this.onMessage(event));
        this.socket.addEventListener('close', (event) => this.onClose(event));
        this.socket.addEventListener('error', () => this.onError());
    }

    disconnect(reason = 'client') {
        this.stopHeartbeat();
        this.clearReconnectTimer();
        if (this.socket) {
            try {
                this.socket.close(1000, reason);
            } catch (_) { }
        }
        this.socket = null;
        this.state.connected = false;
        this.state.connecting = false;
    }

    onOpen() {
        this.state.connected = true;
        this.state.connecting = false;
        this.state.lastError = null;
        this.state.reconnectDelayMs = this.reconnectBaseMs;
        this.startHeartbeat();
        this.flushQueue();
        this.emit({ type: 'connected', endpoint: this.state.endpoint });
    }

    onClose(event) {
        const wasConnected = this.state.connected;
        this.state.connected = false;
        this.state.connecting = false;
        if (wasConnected) {
            this.emit({ type: 'disconnected', code: event?.code, reason: event?.reason || 'closed' });
        }
        this.stopHeartbeat();
        this.scheduleReconnect();
    }

    onError() {
        this.state.lastError = 'socket-error';
        this.stopHeartbeat();
        this.scheduleReconnect();
    }

    startHeartbeat() {
        this.stopHeartbeat();
        if (!this.heartbeatMs) return;
        this.heartbeatTimer = setInterval(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            try {
                this.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (_) { }
        }, this.heartbeatMs);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delay = Math.min(this.state.reconnectDelayMs, this.reconnectMaxMs);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.state.reconnectDelayMs = Math.min(delay * 1.8, this.reconnectMaxMs);
            this.connect();
        }, delay);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    onMessage(event) {
        const payload = safeJsonParse(event?.data);
        if (!payload) return;

        const responseId = payload.requestId || payload.id || payload.request_id || null;
        if (responseId && this.pending.has(responseId)) {
            const entry = this.pending.get(responseId);
            if (entry) {
                clearTimeout(entry.timeoutId);
                this.pending.delete(responseId);
                if (payload.success === false || payload.error) {
                    entry.reject(new Error(payload.error || 'request-failed'));
                } else {
                    entry.resolve(payload);
                }
                return;
            }
        }

        this.emit(payload);
    }

    emit(payload) {
        for (const listener of this.listeners) {
            try {
                listener(payload);
            } catch (_) { }
        }
    }

    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }
        return () => this.listeners.delete(listener);
    }

    send(payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        try {
            this.socket.send(JSON.stringify(payload));
            return true;
        } catch (_) {
            return false;
        }
    }

    request(payload, options = {}) {
        const requestId = payload.requestId || payload.request_id || payload.id || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const timeoutMs = options.timeoutMs || this.requestTimeoutMs;
        const fullPayload = { ...payload, requestId };

        if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
            return this.sendRequest(fullPayload, requestId, timeoutMs);
        }

        return this.queueRequest(fullPayload, requestId, timeoutMs);
    }

    sendRequest(payload, requestId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error('request-timeout'));
            }, timeoutMs);

            this.pending.set(requestId, { resolve, reject, timeoutId });
            const ok = this.send(payload);
            if (!ok) {
                clearTimeout(timeoutId);
                this.pending.delete(requestId);
                reject(new Error('send-failed'));
            }
        });
    }

    queueRequest(payload, requestId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            this.queue = this.queue.filter((item) => now - item.queuedAt < this.queueMaxAgeMs);
            if (this.queue.length >= this.queueMax) {
                reject(new Error('queue-full'));
                return;
            }
            this.queue.push({ payload, requestId, timeoutMs, resolve, reject, queuedAt: now });
            this.connect();
        });
    }

    flushQueue() {
        if (!this.queue.length || !this.state.connected) return;
        const items = [...this.queue];
        this.queue = [];
        items.forEach((item) => {
            this.sendRequest(item.payload, item.requestId, item.timeoutMs)
                .then(item.resolve)
                .catch(item.reject);
        });
    }
}

// =============================================================================
// UNIFIED SYNC STATE
// =============================================================================

const runtime = detectRuntime();
const clientId = getClientId();

const realtimeSocket = new WsClient({
    purpose: 'realtime',
    resolveUrl: resolveFastifyWsSyncUrl,
    heartbeatMs: DEFAULTS.realtime.heartbeatMs,
    reconnectBaseMs: DEFAULTS.realtime.reconnectBaseMs,
    reconnectMaxMs: DEFAULTS.realtime.reconnectMaxMs
});

const fastifyApiSocket = new WsClient({
    purpose: 'fastify-api',
    resolveUrl: resolveFastifyWsApiUrl,
    heartbeatMs: DEFAULTS.realtime.heartbeatMs,
    reconnectBaseMs: DEFAULTS.realtime.reconnectBaseMs,
    reconnectMaxMs: DEFAULTS.realtime.reconnectMaxMs,
    requestTimeoutMs: DEFAULTS.rpc.requestTimeoutMs
});

const tauriApiSocket = new WsClient({
    purpose: 'tauri-api',
    resolveUrl: resolveTauriWsApiUrl,
    heartbeatMs: DEFAULTS.realtime.heartbeatMs,
    reconnectBaseMs: DEFAULTS.realtime.reconnectBaseMs,
    reconnectMaxMs: DEFAULTS.realtime.reconnectMaxMs,
    requestTimeoutMs: DEFAULTS.rpc.requestTimeoutMs
});

const syncQueue = readQueue();

const realtimeState = {
    connected: false,
    serverAvailable: null
};

const realtimeListeners = new Map();

// =============================================================================
// REAL-TIME SYNC API
// =============================================================================

const connectRealtime = async (options = {}) => {
    const onPayload = (payload) => {
        if (!payload || !payload.type) return;

        // Forward to external listeners
        const listeners = realtimeListeners.get(payload.type) || [];
        listeners.forEach((fn) => {
            try { fn(payload); } catch (_) { }
        });

        if (options.onAtomeCreated && payload.type === 'atome:created') {
            options.onAtomeCreated(payload);
        }
        if (options.onAtomeUpdated && payload.type === 'atome:updated') {
            options.onAtomeUpdated(payload);
        }
        if (options.onAtomeAltered && payload.type === 'atome:altered') {
            options.onAtomeAltered(payload);
        }
        if (options.onAtomeDeleted && payload.type === 'atome:deleted') {
            options.onAtomeDeleted(payload);
        }
    };

    const onConnected = () => {
        realtimeState.connected = true;
        realtimeState.serverAvailable = true;
        realtimeSocket.send({
            type: 'register',
            clientId,
            clientType: runtime,
            timestamp: nowIso()
        });

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('squirrel:sync-connected', {
                detail: { endpoint: realtimeSocket.getState().endpoint, runtime }
            }));
        }

        if (typeof options.onConnected === 'function') {
            options.onConnected({ clientId });
        }
    };

    const onDisconnected = (payload) => {
        realtimeState.connected = false;
        if (typeof options.onDisconnected === 'function') {
            options.onDisconnected(payload);
        }
    };

    realtimeSocket.subscribe((payload) => {
        if (payload?.type === 'connected') onConnected();
        if (payload?.type === 'disconnected') onDisconnected(payload);
        onPayload(payload);
    });

    realtimeSocket.connect();
    return true;
};

const disconnectRealtime = () => {
    realtimeSocket.disconnect('client');
    realtimeState.connected = false;
};

const isRealtimeConnected = () => realtimeSocket.getState().connected;

const getRealtimeState = () => ({
    ...realtimeSocket.getState(),
    serverAvailable: realtimeState.serverAvailable
});

const requestRealtimeSync = () => realtimeSocket.send({ type: 'sync_request', timestamp: Date.now() });

const onRealtime = (eventType, callback) => {
    if (!realtimeListeners.has(eventType)) {
        realtimeListeners.set(eventType, []);
    }
    realtimeListeners.get(eventType).push(callback);
    return () => {
        const list = realtimeListeners.get(eventType) || [];
        realtimeListeners.set(eventType, list.filter((fn) => fn !== callback));
    };
};

// =============================================================================
// WS/API REQUESTS (FASTIFY + TAURI)
// =============================================================================

const requestApi = async (backend, payload, options = {}) => {
    const socket = backend === 'tauri' ? tauriApiSocket : fastifyApiSocket;

    const token = backend === 'tauri' ? getTauriToken() : getFastifyToken();
    const headers = {
        ...(payload.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const requestPayload = {
        ...payload,
        headers
    };

    return socket.request(requestPayload, options);
};

const apiRequest = (backend, method, path, body = null, headers = {}) => {
    return requestApi(backend, {
        type: 'api-request',
        id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        method,
        path,
        body,
        headers
    });
};

const atomeRequest = (backend, action, data = {}) => {
    return requestApi(backend, {
        type: 'atome',
        action,
        requestId: `atome_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        data
    });
};

const shareRequest = (backend, action, data = {}) => {
    return requestApi(backend, {
        type: 'share',
        action,
        requestId: `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...data
    });
};

// =============================================================================
// OFFLINE QUEUE
// =============================================================================

const enqueueOperation = (operation) => {
    const item = { id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...operation, queuedAt: nowIso() };
    syncQueue.push(item);
    writeQueue(syncQueue);
    return item;
};

const flushQueue = async (backend = 'fastify') => {
    if (!syncQueue.length) return { success: true, flushed: 0 };

    const remaining = [];
    let flushed = 0;

    for (const item of syncQueue) {
        try {
            if (item.type === 'share') {
                await shareRequest(backend, item.action, item.data || {});
                flushed += 1;
                continue;
            }
            if (item.type === 'atome') {
                await atomeRequest(backend, item.action, item.data || {});
                flushed += 1;
                continue;
            }
            if (item.type === 'api') {
                await apiRequest(backend, item.method, item.path, item.body, item.headers || {});
                flushed += 1;
                continue;
            }
        } catch (_) {
            remaining.push(item);
        }
    }

    syncQueue.length = 0;
    remaining.forEach((item) => syncQueue.push(item));
    writeQueue(syncQueue);

    return { success: true, flushed, remaining: remaining.length };
};

// =============================================================================
// COMMANDS (DIRECT MESSAGES)
// =============================================================================

const commandState = {
    active: false,
    currentUserId: null,
    authInFlight: false,
    allowedSenders: new Set(),
    handlers: new Map()
};

const onCommandMessage = (payload) => {
    if (!payload || payload.type !== 'console-message') return;
    const senderId = payload.from?.userId || payload.from?.user_id || null;
    if (commandState.allowedSenders.size && senderId && !commandState.allowedSenders.has(senderId)) return;

    const msgText = payload.message || '';
    const parsed = safeJsonParse(msgText);
    if (!parsed || typeof parsed.command !== 'string') return;

    const handler = commandState.handlers.get(parsed.command);
    if (!handler) return;

    try {
        handler(parsed.params || {}, payload.from || {});
    } catch (_) { }
};

const ensureCommandAuth = async (userId) => {
    if (commandState.authInFlight) return false;
    const token = getFastifyToken();
    if (!token) return false;

    commandState.authInFlight = true;
    const authPayload = {
        type: 'auth',
        action: 'me',
        requestId: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        token,
        registerAs: userId || commandState.currentUserId || undefined
    };

    try {
        const response = await fastifyApiSocket.request(authPayload, { timeoutMs: DEFAULTS.auth.authTimeoutMs });
        if (response?.success) {
            commandState.currentUserId = userId || response?.user?.user_id || response?.user?.id || commandState.currentUserId;
            commandState.authInFlight = false;
            return true;
        }
    } catch (_) { }

    commandState.authInFlight = false;
    return false;
};

const commands = {
    async start(userId) {
        fastifyApiSocket.subscribe(onCommandMessage);
        fastifyApiSocket.connect();
        const ok = await ensureCommandAuth(userId || getCurrentUserId());
        commandState.active = ok;
        return ok;
    },
    stop() {
        commandState.active = false;
    },
    isActive() {
        return commandState.active;
    },
    getCurrentUserId() {
        return commandState.currentUserId || getCurrentUserId();
    },
    setAllowedSenders(list = []) {
        commandState.allowedSenders = new Set(list);
    },
    register(name, handler) {
        if (typeof handler !== 'function') return false;
        commandState.handlers.set(name, handler);
        return true;
    },
    unregister(name) {
        commandState.handlers.delete(name);
    },
    async sendCommand(targetUserIdOrPhone, command, params = {}) {
        if (!commandState.active) {
            const ok = await commands.start(commandState.currentUserId || getCurrentUserId());
            if (!ok) return { success: false, error: 'commands-not-active' };
        }

        const message = JSON.stringify({ command, params });
        const payload = {
            type: 'direct-message',
            requestId: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            message
        };

        if (String(targetUserIdOrPhone || '').includes('+') || String(targetUserIdOrPhone || '').length >= 8) {
            payload.toPhone = String(targetUserIdOrPhone);
        } else {
            payload.toUserId = String(targetUserIdOrPhone);
        }

        try {
            const response = await fastifyApiSocket.request(payload, { timeoutMs: DEFAULTS.rpc.requestTimeoutMs });
            return { success: true, ...response };
        } catch (error) {
            return { success: false, error: error?.message || 'direct-message-failed' };
        }
    }
};

// Built-in handlers (safe subset)
const builtinHandlers = {
    registerAll() {
        commands.register('ping', () => { });
        commands.register('pong', () => { });
        commands.register('share-sync', (params) => {
            const atomeId = params?.atomeId || params?.atome_id || params?.id;
            const properties = params?.properties || params?.particles || params?.patch || null;
            if (!atomeId || !properties || typeof properties !== 'object') return;

            const candidates = [
                document.getElementById(`atome_${atomeId}`),
                document.getElementById(atomeId)
            ].filter(Boolean);

            candidates.forEach((el) => {
                Object.entries(properties).forEach(([key, value]) => {
                    if (key === 'text') {
                        el.textContent = String(value ?? '');
                        return;
                    }
                    if (key.startsWith('css.')) {
                        const cssKey = key.replace('css.', '');
                        el.style[cssKey] = typeof value === 'number' ? `${value}px` : String(value);
                    }
                });
            });
        });
        return true;
    },
    register(name) {
        return commands.register(name, () => { });
    }
};

commands.builtin = builtinHandlers;

// =============================================================================
// SHARE API
// =============================================================================

const share = {
    request(data) {
        return shareRequest('fastify', 'request', data);
    },
    respond(data) {
        return shareRequest('fastify', 'respond', data);
    },
    revoke(data) {
        return shareRequest('fastify', 'revoke', data);
    },
    myShares(data) {
        return shareRequest('fastify', 'my-shares', data);
    },
    sharedWithMe(data) {
        return shareRequest('fastify', 'shared-with-me', data);
    },
    accessible(data) {
        return shareRequest('fastify', 'accessible', data);
    },
    check(data) {
        return shareRequest('fastify', 'check', data);
    }
};

// =============================================================================
// UNIFIED API
// =============================================================================

const UnifiedSync = {
    init(options = {}) {
        if (typeof window !== 'undefined') {
            window.Squirrel = window.Squirrel || {};
            window.Squirrel.Sync = UnifiedSync;
            window.Squirrel.SyncEngine = {
                subscribe: (listener) => realtimeSocket.subscribe(listener),
                send: (payload) => realtimeSocket.send(payload),
                getState: () => getRealtimeState(),
                requestSync: () => requestRealtimeSync(),
                disconnect: () => disconnectRealtime(),
                retry: () => realtimeSocket.connect()
            };
            window.Squirrel.VersionSync = window.Squirrel.SyncEngine;
        }

        if (options.autoConnect !== false) {
            connectRealtime({});
        }
    },

    connectRealtime,
    disconnectRealtime,
    isRealtimeConnected,
    getRealtimeState,
    requestRealtimeSync,
    on: onRealtime,

    requestApi,
    apiRequest,
    atomeRequest,
    shareRequest,

    enqueueOperation,
    flushQueue,

    share,
    commands
};

export default UnifiedSync;
export { UnifiedSync };
