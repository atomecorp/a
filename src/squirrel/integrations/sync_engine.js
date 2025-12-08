const DEFAULT_WS_PATH = '/ws/events';
const MAX_RETRIES = 3;  // Very few retries to avoid spam
const RECONNECT_BASE_DELAY = 30000;  // Start at 30 seconds
const RECONNECT_MAX_DELAY = 3600000;  // 1 hour max
const SILENT_MODE_AFTER_FAILURES = 1;  // Silent after first failure (Fastify may be intentionally off)
const LONG_POLL_INTERVAL = 300000;  // 5 minutes between background retries

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

function resolveWsCandidates() {
    const customEndpoint = typeof window.__SQUIRREL_SYNC_WS__ === 'string'
        ? window.__SQUIRREL_SYNC_WS__.trim()
        : '';
    if (customEndpoint) {
        return [ensureWsPath(customEndpoint)];
    }

    // Production environment: use same origin with wss
    if (isProductionEnvironment()) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return [`${protocol}//${host}${DEFAULT_WS_PATH}`];
    }

    const bases = [];
    const pushBase = (value) => {
        if (!value || bases.includes(value)) {
            return;
        }
        bases.push(value);
    };

    const isTauri = Boolean(
        window.__TAURI__ ||
        window.__TAURI_INTERNALS__ ||
        (typeof navigator !== 'undefined' && /tauri/i.test(navigator.userAgent || ''))
    );

    const location = window.location || {};
    const protocol = location.protocol || 'http:';
    const host = location.host || '';
    const port = location.port || '';

    // Log for debugging only once, not on every reconnect
    if (typeof window.__sync_engine_logged__ === 'undefined') {
        console.log('[sync_engine] resolveWsCandidates: isTauri =', isTauri, ', port =', port);
        window.__sync_engine_logged__ = true;
    }

    // For both Tauri and browser dev mode, WebSocket is only available on Fastify (port 3001)
    // - Port 3000 (Squirrel static server or Axum) doesn't have WebSocket
    // - Port 1420/1430 (Tauri dev server / Vite) doesn't have WebSocket
    // Only Fastify on 3001 has the /ws/events endpoint

    pushBase('ws://localhost:3001');
    pushBase('ws://127.0.0.1:3001');

    // WebSocket candidates are localhost:3001 and 127.0.0.1:3001
    return bases.map((base) => ensureWsPath(base));
}

function ensureWsPath(base) {
    if (!base) {
        return `ws://127.0.0.1:3001${DEFAULT_WS_PATH}`;
    }

    const trimmed = base.replace(/\s+/g, '');
    if (trimmed.endsWith(DEFAULT_WS_PATH)) {
        return trimmed;
    }

    return `${trimmed.replace(/\/$/, '')}${DEFAULT_WS_PATH}`;
}

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

class SyncEngineClient {
    constructor() {
        this.state = {
            connected: false,
            attempts: 0,
            totalFailures: 0,
            lastDelta: null,
            endpoint: null,
            silentMode: false,
            serverAvailable: null,  // null = unknown, true/false = known state
            fastifyChecked: false   // Whether we've checked Fastify availability
        };
        this.listeners = new Set();
        this.socket = null;
        this.reconnectTimer = null;
        this.queue = [];
        this.setupNetworkListeners();
    }

    /**
     * Setup network online/offline listeners for smart reconnection
     */
    setupNetworkListeners() {
        if (typeof window === 'undefined') return;
        
        window.addEventListener('online', () => {
            if (!this.state.connected && this.state.silentMode) {
                console.log('[sync_engine] Network back online, attempting reconnection...');
                this.state.silentMode = false;
                this.state.attempts = 0;
                this.start();
            }
        });
    }

