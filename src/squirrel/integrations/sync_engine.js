const DEFAULT_WS_PATH = '/ws/events';
const MAX_RETRIES = 10;

function resolveWsCandidates() {
    const customEndpoint = typeof window.__SQUIRREL_SYNC_WS__ === 'string'
        ? window.__SQUIRREL_SYNC_WS__.trim()
        : '';
    if (customEndpoint) {
        return [ensureWsPath(customEndpoint)];
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

    // Log for debugging
    console.log('[sync_engine] resolveWsCandidates: isTauri =', isTauri, ', port =', port);

    // For both Tauri and browser dev mode, WebSocket is only available on Fastify (port 3001)
    // - Port 3000 (Squirrel static server or Axum) doesn't have WebSocket
    // - Port 1420/1430 (Tauri dev server / Vite) doesn't have WebSocket
    // Only Fastify on 3001 has the /ws/events endpoint
    
    pushBase('ws://localhost:3001');
    pushBase('ws://127.0.0.1:3001');

    console.log('[sync_engine] WebSocket candidates:', bases);
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
            lastDelta: null,
            endpoint: null
        };
        this.listeners = new Set();
        this.socket = null;
        this.reconnectTimer = null;
        this.queue = [];
    }

    start() {
        if (this.socket || this.state.connected) {
            return;
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
            this.scheduleReconnect();
            return;
        }

        this.socket.addEventListener('open', () => {
            this.state.connected = true;
            this.state.attempts = 0;
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
            this.state.connected = false;
            this.socket?.close();
        });
    }

    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }
        if (this.state.attempts >= MAX_RETRIES) {
            return;
        }
        this.state.attempts += 1;
        const delay = Math.min(1000 * this.state.attempts, 5000);
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
}

const syncEngineSingleton = new SyncEngineClient();
let syncEngineInitialized = false;

export default function initSyncEngine() {
    if (syncEngineInitialized) {
        return;
    }
    syncEngineInitialized = true;

    syncEngineSingleton.start();

    const relayReady = () => {
        window.removeEventListener('squirrel:ready', relayReady);
        window.dispatchEvent(new CustomEvent('squirrel:sync-ready'));
    };
    window.addEventListener('squirrel:ready', relayReady, { once: true });

    window.Squirrel = window.Squirrel || {};
    window.Squirrel.SyncEngine = {
        subscribe: (listener) => syncEngineSingleton.subscribe(listener),
        getLastDelta: () => syncEngineSingleton.getLastDelta()
    };
}

export { syncEngineSingleton as SyncEngine };
