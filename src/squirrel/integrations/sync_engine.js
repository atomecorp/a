/**
 * sync_engine.js
 * 
 * Unified WebSocket sync module for Squirrel framework.
 * Handles both file system events (/ws/events) and version/atome sync (/ws/sync).
 * 
 * Features:
 * - File system event synchronization (ADOLE delta format)
 * - Version synchronization with conflict resolution
 * - Atome CRUD event broadcasting
 * - Auto-reconnect with exponential backoff
 * - Silent mode when Fastify server is unavailable
 */

// === SHARED CONSTANTS ===
const MAX_RETRIES = 3;
const RECONNECT_BASE_DELAY = 30000;
const RECONNECT_MAX_DELAY = 3600000;
const SILENT_MODE_AFTER_FAILURES = 1;
const LONG_POLL_INTERVAL = 300000;
const HEARTBEAT_INTERVAL = 30000;

// === SHARED UTILITIES ===

/**
 * Check if we're in a production environment
 */
function isProductionEnvironment() {
    if (typeof window === 'undefined') return false;
    const hostname = window.location?.hostname || '';
    return hostname === 'atome.one' ||
        hostname === 'www.atome.one' ||
        hostname.endsWith('.squirrel.cloud') ||
        hostname === 'squirrel.cloud';
}

/**
 * Check if Fastify server is available
 */
async function checkFastifyAvailable() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch('http://127.0.0.1:3001/api/server-info', {
            signal: controller.signal
        });
        clearTimeout(timeout);
        return response.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Get client identifier (persistent)
 */
function getClientId() {
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
 * Detect runtime environment
 */
function detectRuntime() {
    if (typeof window === 'undefined') return 'unknown';
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return 'tauri';
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return 'electron';
    return 'browser';
}

/**
 * Get current local version from version.json
 */
async function getLocalVersion() {
    try {
        const response = await fetch('/version.json');
        if (response.ok) {
            const data = await response.json();
            return data.version || 'unknown';
        }
    } catch (e) {
        // Silent fail
    }
    return 'unknown';
}

/**
 * Resolve WebSocket URL for a given path
 */
function resolveWsUrl(wsPath, customVar) {
    const customEndpoint = typeof window[customVar] === 'string'
        ? window[customVar].trim()
        : '';

    if (customEndpoint) {
        const wsUrl = customEndpoint
            .replace(/^https:/, 'wss:')
            .replace(/^http:/, 'ws:')
            .replace(/\/$/, '');
        return `${wsUrl}${wsPath}`;
    }

    if (isProductionEnvironment()) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}${wsPath}`;
    }

    return `ws://localhost:3001${wsPath}`;
}

// === FILE SYNC UTILITIES ===

function mapKindToOperation(kind) {
    switch (kind) {
        case 'add':
        case 'addDir':
            return 'create';
        case 'change':
            return 'update';
        case 'unlink':
        case 'unlinkDir':
            return 'delete';
        default:
            return 'unknown';
    }
}

function toAdoleDelta(envelope) {
    if (!envelope || envelope.type !== 'sync:file-event') {
        return null;
    }

    const fsEvent = envelope.payload || {};
    return {
        schema: 'adole.fs.delta/1',
        deltaId: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        timestamp: envelope.timestamp || new Date().toISOString(),
        operation: mapKindToOperation(fsEvent.kind),
        sourceRuntime: envelope.runtime,
        target: {
            relativePath: fsEvent.relativePath,
            normalizedPath: fsEvent.normalizedPath,
            absolutePath: fsEvent.absolutePath,
            isDirectory: Boolean(fsEvent.metadata && fsEvent.metadata.isDirectory)
        },
        metadata: {
            size: fsEvent.metadata?.size ?? null,
            hash: fsEvent.metadata?.hash ?? null,
            mtimeMs: fsEvent.metadata?.mtimeMs ?? null,
            birthtimeMs: fsEvent.metadata?.birthtimeMs ?? null,
            workspaceRoot: fsEvent.workspaceRoot
        },
        rawEvent: envelope
    };
}

// =============================================================================
// BASE WEBSOCKET CLIENT CLASS (shared logic)
// =============================================================================

class BaseWebSocketClient {
    constructor(name, wsPath, customVar) {
        this.name = name;
        this.wsPath = wsPath;
        this.customVar = customVar;
        this.state = {
            connected: false,
            attempts: 0,
            totalFailures: 0,
            endpoint: null,
            silentMode: false,
            serverAvailable: null,
            fastifyChecked: false
        };
        this.listeners = new Set();
        this.socket = null;
        this.reconnectTimer = null;
        this._networkListenerSetup = false;
    }

