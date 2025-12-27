/**
 * sync_engine.js
 * 
 * Unified WebSocket sync module for Squirrel framework.
 * Single client handling all sync operations:
 * - File system events (ADOLE delta format)
 * - Atome CRUD events
 * - Account events (created/deleted)
 * - Version sync with conflict resolution
 * 
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Silent mode when Fastify server is unavailable
 * - Heartbeat to keep connection alive
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFIG = {
    MAX_RETRIES: 3,
    RECONNECT_BASE_DELAY: 30000,
    RECONNECT_MAX_DELAY: 3600000,
    SILENT_MODE_AFTER_FAILURES: 1,
    LONG_POLL_INTERVAL: 300000,
    HEARTBEAT_INTERVAL: 30000,
    WS_PATH: '/ws/sync',
    CUSTOM_VAR: '__SQUIRREL_FASTIFY_URL__'
};

// =============================================================================
// SHARED UTILITIES (exported for other modules)
// =============================================================================

/**
 * Check if we're in a production environment
 */
export function isProductionEnvironment() {
    if (typeof window === 'undefined') return false;
    const hostname = window.location?.hostname || '';
    return hostname === 'atome.one' ||
        hostname === 'www.atome.one' ||
        hostname.endsWith('.squirrel.cloud') ||
        hostname === 'squirrel.cloud';
}

/**
 * Detect runtime environment
 */
export function detectRuntime() {
    if (typeof window === 'undefined') return 'unknown';
    if (window.__TAURI__ || window.__TAURI_INTERNALS__) return 'tauri';
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '')) return 'electron';
    return 'browser';
}

/**
 * Get client identifier (persistent)
 */
