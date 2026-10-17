import { socketHealthMixin } from './websocket_health.js';
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

// A key-bound session token (`cnf.pop`) is accepted on a connection only after
// that connection signed a fresh challenge with the session key. The account
// owner registers the prover; the transport runs it once per opened socket.
let connectionProver = null;
export const setConnectionProver = (prover) => { connectionProver = typeof prover === 'function' ? prover : null; };
const PROOF_ACTIONS = new Set(['connection-challenge', 'connection-proof']);
const tokenClaims = (token) => {
    try { return JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (_) { return null; }
};

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
        this.reconnectAttempt = 0;
        this.heartbeat = null;
        this.env = globalThis.window;
        // Returning to the foreground (or the iOS local server restarting) is
        // when a socket may have died silently; one deduplicated check covers it.
        this.onForeground = () => {
            if (this.env?.document?.visibilityState !== 'hidden') void this.verifyConnection();
        };
        this.env?.addEventListener?.('local-server-ready', this.onForeground);
        this.env?.document?.addEventListener?.('visibilitychange', this.onForeground);
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
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                    this.isConnecting = false;
                    this.isConnected = true;
                    this.connectionGeneration += 1;
                    this.startPing();
                    if (this.backend === 'fastify') void this.announcePresence(socket);
                    globalThis.window?.dispatchEvent(new CustomEvent('squirrel:auth-transport-open', { detail: { backend: this.backend } }));
                    // Only a REconnection announces itself: reads that failed while the
                    // link was down retry; the first open has nothing to recover.
                    if (this.backend === 'tauri' && this.connectionGeneration > 1) {
                        this.env?.dispatchEvent(new CustomEvent('squirrel:local-connection-ready'));
                    }
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
                    this.noteInbound();
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
        this.finishHeartbeat(false);

        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.resolve({ ok: false, success: false, error: 'Connection lost', offline: true, status: 0 });
        }
        this.pendingRequests.clear();

        if (scheduleReconnect && !this.disposed && !this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.silentConnect();
            }, Math.min(30000, 1000 * (2 ** this.reconnectAttempt++)));
        }
    }

    // Silent connect - no error logging on failure
    async silentConnect() {
        if (this.disposed || this.isConnected || this.isConnecting) return;
        await this.connect();
    }

    // One proof per opened socket and key; a failure leaves the next request to try again.
    ensureConnectionProof(token) {
        const kid = tokenClaims(token)?.cnf?.pop === true ? tokenClaims(token).cnf.kid : null;
        if (!kid || this.backend !== 'fastify') return Promise.resolve();
        const mark = `${this.connectionGeneration}:${kid}`;
        if (this.provenConnection === mark) return Promise.resolve();
        if (this.connectionProof?.mark === mark) return this.connectionProof.task;
        if (!connectionProver) return Promise.reject(new Error('auth_connection_proof_unavailable'));
        const task = connectionProver(token, (message) => this.send(message)).then(() => {
            if (this.connectionGeneration === Number(mark.split(':')[0])) this.provenConnection = mark;
        }).finally(() => { if (this.connectionProof?.task === task) this.connectionProof = null; });
        this.connectionProof = { mark, task };
        return task;
    }

    // A reopened socket belongs to nobody until it carries the session token: until then
    // the server counts this device as offline and a call to it goes straight to voicemail.
    async announcePresence(socket = this.socket) {
        try {
            const { FastifyAdapter } = await import('./adole.js');
            const token = FastifyAdapter.getToken?.();
            if (!token || this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
            await this.ensureConnectionProof(token);
            if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(JSON.stringify({ type: 'auth', action: 'me', token, requestId: `presence_${Date.now()}` }));
        } catch (_) { /* presence is best effort; the next request attaches anyway */ }
    }

    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
                void this.verifyConnection();
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

    onHealthTimeout(socket) {
        this.handleDisconnect({ socket });
        this.socket = null;
        try { socket.close(); } catch (_) { }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.env?.removeEventListener?.('local-server-ready', this.onForeground);
        this.env?.document?.removeEventListener?.('visibilitychange', this.onForeground);
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

    async send(message, { timeoutMs = 10000, onProgress = null, signal = null } = {}) {
        signal?.throwIfAborted();
        if (message.type !== 'auth' && this.backend === 'tauri') {
            const { ensureLocalSession } = await import('./adole_api/auth_methods_login.js');
            try {
                await ensureLocalSession();
                const { TauriAdapter } = await import('./adole.js');
                message.token = TauriAdapter.getToken();
            } catch (error) {
                return { ok: false, success: false, error: error.message };
            }
        }
        const connected = await this.connect();
        signal?.throwIfAborted();
        if (!connected || this.socket?.readyState !== WebSocket.OPEN) {
            if (this.isConnected) this.handleDisconnect();
            return { ok: false, success: false, error: 'Server unreachable', offline: true, status: 0 };
        }
        if (message.token && !(message.type === 'auth' && PROOF_ACTIONS.has(message.action))) {
            try { await this.ensureConnectionProof(message.token); } catch (error) {
                return { ok: false, success: false, error: error.message || 'auth_connection_proof_required', status: 0 };
            }
        }

        const requestId = message.requestId || message.request_id || `ws_${++this.requestCounter}_${Date.now()}`;
        message.requestId = requestId;
        const pending = this.pendingRequests.get(requestId);
        if (pending) return pending.promise;

        let resolve;
        const promise = new Promise(settle => { resolve = settle; });
        const timeout = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            resolve({ ok: false, success: false, error: 'Request timeout', status: 0 });
            void this.verifyConnection();
        }, Math.max(1, Math.min(Number(timeoutMs) || 10000, 180000)));
        const settle = resolve;
        const cancel = () => {
            this.pendingRequests.delete(requestId); clearTimeout(timeout);
            resolve({ ok: false, success: false, error: 'Request cancelled', status: 0 });
        };
        resolve = value => { signal?.removeEventListener('abort', cancel); settle(value); };
        signal?.addEventListener('abort', cancel, { once: true });
        this.pendingRequests.set(requestId, { resolve, timeout, promise, onProgress });
        try {
            this.socket.send(JSON.stringify(message));
        } catch (error) {
            this.pendingRequests.delete(requestId);
            clearTimeout(timeout);
            resolve({ ok: false, success: false, error: error.message, status: 0 });
        }
        return promise;
    }

    async sendFireAndForget(message) {
        const connected = await this.connect();
        if (!connected || this.socket?.readyState !== WebSocket.OPEN) {
            return { ok: false, success: false, error: 'Server unreachable', offline: true, status: 0 };
        }
        if (message.token) {
            try { await this.ensureConnectionProof(message.token); } catch (error) {
                return { ok: false, success: false, error: error.message || 'auth_connection_proof_required', status: 0 };
            }
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

Object.assign(TauriWebSocket.prototype, messageHandlerMixin, socketHealthMixin);

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
