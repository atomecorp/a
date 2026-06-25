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
    }

    async connect() {
        if (this.backend === 'fastify') {
            const online = await checkConnection('fastify');
            if (!online) {
                return false;
            }
        }

        return new Promise((resolve) => {
            if (this.isConnected) {
                resolve(true);
                return;
            }
            if (this.isConnecting) {
                // Wait for existing connection attempt
                const checkInterval = setInterval(() => {
                    if (this.isConnected) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(false);
                }, 5000);
                return;
            }

            this.isConnecting = true;

            try {
                const _xlog = (msg) => { void msg; };
                _xlog('Creating WebSocket to ' + this.url);
                this.socket = new WebSocket(this.url);

                this.socket.onopen = () => {
                    _xlog('onopen fired, readyState=' + this.socket.readyState);
                    this.isConnecting = false;
                    this.isConnected = true;
                    this.startPing();
                    resolve(true);
                };

                this.socket.onclose = (evt) => {
                    _xlog('onclose fired, code=' + evt.code + ' reason=' + evt.reason + ' wasClean=' + evt.wasClean);
                    // Don't trigger handleDisconnect on normal close
                    // Only schedule silent reconnect
                    this.isConnected = false;
                    this.isConnecting = false;
                    this.stopPing();
                    resolve(false);
                };

                this.socket.onerror = (evt) => {
                    _xlog('onerror fired: ' + String(evt?.message || evt?.type || 'unknown'));
                    // Silent - don't call handleDisconnect to avoid cascading reconnects
                    this.isConnecting = false;
                    resolve(false);
                };

                this.socket.onmessage = (event) => {
                    _xlog('onmessage: ' + String(event.data).substring(0, 120));
                    this.handleMessage(event.data);
                };

                // Timeout connection attempt
                setTimeout(() => {
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        resolve(false);
                    }
                }, 3000);

            } catch (e) {
                this.isConnecting = false;
                resolve(false);
            }
        });
    }

    handleDisconnect() {
        this.isConnected = false;
        this.isConnecting = false;
        this.stopPing();

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject({ ok: false, success: false, error: 'Connection lost', offline: true });
        }
        this.pendingRequests.clear();

        // Schedule silent reconnect (no logging, no error on failure)
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.silentConnect();
            }, 5000);
        }
    }

    // Silent connect - no error logging on failure
    async silentConnect() {
        if (this.isConnected || this.isConnecting) return;
        this.isConnecting = true;

        if (this.backend === 'fastify') {
            const online = await checkConnection('fastify');
            if (!online) {
                this.isConnecting = false;
                return;
            }
        }

        try {
            this.socket = new WebSocket(this.url);

            this.socket.onopen = () => {
                this.isConnecting = false;
                this.isConnected = true;
                this.startPing();
            };

            this.socket.onclose = () => {
                this.isConnecting = false;
                this.isConnected = false;
                this.stopPing();
                // Silent retry after delay
                if (!this.reconnectTimer) {
                    this.reconnectTimer = setTimeout(() => {
                        this.reconnectTimer = null;
                        this.silentConnect();
                    }, 10000);
                }
            };

            this.socket.onerror = () => {
                // Silent - no error logging for reconnect attempts
            };

            this.socket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            setTimeout(() => {
                if (this.isConnecting) {
                    this.isConnecting = false;
                }
            }, 3000);

        } catch (e) {
            this.isConnecting = false;
        }
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

    async send(message) {
        const isAuthMessage = message?.type === 'auth';
        void isAuthMessage;
        const connected = await this.connect();
        if (!connected) {
            return { ok: false, success: false, error: 'Server unreachable', offline: true, status: 0 };
        }

        return new Promise((resolve, reject) => {
            const requestId = `ws_${++this.requestCounter}_${Date.now()}`;
            message.requestId = requestId;

            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                resolve({ ok: false, success: false, error: 'Request timeout', status: 0 });
            }, 10000);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });

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
        if (!connected) {
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
        try { _tauriWs?.socket?.close?.(); } catch (_) { }
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
        try { _fastifyWs?.socket?.close?.(); } catch (_) { }
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
