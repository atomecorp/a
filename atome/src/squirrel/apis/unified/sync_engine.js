import { CONFIG, resolveDataSource } from './adole_backend.js';
import { getToken } from './adole_connection.js';

const DEVICE_KEY = 'squirrel_sync_device_id_v1';
const STREAMS_KEY = 'squirrel_sync_streams_v1';
const CURSORS_KEY = 'squirrel_sync_cursors_v1';

const readJson = (storage, key, fallback) => {
    try {
        const value = JSON.parse(storage?.getItem?.(key) || 'null');
        return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
        return fallback;
    }
};

const writeJson = (storage, key, value) => {
    storage?.setItem?.(key, JSON.stringify(value));
};

const syncUrl = (env) => {
    const explicit = String(env?.__SQUIRREL_FASTIFY_WS_SYNC_URL__ || '').trim();
    if (explicit) return explicit;
    const api = String(env?.__SQUIRREL_FASTIFY_WS_API_URL__ || '').trim();
    return api ? api.replace(/\/ws\/api$/, '/ws/sync') : '';
};

const principalId = (env) => String(
    env?.__currentUser?.id || env?.__authCheckResult?.userId || ''
).trim();

const randomId = (env) => env?.crypto?.randomUUID?.()
    || `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const winningPatch = (message) => {
    const patch = message?.patch && typeof message.patch === 'object' ? message.patch : {};
    const decisions = message?.lww_decisions && typeof message.lww_decisions === 'object'
        ? message.lww_decisions
        : {};
    const props = Object.fromEntries(Object.entries(patch.props || {}).filter(([key]) => (
        decisions[key]?.winner !== false
    )));
    const deleteKeys = (patch.delete_keys || patch.deleteKeys || []).filter((key) => (
        decisions[key]?.winner !== false
    ));
    return { props, deleteKeys };
};

export class SyncEngine {
    constructor(options = {}) {
        this.env = options.env || globalThis.window || globalThis;
        this.WebSocketClass = options.WebSocketClass || this.env?.WebSocket;
        this.token = options.token || (() => getToken(CONFIG.FASTIFY_TOKEN_KEY));
        this.socket = null;
        this.connected = false;
        this.registered = false;
        this.error = '';
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.seenEventIds = new Set();
        this.streams = new Set();
        this.cursors = {};
        this.installed = false;
        this.boundLogin = () => this.retry();
        this.boundLogout = () => this.disconnect();
        this.boundOnline = () => this.retry();
        this.source = this.loadDeviceSource();
        this.loadScope();
        this.streams.add('directory.public');
    }

    scopeKey() {
        const environment = String(this.env?.__SQUIRREL_ENVIRONMENT_FINGERPRINT__ || '').trim()
            || syncUrl(this.env);
        return `${environment}|${principalId(this.env) || 'anonymous'}`;
    }

    loadDeviceSource() {
        const storage = this.env?.localStorage;
        let source = String(storage?.getItem?.(DEVICE_KEY) || '').trim();
        if (!source) {
            source = randomId(this.env);
            storage?.setItem?.(DEVICE_KEY, source);
        }
        return source;
    }

    loadScope() {
        const key = this.scopeKey();
        const streamScopes = readJson(this.env?.localStorage, STREAMS_KEY, {});
        const cursorScopes = readJson(this.env?.localStorage, CURSORS_KEY, {});
        this.streams = new Set(Array.isArray(streamScopes[key]) ? streamScopes[key] : []);
        this.streams.add('directory.public');
        this.cursors = cursorScopes[key] && typeof cursorScopes[key] === 'object'
            ? { ...cursorScopes[key] }
            : {};
    }

    persistScope() {
        const key = this.scopeKey();
        const storage = this.env?.localStorage;
        const streamScopes = readJson(storage, STREAMS_KEY, {});
        const cursorScopes = readJson(storage, CURSORS_KEY, {});
        streamScopes[key] = Array.from(this.streams);
        cursorScopes[key] = { ...this.cursors };
        writeJson(storage, STREAMS_KEY, streamScopes);
        writeJson(storage, CURSORS_KEY, cursorScopes);
    }

    install() {
        if (this.installed) return this;
        this.installed = true;
        this.env?.addEventListener?.('squirrel:user-logged-in', this.boundLogin);
        this.env?.addEventListener?.('squirrel:user-logged-out', this.boundLogout);
        this.env?.addEventListener?.('online', this.boundOnline);
        if (principalId(this.env) && this.token()) void this.connect();
        return this;
    }

    getState() {
        return {
            connected: this.connected,
            registered: this.registered,
            source: this.source,
            principal_id: principalId(this.env) || null,
            environment_fingerprint: this.scopeKey(),
            url: syncUrl(this.env) || null,
            streams: Array.from(this.streams),
            cursors: { ...this.cursors },
            error: this.error || null
        };
    }

    getSource() {
        return this.source;
    }

    async connect() {
        const url = syncUrl(this.env);
        const authToken = this.token();
        if (!url || !authToken || !principalId(this.env) || !this.WebSocketClass) return false;
        if (resolveDataSource() !== 'fastify') return false;
        if (this.socket?.readyState === this.WebSocketClass.OPEN) return true;
        this.disconnect({ reconnect: false });
        this.loadScope();
        const socket = new this.WebSocketClass(url);
        this.socket = socket;
        socket.onopen = () => {
            if (this.socket !== socket) return;
            this.error = '';
            this.reconnectAttempt = 0;
            socket.send(JSON.stringify({ type: 'auth', token: authToken }));
        };
        socket.onmessage = (event) => this.handleMessage(event.data);
        socket.onerror = () => { this.error = 'sync_connection_error'; };
        socket.onclose = () => {
            if (this.socket !== socket) return;
            this.socket = null;
            this.connected = false;
            this.registered = false;
            this.scheduleReconnect();
        };
        return true;
    }

    send(message) {
        if (!this.socket || this.socket.readyState !== this.WebSocketClass.OPEN) return false;
        this.socket.send(JSON.stringify(message));
        return true;
    }

    handleMessage(raw) {
        let message;
        try { message = JSON.parse(raw); } catch (_) { this.error = 'sync_invalid_json'; return; }
        if (message.type === 'welcome') {
            this.connected = true;
            this.send({ type: 'register', source: this.source, capabilities: ['events', 'replay'] });
            return;
        }
        if (message.type === 'registered') {
            this.observeEvents((message.streams || []).map((stream) => ({ stream_id: stream })));
            this.registered = true;
            for (const stream of this.streams) this.subscribe(stream);
            return;
        }
        if (message.type === 'stream-available') {
            this.observeEvents([{ stream_id: message.stream }]);
            return;
        }
        if (message.type === 'event') {
            this.applyEvent(message);
            return;
        }
        if (message.type === 'replay-complete') {
            this.persistCursor(message.stream, message.cursor);
            return;
        }
        if (message.type === 'revoked') {
            this.streams.delete(String(message.stream || ''));
            this.persistScope();
            return;
        }
        if (message.type === 'error') this.error = String(message.code || 'sync_error');
    }

    applyEvent(message) {
        const eventId = String(message.event_id || '').trim();
        const stream = String(message.stream || '').trim();
        const sequence = Number(message.sequence);
        if (!eventId || !stream || !Number.isInteger(sequence)) return;
        if (this.seenEventIds.has(eventId)) {
            this.ack(stream, sequence);
            return;
        }
        this.seenEventIds.add(eventId);
        while (this.seenEventIds.size > 2000) this.seenEventIds.delete(this.seenEventIds.values().next().value);
        const { props, deleteKeys } = winningPatch(message);
        const kind = String(message.kind || '').toLowerCase();
        if (this.env?.__SQUIRREL_SYNC_DEBUG__ === true) {
            this.dispatch('squirrel:sync-debug-event', {
                event_id: eventId, stream, sequence, kind,
                replay: message.replay === true, origin: 'ws/sync'
            });
        }
        if (kind === 'directory.invalidate') {
            this.dispatch('squirrel:directory-invalidated', {
                principal_id: message.patch?.principal_id || null,
                action: message.patch?.action || null,
                revision: message.patch?.revision || null,
                source: 'realtime', origin: 'ws/sync'
            });
            this.persistCursor(stream, sequence);
            this.ack(stream, sequence);
            return;
        }
        const lifecycleWins = message.lww_decisions?.__lifecycle__?.winner !== false;
        const common = {
            id: message.atome_id,
            atome_id: message.atome_id,
            project_id: message.project_id,
            event_id: eventId,
            tx_id: message.tx_id,
            gesture_id: message.gesture_id,
            properties: props,
            delete_keys: deleteKeys,
            projection: message.projection,
            source: 'realtime',
            origin: 'ws/sync',
            durable: true
        };
        if (kind === 'delete' && lifecycleWins) this.dispatch('squirrel:atome-deleted', common);
        else if (kind === 'restore' && lifecycleWins) this.dispatch('squirrel:atome-restored', common);
        else if (Object.keys(props).length || deleteKeys.length) this.dispatch('squirrel:atome-updated', common);
        this.persistCursor(stream, sequence);
        this.ack(stream, sequence);
    }

    dispatch(name, detail) {
        if (!this.env?.dispatchEvent || !this.env?.CustomEvent) return;
        this.env.dispatchEvent(new this.env.CustomEvent(name, { detail }));
    }

    persistCursor(stream, sequence) {
        const normalized = Number(sequence);
        if (!stream || !Number.isInteger(normalized)) return;
        this.cursors[stream] = Math.max(Number(this.cursors[stream]) || 0, normalized);
        this.persistScope();
    }

    ack(stream, sequence) {
        this.send({ type: 'ack', stream, sequence });
    }

    subscribe(stream) {
        const id = String(stream || '').trim();
        if (!id || !this.registered) return false;
        return this.send({ type: 'subscribe', stream: id, cursor: Number(this.cursors[id]) || 0 });
    }

    observeEvents(events = []) {
        for (const event of events || []) {
            const stream = String(event?.stream_id || event?.stream || '').trim();
            if (!stream) continue;
            this.streams.add(stream);
            if (this.registered) this.subscribe(stream);
        }
        this.persistScope();
    }

    async requestSync() {
        const connected = await this.connect();
        return { ok: connected !== false, streams: Array.from(this.streams) };
    }

    scheduleReconnect() {
        if (this.reconnectTimer || !this.installed || !principalId(this.env)) return;
        const delay = Math.min(30_000, 1000 * (2 ** this.reconnectAttempt++));
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
        }, delay);
    }

    disconnect({ reconnect = false } = {}) {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        const socket = this.socket;
        this.socket = null;
        this.connected = false;
        this.registered = false;
        if (socket) socket.close();
        if (reconnect) this.scheduleReconnect();
    }

    retry() {
        this.disconnect({ reconnect: false });
        return this.connect();
    }

    clearFastifyAvailabilityCache() {
        this.error = '';
    }
}

let singleton = null;

export const installSyncEngine = (env = globalThis.window || globalThis) => {
    if (!singleton || singleton.env !== env) singleton = new SyncEngine({ env });
    env.Squirrel = env.Squirrel || {};
    env.Squirrel.SyncEngine = singleton.install();
    return singleton;
};

export default installSyncEngine;
