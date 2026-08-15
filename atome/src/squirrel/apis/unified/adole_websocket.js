// Extracted from adole.js: TauriWebSocket transport class + per-backend WS singletons.
import { messageHandlerMixin } from './adole_websocket_message.js';
import {
    MEDIA_PATCH_KIND_HINTS,
    mediaPatchHintsByAtomeId,
    normalizeMediaPatchKindHint,
    hasMediaSourceHintsInPatch,
    rememberMediaPatchHint,
    isInTauri,
    readLocalTauriHttpPort,
    getTauriWsUrl,
    getFastifyWsApiUrl
} from './adole_backend.js';
import {
    checkConnection
} from './adole_connection.js';

class TauriWebSocket {
    constructor(url, backend = 'tauri') {
        this.url = url;
        this.backend = backend;
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.pendingRequests = new Map();
        this.requestCounter = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.connectionTimer = null;
        this.connectionPromise = null;
        this.disposed = false;
        // Incremented on every successful open. Consumers that must re-declare
        // per-connection state after a reconnection (the surface registry does)
        // compare against this instead of guessing from `isConnected`, which is
        // also true for the socket they already announced on.
        this.connectionGeneration = 0;
    }

    async connect() {
        if (this.disposed) return false;
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.isConnected = true;
            this.isConnecting = false;
            return true;
        }
        if (this.connectionPromise) return this.connectionPromise;

        const attempt = this.openConnection();
        this.connectionPromise = attempt;
        try {
            return await attempt;
        } finally {
            if (this.connectionPromise === attempt) this.connectionPromise = null;
        }
    }

    async openConnection() {
        if (this.backend === 'fastify') {
            const online = await checkConnection('fastify');
            if (!online || this.disposed) return false;
        }
        if (this.disposed) return false;
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.isConnected = true;
            return true;
        }

        this.isConnecting = true;
        return new Promise((resolve) => {
            try {
                const socket = new WebSocket(this.url);
                this.socket = socket;

                socket.onopen = () => {
                    if (this.disposed || this.socket !== socket) return;
                    this.clearConnectionTimer();
                    this.isConnecting = false;
                    this.isConnected = true;
                    this.connectionGeneration += 1;
                    this.startPing();
                    resolve(true);
                };

                socket.onclose = () => {
                    if (this.socket !== socket) return;
                    this.handleDisconnect({ socket });
                    resolve(false);
                };

                socket.onerror = () => {
                    if (this.socket !== socket) return;
                    if (socket.readyState !== WebSocket.OPEN) this.handleDisconnect({ socket });
                    resolve(false);
                };

                socket.onmessage = (event) => {
                    if (this.disposed || this.socket !== socket) return;
                    this.handleMessage(event.data);
                };

                this.clearConnectionTimer();
                this.connectionTimer = setTimeout(() => {
                    this.connectionTimer = null;
                    if (this.socket !== socket || !this.isConnecting) return;
                    this.handleDisconnect({ socket });
                    try { socket.close(); } catch (_) { }
                    resolve(false);
                }, 3000);
            } catch (_) {
                this.isConnecting = false;
                resolve(false);
            }
        });
    }

    handleDisconnect({ socket = this.socket, scheduleReconnect = true } = {}) {
        if (socket && this.socket !== socket) return;
        this.clearConnectionTimer();
        this.isConnected = false;
        this.isConnecting = false;
        this.stopPing();

        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.resolve({ ok: false, success: false, error: 'Connection lost', offline: true, status: 0 });
        }
        this.pendingRequests.clear();

        if (scheduleReconnect && !this.disposed && !this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.silentConnect();
            }, 5000);
        }
    }

    // Silent connect - no error logging on failure
    async silentConnect() {
        if (this.disposed || this.isConnected || this.isConnecting) return;
        await this.connect();
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

    clearConnectionTimer() {
        if (!this.connectionTimer) return;
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.clearConnectionTimer();
        this.handleDisconnect({ scheduleReconnect: false });
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            socket.onopen = null;
            socket.onclose = null;
            socket.onerror = null;
            socket.onmessage = null;
            try { socket.close(); } catch (_) { }
        }
    }

    async send(message) {
        const isAuthMessage = message?.type === 'auth';
        void isAuthMessage;
        const connected = await this.connect();
        if (!connected || this.socket?.readyState !== WebSocket.OPEN) {
            if (this.isConnected) this.handleDisconnect();
            return { ok: false, success: false, error: 'Server unreachable', offline: true, status: 0 };
        }

        return new Promise((resolve) => {
            const requestId = `ws_${++this.requestCounter}_${Date.now()}`;
            message.requestId = requestId;

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve({ ok: false, success: false, error: 'Request timeout', status: 0 });
            }, 10000);

            this.pendingRequests.set(requestId, { resolve, timeout });

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
        if (!connected || this.socket?.readyState !== WebSocket.OPEN) {
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

Object.assign(TauriWebSocket.prototype, messageHandlerMixin);

// Singleton WebSocket instances
let _tauriWs = null;
let _fastifyWs = null;

const _noTauriWs = {
    // -1 marks "never opened", so per-connection state is never treated as declared.
    connectionGeneration: -1,
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
    connectionGeneration: -1,
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
    const localPort = readLocalTauriHttpPort();
    const hasLocalRuntime = !!localPort;
    if (!isInTauri() && !hasLocalRuntime) {
        return _noTauriWs;
    }

    const wsUrl = getTauriWsUrl();
    if (!_tauriWs || _tauriWs.url !== wsUrl) {
        _tauriWs?.dispose?.();
        _tauriWs = new TauriWebSocket(wsUrl, 'tauri');
    }
    return _tauriWs;
}

function getFastifyWs() {
    const wsUrl = getFastifyWsApiUrl();
    if (!wsUrl) {
        return _noFastifyWs;
    }

    if (!_fastifyWs || _fastifyWs.url !== wsUrl) {
        _fastifyWs?.dispose?.();
        _fastifyWs = new TauriWebSocket(wsUrl, 'fastify');
    }

    return _fastifyWs;
}

/**
 * Create a WebSocket-based adapter (ADOLE v3.0)
 * @param {string} tokenKey - LocalStorage key for auth token
 * @param {string} backend - 'tauri' (port 3000) or 'fastify' (port 3001)
 */

export { TauriWebSocket, getTauriWs, getFastifyWs };
