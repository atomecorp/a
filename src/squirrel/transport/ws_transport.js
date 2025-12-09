/**
 * ws_transport.js
 * 
 * Unified WebSocket Transport for all API calls.
 * Replaces HTTP fetch() for backend communication.
 * 
 * Benefits:
 * - No console errors when server is offline
 * - Lower latency (persistent connection)
 * - Automatic reconnection with request queuing
 * - Single connection per backend
 * 
 * Usage:
 *   const transport = WSTransport.getInstance('tauri'); // or 'fastify'
 *   const result = await transport.request('POST', '/api/auth/login', { phone, password });
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    tauri: {
        wsUrl: 'ws://127.0.0.1:3000/ws/api',
        httpBase: 'http://127.0.0.1:3000'
    },
    fastify: {
        wsUrl: 'ws://127.0.0.1:3001/ws/api',
        httpBase: 'http://127.0.0.1:3001'
    },
    CONNECT_TIMEOUT: 3000,
    REQUEST_TIMEOUT: 30000,
    RECONNECT_DELAY: 5000,
    MAX_RECONNECT_DELAY: 60000,
    HEARTBEAT_INTERVAL: 25000
};

// =============================================================================
// WEBSOCKET TRANSPORT CLASS
// =============================================================================

class WSTransport {
    static instances = {};

    /**
     * Get singleton instance for a backend
     * @param {string} backend - 'tauri' or 'fastify'
     * @returns {WSTransport}
     */
    static getInstance(backend) {
        if (!this.instances[backend]) {
            this.instances[backend] = new WSTransport(backend);
        }
        return this.instances[backend];
    }

    /**
     * Check if a backend is available (connected)
     * @param {string} backend - 'tauri' or 'fastify'
     * @returns {boolean}
     */
    static isAvailable(backend) {
        const instance = this.instances[backend];
        return instance ? instance.isConnected() : false;
    }

    constructor(backend) {
        this.backend = backend;
        this.config = CONFIG[backend];
        this.socket = null;
        this.state = {
            connected: false,
            connecting: false,
            available: null, // null = unknown, true = online, false = offline
            reconnectAttempts: 0
        };

        this.pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
        this.queuedRequests = []; // Requests made while disconnected
        this.requestId = 0;

        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.listeners = new Set();

        // DON'T auto-connect - wait for explicit connect() call or first request
        // This prevents WebSocket errors in console when server is unavailable
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /**
     * Make an API request via WebSocket
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE, PATCH)
     * @param {string} path - API path (e.g., '/api/auth/login')
     * @param {object} body - Request body (for POST/PUT/PATCH)
     * @param {object} headers - Additional headers
     * @returns {Promise<object>} Response data
     */
    async request(method, path, body = null, headers = {}) {
        const requestId = ++this.requestId;

        const message = {
            type: 'api-request',
            id: requestId,
            method: method.toUpperCase(),
            path,
            body,
            headers
        };

        // If connected, send immediately
        if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
            return this._sendRequest(message);
        }

        // If not connected, queue the request
        return new Promise((resolve, reject) => {
            this.queuedRequests.push({
                message,
                resolve,
                reject,
                timestamp: Date.now()
            });

            // Clean old requests (> 5 minutes)
            const cutoff = Date.now() - 300000;
            this.queuedRequests = this.queuedRequests.filter(r => r.timestamp > cutoff);

            // Try to connect if not already
            if (!this.state.connecting && !this.state.connected) {
                this.connect();
            }
        });
    }

    /**
     * Check if transport is connected
     * @returns {boolean}
     */
    isConnected() {
        return this.state.connected && this.socket?.readyState === WebSocket.OPEN;
    }

    /**
     * Check if backend is available (was ever connected or last attempt succeeded)
     * @returns {boolean|null} true = online, false = offline, null = unknown
     */
    isAvailable() {
        return this.state.available;
    }

    /**
     * Add event listener
     * @param {function} callback
     */
    addListener(callback) {
        this.listeners.add(callback);
    }

    /**
     * Remove event listener
     * @param {function} callback
     */
    removeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Force reconnection attempt
     */
    reconnect() {
        this.state.reconnectAttempts = 0;
        this.disconnect();
        this.connect();
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this._stopHeartbeat();
        this._clearReconnectTimer();

        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }

        this.state.connected = false;
        this.state.connecting = false;
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================

    connect() {
        if (this.state.connecting || this.state.connected) return;

        this.state.connecting = true;

        try {
            this.socket = new WebSocket(this.config.wsUrl);
        } catch (error) {
            this._handleConnectionError(error);
            return;
        }

        // Connection timeout
        const connectTimeout = setTimeout(() => {
            if (this.state.connecting) {
                this.socket?.close();
                this._handleConnectionError(new Error('Connection timeout'));
            }
        }, CONFIG.CONNECT_TIMEOUT);

        this.socket.onopen = () => {
            clearTimeout(connectTimeout);
            this._onOpen();
        };

        this.socket.onmessage = (event) => {
            this._onMessage(event);
        };

        this.socket.onclose = (event) => {
            clearTimeout(connectTimeout);
            this._onClose(event);
        };

        this.socket.onerror = () => {
            clearTimeout(connectTimeout);
            // Error is followed by close, so we handle it there
        };
    }

    _onOpen() {
        this.state.connected = true;
        this.state.connecting = false;
        this.state.available = true;
        this.state.reconnectAttempts = 0;

        console.log(`[WSTransport:${this.backend}] ✅ Connected`);

        this._startHeartbeat();
        this._broadcast({ type: 'connected', backend: this.backend });

        // Process queued requests
        this._processQueue();
    }

    _onClose(event) {
        const wasConnected = this.state.connected;
        this.state.connected = false;
        this.state.connecting = false;

        this._stopHeartbeat();

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();

        if (wasConnected) {
            console.log(`[WSTransport:${this.backend}] ❌ Disconnected (code: ${event.code})`);
            this._broadcast({ type: 'disconnected', backend: this.backend, code: event.code });
        }

        // Schedule reconnection
        this._scheduleReconnect();
    }

    _handleConnectionError(error) {
        this.state.connecting = false;
        this.state.available = false;
        this.state.reconnectAttempts++;

        // Don't log on first failure (silent mode)
        if (this.state.reconnectAttempts > 3) {
            console.log(`[WSTransport:${this.backend}] Server unavailable, retrying...`);
        }

        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        this._clearReconnectTimer();

        // Exponential backoff
        const delay = Math.min(
            CONFIG.RECONNECT_DELAY * Math.pow(1.5, this.state.reconnectAttempts),
            CONFIG.MAX_RECONNECT_DELAY
        );

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    _clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    // =========================================================================
    // MESSAGE HANDLING
    // =========================================================================

    _onMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        // Handle API response
        if (data.type === 'api-response' && data.id) {
            const pending = this.pendingRequests.get(data.id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(data.id);

                if (data.error) {
                    pending.reject(new Error(data.error));
                } else {
                    pending.resolve(data.response);
                }
            }
            return;
        }

        // Handle pong
        if (data.type === 'pong') {
            return;
        }

        // Broadcast other messages (sync events, etc.)
        this._broadcast(data);
    }

    _sendRequest(message) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(message.id);
                reject(new Error('Request timeout'));
            }, CONFIG.REQUEST_TIMEOUT);

            this.pendingRequests.set(message.id, { resolve, reject, timeout });

            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(message.id);
                reject(error);
            }
        });
    }

    _processQueue() {
        if (this.queuedRequests.length === 0) return;

        console.log(`[WSTransport:${this.backend}] 🔄 Processing ${this.queuedRequests.length} queued requests`);

        const requests = this.queuedRequests.slice();
        this.queuedRequests = [];

        for (const queued of requests) {
            this._sendRequest(queued.message)
                .then(queued.resolve)
                .catch(queued.reject);
        }
    }

    // =========================================================================
    // HEARTBEAT
    // =========================================================================

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, CONFIG.HEARTBEAT_INTERVAL);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // =========================================================================
    // EVENT BROADCASTING
    // =========================================================================

    _broadcast(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[WSTransport] Listener error:', e);
            }
        }
    }
}

// =============================================================================
// UNIFIED API HELPER
// =============================================================================

/**
 * Helper function to make API calls via WebSocket transport
 * Automatically selects the right backend based on current environment
 */
async function wsRequest(backend, method, path, body = null, headers = {}) {
    const transport = WSTransport.getInstance(backend);
    return transport.request(method, path, body, headers);
}

/**
 * Helper to check if a backend is available
 */
function isBackendAvailable(backend) {
    return WSTransport.isAvailable(backend);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { WSTransport, wsRequest, isBackendAvailable, CONFIG as WS_CONFIG };

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
    window.WSTransport = WSTransport;
    window.wsRequest = wsRequest;
    window.isBackendAvailable = isBackendAvailable;
}