    setupNetworkListeners() {
        if (typeof window === 'undefined' || this._networkListenerSetup) return;
        this._networkListenerSetup = true;

        window.addEventListener('online', () => {
            if (!this.state.connected && this.state.silentMode) {
                console.log(`[${this.name}] Network back online, attempting reconnection...`);
                this.state.silentMode = false;
                this.state.attempts = 0;
                this.start();
            }
        });
    }

    async start() {
        if (this.socket || this.state.connected) return;

        if (!this.state.fastifyChecked) {
            this.state.fastifyChecked = true;
            const available = await checkFastifyAvailable();
            if (!available) {
                this.state.silentMode = true;
                this.state.serverAvailable = false;
                this.scheduleBackgroundRetry();
                return;
            }
        }

        this.connect();
    }

    connect() {
        const url = resolveWsUrl(this.wsPath, this.customVar);
        this.state.endpoint = url;

        try {
            this.socket = new WebSocket(url);
        } catch (error) {
            this.handleConnectionError();
            return;
        }

        this.socket.addEventListener('open', () => this.onOpen());
        this.socket.addEventListener('message', (event) => this.onMessage(event));
        this.socket.addEventListener('close', (event) => this.onClose(event));
        this.socket.addEventListener('error', () => this.handleConnectionError());
    }

    onOpen() {
        if (!this.state.silentMode) {
            console.log(`[${this.name}] ✅ Connected`);
        }
        this.state.connected = true;
        this.state.attempts = 0;
        this.state.totalFailures = 0;
        this.state.silentMode = false;
        this.state.serverAvailable = true;
    }

    onMessage(event) {
        // Override in subclass
    }

    onClose(event) {
        this.state.connected = false;
        this.socket = null;
        this.scheduleReconnect();
    }

    handleConnectionError() {
        this.state.totalFailures++;
        this.state.connected = false;
        this.state.serverAvailable = false;

        if (this.state.totalFailures >= SILENT_MODE_AFTER_FAILURES && !this.state.silentMode) {
            this.state.silentMode = true;
            console.log(`[${this.name}] Fastify server unavailable - sync will auto-resume when server is back`);
        }

        this.socket?.close();
        this.scheduleReconnect();
    }

