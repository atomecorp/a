/**
 * 🔌 WebSocket Transport Layer
 * 
 * Unified WebSocket transport for all backend communications.
 * Replaces HTTP fetch for API calls to avoid console errors when servers are offline.
 * 
 * Benefits:
 * - No console errors when server is unreachable
 * - Lower latency (persistent connection)
 * - Automatic reconnection
 * - Request queuing when offline
 */

// =============================================================================
// TRANSPORT CONFIGURATION
// =============================================================================

const WS_CONFIG = {
    TAURI_URL: 'ws://127.0.0.1:3000/ws/api',
    FASTIFY_URL: null,
    RECONNECT_INTERVAL: 5000,      // 5 seconds between reconnect attempts
    PING_INTERVAL: 30000,          // 30 seconds heartbeat
    REQUEST_TIMEOUT: 10000,        // 10 seconds request timeout
    MAX_QUEUE_SIZE: 100,           // Max pending requests
    MAX_QUEUE_AGE: 300000          // 5 minutes max age for queued requests
};

function isInTauriRuntime() {
    if (typeof window === 'undefined') return false;
    return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

function getTauriWsUrl() {
    if (!isInTauriRuntime()) return '';

    const port = window.__ATOME_LOCAL_HTTP_PORT__;
    if (port) return `ws://127.0.0.1:${port}/ws/api`;

    return WS_CONFIG.TAURI_URL;
}

function getFastifyWsUrl() {
    if (typeof window === 'undefined') return '';
    const explicit = window.__SQUIRREL_FASTIFY_WS_API_URL__;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

    const httpBase = window.__SQUIRREL_FASTIFY_URL__;
    if (typeof httpBase !== 'string' || !httpBase.trim()) return '';

    return httpBase
        .trim()
        .replace(/^https:/, 'wss:')
        .replace(/^http:/, 'ws:')
        .replace(/\/$/, '') + '/ws/api';
}

const _disabledTauriTransport = {
    name: 'tauri',
    get available() { return false; },
    connect() { },
    reconnect() { },
    disconnect() { },
    on() { return () => { }; },
    off() { },
    emit() { },
    async request() {
        throw new Error('Tauri backend is not available in this runtime');
    }
};

const _disabledFastifyTransport = {
    name: 'fastify',
    get available() { return false; },
    connect() { },
    reconnect() { },
    disconnect() { },
    on() { return () => { }; },
    off() { },
    emit() { },
    async request() {
        throw new Error('Fastify backend URL is not configured');
    }
};

// =============================================================================
// WEBSOCKET TRANSPORT CLASS
// =============================================================================

class WSTransport {
    constructor(name, wsUrl) {
        this.name = name;
        this.wsUrl = wsUrl;
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.pendingRequests = new Map();  // requestId -> {resolve, reject, timeout}
        this.requestQueue = [];             // Requests made while disconnected
        this.requestCounter = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.listeners = new Set();

        // DON'T auto-connect - prevents WebSocket errors in console
        // Connection will be established on first request
    }

    /**
     * Connect to WebSocket server (silent - no console errors)
     */
    connect() {
        if (this.isConnecting || this.isConnected) return;

        this.isConnecting = true;

        try {
            this.socket = new WebSocket(this.wsUrl);

            this.socket.onopen = () => {
                this.isConnecting = false;
                this.isConnected = true;
                this.stopReconnectTimer();
                this.startPingTimer();

                console.log(`[WSTransport:${this.name}] ✅ Connected`);

                // Process queued requests
                this.processQueue();

                // Notify listeners
                this.emit('connected');
            };

            this.socket.onclose = (event) => {
                this.handleDisconnect('closed', event.code);
            };

            this.socket.onerror = () => {
                // Don't log errors - this is silent
                this.handleDisconnect('error');
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

        } catch (e) {
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }

    /**
     * Handle disconnection (silent)
     */
    handleDisconnect(reason, code) {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isConnecting = false;
        this.stopPingTimer();

        if (wasConnected) {
            console.log(`[WSTransport:${this.name}] 🔌 Disconnected (${reason})`);
        }

        // Reject pending requests with timeout
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error(`Connection lost: ${reason}`));
        }
        this.pendingRequests.clear();

        // Notify listeners
        this.emit('disconnected', { reason, code });

        // Schedule reconnection
        this.scheduleReconnect();
    }

    /**
     * Handle incoming message
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);

            // Handle pong response
            if (message.type === 'pong') {
                return;
            }

            // Handle API response (format used by Fastify server)
            if (message.type === 'api-response' && message.id && this.pendingRequests.has(message.id)) {
                const pending = this.pendingRequests.get(message.id);
                this.pendingRequests.delete(message.id);
                clearTimeout(pending.timeout);

                if (message.error) {
                    pending.reject(new Error(message.error));
                } else if (message.response) {
                    // Convert server response to our format
                    pending.resolve({
                        status: message.response.status,
                        headers: message.response.headers,
                        data: message.response.body
                    });
                } else {
                    pending.resolve(message.data);
                }
                return;
            }

            // Handle legacy response format (requestId)
            if (message.requestId && this.pendingRequests.has(message.requestId)) {
                const pending = this.pendingRequests.get(message.requestId);
                this.pendingRequests.delete(message.requestId);
                clearTimeout(pending.timeout);

                if (message.error) {
                    pending.reject(new Error(message.error));
                } else {
                    pending.resolve(message.data);
                }
                return;
            }

            // Handle server push (events)
            if (message.event) {
                this.emit(message.event, message.data);
            }

            // Handle error messages
            if (message.type === 'error') {
                console.warn(`[WSTransport:${this.name}] Server error:`, message.message);
            }

        } catch (e) {
            // Ignore parse errors
        }
    }

    /**
     * Send a request and wait for response
     */
    request(method, path, body = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const requestId = `req_${++this.requestCounter}_${Date.now()}`;

            // Format compatible with Fastify's /ws/api handler
            const requestData = {
                type: 'api-request',
                id: requestId,
                method,
                path,
                body,
                headers
            };

            // If connected, send immediately
            if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
                this.sendRequest(requestId, requestData, resolve, reject);
            } else {
                // Queue the request
                this.queueRequest(requestId, requestData, resolve, reject);
            }
        });
    }

    /**
     * Send request over WebSocket
     */
    sendRequest(requestId, requestData, resolve, reject) {
        const timeout = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            reject(new Error('Request timeout'));
        }, WS_CONFIG.REQUEST_TIMEOUT);

        this.pendingRequests.set(requestId, { resolve, reject, timeout });

        try {
            this.socket.send(JSON.stringify(requestData));
        } catch (e) {
            this.pendingRequests.delete(requestId);
            clearTimeout(timeout);
            reject(e);
        }
    }

    /**
     * Queue request for when connection is restored
     */
    queueRequest(requestId, requestData, resolve, reject) {
        // Clean old requests
        const cutoff = Date.now() - WS_CONFIG.MAX_QUEUE_AGE;
        this.requestQueue = this.requestQueue.filter(r => r.timestamp > cutoff);

        // Check queue size
        if (this.requestQueue.length >= WS_CONFIG.MAX_QUEUE_SIZE) {
            reject(new Error('Request queue full'));
            return;
        }

        this.requestQueue.push({
            id: requestId,
            data: requestData,
            resolve,
            reject,
            timestamp: Date.now()
        });
    }

    /**
     * Process queued requests after reconnection
     */
    processQueue() {
        if (this.requestQueue.length === 0) return;

        console.log(`[WSTransport:${this.name}] 🔄 Processing ${this.requestQueue.length} queued requests`);

        const queue = this.requestQueue.slice();
        this.requestQueue = [];

        for (const item of queue) {
            this.sendRequest(item.id, item.data, item.resolve, item.reject);
        }
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer) return;

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, WS_CONFIG.RECONNECT_INTERVAL);
    }

    /**
     * Stop reconnection timer
     */
    stopReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Start ping/heartbeat timer
     */
    startPingTimer() {
        this.stopPingTimer();
        this.pingTimer = setInterval(() => {
            if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send(JSON.stringify({ type: 'ping' }));
                } catch (e) {
                    // Connection probably dead
                    this.handleDisconnect('ping_failed');
                }
            }
        }, WS_CONFIG.PING_INTERVAL);
    }

    /**
     * Stop ping timer
     */
    stopPingTimer() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        this.listeners.add({ event, callback });
        return () => this.off(event, callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        for (const listener of this.listeners) {
            if (listener.event === event && listener.callback === callback) {
                this.listeners.delete(listener);
                break;
            }
        }
    }

    /**
     * Emit event to listeners
     */
    emit(event, data) {
        for (const listener of this.listeners) {
            if (listener.event === event) {
                try {
                    listener.callback(data);
                } catch (e) {
                    // Ignore listener errors
                }
            }
        }
    }

    /**
     * Check if connected
     */
    get available() {
        return this.isConnected;
    }

    /**
     * Force reconnection
     */
    reconnect() {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (e) { }
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.stopReconnectTimer();
        this.connect();
    }

    /**
     * Disconnect permanently
     */
    disconnect() {
        this.stopReconnectTimer();
        this.stopPingTimer();
        if (this.socket) {
            try {
                this.socket.close();
            } catch (e) { }
        }
        this.isConnected = false;
        this.isConnecting = false;
    }
}

