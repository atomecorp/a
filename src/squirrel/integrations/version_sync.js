/**
 * version_sync.js
 * 
 * Client-side WebSocket module for version synchronization with Fastify server.
 * Connects to /ws/sync to receive version updates and handle sync commands.
 * 
 * Features:
 * - Auto-connect to Fastify server on port 3001
 * - Receives version broadcasts from server
 * - Handles offline/online transitions
 * - Supports remote Fastify URL via SQUIRREL_FASTIFY_URL
 */

const DEFAULT_WS_PATH = '/ws/sync';
const MAX_RETRIES = 10;
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

/**
 * Resolve WebSocket URL for version sync
 * Supports remote Fastify URL via window.__SQUIRREL_FASTIFY_URL__
 */
function resolveVersionSyncUrl() {
    // Check for custom Fastify URL (set by Tauri from environment)
    const customUrl = typeof window.__SQUIRREL_FASTIFY_URL__ === 'string'
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';

    if (customUrl) {
        // Convert http(s) to ws(s)
        const wsUrl = customUrl
            .replace(/^https:/, 'wss:')
            .replace(/^http:/, 'ws:')
            .replace(/\/$/, '');
        console.log('[version_sync] Using custom Fastify URL:', wsUrl);
        return `${wsUrl}${DEFAULT_WS_PATH}`;
    }

    // Default to localhost:3001 (Fastify server)
    return `ws://localhost:3001${DEFAULT_WS_PATH}`;
}

/**
 * Get client identifier
 */
function getClientId() {
    // Try to get persistent client ID from localStorage
    let clientId = null;
    try {
        clientId = localStorage.getItem('squirrel_client_id');
        if (!clientId) {
            clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('squirrel_client_id', clientId);
        }
    } catch (e) {
        clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return clientId;
}

/**
 * Get current local version from version.json
 */
async function getLocalVersion() {
    try {
        // Try fetching from server
        const response = await fetch('/version.json');
        if (response.ok) {
            const data = await response.json();
            return data.version || 'unknown';
        }
    } catch (e) {
        console.warn('[version_sync] Could not fetch version.json:', e);
    }
    return 'unknown';
}

/**
 * Detect runtime environment
 */
function detectRuntime() {
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
        return 'tauri';
    }
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) {
        return 'electron';
    }
    return 'browser';
}

class VersionSyncClient {
    constructor() {
        this.state = {
            connected: false,
            attempts: 0,
            lastVersion: null,
            serverVersion: null,
            endpoint: null,
            clientId: getClientId(),
            runtime: detectRuntime()
        };
        this.listeners = new Set();
        this.socket = null;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.pendingConflicts = [];
    }

    /**
     * Start the version sync client
     */
    async start() {
        if (this.socket || this.state.connected) {
            console.log('[version_sync] Already connected or connecting');
            return;
        }

        // Get local version before connecting
        this.state.lastVersion = await getLocalVersion();
        console.log('[version_sync] Local version:', this.state.lastVersion);

        this.connect();
    }

    /**
     * Connect to the version sync WebSocket
     */
    connect() {
        const url = resolveVersionSyncUrl();
        this.state.endpoint = url;

        console.log('[version_sync] Connecting to:', url);

        try {
            this.socket = new WebSocket(url);
        } catch (error) {
            console.error('[version_sync] WebSocket creation failed:', error);
            this.scheduleReconnect();
            return;
        }

        this.socket.addEventListener('open', () => this.onOpen());
        this.socket.addEventListener('message', (event) => this.onMessage(event));
        this.socket.addEventListener('close', (event) => this.onClose(event));
        this.socket.addEventListener('error', (event) => this.onError(event));
    }

    /**
     * Handle WebSocket open
     */
    onOpen() {
        console.log('[version_sync] ✅ Connected to version sync server');
        this.state.connected = true;
        this.state.attempts = 0;

        // Send registration message
        this.send({
            type: 'register',
            clientId: this.state.clientId,
            runtime: this.state.runtime,
            localVersion: this.state.lastVersion,
            capabilities: ['auto-update', 'conflict-resolution']
        });

        // Start heartbeat
        this.startHeartbeat();

        // Broadcast connection event
        this.broadcast({
            type: 'connected',
            endpoint: this.state.endpoint
        });
    }