    scheduleBackgroundRetry() {
        if (this.reconnectTimer) return;

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            const available = await checkFastifyAvailable();
            if (available) {
                console.log(`[${this.name}] Fastify server now available, connecting...`);
                this.state.silentMode = false;
                this.state.attempts = 0;
                this.connect();
            } else {
                this.scheduleBackgroundRetry();
            }
        }, LONG_POLL_INTERVAL);
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;

        if (this.state.attempts >= MAX_RETRIES) {
            this.state.serverAvailable = false;
            this.scheduleBackgroundRetry();
            return;
        }

        this.state.attempts++;
        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.state.attempts - 1),
            RECONNECT_MAX_DELAY
        );

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    broadcast(data) {
        this.listeners.forEach((listener) => {
            try {
                listener(data);
            } catch (_) {
                // Ignore listener errors
            }
        });
    }

    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }
        return () => this.listeners.delete(listener);
    }

    send(data) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        try {
            this.socket.send(JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    getState() {
        return {
            connected: this.state.connected,
            endpoint: this.state.endpoint,
            serverAvailable: this.state.serverAvailable,
            silentMode: this.state.silentMode,
            attempts: this.state.attempts
        };
    }

    isServerAvailable() {
        return this.state.serverAvailable === true;
    }

    retry() {
        this.state.attempts = 0;
        this.state.totalFailures = 0;
        this.state.silentMode = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.connect();
    }

    disconnect() {
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

// =============================================================================
// FILE SYNC CLIENT (/ws/events)
// =============================================================================

class FileSyncClient extends BaseWebSocketClient {
    constructor() {
        super('sync_engine', '/ws/events', '__SQUIRREL_SYNC_WS__');
        this.lastDelta = null;
        this.queue = [];
        this.setupNetworkListeners();
    }

    onOpen() {
        super.onOpen();
        this.flushQueue();
    }

    onMessage(event) {
        let payload = null;
        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        if (payload.type === 'sync:file-event') {
            const delta = toAdoleDelta(payload);
            if (delta) {
                this.lastDelta = delta;
                this.broadcast(delta);
                window.dispatchEvent(new CustomEvent('squirrel:adole-delta', { detail: delta }));
            }
        } else if (payload.type === 'sync:account-created') {
            console.log('[sync_engine] Account created on cloud:', payload.payload);
            this.broadcast({
                type: 'account-created',
                userId: payload.payload?.userId,
                username: payload.payload?.username,
                phone: payload.payload?.phone,
                optional: payload.payload?.optional,
                rawEvent: payload
            });
        } else if (payload.type === 'sync:account-deleted') {
            console.log('[sync_engine] Account deleted on cloud:', payload.payload);
            this.broadcast({
                type: 'account-deleted',
                userId: payload.payload?.userId,
                username: payload.payload?.username,
                phone: payload.payload?.phone,
                rawEvent: payload
            });
        } else if (payload.type === 'sync:warning') {
            this.broadcast({ warning: payload.payload?.message, rawEvent: payload });
        } else if (payload.type === 'sync:ready') {
            this.broadcast({ info: 'watcher-ready', rawEvent: payload });
        } else if (payload.type === 'sync:error') {
            this.broadcast({ error: payload.payload?.message, rawEvent: payload });
        }
    }

    flushQueue() {
        while (this.queue.length) {
            const msg = this.queue.shift();
            this.socket?.send(msg);
        }
    }

    getLastDelta() {
        return this.lastDelta;
    }
}

// =============================================================================
// VERSION SYNC CLIENT (/ws/sync)
// =============================================================================

class VersionSyncClient extends BaseWebSocketClient {
    constructor() {
        super('version_sync', '/ws/sync', '__SQUIRREL_FASTIFY_URL__');
        this.clientId = getClientId();
        this.runtime = detectRuntime();
        this.localVersion = null;
        this.serverVersion = null;
        this.pendingConflicts = [];
        this.heartbeatTimer = null;
        this.setupNetworkListeners();
    }

    async start() {
        if (this.socket || this.state.connected) return;

        if (!this.state.fastifyChecked) {
            this.state.fastifyChecked = true;
            const available = await checkFastifyAvailable();
            if (!available) {
                this.state.silentMode = true;
                this.state.serverAvailable = false;
                this.scheduleBackgroundRetry();
                return;
            }
        }

        this.localVersion = await getLocalVersion();
        this.connect();
    }

    onOpen() {
        super.onOpen();

        // Send registration
        this.send({
            type: 'register',
            clientId: this.clientId,
            runtime: this.runtime,
            localVersion: this.localVersion,
            capabilities: ['auto-update', 'conflict-resolution']
        });

        this.startHeartbeat();
        this.broadcast({ type: 'connected', endpoint: this.state.endpoint });
    }

    onClose(event) {
        super.onClose(event);
        this.stopHeartbeat();
        this.broadcast({ type: 'disconnected', code: event.code, reason: event.reason });
    }

    onMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        switch (data.type) {
            case 'version-update':
                this.handleVersionUpdate(data);
                break;

            case 'sync-request':
                this.broadcast({ type: 'sync-request', files: data.files, action: data.action });
                break;

            case 'conflict':
                this.handleConflict(data);
                break;

            case 'registered':
                this.serverVersion = data.serverVersion;
                this.broadcast({ type: 'registered', data });
                break;

            case 'pong':
                break;

            case 'atome:created':
                console.log('[version_sync] 🆕 Atome created:', data.atome?.id);
                window.dispatchEvent(new CustomEvent('squirrel:atome-created', { detail: data.atome }));
                this.broadcast({ type: 'atome:created', atome: data.atome });
                break;

            case 'atome:updated':
                console.log('[version_sync] ✏️ Atome updated:', data.atome?.id);
                window.dispatchEvent(new CustomEvent('squirrel:atome-updated', { detail: data.atome }));
                this.broadcast({ type: 'atome:updated', atome: data.atome });
                break;

            case 'atome:deleted':
                console.log('[version_sync] 🗑️ Atome deleted:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-deleted', { detail: data.atome || { id: data.atomeId } }));
                this.broadcast({ type: 'atome:deleted', atome: data.atome, atomeId: data.atomeId });
                break;

            case 'atome:altered':
                console.log('[version_sync] 🔧 Atome altered:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-altered', { detail: data.atome || { id: data.atomeId, alterations: data.alterations } }));
                this.broadcast({ type: 'atome:altered', atome: data.atome, atomeId: data.atomeId, alterations: data.alterations });
                break;

            case 'atome:renamed':
                console.log('[version_sync] 📝 Atome renamed:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-renamed', { detail: data.atome || { id: data.atomeId, newName: data.newName } }));
                this.broadcast({ type: 'atome:renamed', atome: data.atome, atomeId: data.atomeId, newName: data.newName });
                break;

            case 'atome:restored':
                console.log('[version_sync] ♻️ Atome restored:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-restored', { detail: data.atome || { id: data.atomeId } }));
                this.broadcast({ type: 'atome:restored', atome: data.atome, atomeId: data.atomeId });
                break;

            case 'welcome':
                if (data.clientId) {
                    try {
                        localStorage.setItem('squirrel_client_id', data.clientId);
                    } catch (e) { }
                }
                this.serverVersion = data.version;
                this.broadcast({ type: 'welcome', data });
                break;

            case 'error':
                console.error('[version_sync] Server error:', data.message);
                this.broadcast({ type: 'error', message: data.message });
                break;

            default:
                this.broadcast({ type: 'unknown', data });
        }
    }

    handleVersionUpdate(data) {
        const { newVersion, oldVersion, changes, requiresReload } = data;
        console.log('[version_sync] 🔄 Version update:', oldVersion, '->', newVersion);

        this.serverVersion = newVersion;
        this.broadcast({ type: 'version-update', newVersion, oldVersion, changes, requiresReload });
        window.dispatchEvent(new CustomEvent('squirrel:version-update', {
            detail: { newVersion, oldVersion, changes, requiresReload }
        }));

        if (requiresReload && window.Squirrel?.config?.autoReload !== false) {
            console.log('[version_sync] Auto-reload in 3 seconds...');
            setTimeout(() => window.location.reload(), 3000);
        }
    }

    handleConflict(data) {
        console.log('[version_sync] ⚠️ Conflict detected:', data);
        this.pendingConflicts.push({
            id: data.conflictId,
            file: data.file,
            localVersion: data.localVersion,
            serverVersion: data.serverVersion,
            timestamp: Date.now()
        });
        this.broadcast({ type: 'conflict', conflict: data });
        window.dispatchEvent(new CustomEvent('squirrel:sync-conflict', { detail: data }));
    }

    resolveConflict(conflictId, resolution) {
        const conflict = this.pendingConflicts.find(c => c.id === conflictId);
        if (!conflict) return;

        this.send({
            type: 'resolve-conflict',
            conflictId,
            resolution,
            clientId: this.clientId
        });
        this.pendingConflicts = this.pendingConflicts.filter(c => c.id !== conflictId);
    }

    requestSync() {
        this.send({
            type: 'request-sync',
            clientId: this.clientId,
            localVersion: this.localVersion
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, HEARTBEAT_INTERVAL);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        super.disconnect();
    }

    getState() {
        return {
            ...super.getState(),
            serverVersion: this.serverVersion,
            localVersion: this.localVersion,
            clientId: this.clientId,
            pendingConflicts: this.pendingConflicts.length
        };
    }
}