// =============================================================================
// TRANSPORT INSTANCES
// =============================================================================

let tauriTransport = null;
let fastifyTransport = null;

/**
 * Get Tauri WebSocket transport
 */
export function getTauriTransport() {
    if (!isInTauriRuntime()) {
        return _disabledTauriTransport;
    }

    if (!tauriTransport) {
        tauriTransport = new WSTransport('tauri', getTauriWsUrl());
    }
    return tauriTransport;
}

/**
 * Get Fastify WebSocket transport
 */
export function getFastifyTransport() {
    const wsUrl = getFastifyWsUrl();
    if (!wsUrl) {
        return _disabledFastifyTransport;
    }

    if (!fastifyTransport) {
        fastifyTransport = new WSTransport('fastify', wsUrl);
    }
    return fastifyTransport;
}

/**
 * Check if Tauri is available (via WebSocket)
 */
export function isTauriAvailable() {
    return tauriTransport?.available ?? false;
}

/**
 * Check if Fastify is available (via WebSocket)
 */
export function isFastifyAvailable() {
    return fastifyTransport?.available ?? false;
}

// =============================================================================
// HTTP-LIKE API (for easy migration from fetch)
// =============================================================================

/**
 * Make a request via WebSocket transport
 * API compatible with fetch pattern
 */
