/**
 * SyncWebSocket.js
 * 
 * WebSocket client for real-time synchronization between Tauri and Fastify
 * 
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Event-based architecture
 * - Bidirectional sync (push/receive)
 * - Connection state management
 * 
 * Events emitted:
 * - atome:created - When an atome is created
 * - atome:updated - When an atome is updated  
 * - atome:altered - When an atome is altered (ADOLE)
 * - atome:deleted - When an atome is deleted
 * - sync:connected - WebSocket connected
 * - sync:disconnected - WebSocket disconnected
 * - sync:error - Connection error
 * 
 * @module unified/SyncWebSocket
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    FASTIFY_WS_URL: 'ws://127.0.0.1:3001/ws/atome-sync',
    RECONNECT_INITIAL_DELAY: 1000,
    RECONNECT_MAX_DELAY: 30000,
    RECONNECT_MULTIPLIER: 2,
    HEARTBEAT_INTERVAL: 30000,
    MAX_RECONNECT_ATTEMPTS: 10
};

// ============================================
// STATE
// ============================================

let websocket = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let heartbeatInterval = null;
let isIntentionallyClosed = false;
let clientId = null;

// Event listeners
const eventListeners = new Map();

// ============================================
// HELPERS
// ============================================

function generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function emit(eventType, payload) {
    const listeners = eventListeners.get(eventType) || [];
    listeners.forEach(callback => {
        try {
            callback(payload);
        } catch (error) {
            console.error(`[SyncWebSocket] Error in listener for ${eventType}:`, error);
        }
    });

    // Also emit to wildcard listeners
    const wildcardListeners = eventListeners.get('*') || [];
    wildcardListeners.forEach(callback => {
        try {
            callback({ type: eventType, ...payload });
        } catch (error) {
            console.error(`[SyncWebSocket] Error in wildcard listener:`, error);
        }
    });
}

function getReconnectDelay() {
    const delay = Math.min(
        CONFIG.RECONNECT_INITIAL_DELAY * Math.pow(CONFIG.RECONNECT_MULTIPLIER, reconnectAttempts),
        CONFIG.RECONNECT_MAX_DELAY
    );
    return delay;
}

function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
    }, CONFIG.HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function handleMessage(event) {
    try {
        const message = JSON.parse(event.data);

        switch (message.type) {
            case 'welcome':
                clientId = message.clientId;
                console.log(`[SyncWebSocket] Connected as ${clientId}`);
                emit('sync:connected', { clientId, serverTime: message.timestamp });
                break;

            case 'pong':
                // Heartbeat response - connection is alive
                break;

            case 'atome:created':
                console.log('[SyncWebSocket] Received atome:created', message.atome?.id || message.atomeId);
                emit('atome:created', message);
                break;

            case 'atome:updated':
                console.log('[SyncWebSocket] Received atome:updated', message.atome?.id || message.atomeId);
                emit('atome:updated', message);
                break;

            case 'atome:altered':
                console.log('[SyncWebSocket] Received atome:altered', message.atome?.id || message.atomeId);
                emit('atome:altered', message);
                break;

            case 'atome:deleted':
                console.log('[SyncWebSocket] Received atome:deleted', message.atomeId);
                emit('atome:deleted', message);
                break;

            case 'atome:renamed':
                console.log('[SyncWebSocket] Received atome:renamed', message.atomeId);
                emit('atome:renamed', message);
                break;

            case 'atome:restored':
                console.log('[SyncWebSocket] Received atome:restored', message.atomeId);
                emit('atome:restored', message);
                break;

            case 'sync:broadcast':
                // Rebroadcast from another client
                emit(message.originalType, message.payload);
                break;

            case 'error':
                console.error('[SyncWebSocket] Server error:', message.message);
                emit('sync:error', { error: message.message });
                break;

            default:
                console.log('[SyncWebSocket] Unknown message type:', message.type);;
                emit('sync:message', message);
        }
    } catch (error) {
        console.error('[SyncWebSocket] Failed to parse message:', error);
    }
}

function scheduleReconnect() {
    if (isIntentionallyClosed) return;
    if (reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
        console.error('[SyncWebSocket] Max reconnection attempts reached');
        emit('sync:error', { error: 'Max reconnection attempts reached' });
        return;
    }

    const delay = getReconnectDelay();
    console.log(`[SyncWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimeout = setTimeout(() => {
        reconnectAttempts++;
        SyncWebSocket.connect();
    }, delay);
}

// ============================================
// SYNC WEBSOCKET API
// ============================================

const SyncWebSocket = {
    /**
     * Connect to the WebSocket server
     * 
     * @param {Object} options - Connection options
     * @param {string} [options.url] - Custom WebSocket URL
     * @param {string} [options.token] - Auth token to send
     * @returns {Promise<boolean>} Connection success
     * 
     * @example
     * await SyncWebSocket.connect();
     * // or with custom URL:
     * await SyncWebSocket.connect({ url: 'ws://custom:3001/ws/atome-sync' });
     */
    connect(options = {}) {
        return new Promise((resolve, reject) => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                console.log('[SyncWebSocket] Already connected');
                resolve(true);
                return;
            }

            isIntentionallyClosed = false;
            const url = options.url || CONFIG.FASTIFY_WS_URL;

            try {
                websocket = new WebSocket(url);

                websocket.onopen = () => {
                    console.log('[SyncWebSocket] Connection established');
                    reconnectAttempts = 0;
                    startHeartbeat();

                    // Send auth token if available
                    if (options.token) {
                        websocket.send(JSON.stringify({
                            type: 'auth',
                            token: options.token
                        }));
                    }

                    resolve(true);
                };

                websocket.onmessage = handleMessage;

                websocket.onclose = (event) => {
                    console.log(`[SyncWebSocket] Connection closed: ${event.code} ${event.reason}`);
                    stopHeartbeat();
                    emit('sync:disconnected', { code: event.code, reason: event.reason });

                    if (!isIntentionallyClosed) {
                        scheduleReconnect();
                    }
                };

                websocket.onerror = (error) => {
                    console.error('[SyncWebSocket] Connection error:', error);
                    emit('sync:error', { error: 'WebSocket connection error' });
                    reject(error);
                };

            } catch (error) {
                console.error('[SyncWebSocket] Failed to create WebSocket:', error);
                reject(error);
            }
        });
    },

    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        isIntentionallyClosed = true;

        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        stopHeartbeat();

        if (websocket) {
            websocket.close(1000, 'Client disconnect');
            websocket = null;
        }

        clientId = null;
        reconnectAttempts = 0;
        console.log('[SyncWebSocket] Disconnected');
    },

    /**
     * Check if WebSocket is connected
     * 
     * @returns {boolean} True if connected
     */
    isConnected() {
        return websocket && websocket.readyState === WebSocket.OPEN;
    },

    /**
     * Get connection state
     * 
     * @returns {Object} { connected, clientId, reconnectAttempts }
     */
    getState() {
        return {
            connected: this.isConnected(),
            clientId,
            reconnectAttempts,
            readyState: websocket?.readyState
        };
    },

    // ============================================
    // EVENT SUBSCRIPTION
    // ============================================

    /**
     * Subscribe to an event
     * 
     * @param {string} eventType - Event type to listen for
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     * 
     * @example
     * const unsubscribe = SyncWebSocket.on('atome:created', (data) => {
     *     console.log('New atome:', data.atome);
     * });
     * // Later: unsubscribe();
     */
    on(eventType, callback) {
        if (!eventListeners.has(eventType)) {
            eventListeners.set(eventType, []);
        }
        eventListeners.get(eventType).push(callback);

        // Return unsubscribe function
        return () => {
            const listeners = eventListeners.get(eventType);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    },

    /**
     * Unsubscribe from an event
     * 
     * @param {string} eventType - Event type
     * @param {Function} callback - Callback to remove
     */
    off(eventType, callback) {
        const listeners = eventListeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    },

    /**
     * Subscribe to all events (wildcard)
     * 
     * @param {Function} callback - Callback receiving { type, ...payload }
     * @returns {Function} Unsubscribe function
     */
    onAll(callback) {
        return this.on('*', callback);
    },

    // ============================================
    // BROADCASTING
    // ============================================

    /**
     * Broadcast an atome creation to all connected clients
     * 
     * @param {Object} atome - The created atome
     * 
     * @example
     * SyncWebSocket.broadcastCreate(newAtome);
     */
    broadcastCreate(atome) {
        if (!this.isConnected()) {
            console.warn('[SyncWebSocket] Cannot broadcast: not connected');
            return false;
        }

        websocket.send(JSON.stringify({
            type: 'atome:created',
            atome,
            clientId,
            timestamp: new Date().toISOString()
        }));
        return true;
    },

    /**
     * Broadcast an atome update to all connected clients
     * 
     * @param {Object} atome - The updated atome
     */
    broadcastUpdate(atome) {
        if (!this.isConnected()) {
            console.warn('[SyncWebSocket] Cannot broadcast: not connected');
            return false;
        }

        websocket.send(JSON.stringify({
            type: 'atome:updated',
            atome,
            clientId,
            timestamp: new Date().toISOString()
        }));
        return true;
    },

    /**
     * Broadcast an atome alteration (ADOLE) to all connected clients
     * 
     * @param {string} atomeId - The atome ID
     * @param {Object} alteration - The alteration applied
     * @param {Object} atome - The resulting atome
     */
    broadcastAlter(atomeId, alteration, atome) {
        if (!this.isConnected()) {
            console.warn('[SyncWebSocket] Cannot broadcast: not connected');
            return false;
        }

        websocket.send(JSON.stringify({
            type: 'atome:altered',
            atomeId,
            alteration,
            atome,
            clientId,
            timestamp: new Date().toISOString()
        }));
        return true;
    },

    /**
     * Broadcast an atome deletion to all connected clients
     * 
     * @param {string} atomeId - The deleted atome ID
     */
    broadcastDelete(atomeId) {
        if (!this.isConnected()) {
            console.warn('[SyncWebSocket] Cannot broadcast: not connected');
            return false;
        }

        websocket.send(JSON.stringify({
            type: 'atome:deleted',
            atomeId,
            clientId,
            timestamp: new Date().toISOString()
        }));
        return true;
    },

    /**
     * Send a raw message
     * 
     * @param {Object} message - Message to send
     * @returns {boolean} Send success
     */
    send(message) {
        if (!this.isConnected()) {
            console.warn('[SyncWebSocket] Cannot send: not connected');
            return false;
        }

        websocket.send(JSON.stringify(message));
        return true;
    }
};

export default SyncWebSocket;