export function getClientId() {
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

// =============================================================================
// INTERNAL UTILITIES
// =============================================================================

const FASTIFY_AVAILABILITY_TTL = 10000;
let fastifyAvailabilityCache = { value: null, lastCheck: 0 };

function shouldAttemptFastifyChecks() {
    if (typeof window === 'undefined') return false;
    const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!isTauriRuntime) return true;

    if (window.__SQUIRREL_FORCE_FASTIFY__ === true) return true;

    const base = (typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
        ? window.__SQUIRREL_FASTIFY_URL__.trim()
        : '';
    if (!base) return false;

    try {
        const parsed = new URL(base);
        const host = parsed.hostname;
        const port = parsed.port || '';
        const isLocalHost = host === '127.0.0.1' || host === 'localhost';
        const isDefaultPort = port === '' || port === '3001';
        if (!isLocalHost || !isDefaultPort) return true;
    } catch {
        return false;
    }

    try {
        const token = localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token');
        if (token) return true;
    } catch { }

    try {
        const pending = JSON.parse(localStorage.getItem('auth_pending_sync') || '[]');
        if (Array.isArray(pending) && pending.length > 0) return true;
    } catch { }

    return false;
}

async function checkFastifyViaTauri() {
    if (typeof window === 'undefined') return null;
    const isTauriRuntime = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
    if (!isTauriRuntime) return null;

    const localPort = window.__ATOME_LOCAL_HTTP_PORT__ || 3000;
    const localBase = `http://127.0.0.1:${localPort}`;

    try {
        const res = await fetch(`${localBase}/api/fastify-status`, {
            method: 'GET',
            credentials: 'omit',
            headers: { 'Accept': 'application/json' }
        });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (data && typeof data.available === 'boolean') {
            return data.available;
        }
    } catch { }
    return null;
}

/**
 * Check if Fastify server is available
 * Uses HTTP ping to avoid noisy WebSocket connection errors
 */
async function checkFastifyAvailable() {
    if (!shouldAttemptFastifyChecks()) {
        fastifyAvailabilityCache = { value: false, lastCheck: Date.now() };
        if (typeof window !== 'undefined') {
            window._checkFastifyAvailable = () => false;
        }
        return false;
    }
    if (typeof window !== 'undefined' && typeof window._checkFastifyAvailable === 'function') {
        const cachedState = window._checkFastifyAvailable();
        if (cachedState === false || cachedState === true) {
            return cachedState;
        }
    }

    const now = Date.now();
    if (fastifyAvailabilityCache.value !== null &&
        (now - fastifyAvailabilityCache.lastCheck < FASTIFY_AVAILABILITY_TTL)) {
        return fastifyAvailabilityCache.value;
    }

    const tauriCheck = await checkFastifyViaTauri();
    if (tauriCheck === true || tauriCheck === false) {
        fastifyAvailabilityCache = { value: tauriCheck, lastCheck: now };
    } else {
        const base = (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_URL__ === 'string')
            ? window.__SQUIRREL_FASTIFY_URL__.trim()
            : '';

        if (!base) {
            fastifyAvailabilityCache = { value: false, lastCheck: now };
        } else {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            try {
                await fetch(`${base}/api/auth/me`, {
                    method: 'GET',
                    signal: controller.signal,
                    credentials: 'omit',
                    headers: { 'Accept': 'application/json' }
                });
                clearTimeout(timeoutId);
                fastifyAvailabilityCache = { value: true, lastCheck: now };
            } catch (_) {
                clearTimeout(timeoutId);
                fastifyAvailabilityCache = { value: false, lastCheck: now };
            }
        }
    }

    if (typeof window !== 'undefined') {
        window._checkFastifyAvailable = () => fastifyAvailabilityCache.value;
    }

    return fastifyAvailabilityCache.value;
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
 * Resolve WebSocket URL
 */
function resolveWsUrl() {
    const customEndpoint = typeof window[CONFIG.CUSTOM_VAR] === 'string'
        ? window[CONFIG.CUSTOM_VAR].trim()
        : '';

    if (customEndpoint) {
        const wsUrl = customEndpoint
            .replace(/^https:/, 'wss:')
            .replace(/^http:/, 'ws:')
            .replace(/\/$/, '');
        return `${wsUrl}${CONFIG.WS_PATH}`;
    }

    if (isProductionEnvironment()) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}${CONFIG.WS_PATH}`;
    }

    // Local/dev: require explicit config (server_config.json -> globals)
    if (typeof window !== 'undefined' && typeof window.__SQUIRREL_FASTIFY_URL__ === 'string') {
        const wsBase = window.__SQUIRREL_FASTIFY_URL__
            .trim()
            .replace(/^https:/, 'wss:')
            .replace(/^http:/, 'ws:')
            .replace(/\/$/, '');
        return `${wsBase}${CONFIG.WS_PATH}`;
    }

    return '';
}

/**
 * Map file system kind to ADOLE operation
 */
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

/**
 * Convert file event to ADOLE delta format
 */
function toAdoleDelta(fsEvent) {
    if (!fsEvent) return null;

    return {
        schema: 'adole.fs.delta/1',
        deltaId: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        operation: mapKindToOperation(fsEvent.kind),
        target: {
            relativePath: fsEvent.relativePath,
            normalizedPath: fsEvent.normalizedPath,
            absolutePath: fsEvent.absolutePath,
            isDirectory: Boolean(fsEvent.metadata?.isDirectory)
        },
        metadata: {
            size: fsEvent.metadata?.size ?? null,
            hash: fsEvent.metadata?.hash ?? null,
            mtimeMs: fsEvent.metadata?.mtimeMs ?? null,
            birthtimeMs: fsEvent.metadata?.birthtimeMs ?? null,
            workspaceRoot: fsEvent.workspaceRoot
        }
    };
}

// =============================================================================
// UNIFIED SYNC CLIENT
// =============================================================================

class UnifiedSyncClient {
    constructor() {
        this.state = {
            connected: false,
            attempts: 0,
            totalFailures: 0,
            endpoint: null,
            silentMode: false,
            serverAvailable: null,
            fastifyChecked: false
        };

        this.clientId = getClientId();
        this.runtime = detectRuntime();
        this.localVersion = null;
        this.serverVersion = null;
        this.pendingConflicts = [];
        this.lastDelta = null;

        this.listeners = new Set();
        this.socket = null;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this._networkListenerSetup = false;
    }

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    setupNetworkListeners() {
        if (typeof window === 'undefined' || this._networkListenerSetup) return;
        this._networkListenerSetup = true;

        window.addEventListener('online', () => {
            if (!this.state.connected && this.state.silentMode) {
                console.log('[sync_engine] Network back online, attempting reconnection...');
                this.state.silentMode = false;
                this.state.attempts = 0;
                this.start();
            }
        });
    }

    async start() {
        if (this.socket || this.state.connected) return;

        this.setupNetworkListeners();

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

    connect() {
        const url = resolveWsUrl();
        this.state.endpoint = url;

        if (!url) {
            this.handleConnectionError();
            return;
        }

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

    retry() {
        this.state.attempts = 0;
        this.state.totalFailures = 0;
        this.state.silentMode = false;
        this.state.fastifyChecked = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.start();
    }

    // =========================================================================
    // CONNECTION HANDLERS
    // =========================================================================

    onOpen() {
        console.log('[sync_engine] ✅ Connected');
        this.state.connected = true;
        this.state.attempts = 0;
        this.state.totalFailures = 0;
        this.state.silentMode = false;
        this.state.serverAvailable = true;

        // Send registration
        this.send({
            type: 'register',
            clientId: this.clientId,
            runtime: this.runtime,
            localVersion: this.localVersion,
            capabilities: ['auto-update', 'conflict-resolution', 'file-sync', 'atome-sync']
        });

        this.startHeartbeat();
        this.broadcast({ type: 'connected', endpoint: this.state.endpoint });
    }

    onClose(event) {
        this.state.connected = false;
        this.socket = null;
        this.stopHeartbeat();
        this.broadcast({ type: 'disconnected', code: event.code, reason: event.reason });
        this.scheduleReconnect();
    }

    handleConnectionError() {
        this.state.totalFailures++;
        this.state.connected = false;
        this.state.serverAvailable = false;

        if (this.state.totalFailures >= CONFIG.SILENT_MODE_AFTER_FAILURES && !this.state.silentMode) {
            this.state.silentMode = true;
            console.log('[sync_engine] Fastify server unavailable - sync will auto-resume when server is back');
        }

        this.socket?.close();
        this.scheduleReconnect();
    }

    // =========================================================================
    // MESSAGE HANDLING
    // =========================================================================

    onMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        const type = data.type;

        // File sync events
        if (type === 'sync:file-event' || type === 'file-event') {
            const delta = toAdoleDelta(data.payload || data);
            if (delta) {
                this.lastDelta = delta;
                this.broadcast(delta);
                window.dispatchEvent(new CustomEvent('squirrel:adole-delta', { detail: delta }));
            }
            return;
        }

        // Account events (moved from FileSyncClient)
        if (type === 'sync:account-created' || type === 'account-created') {
            const payload = data.payload || data;
            console.log('[sync_engine] 👤 Account created:', payload.username || payload.phone);
            const eventData = {
                type: 'account-created',
                userId: payload.userId,
                username: payload.username,
                phone: payload.phone,
                optional: payload.optional
            };
            this.broadcast(eventData);
            window.dispatchEvent(new CustomEvent('squirrel:account-created', { detail: eventData }));
            return;
        }

        if (type === 'sync:account-deleted' || type === 'account-deleted') {
            const payload = data.payload || data;
            console.log('[sync_engine] 🗑️ Account deleted:', payload.username || payload.phone);
            const eventData = {
                type: 'account-deleted',
                userId: payload.userId,
                username: payload.username,
                phone: payload.phone
            };
            this.broadcast(eventData);
            window.dispatchEvent(new CustomEvent('squirrel:account-deleted', { detail: eventData }));
            return;
        }

        // Atome CRUD events
        switch (type) {
            case 'atome:created':
                console.log('[sync_engine] 🆕 Atome created:', data.atome?.id);
                window.dispatchEvent(new CustomEvent('squirrel:atome-created', { detail: data.atome }));
                this.broadcast({ type: 'atome:created', atome: data.atome });
                break;

            case 'atome:updated':
                console.log('[sync_engine] ✏️ Atome updated:', data.atome?.id);
                window.dispatchEvent(new CustomEvent('squirrel:atome-updated', { detail: data.atome }));
                this.broadcast({ type: 'atome:updated', atome: data.atome });
                break;

            case 'atome:deleted':
                console.log('[sync_engine] 🗑️ Atome deleted:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-deleted', { detail: data.atome || { id: data.atomeId } }));
                this.broadcast({ type: 'atome:deleted', atome: data.atome, atomeId: data.atomeId });
                break;

            case 'atome:altered':
                console.log('[sync_engine] 🔧 Atome altered:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-altered', { detail: data.atome || { id: data.atomeId, alterations: data.alterations } }));
                this.broadcast({ type: 'atome:altered', atome: data.atome, atomeId: data.atomeId, alterations: data.alterations });
                break;

            case 'atome:renamed':
                console.log('[sync_engine] 📝 Atome renamed:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-renamed', { detail: data.atome || { id: data.atomeId, newName: data.newName } }));
                this.broadcast({ type: 'atome:renamed', atome: data.atome, atomeId: data.atomeId, newName: data.newName });
                break;

            case 'atome:restored':
                console.log('[sync_engine] ♻️ Atome restored:', data.atome?.id || data.atomeId);
                window.dispatchEvent(new CustomEvent('squirrel:atome-restored', { detail: data.atome || { id: data.atomeId } }));
                this.broadcast({ type: 'atome:restored', atome: data.atome, atomeId: data.atomeId });
                break;

            // Version and sync events
            case 'version-update':
                this.handleVersionUpdate(data);
                break;

            case 'conflict':
                this.handleConflict(data);
                break;

            case 'sync-request':
                this.broadcast({ type: 'sync-request', files: data.files, action: data.action });
                break;

            case 'registered':
                this.serverVersion = data.serverVersion;
                this.broadcast({ type: 'registered', data });
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
                console.error('[sync_engine] Server error:', data.message);
                this.broadcast({ type: 'error', message: data.message });
                break;

            case 'pong':
                // Heartbeat response - ignore
                break;

            // Watcher status events
            case 'sync:warning':
                this.broadcast({ warning: data.payload?.message });
                break;

            case 'sync:ready':
                this.broadcast({ info: 'watcher-ready' });
                window.dispatchEvent(new CustomEvent('squirrel:watcher-ready'));
                break;

            case 'sync:error':
                this.broadcast({ error: data.payload?.message });
                break;

            default:
                // Unknown event - broadcast for extensibility
                this.broadcast({ type: 'unknown', data });
        }
    }

    // =========================================================================
    // VERSION SYNC
    // =========================================================================

    handleVersionUpdate(data) {
        const { newVersion, oldVersion, changes, requiresReload } = data;
        console.log('[sync_engine] 🔄 Version update:', oldVersion, '->', newVersion);

        this.serverVersion = newVersion;
        this.broadcast({ type: 'version-update', newVersion, oldVersion, changes, requiresReload });
        window.dispatchEvent(new CustomEvent('squirrel:version-update', {
            detail: { newVersion, oldVersion, changes, requiresReload }
        }));

        if (requiresReload && window.Squirrel?.config?.autoReload !== false) {
            console.log('[sync_engine] Auto-reload in 3 seconds...');
            setTimeout(() => window.location.reload(), 3000);
        }
    }

    handleConflict(data) {
        console.log('[sync_engine] ⚠️ Conflict detected:', data);
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

    // =========================================================================
    // RECONNECTION
    // =========================================================================

    scheduleBackgroundRetry() {
        if (this.reconnectTimer) return;

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            const available = await checkFastifyAvailable();
            if (available) {
                console.log('[sync_engine] Fastify server now available, connecting...');
                this.state.silentMode = false;
                this.state.attempts = 0;
                this.localVersion = await getLocalVersion();
                this.connect();
            } else {
                this.scheduleBackgroundRetry();
            }
        }, CONFIG.LONG_POLL_INTERVAL);
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;

        if (this.state.attempts >= CONFIG.MAX_RETRIES) {
            this.state.serverAvailable = false;
            this.scheduleBackgroundRetry();
            return;
        }

        this.state.attempts++;
        const delay = Math.min(
            CONFIG.RECONNECT_BASE_DELAY * Math.pow(2, this.state.attempts - 1),
            CONFIG.RECONNECT_MAX_DELAY
        );

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    // =========================================================================
    // HEARTBEAT
    // =========================================================================

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.state.connected && this.socket?.readyState === WebSocket.OPEN) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, CONFIG.HEARTBEAT_INTERVAL);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

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

    getState() {
        return {
            connected: this.state.connected,
            endpoint: this.state.endpoint,
            serverAvailable: this.state.serverAvailable,
            silentMode: this.state.silentMode,
            attempts: this.state.attempts,
            serverVersion: this.serverVersion,
            localVersion: this.localVersion,
            clientId: this.clientId,
            pendingConflicts: this.pendingConflicts.length
        };
    }

    isServerAvailable() {
        return this.state.serverAvailable === true;
    }

    getLastDelta() {
        return this.lastDelta;
    }
}

// =============================================================================
// SINGLETON & INITIALIZATION
// =============================================================================

const syncClient = new UnifiedSyncClient();
let syncEngineInitialized = false;

export default function initSyncEngine() {
    if (syncEngineInitialized) return;
    syncEngineInitialized = true;

    syncClient.start();

    // Listen for server availability events
    window.addEventListener('squirrel:server-available', () => {
        console.log('[sync_engine] Server available event received - attempting connection');
        syncClient.retry();
    });

    // Relay ready event
    const relayReady = () => {
        window.removeEventListener('squirrel:ready', relayReady);
        window.dispatchEvent(new CustomEvent('squirrel:sync-ready'));
        window.dispatchEvent(new CustomEvent('squirrel:version-sync-ready'));
    };
    window.addEventListener('squirrel:ready', relayReady, { once: true });

    // Expose unified API (backward compatible with both old APIs)
    window.Squirrel = window.Squirrel || {};

    // Unified SyncEngine API (combines old SyncEngine + VersionSync)
    window.Squirrel.SyncEngine = {
        // File sync methods (backward compat)
        subscribe: (listener) => syncClient.subscribe(listener),
        getLastDelta: () => syncClient.getLastDelta(),
        getState: () => syncClient.getState(),
        isServerAvailable: () => syncClient.isServerAvailable(),
        retry: () => syncClient.retry(),
        disconnect: () => syncClient.disconnect(),

        // Version sync methods (merged in)
        requestSync: () => syncClient.requestSync(),
        resolveConflict: (id, resolution) => syncClient.resolveConflict(id, resolution)
    };

    // Alias for backward compatibility
    window.Squirrel.VersionSync = window.Squirrel.SyncEngine;

    console.log('[sync_engine] ✅ Initialized');
}

// Export singleton for direct use
export { syncClient as SyncEngine };