export async function wsRequest(backend, path, options = {}) {
    const transport = backend === 'tauri' ? getTauriTransport() : getFastifyTransport();

    const method = options.method || 'GET';
    const body = options.body ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body) : null;
    const headers = options.headers || {};

    try {
        const data = await transport.request(method, path, body, headers);

        // Return a Response-like object
        return {
            ok: true,
            status: 200,
            json: async () => data,
            text: async () => JSON.stringify(data),
            headers: new Headers()
        };
    } catch (error) {
        return {
            ok: false,
            status: error.message.includes('timeout') ? 408 : 503,
            json: async () => ({ error: error.message }),
            text: async () => error.message,
            headers: new Headers()
        };
    }
}

/**
 * Shorthand for Tauri requests
 */
export function tauriRequest(path, options = {}) {
    return wsRequest('tauri', path, options);
}

/**
 * Shorthand for Fastify requests
 */
export function fastifyRequest(path, options = {}) {
    return wsRequest('fastify', path, options);
}

// =============================================================================
// GLOBAL EXPOSURE (for non-module scripts)
// =============================================================================

if (typeof window !== 'undefined') {
    window._wsTransport = {
        getTauriTransport,
        getFastifyTransport,
        isTauriAvailable,
        isFastifyAvailable,
        wsRequest,
        tauriRequest,
        fastifyRequest
    };
}

export default {
    getTauriTransport,
    getFastifyTransport,
    isTauriAvailable,
    isFastifyAvailable,
    wsRequest,
    tauriRequest,
    fastifyRequest,
    WS_CONFIG
};