    /**
     * Check if Fastify server is available before attempting WebSocket
     */
    async checkFastifyAvailable() {
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

    async start() {
        if (this.socket || this.state.connected) {
            return;
        }
        
        // First time: check if Fastify is even available
        if (!this.state.fastifyChecked) {
            this.state.fastifyChecked = true;
            const available = await this.checkFastifyAvailable();
            if (!available) {
                // Fastify not available - enter silent mode immediately, no error spam
                this.state.silentMode = true;
                this.state.serverAvailable = false;
                this.scheduleBackgroundRetry();
                return;
            }
        }
        
        this.connectNextCandidate();
    }

    connectNextCandidate() {
        const endpoints = resolveWsCandidates();
        const endpoint = endpoints[this.state.attempts % endpoints.length];
        this.state.endpoint = endpoint;
        this.openSocket(endpoint);
    }

    openSocket(url) {
        try {
            this.socket = new WebSocket(url);
        } catch (error) {
            this.handleConnectionError();
            return;
        }

        this.socket.addEventListener('open', () => {
            if (!this.state.silentMode) {
                console.log('[sync_engine] ✅ Connected to sync server');
            }
            this.state.connected = true;
            this.state.attempts = 0;
            this.state.totalFailures = 0;
            this.state.silentMode = false;
            this.state.serverAvailable = true;
            this.flushQueue();
        });

        this.socket.addEventListener('message', (event) => {
            this.handleMessage(event);
        });

        this.socket.addEventListener('close', () => {
            this.state.connected = false;
            this.socket = null;
            this.scheduleReconnect();
        });

        this.socket.addEventListener('error', () => {
            this.handleConnectionError();
        });
    }

    handleConnectionError() {
        this.state.totalFailures++;
        this.state.connected = false;
        this.state.serverAvailable = false;

        // Enter silent mode after too many failures
        if (this.state.totalFailures >= SILENT_MODE_AFTER_FAILURES && !this.state.silentMode) {
            this.state.silentMode = true;
            console.warn('[sync_engine] Entering silent mode - server appears unavailable. Will keep trying in background.');
        }

        this.socket?.close();
        this.scheduleReconnect();
    }

    /**
     * Schedule background retry with long interval (for when Fastify is unavailable)
     */
    scheduleBackgroundRetry() {
        if (this.reconnectTimer) return;
        
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            const available = await this.checkFastifyAvailable();
            if (available) {
                console.log('[sync_engine] Fastify server now available, connecting...');
                this.state.silentMode = false;
                this.state.attempts = 0;
                this.connectNextCandidate();
            } else {
                // Still not available, schedule another background check
                this.scheduleBackgroundRetry();
            }
        }, LONG_POLL_INTERVAL);
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        
        // Enter silent mode after first failure
        if (this.state.totalFailures >= SILENT_MODE_AFTER_FAILURES && !this.state.silentMode) {
            this.state.silentMode = true;
            // Single log message, then go silent
            console.log('[sync_engine] Fastify server unavailable - sync will auto-resume when server is back');
        }
        
        if (this.state.attempts >= MAX_RETRIES) {
            this.state.serverAvailable = false;
            // Switch to long background polling
            this.scheduleBackgroundRetry();
            return;
        }

        this.state.attempts += 1;
        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.state.attempts - 1),
            RECONNECT_MAX_DELAY
        );

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectNextCandidate();
        }, delay);
    }

    handleMessage(event) {
        let payload = null;
        try {
            payload = JSON.parse(event.data);
        } catch (error) {
            return;
        }

        if (payload.type === 'sync:file-event') {
            const delta = toAdoleDelta(payload);
            if (delta) {
                this.state.lastDelta = delta;
                this.broadcast(delta);
            }
        } else if (payload.type === 'sync:account-created') {
            // Account created on cloud server - sync to local
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
            // Account deleted on cloud server - sync to local
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

    broadcast(delta) {
        this.listeners.forEach((listener) => {
            try {
                listener(delta);
            } catch (_) {
                // Ignore listener errors
            }
        });
        window.dispatchEvent(new CustomEvent('squirrel:adole-delta', { detail: delta }));
    }

    flushQueue() {
        while (this.queue.length) {
            const msg = this.queue.shift();
            this.socket?.send(msg);
        }
    }

    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.add(listener);
        }
        return () => this.listeners.delete(listener);
    }

    getLastDelta() {
        return this.state.lastDelta;
    }

    /**
     * Get connection state
     */
    getState() {
        return {
            connected: this.state.connected,
            endpoint: this.state.endpoint,
            serverAvailable: this.state.serverAvailable,
            silentMode: this.state.silentMode,
            attempts: this.state.attempts
        };
    }

    /**
     * Check if server is available
     */
    isServerAvailable() {
        return this.state.serverAvailable === true;
    }

    /**
     * Reset connection state and retry
     */
    retry() {
        this.state.attempts = 0;
        this.state.totalFailures = 0;
        this.state.silentMode = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.connectNextCandidate();
    }

    /**
     * Disconnect from server
     */
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

const syncEngineSingleton = new SyncEngineClient();
let syncEngineInitialized = false;

export default function initSyncEngine() {
    if (syncEngineInitialized) {
        return;
    }
    syncEngineInitialized = true;

    syncEngineSingleton.start();

    // Listen for server availability events (from Tauri or other sources)
    window.addEventListener('squirrel:server-available', () => {
        console.log('[sync_engine] Server available event received - attempting connection');
        syncEngineSingleton.retry();
    });

    // Also listen for online event (browser comes back online)
    window.addEventListener('online', () => {
        if (!syncEngineSingleton.state.connected) {
            console.log('[sync_engine] Network online - attempting reconnection');
            syncEngineSingleton.retry();
        }
    });

    const relayReady = () => {
        window.removeEventListener('squirrel:ready', relayReady);
        window.dispatchEvent(new CustomEvent('squirrel:sync-ready'));
    };
    window.addEventListener('squirrel:ready', relayReady, { once: true });

    window.Squirrel = window.Squirrel || {};
    window.Squirrel.SyncEngine = {
        subscribe: (listener) => syncEngineSingleton.subscribe(listener),
        getLastDelta: () => syncEngineSingleton.getLastDelta(),
        getState: () => syncEngineSingleton.getState(),
        isServerAvailable: () => syncEngineSingleton.isServerAvailable(),
        retry: () => syncEngineSingleton.retry(),
        disconnect: () => syncEngineSingleton.disconnect()
    };
}

export { syncEngineSingleton as SyncEngine };