    /**
     * Handle incoming messages
     */
    onMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            console.warn('[version_sync] Invalid JSON received:', event.data);
            return;
        }

        console.log('[version_sync] Message received:', data.type);

        switch (data.type) {
            case 'version-update':
                this.handleVersionUpdate(data);
                break;

            case 'sync-request':
                this.handleSyncRequest(data);
                break;

            case 'conflict':
                this.handleConflict(data);
                break;

            case 'registered':
                console.log('[version_sync] Registration confirmed:', data);
                this.state.serverVersion = data.serverVersion;
                this.broadcast({ type: 'registered', data });
                break;

            case 'pong':
                // Heartbeat response
                break;

            case 'error':
                console.error('[version_sync] Server error:', data.message);
                this.broadcast({ type: 'error', message: data.message });
                break;

            default:
                console.log('[version_sync] Unknown message type:', data.type);
                this.broadcast({ type: 'unknown', data });
        }
    }

    /**
     * Handle version update from server
     */
    handleVersionUpdate(data) {
        const { newVersion, oldVersion, changes, requiresReload } = data;

        console.log('[version_sync] 🔄 Version update:', oldVersion, '->', newVersion);

        this.state.serverVersion = newVersion;

        // Broadcast to listeners
        this.broadcast({
            type: 'version-update',
            newVersion,
            oldVersion,
            changes,
            requiresReload
        });

        // Dispatch DOM event for UI components
        window.dispatchEvent(new CustomEvent('squirrel:version-update', {
            detail: { newVersion, oldVersion, changes, requiresReload }
        }));

        // If auto-update is enabled and reload is required
        if (requiresReload && window.Squirrel?.config?.autoReload !== false) {
            console.log('[version_sync] Auto-reload in 3 seconds...');
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        }
    }

    /**
     * Handle sync request from server
     */
    handleSyncRequest(data) {
        console.log('[version_sync] Sync request received:', data);

        this.broadcast({
            type: 'sync-request',
            files: data.files,
            action: data.action
        });
    }

    /**
     * Handle conflict notification
     */
    handleConflict(data) {
        console.log('[version_sync] ⚠️ Conflict detected:', data);

        this.pendingConflicts.push({
            id: data.conflictId,
            file: data.file,
            localVersion: data.localVersion,
            serverVersion: data.serverVersion,
            timestamp: Date.now()
        });

        this.broadcast({
            type: 'conflict',
            conflict: data
        });

        // Dispatch DOM event
        window.dispatchEvent(new CustomEvent('squirrel:sync-conflict', {
            detail: data
        }));
    }

    /**
     * Resolve a conflict
     */
    resolveConflict(conflictId, resolution) {
        const conflict = this.pendingConflicts.find(c => c.id === conflictId);
        if (!conflict) {
            console.warn('[version_sync] Conflict not found:', conflictId);
            return;
        }

        this.send({
            type: 'resolve-conflict',
            conflictId,
            resolution, // 'local' | 'server' | 'merge'
            clientId: this.state.clientId
        });

        // Remove from pending
        this.pendingConflicts = this.pendingConflicts.filter(c => c.id !== conflictId);
    }

    /**
     * Request manual sync from server
     */
    requestSync() {
        console.log('[version_sync] Requesting sync from server...');
        this.send({
            type: 'request-sync',
            clientId: this.state.clientId,
            localVersion: this.state.lastVersion
        });
    }

    /**
     * Handle WebSocket close
     */
    onClose(event) {
        console.log('[version_sync] Connection closed:', event.code, event.reason);
        this.state.connected = false;
        this.socket = null;
        this.stopHeartbeat();

        this.broadcast({ type: 'disconnected', code: event.code, reason: event.reason });
        this.scheduleReconnect();
    }

    /**
     * Handle WebSocket error
     */
    onError(event) {
        console.error('[version_sync] WebSocket error:', event);
        this.state.connected = false;
        this.socket?.close();
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        if (this.state.attempts >= MAX_RETRIES) {
            console.error('[version_sync] Max retries reached, giving up');
            this.broadcast({ type: 'max-retries-reached' });
            return;
        }

        this.state.attempts++;
        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.state.attempts - 1),
            RECONNECT_MAX_DELAY
        );

        console.log(`[version_sync] Reconnecting in ${delay}ms (attempt ${this.state.attempts}/${MAX_RETRIES})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, 30000); // Every 30 seconds
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Send message to server
     */
    send(data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[version_sync] Cannot send, not connected');
            return false;
        }

        try {
            this.socket.send(JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[version_sync] Send error:', e);
            return false;
        }
    }

    /**
     * Broadcast to all listeners
     */
    broadcast(event) {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            } catch (e) {
                console.error('[version_sync] Listener error:', e);
            }
        });
    }

    /**
     * Subscribe to events
     */
    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }
        return () => this.listeners.delete(listener);
    }

    /**
     * Get connection state
     */
    getState() {
        return {
            connected: this.state.connected,
            serverVersion: this.state.serverVersion,
            localVersion: this.state.lastVersion,
            endpoint: this.state.endpoint,
            clientId: this.state.clientId,
            pendingConflicts: this.pendingConflicts.length
        };
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        this.state.connected = false;
    }
}

// Singleton instance
const versionSyncSingleton = new VersionSyncClient();
let versionSyncInitialized = false;

/**
 * Initialize version sync client
 */
export default function initVersionSync() {
    if (versionSyncInitialized) {
        return versionSyncSingleton;
    }
    versionSyncInitialized = true;

    // Start connection
    versionSyncSingleton.start();

    // Expose global API
    window.Squirrel = window.Squirrel || {};
    window.Squirrel.VersionSync = {
        subscribe: (listener) => versionSyncSingleton.subscribe(listener),
        getState: () => versionSyncSingleton.getState(),
        requestSync: () => versionSyncSingleton.requestSync(),
        resolveConflict: (id, resolution) => versionSyncSingleton.resolveConflict(id, resolution),
        disconnect: () => versionSyncSingleton.disconnect()
    };

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('squirrel:version-sync-ready'));

    console.log('[version_sync] Initialized and exposed as window.Squirrel.VersionSync');
    return versionSyncSingleton;
}

export { versionSyncSingleton as VersionSync };