// =============================================================================
// SINGLETON INSTANCES
// =============================================================================

const fileSyncSingleton = new FileSyncClient();
const versionSyncSingleton = new VersionSyncClient();
let syncEngineInitialized = false;

export default function initSyncEngine() {
    if (syncEngineInitialized) return;
    syncEngineInitialized = true;

    // Start both sync clients
    fileSyncSingleton.start();
    versionSyncSingleton.start();

    // Listen for server availability events
    window.addEventListener('squirrel:server-available', () => {
        console.log('[sync_engine] Server available event received - attempting connection');
        fileSyncSingleton.retry();
        versionSyncSingleton.retry();
    });

    // Relay ready event
    const relayReady = () => {
        window.removeEventListener('squirrel:ready', relayReady);
        window.dispatchEvent(new CustomEvent('squirrel:sync-ready'));
        window.dispatchEvent(new CustomEvent('squirrel:version-sync-ready'));
    };
    window.addEventListener('squirrel:ready', relayReady, { once: true });

    // Expose global APIs
    window.Squirrel = window.Squirrel || {};

    // File sync API (backward compatible)
    window.Squirrel.SyncEngine = {
        subscribe: (listener) => fileSyncSingleton.subscribe(listener),
        getLastDelta: () => fileSyncSingleton.getLastDelta(),
        getState: () => fileSyncSingleton.getState(),
        isServerAvailable: () => fileSyncSingleton.isServerAvailable(),
        retry: () => fileSyncSingleton.retry(),
        disconnect: () => fileSyncSingleton.disconnect()
    };

    // Version sync API (backward compatible)
    window.Squirrel.VersionSync = {
        subscribe: (listener) => versionSyncSingleton.subscribe(listener),
        getState: () => versionSyncSingleton.getState(),
        requestSync: () => versionSyncSingleton.requestSync(),
        resolveConflict: (id, resolution) => versionSyncSingleton.resolveConflict(id, resolution),
        disconnect: () => versionSyncSingleton.disconnect(),
        isServerAvailable: () => versionSyncSingleton.isServerAvailable(),
        retry: () => versionSyncSingleton.retry()
    };

    console.log('[sync_engine] Initialized: SyncEngine + VersionSync');
}

// Export shared utilities for atome_sync.js
export {
    fileSyncSingleton as SyncEngine,
    versionSyncSingleton as VersionSync,
    isProductionEnvironment,
    detectRuntime,
    getClientId
};
